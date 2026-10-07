use crate::model::*;
use crate::store::Store;
use crate::{autostart, clock, logic, notify, scheduler, updater, PendingRoute};
use serde_json::Value;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, State};

pub fn debug_mode() -> bool {
    std::env::var("NEXTDAY_DEBUG").is_ok_and(|v| v == "1")
}

#[tauri::command]
pub fn get_overview(store: State<'_, Store>) -> Overview {
    logic::overview(&store, clock::now(), autostart::is_enabled(), debug_mode())
}

#[tauri::command]
pub fn get_day(store: State<'_, Store>, date: String) -> Option<Day> {
    logic::get_day(&store, clock::now(), &date)
}

#[tauri::command]
pub fn get_board(store: State<'_, Store>, date: String) -> Option<Value> {
    logic::get_board(&store, &date)
}

#[tauri::command]
pub fn list_tasks(store: State<'_, Store>) -> Vec<TaskNode> {
    logic::list_tasks(&store)
}

#[tauri::command]
pub fn list_days(store: State<'_, Store>) -> Vec<DaySummary> {
    logic::list_days(&store, clock::now())
}

#[tauri::command]
pub fn save_plan(app: AppHandle, store: State<'_, Store>, date: String, plan: PlanInput) -> Result<Day, String> {
    let day = logic::save_plan(&store, clock::now(), &date, plan)?;
    scheduler::refresh_tray(&app);
    Ok(day)
}

#[tauri::command]
pub fn set_check(app: AppHandle, store: State<'_, Store>, date: String, item_id: String, done: bool) -> Result<Day, String> {
    let day = logic::set_check(&store, clock::now(), &date, &item_id, done)?;
    scheduler::refresh_tray(&app);
    Ok(day)
}

#[tauri::command]
pub fn set_start(app: AppHandle, store: State<'_, Store>, date: String, item_id: String, hour: Option<u8>) -> Result<Day, String> {
    let day = logic::set_start(&store, clock::now(), &date, &item_id, hour)?;
    scheduler::refresh_tray(&app);
    Ok(day)
}

#[tauri::command]
pub fn save_board(store: State<'_, Store>, date: String, board: Value) -> Result<String, String> {
    logic::save_board(&store, clock::now(), &date, &board)
}

#[tauri::command]
pub async fn import_image(store: State<'_, Store>, request: Request<'_>) -> Result<AssetInfo, String> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };
    let date = header("x-date").ok_or("Не указан день.")?;
    let ext = header("x-ext").unwrap_or_else(|| "png".into());
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("Картинка пришла не байтами.".into());
    };
    logic::import_image(&store, clock::now(), &date, &ext, bytes)
}

#[tauri::command]
pub async fn import_image_path(store: State<'_, Store>, date: String, path: String) -> Result<AssetInfo, String> {
    logic::import_image_path(&store, clock::now(), &date, std::path::Path::new(&path))
}

#[tauri::command]
pub fn seal_day(
    app: AppHandle,
    store: State<'_, Store>,
    date: String,
    rating: u8,
    summary: Option<String>,
) -> Result<Day, String> {
    let day = logic::seal(&store, clock::now(), &date, rating, summary)?;
    scheduler::refresh_tray(&app);
    Ok(day)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, store: State<'_, Store>, settings: Settings) -> Result<Settings, String> {
    let s = logic::save_settings(&store, settings)?;
    scheduler::refresh_tray(&app);
    Ok(s)
}

#[tauri::command]
pub fn set_autostart(app: AppHandle, enabled: bool) -> Result<bool, String> {
    crate::apply_autostart(&app, enabled)
}

#[tauri::command]
pub fn test_notification(app: AppHandle) {
    notify::show(
        &app,
        "Проверка связи",
        "Так будут выглядеть напоминания Next Day.",
        "settings",
        &[("Открыть", "open:settings")],
    );
}

#[tauri::command]
pub fn hide_to_tray(app: AppHandle) {
    crate::hide_to_tray(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    crate::quit_gracefully(&app);
}

#[tauri::command]
pub fn take_pending_route(pending: State<'_, PendingRoute>) -> Option<String> {
    pending.0.lock().unwrap_or_else(|e| e.into_inner()).take()
}

#[tauri::command]
pub fn update_status(app: AppHandle) -> updater::UpdateStatus {
    updater::status(&app)
}

#[tauri::command]
pub fn check_update(app: AppHandle) {
    updater::check_in_background(&app);
}

#[tauri::command]
pub fn install_update(app: AppHandle) -> Result<(), String> {
    updater::install(&app, false)
}

#[tauri::command]
pub fn debug_shift_time(app: AppHandle, minutes: i64) -> Result<String, String> {
    if !debug_mode() {
        return Err("Доступно только в режиме отладки.".into());
    }
    clock::shift(minutes);
    scheduler::tick(&app);
    let _ = app.emit("day-changed", ());
    Ok(clock::fmt_dt(clock::now()))
}

#[tauri::command]
pub fn debug_tick(app: AppHandle) -> Result<(), String> {
    if !debug_mode() {
        return Err("Доступно только в режиме отладки.".into());
    }
    scheduler::tick(&app);
    Ok(())
}
