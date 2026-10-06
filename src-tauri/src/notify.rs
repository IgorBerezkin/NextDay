use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::AppHandle;

pub const APP_ID: &str = "ru.igorberezkin.nextday";
const DISPLAY_NAME: &str = "Next Day";

static ICON: OnceLock<PathBuf> = OnceLock::new();

pub fn setup(data_dir: &Path) {
    let icon = data_dir.join("toast-icon.png");
    if let Err(e) = std::fs::write(&icon, include_bytes!("../icons/toast.png")) {
        eprintln!("иконка уведомлений не записана: {e}");
    }
    #[cfg(windows)]
    if let Err(e) = register_app_id(&icon) {
        eprintln!("AppUserModelID не зарегистрирован: {e}");
    }
    let _ = ICON.set(icon);
}

#[cfg(windows)]
fn register_app_id(icon: &Path) -> std::io::Result<()> {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let (key, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(format!(r"Software\Classes\AppUserModelId\{APP_ID}"))?;
    key.set_value("DisplayName", &DISPLAY_NAME)?;
    key.set_value("IconUri", &icon.to_string_lossy().to_string())?;
    key.set_value("IconBackgroundColor", &"FF29366F")?;
    Ok(())
}

pub fn show(app: &AppHandle, title: &str, body: &str, route: &str, buttons: &[(&str, &str)]) {
    #[cfg(windows)]
    {
        use tauri_winrt_notification::{IconCrop, Toast};
        let app2 = app.clone();
        let route = route.to_string();
        let mut toast = Toast::new(APP_ID).title(title).text1(body);
        if let Some(icon) = ICON.get() {
            toast = toast.icon(icon, IconCrop::Square, "");
        }
        for (label, action) in buttons {
            toast = toast.add_button(label, action);
        }
        toast = toast.on_activated(move |action| {
            let action = action.unwrap_or_else(|| format!("open:{route}"));
            crate::on_toast_action(&app2, &action);
            Ok(())
        });
        if let Err(e) = toast.show() {
            eprintln!("уведомление не показано: {e}");
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (app, title, body, route, buttons);
    }
}
