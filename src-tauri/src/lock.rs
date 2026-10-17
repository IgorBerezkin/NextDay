use crate::drill::{self, Screen, Session};
use crate::store::Store;
use crate::{clock, show_main};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::window::Color;
use tauri::{AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
pub struct DrillRuntime(pub Mutex<Option<Session>>);

pub const MAIN: &str = "drill-main";

static CLOSED: Mutex<String> = Mutex::new(String::new());

pub fn windowed() -> bool {
    std::env::var("NEXTDAY_DRILL_WINDOWED").is_ok_and(|v| v == "1")
}

pub fn locked(app: &AppHandle) -> bool {
    app.try_state::<DrillRuntime>().is_some_and(|rt| {
        rt.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().is_some_and(|s| s.ended.is_none() && s.preset.screen == Screen::Lock)
    })
}

fn build(app: &AppHandle, label: &str) -> tauri::Result<tauri::WebviewWindow> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(tr!("Next Day: Зубрилка", "Next Day: Drill"))
        .decorations(false)
        .background_color(Color(26, 28, 44, 255))
        .visible(false)
        .build()
}

pub fn open(app: &AppHandle) -> Result<(), String> {
    close_windows(app);
    if windowed() {
        let w = build(app, MAIN).map_err(|e| e.to_string())?;
        let _ = w.set_size(tauri::LogicalSize::new(1000.0, 720.0));
        let _ = w.center();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary = app.primary_monitor().ok().flatten();
    let main_idx = primary
        .as_ref()
        .and_then(|p| monitors.iter().position(|m| m.position() == p.position() && m.size() == p.size()))
        .unwrap_or(0);
    let mut targets: Vec<(String, Option<&tauri::Monitor>)> = Vec::new();
    if monitors.is_empty() {
        targets.push((MAIN.into(), None));
    }
    for (i, m) in monitors.iter().enumerate() {
        let label = if i == main_idx { MAIN.to_string() } else { format!("drill-{i}") };
        targets.push((label, Some(m)));
    }
    targets.sort_by_key(|(l, _)| l == MAIN);
    for (label, m) in targets {
        let w = build(app, &label).map_err(|e| e.to_string())?;
        let _ = w.set_skip_taskbar(true);
        let _ = w.set_resizable(false);
        let _ = w.set_always_on_top(true);
        if let Some(m) = m {
            let _ = w.set_position(PhysicalPosition::new(m.position().x, m.position().y));
            let _ = w.set_size(PhysicalSize::new(m.size().width, m.size().height));
            let logical = m.size().width as f64 / m.scale_factor().max(0.5);
            let _ = w.set_zoom(((logical / 1400.0).clamp(1.0, 2.0) * 4.0).round() / 4.0);
        }
        let _ = w.set_fullscreen(true);
        let _ = w.show();
        if label == MAIN {
            let _ = w.set_focus();
        }
    }
    Ok(())
}

pub fn close_windows(app: &AppHandle) {
    for (label, w) in app.webview_windows() {
        if label.starts_with("drill-") {
            let _ = w.destroy();
        }
    }
}

pub fn ended(app: &AppHandle, id: &str) {
    {
        let mut closed = CLOSED.lock().unwrap_or_else(|e| e.into_inner());
        if *closed == id {
            return;
        }
        *closed = id.to_string();
    }
    close_windows(app);
    let _ = app.emit("drill-changed", ());
    show_main(app, Some("drill"));
}

#[cfg(windows)]
fn taskmgr_front() -> bool {
    use std::ffi::c_void;
    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> *mut c_void;
        fn GetClassNameW(hwnd: *mut c_void, name: *mut u16, max: i32) -> i32;
    }
    unsafe {
        let h = GetForegroundWindow();
        if h.is_null() {
            return false;
        }
        let mut buf = [0u16; 128];
        let n = GetClassNameW(h, buf.as_mut_ptr(), buf.len() as i32);
        n > 0 && String::from_utf16_lossy(&buf[..n as usize]) == "TaskManagerWindow"
    }
}

#[cfg(not(windows))]
fn taskmgr_front() -> bool {
    false
}

fn guard_focus(app: &AppHandle, last: &mut Option<Instant>, lowered: &mut bool) {
    let Some(w) = app.get_webview_window(MAIN) else { return };
    let tm = taskmgr_front();
    if tm != *lowered {
        for (label, x) in app.webview_windows() {
            if label.starts_with("drill-") {
                let _ = x.set_always_on_top(!tm);
            }
        }
        *lowered = tm;
    }
    if tm || w.is_focused().unwrap_or(true) {
        return;
    }
    if last.is_some_and(|t| t.elapsed() < Duration::from_secs(1)) {
        return;
    }
    *last = Some(Instant::now());
    let _ = w.unminimize();
    let _ = w.set_always_on_top(true);
    let _ = w.set_focus();
}

pub fn watch(app: AppHandle, id: String) {
    std::thread::spawn(move || {
        let mut last_focus: Option<Instant> = None;
        let mut ended_at: Option<Instant> = None;
        let mut lowered = false;
        loop {
            std::thread::sleep(Duration::from_millis(400));
            let (lock, finished) = {
                let rt = app.state::<DrillRuntime>();
                let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
                let Some(s) = g.as_mut().filter(|s| s.id == id) else { break };
                let lock = s.preset.screen == Screen::Lock;
                if s.ended.is_some() {
                    (lock, Some(false))
                } else {
                    let store = app.state::<Store>();
                    (lock, drill::tick(&store, s, clock::now()).map(|_| true))
                }
            };
            match finished {
                Some(true) => {
                    let _ = app.emit("drill-changed", ());
                    if lock {
                        ended(&app, &id);
                    }
                    break;
                }
                Some(false) => {
                    if !lock {
                        break;
                    }
                    if ended_at.get_or_insert_with(Instant::now).elapsed() >= Duration::from_secs(4) {
                        ended(&app, &id);
                        break;
                    }
                    continue;
                }
                None => {}
            }
            if lock && !windowed() {
                guard_focus(&app, &mut last_focus, &mut lowered);
            }
        }
    });
}
