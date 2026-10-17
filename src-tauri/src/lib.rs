mod ai_guide;
mod autostart;
mod clock;
mod commands;
mod drill;
mod goals;
mod insights;
mod lock;
mod logic;
pub mod mcp;
mod model;
mod notify;
mod pylit;
mod scheduler;
mod store;
mod tray;
mod updater;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder, WindowEvent};

#[derive(Default)]
pub struct PendingRoute(pub Mutex<Option<String>>);

#[derive(Default)]
pub struct McpRun {
    pub server: Option<Arc<tiny_http::Server>>,
    pub port: u16,
    pub token: String,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct McpState(pub Mutex<McpRun>);

pub fn mcp_start(app: &AppHandle) {
    let state = app.state::<McpState>();
    let mut run = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if run.server.is_some() {
        return;
    }
    let store = app.state::<store::Store>();
    let mut cfg: mcp::McpConfig = store.load_json(mcp::CONFIG_FILE).unwrap_or_default();
    if cfg.token.len() < 32 {
        cfg.token = mcp::token();
    }
    let preferred = if cfg.port == 0 { mcp::DEFAULT_PORT } else { cfg.port };
    match mcp::bind(preferred) {
        Ok((server, port)) => {
            cfg.port = port;
            if let Err(e) = store.save_json(mcp::CONFIG_FILE, &cfg) {
                eprintln!("mcp.json: {e}");
            }
            let server = Arc::new(server);
            *run = McpRun { server: Some(server.clone()), port, token: cfg.token.clone(), error: None };
            let app = app.clone();
            let token = cfg.token;
            std::thread::spawn(move || {
                let notify = app.clone();
                let changed = move || {
                    let _ = notify.emit("data-changed", ());
                    scheduler::refresh_tray(&notify);
                };
                for req in server.incoming_requests() {
                    let store = app.state::<store::Store>();
                    mcp::serve_one(&store, &changed, &token, req);
                }
            });
        }
        Err(e) => run.error = Some(e),
    }
}

pub fn mcp_stop(app: &AppHandle) {
    let state = app.state::<McpState>();
    let mut run = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(s) = run.server.take() {
        s.unblock();
    }
    run.error = None;
}

#[derive(Clone, Copy)]
struct Bounds {
    pos: Option<(f64, f64)>,
    size: (f64, f64),
    maximized: bool,
}

#[derive(Default)]
struct WinBounds(Mutex<Option<Bounds>>);

static HIDE_GEN: AtomicU64 = AtomicU64::new(0);

fn unload_after_sec() -> u64 {
    std::env::var("NEXTDAY_UNLOAD_SEC").ok().and_then(|v| v.parse().ok()).unwrap_or(180)
}

fn build_main(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    let saved = *app.state::<WinBounds>().0.lock().unwrap_or_else(|e| e.into_inner());
    let (w, h) = saved.map_or((1120.0, 760.0), |b| b.size);
    let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Next Day")
        .inner_size(w, h)
        .min_inner_size(920.0, 640.0)
        .decorations(false)
        .shadow(true)
        .background_color(Color(26, 28, 44, 255))
        .visible(false);
    b = match saved.and_then(|s| s.pos) {
        Some((x, y)) => b.position(x, y),
        None => b.center(),
    };
    let win = b.build()?;
    if saved.is_some_and(|s| s.maximized) {
        let _ = win.maximize();
    }
    Ok(win)
}

fn remember_bounds(app: &AppHandle, w: &tauri::WebviewWindow) {
    let state = app.state::<WinBounds>();
    let mut saved = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if w.is_maximized().unwrap_or(false) {
        let prev = saved.unwrap_or(Bounds { pos: None, size: (1120.0, 760.0), maximized: true });
        *saved = Some(Bounds { maximized: true, ..prev });
        return;
    }
    let k = w.scale_factor().unwrap_or(1.0);
    if let (Ok(pos), Ok(size)) = (w.outer_position(), w.inner_size()) {
        *saved = Some(Bounds {
            pos: Some((pos.x as f64 / k, pos.y as f64 / k)),
            size: (size.width as f64 / k, size.height as f64 / k),
            maximized: false,
        });
    }
}

pub fn show_main(app: &AppHandle, route: Option<&str>) {
    HIDE_GEN.fetch_add(1, Ordering::SeqCst);
    if let Some(r) = route {
        if let Some(p) = app.try_state::<PendingRoute>() {
            *p.0.lock().unwrap_or_else(|e| e.into_inner()) = Some(r.to_string());
        }
        let _ = app.emit("navigate", r.to_string());
    }
    let w = match app.get_webview_window("main") {
        Some(w) => w,
        None => match build_main(app) {
            Ok(w) => w,
            Err(e) => {
                eprintln!("окно не создано: {e}");
                return;
            }
        },
    };
    let _ = w.unminimize();
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit("window-visibility", true);
}

pub fn hide_to_tray(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        remember_bounds(app, &w);
        let _ = w.hide();
    }
    let _ = app.emit("window-visibility", false);
    let gen = HIDE_GEN.fetch_add(1, Ordering::SeqCst) + 1;
    let app2 = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(unload_after_sec()));
        if HIDE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        if let Some(w) = app2.get_webview_window("main") {
            if !w.is_visible().unwrap_or(true) {
                let _ = w.destroy();
            }
        }
    });
    let store = app.state::<store::Store>();
    let first_time = {
        let _g = store.lock();
        let mut s = store.load_settings();
        if s.tray_hint_shown {
            false
        } else {
            s.tray_hint_shown = true;
            let _ = store.save_settings(&s);
            true
        }
    };
    if first_time {
        notify::show(
            app,
            "Next Day работает в трее",
            "Окно спрятано, напоминания придут вовремя.",
            "today",
            &[],
        );
    }
}

pub fn quit_gracefully(app: &AppHandle) {
    let _ = app.emit("window-visibility", false);
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(600));
        app.exit(0);
    });
}

pub fn on_toast_action(app: &AppHandle, action: &str) {
    if action == "snooze" {
        let store = app.state::<store::Store>();
        let _g = store.lock();
        let mut ns = store.load_notify();
        ns.snooze_until = Some(clock::fmt_dt(clock::now() + chrono::Duration::minutes(30)));
        let _ = store.save_notify(&ns);
        return;
    }
    let route = action.strip_prefix("open:").unwrap_or("today");
    show_main(app, Some(route));
}

pub fn apply_autostart(app: &AppHandle, enabled: bool) -> Result<bool, String> {
    if enabled {
        autostart::enable()?;
    } else {
        autostart::disable()?;
    }
    let store = app.state::<store::Store>();
    {
        let _g = store.lock();
        let mut s = store.load_settings();
        s.autostart_wanted = enabled;
        store.save_settings(&s)?;
    }
    let on = autostart::is_enabled();
    tray::set_autostart_checked(app, on);
    let _ = app.emit("settings-changed", ());
    Ok(on)
}

pub fn toggle_autostart(app: &AppHandle) {
    let want = !autostart::is_enabled();
    if let Err(e) = apply_autostart(app, want) {
        eprintln!("автозапуск: {e}");
        tray::set_autostart_checked(app, autostart::is_enabled());
    }
}

fn data_dir(app: &tauri::App) -> Result<PathBuf, String> {
    if let Some(d) = std::env::var_os("NEXTDAY_DATA_DIR") {
        return Ok(PathBuf::from(d));
    }
    app.path().app_data_dir().map_err(|e| e.to_string())
}

fn manage_autostart() -> bool {
    !cfg!(debug_assertions) && std::env::var_os("NEXTDAY_DATA_DIR").is_none()
}

pub fn run() {
    clock::init_from_env();
    let mut builder = tauri::Builder::default();
    if std::env::var_os("NEXTDAY_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if argv.iter().any(|a| a == "--quit") {
                quit_gracefully(app);
                return;
            }
            if !argv.iter().any(|a| a == "--autostart") {
                show_main(app, None);
            }
        }));
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PendingRoute::default())
        .manage(McpState::default())
        .manage(WinBounds::default())
        .manage(lock::DrillRuntime::default())
        .setup(|app| {
            if std::env::args().any(|a| a == "--quit") {
                std::process::exit(0);
            }
            let dir = data_dir(app)?;
            let store = store::Store::open(dir.clone())?;
            if !store.settings_exist() {
                let s = model::Settings::default();
                store.save_settings(&s)?;
                if manage_autostart() && s.autostart_wanted {
                    if let Err(e) = autostart::enable() {
                        eprintln!("автозапуск не включён: {e}");
                    }
                }
            } else if manage_autostart()
                && store.load_settings().autostart_wanted
                && (!autostart::is_registered() || autostart::points_elsewhere())
            {
                let _ = autostart::enable();
            }
            app.manage(store);
            app.asset_protocol_scope().allow_directory(dir.join("assets"), true)?;
            notify::setup(&dir);
            tray::build(app.handle())?;
            goals::autoplan(&app.state::<store::Store>(), clock::now());
            scheduler::refresh_tray(app.handle());
            updater::start(app.handle());
            if app.state::<store::Store>().load_settings().mcp_enabled {
                mcp_start(app.handle());
            }

            let hidden = std::env::args().any(|a| a == "--autostart" || a == "--hidden");
            if !hidden {
                show_main(app.handle(), None);
            }
            scheduler::spawn(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label().starts_with("drill-") {
                    if lock::locked(window.app_handle()) {
                        api.prevent_close();
                    }
                    return;
                }
                api.prevent_close();
                hide_to_tray(window.app_handle());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::get_day,
            commands::get_board,
            commands::list_days,
            commands::list_tasks,
            commands::save_plan,
            commands::set_check,
            commands::set_start,
            commands::save_board,
            commands::import_image,
            commands::import_image_path,
            commands::seal_day,
            commands::save_settings,
            commands::set_autostart,
            commands::test_notification,
            commands::hide_to_tray,
            commands::quit_app,
            commands::take_pending_route,
            commands::update_status,
            commands::check_update,
            commands::install_update,
            commands::list_goals,
            commands::save_goal,
            commands::set_goal_status,
            commands::delete_goal,
            commands::edit_topics,
            commands::record_task_result,
            commands::mcp_info,
            commands::set_mcp_enabled,
            commands::debug_shift_time,
            commands::debug_tick,
            commands::drill_overview,
            commands::drill_deck,
            commands::drill_save_deck,
            commands::drill_delete_deck,
            commands::drill_reset_progress,
            commands::drill_save_preset,
            commands::drill_delete_preset,
            commands::drill_set_default,
            commands::drill_set_prefs,
            commands::drill_set_topic,
            commands::drill_start,
            commands::drill_session,
            commands::drill_reveal,
            commands::drill_answer,
            commands::drill_escape,
            commands::drill_close,
            commands::drill_dismiss,
            commands::drill_articles,
            commands::drill_save_article,
            commands::drill_delete_article,
            commands::drill_hint,
            commands::drill_gen_sources,
            commands::drill_generator,
            commands::drill_check_generator,
            commands::drill_save_generator,
            commands::drill_disable_generator,
            commands::drill_import_bank,
            commands::drill_set_gate,
            commands::drill_save_check,
            commands::drill_delete_check,
            commands::drill_reset_checks,
        ])
        .build(tauri::generate_context!())
        .expect("не удалось запустить Next Day")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
