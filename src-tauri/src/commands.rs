use crate::lock::{self, DrillRuntime};
use crate::model::*;
use crate::store::Store;
use crate::{autostart, clock, drill, goals, logic, notify, scheduler, updater, McpState, PendingRoute};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use tauri::ipc::{InvokeBody, Request};
use tauri::{AppHandle, Emitter, Manager, State};

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

#[tauri::command]
pub fn list_goals(store: State<'_, Store>) -> Vec<GoalView> {
    goals::views(&store, clock::now())
}

fn goal_changed(app: &AppHandle, store: &Store, id: &str) -> Result<GoalView, String> {
    scheduler::refresh_tray(app);
    let _ = app.emit("data-changed", ());
    goals::view(store, clock::now(), id).ok_or_else(|| "Цель не найдена.".into())
}

#[tauri::command]
pub fn save_goal(app: AppHandle, store: State<'_, Store>, goal: GoalInput) -> Result<GoalView, String> {
    let g = goals::save(&store, clock::now(), goal, Author::User)?;
    goal_changed(&app, &store, &g.id)
}

#[tauri::command]
pub fn edit_topics(
    app: AppHandle,
    store: State<'_, Store>,
    goal_id: String,
    upsert: Vec<TopicInput>,
    remove: Vec<String>,
) -> Result<GoalView, String> {
    goals::edit_topics(&store, clock::now(), &goal_id, upsert, remove)?;
    goal_changed(&app, &store, &goal_id)
}

#[tauri::command]
pub fn set_goal_status(app: AppHandle, store: State<'_, Store>, id: String, status: GoalStatus) -> Result<GoalView, String> {
    goals::set_status(&store, clock::now(), &id, status)?;
    goal_changed(&app, &store, &id)
}

#[tauri::command]
pub fn delete_goal(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    goals::delete(&store, clock::now(), &id)?;
    scheduler::refresh_tray(&app);
    let _ = app.emit("data-changed", ());
    Ok(())
}

#[tauri::command]
pub fn record_task_result(
    app: AppHandle,
    store: State<'_, Store>,
    goal_id: String,
    task_id: String,
    result: ResultInput,
) -> Result<GoalView, String> {
    goals::record(&store, clock::now(), &goal_id, &task_id, result, Author::User)?;
    goal_changed(&app, &store, &goal_id)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    pub enabled: bool,
    pub running: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    pub exe: String,
    pub error: Option<String>,
}

#[tauri::command]
pub fn mcp_info(app: AppHandle, store: State<'_, Store>) -> McpInfo {
    let run = app.state::<McpState>();
    let run = run.0.lock().unwrap_or_else(|e| e.into_inner());
    let running = run.server.is_some();
    McpInfo {
        enabled: store.load_settings().mcp_enabled,
        running,
        url: running.then(|| format!("http://127.0.0.1:{}/mcp", run.port)),
        token: running.then(|| run.token.clone()),
        exe: std::env::current_exe().map(|p| p.to_string_lossy().to_string()).unwrap_or_default(),
        error: run.error.clone(),
    }
}

#[tauri::command]
pub fn set_mcp_enabled(app: AppHandle, store: State<'_, Store>, enabled: bool) -> Result<McpInfo, String> {
    {
        let _g = store.lock();
        let mut s = store.load_settings();
        s.mcp_enabled = enabled;
        store.save_settings(&s)?;
    }
    if enabled {
        crate::mcp_start(&app);
    } else {
        crate::mcp_stop(&app);
    }
    Ok(mcp_info(app.clone(), store))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DrillOverview {
    #[serde(flatten)]
    pub base: drill::Overview,
    pub active: Option<drill::SessionView>,
}

fn drill_changed(app: &AppHandle) {
    let _ = app.emit("drill-changed", ());
}

#[tauri::command]
pub fn drill_overview(store: State<'_, Store>, rt: State<'_, DrillRuntime>) -> DrillOverview {
    let now = clock::now();
    let active = rt.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|s| drill::view(s, now));
    DrillOverview { base: drill::overview(&store, now), active }
}

#[tauri::command]
pub fn drill_deck(store: State<'_, Store>, id: String) -> Result<Value, String> {
    drill::get_deck(&store, &id)
}

#[tauri::command]
pub fn drill_save_deck(app: AppHandle, store: State<'_, Store>, deck: drill::DeckInput) -> Result<drill::Deck, String> {
    let d = drill::save_deck(&store, clock::now(), deck, Author::User)?;
    drill_changed(&app);
    Ok(d)
}

#[tauri::command]
pub fn drill_delete_deck(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    drill::delete_deck(&store, &id)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_reset_progress(app: AppHandle, store: State<'_, Store>, deck: String) -> Result<(), String> {
    drill::reset_progress(&store, &deck)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_save_preset(app: AppHandle, store: State<'_, Store>, preset: drill::Preset, make_default: bool) -> Result<drill::Preset, String> {
    let p = drill::save_preset(&store, preset, make_default)?;
    drill_changed(&app);
    Ok(p)
}

#[tauri::command]
pub fn drill_delete_preset(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    drill::delete_preset(&store, &id)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_set_default(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    drill::set_default(&store, &id)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_set_prefs(app: AppHandle, store: State<'_, Store>, prefs: drill::BuiltinPrefs) -> Result<(), String> {
    drill::set_prefs(&store, prefs)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_set_topic(app: AppHandle, store: State<'_, Store>, deck: String, topic: String, open: bool) -> Result<(), String> {
    drill::set_topic(&store, clock::now(), &deck, &topic, open)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn drill_start(app: AppHandle, preset_id: String, generated: Option<drill::Generated>) -> Result<drill::SessionView, String> {
    let store = app.state::<Store>();
    let rt = app.state::<DrillRuntime>();
    let now = clock::now();
    let (id, lock_screen, view) = {
        let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
        if g.as_ref().is_some_and(|s| s.ended.is_none()) {
            return Err("Сеанс уже идёт.".into());
        }
        let s = drill::start(&store, now, &preset_id, generated.unwrap_or_default())?;
        let out = (s.id.clone(), s.preset.screen == drill::Screen::Lock, drill::view(&s, now));
        *g = Some(s);
        out
    };
    if lock_screen {
        if let Err(e) = lock::open(&app) {
            rt.0.lock().unwrap_or_else(|e| e.into_inner()).take();
            lock::close_windows(&app);
            return Err(format!("Не удалось закрыть экран: {e}"));
        }
    }
    lock::watch(app.clone(), id);
    drill_changed(&app);
    Ok(view)
}

#[tauri::command]
pub fn drill_gen_sources(store: State<'_, Store>, preset_id: String) -> Result<Vec<drill::GenSource>, String> {
    drill::gen_sources(&store, &preset_id)
}

#[tauri::command]
pub fn drill_generator(store: State<'_, Store>, id: String) -> Result<drill::Generator, String> {
    drill::get_generator(&store, &id)
}

#[tauri::command]
pub fn drill_check_generator(topics: Vec<drill::BankTopic>, templates: Vec<drill::BankCard>, made: HashMap<String, Vec<drill::Variant>>) -> Result<drill::GenCheck, String> {
    drill::check_generator(topics, templates, &made)
}

#[tauri::command]
pub fn drill_save_generator(app: AppHandle, store: State<'_, Store>, generator: drill::GeneratorInput) -> Result<drill::Generator, String> {
    let g = drill::save_generator(&store, clock::now(), generator, Author::User)?;
    drill_changed(&app);
    Ok(g)
}

#[tauri::command]
pub fn drill_disable_generator(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    drill::disable_generator(&store, &id)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub async fn drill_import_bank(app: AppHandle, text: String, replace: Option<String>) -> Result<drill::ImportReport, String> {
    let store = app.state::<Store>();
    let input = drill::parse_bank(&text)?;
    let r = drill::import_bank(&store, clock::now(), input, replace.as_deref(), Author::User)?;
    drill_changed(&app);
    Ok(r)
}

#[tauri::command]
pub fn drill_set_gate(app: AppHandle, store: State<'_, Store>, deck: String, gate: drill::Gate) -> Result<(), String> {
    drill::set_gate(&store, &deck, gate)?;
    drill_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn drill_session(rt: State<'_, DrillRuntime>) -> Option<drill::SessionView> {
    let now = clock::now();
    rt.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().map(|s| drill::view(s, now))
}

#[tauri::command]
pub fn drill_reveal(rt: State<'_, DrillRuntime>) -> Result<drill::SessionView, String> {
    let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.as_mut().ok_or("Сеанса нет.")?;
    drill::reveal(s)?;
    Ok(drill::view(s, clock::now()))
}

#[tauri::command]
pub fn drill_answer(store: State<'_, Store>, rt: State<'_, DrillRuntime>, input: drill::AnswerInput) -> Result<drill::AnswerView, String> {
    let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.as_mut().ok_or("Сеанса нет.")?;
    drill::answer(&store, s, clock::now(), input)
}

#[tauri::command]
pub async fn drill_escape(app: AppHandle) -> Result<drill::SessionRecord, String> {
    let store = app.state::<Store>();
    let rt = app.state::<DrillRuntime>();
    let (rec, id) = {
        let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
        let s = g.as_mut().ok_or("Сеанса нет.")?;
        if s.preset.screen == drill::Screen::Lock && s.preset.escape == drill::Escape::Off && s.ended.is_none() {
            return Err("В этом режиме выхода нет: только ответы или потолок времени.".into());
        }
        let outcome = if s.preset.screen == drill::Screen::Lock { drill::Outcome::Escape } else { drill::Outcome::Stopped };
        (drill::finish(&store, s, clock::now(), outcome), s.id.clone())
    };
    if rec.screen == drill::Screen::Lock {
        lock::ended(&app, &id);
    }
    drill_changed(&app);
    Ok(rec)
}

#[tauri::command]
pub async fn drill_close(app: AppHandle) {
    let rt = app.state::<DrillRuntime>();
    let id = rt.0.lock().unwrap_or_else(|e| e.into_inner()).as_ref().filter(|s| s.ended.is_some()).map(|s| s.id.clone());
    if let Some(id) = id {
        lock::ended(&app, &id);
    }
}

#[tauri::command]
pub fn drill_dismiss(app: AppHandle, rt: State<'_, DrillRuntime>) {
    let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
    if g.as_ref().is_some_and(|s| s.ended.is_some()) {
        *g = None;
    }
    drop(g);
    drill_changed(&app);
}

#[tauri::command]
pub fn drill_articles(store: State<'_, Store>) -> Vec<drill::Article> {
    drill::articles(&store)
}

#[tauri::command]
pub fn drill_save_article(app: AppHandle, store: State<'_, Store>, article: drill::ArticleInput) -> Result<drill::Article, String> {
    let a = drill::save_article(&store, clock::now(), article, Author::User)?;
    drill_changed(&app);
    Ok(a)
}

#[tauri::command]
pub fn drill_delete_article(app: AppHandle, store: State<'_, Store>, id: String) -> Result<(), String> {
    drill::delete_article(&store, &id)?;
    drill_changed(&app);
    Ok(())
}

#[derive(Serialize)]
pub struct HintPlace {
    pub deck: String,
    pub topic: String,
}

#[tauri::command]
pub fn drill_hint(rt: State<'_, DrillRuntime>) -> Option<HintPlace> {
    let mut g = rt.0.lock().unwrap_or_else(|e| e.into_inner());
    let s = g.as_mut()?;
    if s.ended.is_some() {
        return None;
    }
    drill::hint(s).map(|(deck, topic)| HintPlace { deck, topic })
}
