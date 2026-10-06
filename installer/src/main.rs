#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod setup;

use serde::Deserialize;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};

struct Mode {
    uninstall: bool,
    from_temp: bool,
}

static WORKING: AtomicBool = AtomicBool::new(false);

fn webview_dir() -> PathBuf {
    std::env::temp_dir().join("next-day-setup-webview")
}

#[tauri::command]
fn setup_info(mode: State<'_, Mode>) -> setup::Info {
    setup::info(mode.uninstall)
}

#[derive(Deserialize)]
struct InstallArgs {
    desktop: bool,
    autostart: bool,
    dir: Option<String>,
}

#[tauri::command]
fn check_dir(path: String) -> Result<setup::DirCheck, String> {
    setup::check_dir(&path)
}

#[tauri::command]
async fn install(app: AppHandle, opts: InstallArgs) -> Result<(), String> {
    WORKING.store(true, Ordering::SeqCst);
    let o = setup::InstallOptions { desktop: opts.desktop, autostart: opts.autostart, dir: opts.dir };
    let res = tauri::async_runtime::spawn_blocking(move || {
        setup::install(&o, |s| {
            let _ = app.emit("setup-steps", s.to_vec());
        }, true)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    WORKING.store(false, Ordering::SeqCst);
    res
}

#[tauri::command]
async fn uninstall(app: AppHandle, remove_data: bool) -> Result<(), String> {
    WORKING.store(true, Ordering::SeqCst);
    let res = tauri::async_runtime::spawn_blocking(move || {
        setup::uninstall(remove_data, |s| {
            let _ = app.emit("setup-steps", s.to_vec());
        }, true)
    })
    .await
    .map_err(|e| e.to_string())
    .and_then(|r| r);
    WORKING.store(false, Ordering::SeqCst);
    res
}

#[tauri::command]
fn launch_app() -> Result<(), String> {
    setup::launch()
}

#[tauri::command]
fn finish(app: AppHandle, mode: State<'_, Mode>) {
    setup::cleanup_later(&webview_dir(), mode.from_temp);
    app.exit(0);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let has = |flag: &str| args.iter().any(|a| a == flag);
    let uninstall_mode = has("--uninstall");
    let from_temp = has("--from-temp");

    if uninstall_mode && !from_temp && setup::relaunch_from_temp() {
        return;
    }

    if has("--quiet") {
        let res = if uninstall_mode {
            setup::uninstall(has("--remove-data"), |_| {}, false)
        } else {
            let opts = setup::InstallOptions {
                desktop: !has("--no-desktop"),
                autostart: !has("--no-autostart"),
                dir: setup::arg_value("--dir"),
            };
            setup::install(&opts, |_| {}, false).and_then(|_| if has("--launch") { setup::launch() } else { Ok(()) })
        };
        if let Err(e) = &res {
            eprintln!("{e}");
        }
        if from_temp {
            setup::cleanup_later(&webview_dir(), true);
        }
        std::process::exit(if res.is_ok() { 0 } else { 1 });
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Mode { uninstall: uninstall_mode, from_temp })
        .setup(move |app| {
            let title = if uninstall_mode { "Удаление Next Day" } else { "Установка Next Day" };
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("installer.html".into()))
                .title(title)
                .inner_size(760.0, 580.0)
                .resizable(false)
                .maximizable(false)
                .decorations(false)
                .shadow(true)
                .center()
                .background_color(Color(26, 28, 44, 255))
                .data_directory(webview_dir())
                .build()?;
            Ok(())
        })
        .on_window_event(|_, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if WORKING.load(Ordering::SeqCst) {
                    api.prevent_close();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![setup_info, check_dir, install, uninstall, launch_app, finish])
        .run(tauri::generate_context!())
        .expect("не удалось запустить установщик Next Day");
}
