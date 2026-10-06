#[cfg(windows)]
mod imp {
    use winreg::enums::{RegType, HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::{RegKey, RegValue};

    const RUN: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
    const APPROVED: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
    const NAME: &str = "Next Day";

    pub fn command_line() -> String {
        let exe = std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default();
        format!("\"{exe}\" --autostart")
    }

    fn registered() -> Option<String> {
        RegKey::predef(HKEY_CURRENT_USER).open_subkey(RUN).ok()?.get_value::<String, _>(NAME).ok()
    }

    pub fn is_registered() -> bool {
        registered().is_some()
    }

    fn approved() -> bool {
        match RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey(APPROVED)
            .and_then(|k| k.get_raw_value(NAME))
        {
            Ok(v) => v.bytes.first().is_none_or(|b| b & 1 == 0),
            Err(_) => true,
        }
    }

    pub fn is_enabled() -> bool {
        registered().is_some() && approved()
    }

    pub fn enable() -> Result<(), String> {
        let (run, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(RUN).map_err(|e| e.to_string())?;
        run.set_value(NAME, &command_line()).map_err(|e| e.to_string())?;
        if let Ok(k) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(APPROVED, KEY_SET_VALUE) {
            let on = RegValue { bytes: vec![2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], vtype: RegType::REG_BINARY };
            let _ = k.set_raw_value(NAME, &on);
        }
        Ok(())
    }

    pub fn disable() -> Result<(), String> {
        if let Ok(run) = RegKey::predef(HKEY_CURRENT_USER).open_subkey_with_flags(RUN, KEY_SET_VALUE) {
            match run.delete_value(NAME) {
                Ok(()) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(e.to_string()),
            }
        }
        Ok(())
    }

    pub fn points_elsewhere() -> bool {
        registered().is_some_and(|v| v != command_line())
    }
}

#[cfg(not(windows))]
mod imp {
    pub fn is_enabled() -> bool {
        false
    }
    pub fn enable() -> Result<(), String> {
        Err("Автозапуск сделан только для Windows.".into())
    }
    pub fn disable() -> Result<(), String> {
        Ok(())
    }
    pub fn points_elsewhere() -> bool {
        false
    }
    pub fn is_registered() -> bool {
        false
    }
}

pub use imp::*;
