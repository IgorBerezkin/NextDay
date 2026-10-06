use crate::model::{Day, NotifyState, Settings};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct Store {
    pub dir: PathBuf,
    lock: Mutex<()>,
}

impl Store {
    pub fn open(dir: PathBuf) -> Result<Self, String> {
        for sub in ["days", "boards", "assets"] {
            fs::create_dir_all(dir.join(sub))
                .map_err(|e| format!("Не удалось создать папку {}: {e}", dir.join(sub).display()))?;
        }
        Ok(Self { dir, lock: Mutex::new(()) })
    }

    pub fn lock(&self) -> MutexGuard<'_, ()> {
        self.lock.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn day_path(&self, date: &str) -> PathBuf {
        self.dir.join("days").join(format!("{date}.json"))
    }

    fn board_path(&self, date: &str) -> PathBuf {
        self.dir.join("boards").join(format!("{date}.json"))
    }

    pub fn assets_dir(&self, date: &str) -> PathBuf {
        self.dir.join("assets").join(date)
    }

    pub fn load_day(&self, date: &str) -> Option<Day> {
        read_json(&self.day_path(date))
    }

    pub fn save_day(&self, day: &Day) -> Result<(), String> {
        write_json(&self.day_path(&day.date), day)
    }

    pub fn load_board(&self, date: &str) -> Option<Value> {
        read_json(&self.board_path(date))
    }

    pub fn save_board_text(&self, date: &str, text: &str) -> Result<(), String> {
        write_text(&self.board_path(date), text)
    }

    pub fn list_dates(&self) -> Vec<String> {
        let mut out = Vec::new();
        if let Ok(rd) = fs::read_dir(self.dir.join("days")) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if let Some(stem) = name.strip_suffix(".json") {
                    if crate::clock::parse_date(stem).is_some() {
                        out.push(stem.to_string());
                    }
                }
            }
        }
        out.sort();
        out
    }

    pub fn settings_exist(&self) -> bool {
        self.dir.join("settings.json").exists()
    }

    pub fn load_settings(&self) -> Settings {
        read_json(&self.dir.join("settings.json")).unwrap_or_default()
    }

    pub fn save_settings(&self, s: &Settings) -> Result<(), String> {
        write_json(&self.dir.join("settings.json"), s)
    }

    pub fn load_notify(&self) -> NotifyState {
        read_json(&self.dir.join("notify.json")).unwrap_or_default()
    }

    pub fn save_notify(&self, s: &NotifyState) -> Result<(), String> {
        write_json(&self.dir.join("notify.json"), s)
    }

    pub fn gc_assets(&self, date: &str) {
        let dir = self.assets_dir(date);
        let Ok(rd) = fs::read_dir(&dir) else { return };
        let mut keep = HashSet::new();
        if let Some(board) = self.load_board(date) {
            if let Some(items) = board.get("items").and_then(|v| v.as_array()) {
                for it in items {
                    if let Some(src) = it.get("src").and_then(|v| v.as_str()) {
                        keep.insert(src.to_string());
                    }
                }
            }
        }
        for e in rd.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if !keep.contains(&name) {
                let _ = fs::remove_file(e.path());
            }
        }
        let _ = fs::remove_dir(&dir);
    }
}

pub fn uid() -> String {
    static SEQ: AtomicU32 = AtomicU32::new(0);
    let ms = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    format!("{ms:x}{n:x}")
}

fn read_json<T: DeserializeOwned>(p: &Path) -> Option<T> {
    let text = fs::read_to_string(p).ok()?;
    match serde_json::from_str(text.trim_start_matches('\u{feff}')) {
        Ok(v) => Some(v),
        Err(e) => {
            let backup = p.with_extension(format!("broken-{}.json", uid()));
            eprintln!("файл {} не читается ({e}), переименован в {}", p.display(), backup.display());
            let _ = fs::rename(p, backup);
            None
        }
    }
}

fn write_json<T: Serialize>(p: &Path, v: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    write_text(p, &text)
}

fn write_text(p: &Path, text: &str) -> Result<(), String> {
    let tmp = p.with_extension("tmp");
    fs::write(&tmp, text).map_err(|e| format!("Не удалось записать {}: {e}", p.display()))?;
    fs::rename(&tmp, p).map_err(|e| format!("Не удалось сохранить {}: {e}", p.display()))
}
