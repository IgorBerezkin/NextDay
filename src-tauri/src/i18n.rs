use std::sync::atomic::{AtomicBool, Ordering};

static ENGLISH: AtomicBool = AtomicBool::new(false);

pub fn set(lang: &str) {
    ENGLISH.store(lang == "en", Ordering::Relaxed);
}

pub fn en() -> bool {
    ENGLISH.load(Ordering::Relaxed)
}

pub fn pick(ru: &'static str, en: &'static str) -> &'static str {
    if self::en() {
        en
    } else {
        ru
    }
}

pub fn clean(lang: &str) -> String {
    match lang {
        "ru" | "en" => lang.to_string(),
        _ => system(),
    }
}

pub fn system() -> String {
    if system_is_russian() { "ru" } else { "en" }.to_string()
}

#[cfg(windows)]
fn system_is_russian() -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetUserDefaultUILanguage() -> u16;
    }
    unsafe { GetUserDefaultUILanguage() & 0x3ff == 0x19 }
}

#[cfg(not(windows))]
fn system_is_russian() -> bool {
    std::env::var("LANG").is_ok_and(|l| l.starts_with("ru"))
}

macro_rules! tr {
    ($ru:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::en() {
            format!($en $(, $arg)*)
        } else {
            format!($ru $(, $arg)*)
        }
    };
}
