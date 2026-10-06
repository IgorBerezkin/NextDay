fn main() {
    println!("cargo:rerun-if-changed=../src-tauri/target/release/next-day.exe");
    tauri_build::build()
}
