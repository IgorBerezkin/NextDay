use serde::Serialize;
use serde_json::{json, Value};
use std::fs;
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;
use winreg::enums::{RegType, HKEY_CURRENT_USER, KEY_SET_VALUE};
use winreg::{RegKey, RegValue};

static PAYLOAD: &[u8] = include_bytes!("../../src-tauri/target/release/next-day.exe");
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

const APP: &str = "Next Day";
const EXE: &str = "Next Day.exe";
const UNINSTALLER: &str = "uninstall.exe";
const IDENT: &str = "ru.igorberezkin.nextday";
const UNINSTALL_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Uninstall\ru.igorberezkin.nextday";
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
const APPROVED_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
const AUMID_KEY: &str = r"Software\Classes\AppUserModelId\ru.igorberezkin.nextday";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

fn env_dir(var: &str) -> PathBuf {
    std::env::var_os(var).map(PathBuf::from).unwrap_or_default()
}

pub fn arg_value(name: &str) -> Option<String> {
    let args: Vec<String> = std::env::args().collect();
    args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
}

pub fn default_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("NEXTDAY_INSTALL_DIR") {
        return PathBuf::from(d);
    }
    env_dir("LOCALAPPDATA").join("Programs").join(APP)
}

fn registered_dir() -> Option<PathBuf> {
    RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(UNINSTALL_KEY)
        .ok()?
        .get_value::<String, _>("InstallLocation")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
}

pub fn install_dir() -> PathBuf {
    if let Some(d) = arg_value("--install-dir") {
        return PathBuf::from(d);
    }
    registered_dir().unwrap_or_else(default_dir)
}

fn data_dir() -> PathBuf {
    if let Some(d) = std::env::var_os("NEXTDAY_DATA_DIR") {
        return PathBuf::from(d);
    }
    env_dir("APPDATA").join(IDENT)
}

fn webview_dir() -> PathBuf {
    env_dir("LOCALAPPDATA").join(IDENT)
}

fn start_menu_lnk() -> PathBuf {
    env_dir("APPDATA").join(r"Microsoft\Windows\Start Menu\Programs").join(format!("{APP}.lnk"))
}

fn desktop_lnk() -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_Desktop, SHGetKnownFolderPath, KF_FLAG_DEFAULT};
    unsafe {
        let p = SHGetKnownFolderPath(&FOLDERID_Desktop, KF_FLAG_DEFAULT, None).ok()?;
        let s = p.to_string().ok();
        CoTaskMemFree(Some(p.0 as *const _));
        s.map(|d| PathBuf::from(d).join(format!("{APP}.lnk")))
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Info {
    pub uninstall: bool,
    pub version: String,
    pub install_dir: String,
    pub default_dir: String,
    pub installed_version: Option<String>,
    pub desktop_shortcut: bool,
    pub autostart: bool,
    pub size_mb: f64,
    pub data_dir: String,
    pub data_exists: bool,
}

pub fn info(uninstall: bool) -> Info {
    let dir = install_dir();
    let installed_version = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(UNINSTALL_KEY)
        .ok()
        .and_then(|k| k.get_value::<String, _>("DisplayVersion").ok())
        .filter(|_| dir.join(EXE).exists());
    Info {
        uninstall,
        version: VERSION.into(),
        install_dir: dir.display().to_string(),
        default_dir: default_dir().display().to_string(),
        installed_version,
        desktop_shortcut: desktop_lnk().is_some_and(|p| p.exists()),
        autostart: run_value().is_some(),
        size_mb: (PAYLOAD.len() as f64 / 1_048_576.0 * 10.0).round() / 10.0,
        data_dir: data_dir().display().to_string(),
        data_exists: data_dir().exists(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirCheck {
    pub path: String,
    pub has_other_files: bool,
}

pub fn check_dir(input: &str) -> Result<DirCheck, String> {
    let dir = normalize_dir(input)?;
    check_writable(&dir)?;
    let has_other_files = fs::read_dir(&dir)
        .map(|rd| {
            rd.flatten().any(|e| {
                let n = e.file_name().to_string_lossy().to_lowercase();
                n != EXE.to_lowercase() && n != UNINSTALLER && !n.ends_with(".new")
            })
        })
        .unwrap_or(false);
    Ok(DirCheck { path: dir.display().to_string(), has_other_files })
}

fn normalize_dir(input: &str) -> Result<PathBuf, String> {
    let raw = input.trim().trim_matches('"').trim();
    if raw.is_empty() {
        return Err("Укажите папку для установки.".into());
    }
    let mut s = raw.replace('/', "\\");
    while s.ends_with('\\') && !s.ends_with(":\\") {
        s.pop();
    }
    if s.len() == 2 && s.ends_with(':') {
        s.push('\\');
    }
    let p = PathBuf::from(s);
    if !p.is_absolute() {
        return Err("Нужен полный путь, например D:\\Programs.".into());
    }
    let named = p.file_name().is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case(APP));
    Ok(if named { p } else { p.join(APP) })
}

fn check_writable(dir: &Path) -> Result<(), String> {
    let mut probe_dir = dir.to_path_buf();
    while !probe_dir.exists() {
        match probe_dir.parent() {
            Some(p) => probe_dir = p.to_path_buf(),
            None => return Err(format!("Диска {} нет.", dir.display())),
        }
    }
    if !probe_dir.is_dir() {
        return Err(format!("Это файл, а не папка: {}", probe_dir.display()));
    }
    let probe = probe_dir.join(format!(".nextday-check-{}", std::process::id()));
    match fs::write(&probe, b"ok") {
        Ok(()) => {
            let _ = fs::remove_file(&probe);
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => Err(format!(
            "Нет прав на запись в {}. Выберите папку в своём профиле или на другом диске.",
            probe_dir.display()
        )),
        Err(e) => Err(format!("В {} записать не получается: {e}", probe_dir.display())),
    }
}

#[derive(Serialize, Clone)]
pub struct Step {
    pub label: String,
    pub state: &'static str,
}

struct Steps<F: Fn(&[Step])> {
    list: Vec<Step>,
    emit: F,
    pace: bool,
}

impl<F: Fn(&[Step])> Steps<F> {
    fn new(labels: Vec<String>, emit: F, pace: bool) -> Self {
        let list = labels.into_iter().map(|label| Step { label, state: "wait" }).collect::<Vec<_>>();
        emit(&list);
        Self { list, emit, pace }
    }

    fn run<T>(&mut self, i: usize, f: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
        self.list[i].state = "run";
        (self.emit)(&self.list);
        let r = f();
        if self.pace {
            std::thread::sleep(Duration::from_millis(260));
        }
        self.list[i].state = if r.is_ok() { "done" } else { "fail" };
        (self.emit)(&self.list);
        r
    }
}

pub struct InstallOptions {
    pub desktop: bool,
    pub autostart: Option<bool>,
    pub dir: Option<String>,
}

impl InstallOptions {
    pub fn keep_current() -> Self {
        Self { desktop: desktop_lnk().is_some_and(|p| p.exists()), autostart: None, dir: None }
    }
}

pub fn install(opts: &InstallOptions, emit: impl Fn(&[Step]), pace: bool) -> Result<(), String> {
    let dir = match &opts.dir {
        Some(d) => normalize_dir(d)?,
        None => install_dir(),
    };
    check_writable(&dir)?;
    let exe = dir.join(EXE);
    let old_dir = registered_dir().filter(|old| !same_path(old, &dir) && old.join(EXE).exists());
    let running = is_running();

    let mut labels = Vec::new();
    if running {
        labels.push("Закрываю запущенный Next Day".to_string());
    }
    labels.push("Копирую программу".into());
    labels.push("Значок в меню «Пуск»".into());
    if opts.desktop {
        labels.push("Значок на рабочем столе".into());
    }
    if let Some(on) = opts.autostart {
        labels.push(if on { "Автозапуск вместе с Windows" } else { "Без автозапуска" }.into());
    }
    labels.push("Запись в «Приложениях» Windows".into());
    if old_dir.is_some() {
        labels.push("Убираю старую копию".into());
    }

    let mut st = Steps::new(labels, emit, pace);
    let mut i = 0;
    if running {
        let any_exe = old_dir.clone().unwrap_or_else(|| dir.clone()).join(EXE);
        st.run(i, || {
            stop_app(&any_exe);
            Ok(())
        })?;
        i += 1;
    }
    st.run(i, || write_files(&dir))?;
    i += 1;
    st.run(i, || create_shortcut(&start_menu_lnk(), &exe, &dir))?;
    i += 1;
    if opts.desktop {
        st.run(i, || match desktop_lnk() {
            Some(p) => create_shortcut(&p, &exe, &dir),
            None => Err("Не удалось найти рабочий стол.".into()),
        })?;
        i += 1;
    } else if let Some(p) = desktop_lnk() {
        let _ = fs::remove_file(p);
    }
    if let Some(on) = opts.autostart {
        st.run(i, || set_autostart(on, &exe))?;
        i += 1;
    }
    st.run(i, || register(&dir))?;
    i += 1;
    if let Some(old) = old_dir {
        st.run(i, || {
            remove_own_files(&old);
            Ok(())
        })?;
    }
    Ok(())
}

fn same_path(a: &Path, b: &Path) -> bool {
    let norm = |p: &Path| p.display().to_string().replace('/', "\\").trim_end_matches('\\').to_lowercase();
    norm(a) == norm(b)
}

pub fn uninstall(remove_data: bool, emit: impl Fn(&[Step]), pace: bool) -> Result<(), String> {
    let dir = install_dir();
    let mut labels = vec![
        "Закрываю Next Day".to_string(),
        "Убираю значки".into(),
        "Убираю автозапуск и записи в реестре".into(),
        "Удаляю программу".into(),
    ];
    if remove_data {
        labels.push("Удаляю мои дни и доски".into());
    }
    let mut st = Steps::new(labels, emit, pace);
    st.run(0, || {
        stop_app(&dir.join(EXE));
        Ok(())
    })?;
    st.run(1, || {
        let _ = fs::remove_file(start_menu_lnk());
        if let Some(p) = desktop_lnk() {
            let _ = fs::remove_file(p);
        }
        Ok(())
    })?;
    st.run(2, || {
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        for key in [RUN_KEY, APPROVED_KEY] {
            if let Ok(k) = hkcu.open_subkey_with_flags(key, KEY_SET_VALUE) {
                let _ = k.delete_value(APP);
            }
        }
        let _ = hkcu.delete_subkey_all(AUMID_KEY);
        let _ = hkcu.delete_subkey_all(UNINSTALL_KEY);
        Ok(())
    })?;
    st.run(3, || {
        let left = remove_own_files(&dir);
        if left {
            Err(format!("Не удалось удалить файлы в {}.", dir.display()))
        } else {
            Ok(())
        }
    })?;
    if remove_data {
        st.run(4, || {
            remove_dir_retry(&data_dir())?;
            let _ = fs::remove_dir_all(webview_dir());
            Ok(())
        })?;
    }
    Ok(())
}

fn remove_own_files(dir: &Path) -> bool {
    let mut stuck = false;
    for name in [EXE, UNINSTALLER, &format!("{EXE}.new")] {
        let f = dir.join(name);
        if !f.exists() {
            continue;
        }
        let mut ok = false;
        for _ in 0..15 {
            if fs::remove_file(&f).is_ok() {
                ok = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(200));
        }
        stuck |= !ok;
    }
    let _ = fs::remove_dir(dir);
    stuck
}

fn write_files(dir: &Path) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("Не удалось создать папку {}: {e}", dir.display()))?;
    let target = dir.join(EXE);
    let tmp = dir.join(format!("{EXE}.new"));
    fs::write(&tmp, PAYLOAD).map_err(|e| format!("Не удалось записать программу: {e}"))?;
    let mut last_err = None;
    for _ in 0..30 {
        match fs::rename(&tmp, &target) {
            Ok(()) => {
                last_err = None;
                break;
            }
            Err(e) => {
                last_err = Some(e);
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
    if let Some(e) = last_err {
        let _ = fs::remove_file(&tmp);
        return Err(format!("Не удалось заменить программу: {e}"));
    }
    let me = std::env::current_exe().map_err(|e| e.to_string())?;
    let un = dir.join(UNINSTALLER);
    if !same_path(&me, &un) {
        fs::copy(&me, &un).map_err(|e| format!("Не удалось записать {UNINSTALLER}: {e}"))?;
    }
    Ok(())
}

fn create_shortcut(lnk: &Path, target: &Path, workdir: &Path) -> Result<(), String> {
    use windows::core::{Interface, HSTRING};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, IPersistFile, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED};
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};
    let err = |e: windows::core::Error| format!("Не удалось создать ярлык {}: {e}", lnk.display());
    if let Some(parent) = lnk.parent() {
        let _ = fs::create_dir_all(parent);
    }
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).map_err(err)?;
        link.SetPath(&HSTRING::from(target)).map_err(err)?;
        link.SetWorkingDirectory(&HSTRING::from(workdir)).map_err(err)?;
        link.SetDescription(&HSTRING::from("Next Day: план на завтра и итоги дня")).map_err(err)?;
        link.SetIconLocation(&HSTRING::from(target), 0).map_err(err)?;
        let file: IPersistFile = link.cast().map_err(err)?;
        file.Save(&HSTRING::from(lnk), true).map_err(err)?;
    }
    Ok(())
}

fn run_value() -> Option<String> {
    RegKey::predef(HKEY_CURRENT_USER).open_subkey(RUN_KEY).ok()?.get_value::<String, _>(APP).ok()
}

fn set_autostart(on: bool, exe: &Path) -> Result<(), String> {
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if on {
        let (run, _) = hkcu.create_subkey(RUN_KEY).map_err(|e| e.to_string())?;
        run.set_value(APP, &format!("\"{}\" --autostart", exe.display())).map_err(|e| e.to_string())?;
        if let Ok(k) = hkcu.open_subkey_with_flags(APPROVED_KEY, KEY_SET_VALUE) {
            let on = RegValue { bytes: vec![2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], vtype: RegType::REG_BINARY };
            let _ = k.set_raw_value(APP, &on);
        }
    } else if let Ok(run) = hkcu.open_subkey_with_flags(RUN_KEY, KEY_SET_VALUE) {
        let _ = run.delete_value(APP);
    }
    write_setting("autostartWanted", json!(on))
}

fn write_setting(key: &str, value: Value) -> Result<(), String> {
    let dir = data_dir();
    let path = dir.join("settings.json");
    let mut s: Value = fs::read_to_string(&path)
        .ok()
        .and_then(|t| serde_json::from_str(t.trim_start_matches('\u{feff}')).ok())
        .filter(|v: &Value| v.is_object())
        .unwrap_or_else(|| json!({}));
    s[key] = value;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let text = serde_json::to_string_pretty(&s).map_err(|e| e.to_string())?;
    fs::write(&path, text).map_err(|e| format!("Не удалось записать настройки: {e}"))
}

fn register(dir: &Path) -> Result<(), String> {
    let e = |e: std::io::Error| format!("Не удалось записать в реестр: {e}");
    let (k, _) = RegKey::predef(HKEY_CURRENT_USER).create_subkey(UNINSTALL_KEY).map_err(e)?;
    let exe = dir.join(EXE);
    let un = dir.join(UNINSTALLER);
    let size_kb = (PAYLOAD.len() + fs::metadata(&un).map(|m| m.len() as usize).unwrap_or(0)) / 1024;
    k.set_value("DisplayName", &APP).map_err(e)?;
    k.set_value("DisplayVersion", &VERSION).map_err(e)?;
    k.set_value("Publisher", &"IgorBerezkin").map_err(e)?;
    k.set_value("DisplayIcon", &format!("{},0", exe.display())).map_err(e)?;
    k.set_value("InstallLocation", &dir.display().to_string()).map_err(e)?;
    k.set_value("UninstallString", &format!("\"{}\" --uninstall", un.display())).map_err(e)?;
    k.set_value("QuietUninstallString", &format!("\"{}\" --uninstall --quiet", un.display())).map_err(e)?;
    k.set_value("NoModify", &1u32).map_err(e)?;
    k.set_value("NoRepair", &1u32).map_err(e)?;
    k.set_value("EstimatedSize", &(size_kb as u32)).map_err(e)?;
    Ok(())
}

pub fn is_running() -> bool {
    Command::new("tasklist")
        .args(["/FI", &format!("IMAGENAME eq {EXE}"), "/NH"])
        .creation_flags(CREATE_NO_WINDOW)
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(EXE))
        .unwrap_or(false)
}

fn stop_app(any_exe: &Path) {
    if !is_running() {
        return;
    }
    if any_exe.exists() {
        let _ = Command::new(any_exe)
            .arg("--quit")
            .env_remove("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS")
            .creation_flags(CREATE_NO_WINDOW)
            .spawn();
    }
    for _ in 0..25 {
        std::thread::sleep(Duration::from_millis(200));
        if !is_running() {
            return;
        }
    }
    let _ = Command::new("taskkill").args(["/F", "/IM", EXE]).creation_flags(CREATE_NO_WINDOW).status();
    std::thread::sleep(Duration::from_millis(400));
}

fn remove_dir_retry(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    let mut last = String::new();
    for _ in 0..15 {
        match fs::remove_dir_all(dir) {
            Ok(()) => return Ok(()),
            Err(e) => {
                last = e.to_string();
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
    Err(format!("Не удалось удалить {}: {last}", dir.display()))
}

pub fn launch(hidden: bool) -> Result<(), String> {
    let dir = install_dir();
    let mut cmd = Command::new(dir.join(EXE));
    cmd.current_dir(&dir).env_remove("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    if hidden {
        cmd.arg("--hidden");
    }
    cmd.spawn().map(|_| ()).map_err(|e| format!("Не удалось запустить Next Day: {e}"))
}

pub fn relaunch_from_temp() -> bool {
    let Ok(me) = std::env::current_exe() else { return false };
    let Some(dir) = me.parent().map(Path::to_path_buf) else { return false };
    if !dir.join(EXE).exists() {
        return false;
    }
    let tmp = std::env::temp_dir().join(format!("next-day-uninstall-{}.exe", std::process::id()));
    if fs::copy(&me, &tmp).is_err() {
        return false;
    }
    let args: Vec<String> = std::env::args().skip(1).collect();
    Command::new(&tmp)
        .args(&args)
        .arg("--from-temp")
        .arg("--install-dir")
        .arg(&dir)
        .spawn()
        .is_ok()
}

pub fn cleanup_later(webview: &Path, delete_self: bool) {
    let mut cmd = format!("/C ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"{}\"", webview.display());
    if delete_self {
        if let Ok(me) = std::env::current_exe() {
            cmd.push_str(&format!(" & del /f /q \"{}\"", me.display()));
        }
    }
    let _ = Command::new("cmd").raw_arg(cmd).creation_flags(CREATE_NO_WINDOW).spawn();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn folder_gets_app_name() {
        assert_eq!(normalize_dir("D:\\Programs").unwrap(), PathBuf::from("D:\\Programs\\Next Day"));
        assert_eq!(normalize_dir("D:\\Programs\\").unwrap(), PathBuf::from("D:\\Programs\\Next Day"));
        assert_eq!(normalize_dir("\"D:/Games/next day\"").unwrap(), PathBuf::from("D:\\Games\\next day"));
        assert_eq!(normalize_dir("D:\\").unwrap(), PathBuf::from("D:\\Next Day"));
        assert_eq!(normalize_dir("D:").unwrap(), PathBuf::from("D:\\Next Day"));
        assert!(normalize_dir("Programs").is_err());
        assert!(normalize_dir("  ").is_err());
    }
}
