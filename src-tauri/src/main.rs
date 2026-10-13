#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if std::env::args().any(|a| a == "--mcp") {
        std::process::exit(next_day_lib::mcp::bridge());
    }
    next_day_lib::run()
}
