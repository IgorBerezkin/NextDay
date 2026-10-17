use std::sync::Mutex;
use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Wry};

const TRAY: &[u8] = include_bytes!("../icons/tray.png");
const TRAY_ALERT: &[u8] = include_bytes!("../icons/tray-alert.png");

pub struct TrayState {
    items: Vec<MenuItem<Wry>>,
    autostart: CheckMenuItem<Wry>,
    size: u32,
    last: Mutex<(Option<bool>, String)>,
}

fn icon(alert: bool, size: u32) -> Image<'static> {
    let src = Image::from_bytes(if alert { TRAY_ALERT } else { TRAY }).expect("иконка трея");
    let (w, h) = (src.width(), src.height());
    if size == w || size == 0 {
        return src.to_owned();
    }
    let rgba = src.rgba();
    let mut out = vec![0u8; (size * size * 4) as usize];
    for y in 0..size {
        for x in 0..size {
            let (sx, sy) = (x * w / size, y * h / size);
            let si = ((sy * w + sx) * 4) as usize;
            let di = ((y * size + x) * 4) as usize;
            out[di..di + 4].copy_from_slice(&rgba[si..si + 4]);
        }
    }
    Image::new_owned(out, size, size)
}

fn labels() -> [(&'static str, String); 5] {
    [
        ("open", tr!("Открыть Next Day", "Open Next Day")),
        ("today", tr!("Сегодня", "Today")),
        ("tomorrow", tr!("Завтрашний день", "Tomorrow")),
        ("history", tr!("История", "History")),
        ("quit", tr!("Выход", "Quit")),
    ]
}

fn autostart_label() -> String {
    tr!("Запускать вместе с Windows", "Start with Windows")
}

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let items = labels().into_iter().map(|(id, text)| MenuItem::with_id(app, id, text, true, None::<&str>)).collect::<tauri::Result<Vec<_>>>()?;
    let [open, today, tomorrow, history, quit] = [&items[0], &items[1], &items[2], &items[3], &items[4]];
    let autostart = CheckMenuItem::with_id(app, "autostart", autostart_label(), true, crate::autostart::is_enabled(), None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            open,
            &PredefinedMenuItem::separator(app)?,
            today,
            tomorrow,
            history,
            &PredefinedMenuItem::separator(app)?,
            &autostart,
            &PredefinedMenuItem::separator(app)?,
            quit,
        ],
    )?;

    let scale = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| m.scale_factor())
        .unwrap_or(1.0);
    let size = ((16.0 * scale).round() as u32).clamp(16, 64);

    TrayIconBuilder::with_id("main")
        .icon(icon(false, size))
        .tooltip("Next Day")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => crate::show_main(app, None),
            "today" => crate::show_main(app, Some("today")),
            "tomorrow" => crate::show_main(app, Some("tomorrow")),
            "history" => crate::show_main(app, Some("history")),
            "autostart" => crate::toggle_autostart(app),
            "quit" => crate::quit_gracefully(app),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::show_main(tray.app_handle(), None);
            }
        })
        .build(app)?;

    app.manage(TrayState { items, autostart, size, last: Mutex::new((None, String::new())) });
    Ok(())
}

pub fn relabel(app: &AppHandle) {
    let Some(state) = app.try_state::<TrayState>() else { return };
    for (item, (_, text)) in state.items.iter().zip(labels()) {
        let _ = item.set_text(text);
    }
    let _ = state.autostart.set_text(autostart_label());
}

pub fn update(app: &AppHandle, alert: bool, tooltip: &str) {
    let (Some(state), Some(tray)) = (app.try_state::<TrayState>(), app.tray_by_id("main")) else { return };
    let mut last = state.last.lock().unwrap_or_else(|e| e.into_inner());
    if last.0 != Some(alert) {
        let _ = tray.set_icon(Some(icon(alert, state.size)));
        last.0 = Some(alert);
    }
    if last.1 != tooltip {
        let _ = tray.set_tooltip(Some(tooltip));
        last.1 = tooltip.to_string();
    }
}

pub fn set_autostart_checked(app: &AppHandle, on: bool) {
    if let Some(s) = app.try_state::<TrayState>() {
        let _ = s.autostart.set_checked(on);
    }
}
