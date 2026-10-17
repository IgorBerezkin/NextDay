use std::sync::OnceLock;

pub fn russian() -> bool {
    static RUSSIAN: OnceLock<bool> = OnceLock::new();
    *RUSSIAN.get_or_init(system_is_russian)
}

fn system_is_russian() -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        fn GetUserDefaultUILanguage() -> u16;
    }
    unsafe { GetUserDefaultUILanguage() & 0x3ff == 0x19 }
}

macro_rules! tr {
    ($ru:literal, $en:literal $(, $arg:expr)* $(,)?) => {
        if $crate::i18n::russian() {
            format!($ru $(, $arg)*)
        } else {
            format!($en $(, $arg)*)
        }
    };
}
