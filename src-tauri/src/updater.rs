use crate::notify;
use crate::store::Store;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Emitter, Manager};
use ureq::tls::{RootCerts, TlsConfig, TlsProvider};

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
const MANIFEST_URL: &str = "https://github.com/IgorBerezkin/NextDay/releases/latest/download/latest.json";
const PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDdCOEE3MzdBQjI4QjZGNEMKUldSTWI0dXllbk9LZXpRaStNOXFSNlJ6SU1hcjhRVmpJU1VqSlN4UDUyVmM5WUVaZmJiYnZPYXEK";
const FIRST_CHECK: Duration = Duration::from_secs(60);
const CHECK_EVERY: Duration = Duration::from_secs(6 * 3600);
const RETRY_AFTER: Duration = Duration::from_secs(3600);
const TICK: Duration = Duration::from_secs(20);
const MAX_DOWNLOAD: u64 = 200 * 1024 * 1024;

#[derive(Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Phase {
    Idle,
    Checking,
    Downloading,
    Ready,
    Installing,
    Latest,
    Failed,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub allowed: bool,
    pub phase: Phase,
    pub version: Option<String>,
    pub error: Option<String>,
}

struct Inner {
    status: UpdateStatus,
    installer: Option<PathBuf>,
}

pub struct Updater(Mutex<Inner>);

#[derive(Deserialize)]
struct Manifest {
    version: String,
    url: String,
    signature: String,
}

pub fn start(app: &AppHandle) {
    let _ = fs::remove_dir_all(download_dir());
    announce(app);
    let status = UpdateStatus { allowed: allowed(), phase: Phase::Idle, version: None, error: None };
    app.manage(Updater(Mutex::new(Inner { status, installer: None })));
    let app = app.clone();
    std::thread::spawn(move || run(app));
}

pub fn status(app: &AppHandle) -> UpdateStatus {
    lock(app).status.clone()
}

pub fn check_in_background(app: &AppHandle) {
    if !status(app).allowed {
        return;
    }
    let app = app.clone();
    std::thread::spawn(move || {
        check(&app, true);
    });
}

pub fn install(app: &AppHandle, hidden: bool) -> Result<(), String> {
    let (path, version) = {
        let s = lock(app);
        (s.installer.clone(), s.status.version.clone())
    };
    let (Some(path), Some(version)) = (path, version) else {
        return Err("Обновление ещё не скачано.".into());
    };
    remember_try(app, &version);
    set(app, Phase::Installing, Some(version.clone()), None);
    let mut cmd = Command::new(&path);
    cmd.args(["--quiet", "--update", "--launch"]);
    if hidden {
        cmd.arg("--hidden");
    }
    match cmd.spawn() {
        Ok(mut child) => {
            let app = app.clone();
            std::thread::spawn(move || {
                let _ = child.wait();
                let msg = format!("Версия {version} не встала. Попробуйте ещё раз позже.");
                set(&app, Phase::Failed, Some(version), Some(msg));
            });
            Ok(())
        }
        Err(e) => {
            let msg = format!("Не удалось запустить установщик: {e}");
            set(app, Phase::Failed, Some(version), Some(msg.clone()));
            Err(msg)
        }
    }
}

fn run(app: AppHandle) {
    let mut next_check = SystemTime::now() + FIRST_CHECK;
    loop {
        std::thread::sleep(TICK);
        let s = status(&app);
        if !s.allowed || !app.state::<Store>().load_settings().auto_update {
            continue;
        }
        if s.phase == Phase::Ready {
            if window_hidden(&app) {
                let _ = install(&app, true);
            }
            continue;
        }
        if SystemTime::now() >= next_check {
            let ok = check(&app, false);
            next_check = SystemTime::now() + if ok { CHECK_EVERY } else { RETRY_AFTER };
        }
    }
}

fn check(app: &AppHandle, manual: bool) -> bool {
    if !claim(app) {
        return true;
    }
    set(app, Phase::Checking, None, None);
    let m = match fetch_manifest() {
        Ok(Some(m)) if newer(&m.version, VERSION) => m,
        Ok(_) => {
            set(app, Phase::Latest, None, None);
            return true;
        }
        Err(e) => {
            set(app, Phase::Failed, None, Some(e));
            return false;
        }
    };
    if !manual && tried(app, &m.version) {
        let msg = format!("Версия {} не встала сама. Её можно поставить вручную.", m.version);
        set(app, Phase::Failed, Some(m.version), Some(msg));
        return true;
    }
    set(app, Phase::Downloading, Some(m.version.clone()), None);
    match download(&m) {
        Ok(path) => {
            lock(app).installer = Some(path);
            set(app, Phase::Ready, Some(m.version), None);
            true
        }
        Err(e) => {
            set(app, Phase::Failed, Some(m.version), Some(e));
            false
        }
    }
}

fn claim(app: &AppHandle) -> bool {
    let mut s = lock(app);
    let busy = matches!(s.status.phase, Phase::Checking | Phase::Downloading | Phase::Installing);
    if !busy {
        s.status.phase = Phase::Checking;
    }
    !busy
}

fn lock(app: &AppHandle) -> MutexGuard<'_, Inner> {
    app.state::<Updater>().inner().0.lock().unwrap_or_else(|e| e.into_inner())
}

fn set(app: &AppHandle, phase: Phase, version: Option<String>, error: Option<String>) {
    let status = {
        let mut s = lock(app);
        s.status = UpdateStatus { allowed: s.status.allowed, phase, version, error };
        s.status.clone()
    };
    let _ = app.emit("update-changed", status);
}

fn announce(app: &AppHandle) {
    let store = app.state::<Store>();
    let upgraded = {
        let _g = store.lock();
        let mut ns = store.load_notify();
        if ns.last_version.as_deref() == Some(VERSION) {
            return;
        }
        let upgraded = ns.last_version.as_deref().is_some_and(|prev| newer(VERSION, prev));
        ns.last_version = Some(VERSION.to_string());
        let _ = store.save_notify(&ns);
        upgraded
    };
    if upgraded {
        notify::show(app, "Next Day обновился", &format!("Установлена версия {VERSION}."), "settings", &[]);
    }
}

fn tried(app: &AppHandle, version: &str) -> bool {
    app.state::<Store>().load_notify().update_tried.as_deref() == Some(version)
}

fn remember_try(app: &AppHandle, version: &str) {
    let store = app.state::<Store>();
    let _g = store.lock();
    let mut ns = store.load_notify();
    ns.update_tried = Some(version.to_string());
    let _ = store.save_notify(&ns);
}

fn window_hidden(app: &AppHandle) -> bool {
    app.get_webview_window("main").is_none_or(|w| !w.is_visible().unwrap_or(false))
}

fn download_dir() -> PathBuf {
    std::env::temp_dir().join("next-day-update")
}

fn manifest_url() -> String {
    std::env::var("NEXTDAY_UPDATE_URL").unwrap_or_else(|_| MANIFEST_URL.into())
}

fn agent() -> ureq::Agent {
    let tls = TlsConfig::builder()
        .provider(TlsProvider::NativeTls)
        .root_certs(RootCerts::PlatformVerifier)
        .build();
    ureq::Agent::config_builder()
        .tls_config(tls)
        .timeout_global(Some(Duration::from_secs(600)))
        .user_agent(format!("NextDay/{VERSION}"))
        .build()
        .into()
}

fn net_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::StatusCode(code) => format!("Сервер обновлений ответил ошибкой {code}."),
        ureq::Error::Timeout(_) => "Сервер обновлений не ответил вовремя.".into(),
        _ => "Не удалось связаться с сервером обновлений. Проверьте интернет.".into(),
    }
}

fn fetch_manifest() -> Result<Option<Manifest>, String> {
    let text = match agent().get(&manifest_url()).call() {
        Ok(mut r) => r.body_mut().read_to_string().map_err(net_error)?,
        Err(ureq::Error::StatusCode(404)) => return Ok(None),
        Err(e) => return Err(net_error(e)),
    };
    serde_json::from_str(&text).map(Some).map_err(|_| "Описание обновления не читается.".into())
}

fn download(m: &Manifest) -> Result<PathBuf, String> {
    let mut r = agent().get(&m.url).call().map_err(net_error)?;
    let bytes = r.body_mut().with_config().limit(MAX_DOWNLOAD).read_to_vec().map_err(net_error)?;
    verify(&bytes, &m.signature, &m.version)?;
    let dir = download_dir();
    fs::create_dir_all(&dir).map_err(|e| format!("Не удалось сохранить обновление: {e}"))?;
    let path = dir.join(format!("NextDaySetup-{}.exe", m.version));
    fs::write(&path, &bytes).map_err(|e| format!("Не удалось сохранить обновление: {e}"))?;
    Ok(path)
}

fn verify(data: &[u8], signature: &str, version: &str) -> Result<(), String> {
    let bad = || "Подпись обновления не сошлась, ставить его небезопасно.".to_string();
    let key = unbase64(PUBLIC_KEY).and_then(|t| PublicKey::decode(&t).ok()).ok_or_else(bad)?;
    let sig = unbase64(signature).and_then(|t| Signature::decode(&t).ok()).ok_or_else(bad)?;
    key.verify(data, &sig, false).map_err(|_| bad())?;
    let signed = sig.trusted_comment().split('\t').find_map(|f| f.strip_prefix("version:"));
    if signed == Some(version) {
        Ok(())
    } else {
        Err(bad())
    }
}

fn unbase64(s: &str) -> Option<String> {
    STANDARD.decode(s.trim()).ok().and_then(|b| String::from_utf8(b).ok())
}

fn parse_version(v: &str) -> Option<(u64, u64, u64)> {
    let mut parts = v.trim().trim_start_matches('v').split('.').map(|p| p.parse::<u64>().ok());
    let triple = (parts.next()??, parts.next()??, parts.next()??);
    parts.next().is_none().then_some(triple)
}

fn newer(candidate: &str, current: &str) -> bool {
    matches!((parse_version(candidate), parse_version(current)), (Some(a), Some(b)) if a > b)
}

fn allowed() -> bool {
    !cfg!(debug_assertions) && installed_here()
}

#[cfg(windows)]
fn installed_here() -> bool {
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let key = format!(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\{}", notify::APP_ID);
    let registered = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey(key)
        .and_then(|k| k.get_value::<String, _>("InstallLocation"));
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    match (registered, exe_dir) {
        (Ok(dir), Some(here)) => same_dir(Path::new(&dir), &here),
        _ => false,
    }
}

#[cfg(not(windows))]
fn installed_here() -> bool {
    false
}

fn same_dir(a: &Path, b: &Path) -> bool {
    matches!((a.canonicalize(), b.canonicalize()), (Ok(x), Ok(y)) if x == y)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_SIG: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkKUlVSTWI0dXllbk9LZTVKQXg1UWFYd2JFZjA2TURHNkthV3A2YTlmL1FMRnM3eHBCRmhUR29IeG95YUtTdkZ6dWJoS1ZTRkNkYXJoTkM2SzBvT3YyY2IzZWV1MDJ5cUREa3c4PQp0cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzkxMzE0MTYxCWZpbGU6c2FtcGxlLmJpbgl2ZXJzaW9uOjAuMS4yCnlSbTBqNFdRWS8wVlN6SjhWL01KRE82bnd3SHpmS1F3YS9BVVpQbjJ0MHhNNWxzTkF6bGZJVjZXMHRPY0ZOSk5tYlFUT3RsYVR0cUtlR0ovbzZpQUR3PT0K";

    #[test]
    fn versions_compare_by_numbers() {
        assert!(newer("0.1.10", "0.1.9"));
        assert!(newer("v0.2.0", "0.1.9"));
        assert!(newer("1.0.0", "0.9.9"));
        assert!(!newer("0.1.2", "0.1.2"));
        assert!(!newer("0.1.1", "0.1.2"));
        assert!(!newer("0.2.0-beta", "0.1.0"));
        assert!(!newer("0.2", "0.1.0"));
        assert!(!newer("0.2.0.1", "0.1.0"));
    }

    #[test]
    fn signature_matches_key_data_and_version() {
        assert!(verify(b"next-day", SAMPLE_SIG, "0.1.2").is_ok());
        assert!(verify(b"next-dax", SAMPLE_SIG, "0.1.2").is_err());
        assert!(verify(b"next-day", SAMPLE_SIG, "0.1.3").is_err());
        assert!(verify(b"next-day", "garbage", "0.1.2").is_err());
    }

    #[test]
    fn manifest_reads() {
        let m: Manifest = serde_json::from_str(r#"{"version":"0.1.3","url":"https://x/y.exe","signature":"abc"}"#).unwrap();
        assert_eq!(m.version, "0.1.3");
        assert_eq!(m.url, "https://x/y.exe");
    }
}
