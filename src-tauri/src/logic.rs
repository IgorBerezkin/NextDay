use crate::clock::{self, fmt_date, fmt_dt, next, parse_date, prev};
use crate::model::*;
use crate::store::{uid, Store};
use chrono::{NaiveDate, NaiveDateTime};
use serde_json::Value;
use std::collections::HashSet;
use std::path::Path;

const MAX_SUBS: usize = 3;

pub struct Ctx {
    pub at: NaiveDateTime,
    pub today: NaiveDate,
    pub settings: Settings,
}

pub fn ctx(store: &Store, at: NaiveDateTime) -> Ctx {
    let settings = store.load_settings();
    let today = clock::logical_date(at, settings.day_start_hour);
    Ctx { at, today, settings }
}

fn date_arg(s: &str) -> Result<NaiveDate, String> {
    parse_date(s).ok_or_else(|| format!("Непонятная дата: {s}"))
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

fn ensure_open(c: &Ctx, date: NaiveDate) -> Result<(), String> {
    if date > c.today {
        return Err("Этот день ещё не начался.".into());
    }
    if date < prev(c.today) {
        return Err("Этот день уже закрыт, его можно только смотреть.".into());
    }
    Ok(())
}

fn open_day(store: &Store, c: &Ctx, date_s: &str) -> Result<Day, String> {
    let date = date_arg(date_s)?;
    ensure_open(c, date)?;
    let day = store
        .load_day(date_s)
        .filter(|d| d.has_plan())
        .ok_or("У этого дня нет плана.")?;
    if day.result.sealed {
        return Err("День запечатан, его можно только смотреть.".into());
    }
    Ok(day)
}

pub fn save_plan(store: &Store, at: NaiveDateTime, date_s: &str, input: PlanInput) -> Result<Day, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let date = date_arg(date_s)?;
    let tomorrow = next(c.today);
    let existing = store.load_day(date_s);
    let has_plan = existing.as_ref().is_some_and(|d| d.has_plan());

    let late = if date == tomorrow {
        false
    } else if date == c.today {
        if has_plan {
            return Err("Сегодняшний день уже начался, его план менять нельзя.".into());
        }
        true
    } else if date > tomorrow {
        return Err("Назвать можно только завтрашний день, дальше нельзя.".into());
    } else {
        return Err("Этот день уже прошёл.".into());
    };

    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Дайте дню имя.".into());
    }
    if chars(&name) > 80 {
        return Err("Имя дня должно быть не длиннее 80 символов.".into());
    }
    let description = input.description.trim().to_string();
    if chars(&description) > 4000 {
        return Err("Описание должно быть не длиннее 4000 символов.".into());
    }

    let checklist = match input.checklist {
        None => None,
        Some(items) => {
            let mut seen = HashSet::new();
            let mut out = Vec::new();
            for it in items {
                let text = it.text.trim().to_string();
                if text.is_empty() {
                    continue;
                }
                if chars(&text) > 300 {
                    return Err("Пункт чеклиста должен быть не длиннее 300 символов.".into());
                }
                let hours = match it.hours {
                    Some(h) if h.is_finite() && h > 0.0 => {
                        if h > 24.0 {
                            return Err("На один пункт можно не больше 24 часов.".into());
                        }
                        Some(((h * 4.0).round() / 4.0).max(0.25))
                    }
                    _ => None,
                };
                let attach = it.attach.map(|a| a.trim().to_string()).filter(|a| !a.is_empty());
                let id = unique_id(it.id, "i", &mut seen);
                let mut subs = Vec::new();
                for s in it.subs {
                    let text = s.text.trim().to_string();
                    if text.is_empty() {
                        continue;
                    }
                    if chars(&text) > 300 {
                        return Err("Подпункт должен быть не длиннее 300 символов.".into());
                    }
                    let id = unique_id(s.id, "s", &mut seen);
                    subs.push(SubItem { id, text, done: false, done_at: None });
                }
                if subs.len() > MAX_SUBS {
                    return Err("У пункта может быть не больше трёх подпунктов.".into());
                }
                let start = check_hour(it.start)?;
                let from = it.from.map(|r| resolve_ref(store, &r, date)).transpose()?;
                out.push(CheckItem { id, text, hours, attach, done: false, done_at: None, subs, start, from });
            }
            if out.len() > 40 {
                return Err("В чеклисте может быть не больше 40 пунктов.".into());
            }
            Some(out)
        }
    };

    let now_s = fmt_dt(c.at);
    let mut day = existing.unwrap_or_else(|| Day::new(date_s));
    match day.plan.as_mut() {
        Some(p) => {
            p.name = name;
            p.description = description;
            p.checklist = checklist;
            p.updated_at = now_s;
            p.edits += 1;
        }
        None => {
            day.plan = Some(Plan {
                name,
                description,
                checklist,
                created_at: now_s.clone(),
                updated_at: now_s,
                late,
                edits: 0,
            })
        }
    }
    store.save_day(&day)?;
    Ok(day)
}

pub fn set_check(store: &Store, at: NaiveDateTime, date_s: &str, item_id: &str, done: bool) -> Result<Day, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let mut day = open_day(store, &c, date_s)?;
    let items = day
        .plan
        .as_mut()
        .and_then(|p| p.checklist.as_mut())
        .ok_or("В плане нет чеклиста.")?;
    let stamp = done.then(|| fmt_dt(c.at));
    if let Some(it) = items.iter_mut().find(|i| i.id == item_id) {
        it.done = done;
        it.done_at = stamp.clone();
        for s in &mut it.subs {
            s.done = done;
            s.done_at = stamp.clone();
        }
    } else {
        let it = items
            .iter_mut()
            .find(|i| i.subs.iter().any(|s| s.id == item_id))
            .ok_or("Пункт не найден.")?;
        if let Some(s) = it.subs.iter_mut().find(|s| s.id == item_id) {
            s.done = done;
            s.done_at = stamp.clone();
        }
        let all = it.subs.iter().all(|s| s.done);
        if it.done != all {
            it.done = all;
            it.done_at = all.then(|| fmt_dt(c.at));
        }
    }
    store.save_day(&day)?;
    Ok(day)
}

pub fn set_start(store: &Store, at: NaiveDateTime, date_s: &str, item_id: &str, hour: Option<u8>) -> Result<Day, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let date = date_arg(date_s)?;
    let hour = check_hour(hour)?;
    let mut day = if date == next(c.today) {
        store.load_day(date_s).filter(|d| d.has_plan()).ok_or("У этого дня нет плана.")?
    } else if date == c.today {
        open_day(store, &c, date_s)?
    } else {
        return Err("Время задач можно ставить только на сегодня и завтра.".into());
    };
    let item = day
        .plan
        .as_mut()
        .and_then(|p| p.checklist.as_mut())
        .and_then(|items| items.iter_mut().find(|i| i.id == item_id))
        .ok_or("Пункт не найден.")?;
    item.start = hour;
    store.save_day(&day)?;
    Ok(day)
}

fn resolve_ref(store: &Store, r: &TaskRef, date: NaiveDate) -> Result<TaskRef, String> {
    let missing = || "Задача, которую продолжает пункт, не найдена.".to_string();
    let source_date = parse_date(&r.date).filter(|d| *d < date).ok_or_else(missing)?;
    let day = store.load_day(&fmt_date(source_date)).ok_or_else(missing)?;
    let item = day
        .plan
        .and_then(|p| p.checklist)
        .and_then(|items| items.into_iter().find(|i| i.id == r.id))
        .ok_or_else(missing)?;
    Ok(TaskRef { date: fmt_date(source_date), id: item.id, text: item.text })
}

pub fn list_tasks(store: &Store) -> Vec<TaskNode> {
    let mut out = Vec::new();
    for date in store.list_dates() {
        let Some(plan) = store.load_day(&date).and_then(|d| d.plan) else { continue };
        let items = plan.checklist.unwrap_or_default();
        if items.is_empty() {
            continue;
        }
        let notes = board_notes(store, &date);
        for it in items {
            out.push(TaskNode {
                note: notes.iter().find(|(r, _)| *r == it.id).map(|(_, t)| t.clone()),
                date: date.clone(),
                subs_total: it.subs.len() as u32,
                subs_done: it.subs.iter().filter(|s| s.done).count() as u32,
                day_name: plan.name.clone(),
                id: it.id,
                text: it.text,
                done: it.done,
                hours: it.hours,
                from: it.from,
            });
        }
    }
    out
}

fn board_notes(store: &Store, date: &str) -> Vec<(String, String)> {
    let Some(board) = store.load_board(date) else { return Vec::new() };
    let items = board.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
    items
        .iter()
        .filter(|i| i.get("kind").and_then(|k| k.as_str()) == Some("task"))
        .filter_map(|i| {
            let r = i.get("ref")?.as_str()?;
            let t = i.get("text")?.as_str()?.trim();
            (!t.is_empty()).then(|| (r.to_string(), t.to_string()))
        })
        .collect()
}

fn check_hour(hour: Option<u8>) -> Result<Option<u8>, String> {
    match hour {
        Some(h) if h > 23 => Err("Час задачи должен быть от 0 до 23.".into()),
        h => Ok(h),
    }
}

fn unique_id(given: Option<String>, prefix: &str, seen: &mut HashSet<String>) -> String {
    let mut id = given.filter(|s| !s.is_empty() && s.len() <= 40).unwrap_or_default();
    if id.is_empty() || seen.contains(&id) {
        id = format!("{prefix}{}", uid());
    }
    seen.insert(id.clone());
    id
}

pub fn save_board(store: &Store, at: NaiveDateTime, date_s: &str, board: &Value) -> Result<String, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let mut day = open_day(store, &c, date_s)?;
    if !board.is_object() {
        return Err("Доска пришла в непонятном виде.".into());
    }
    let text = serde_json::to_string(board).map_err(|e| e.to_string())?;
    if text.len() > 16 * 1024 * 1024 {
        return Err("Доска слишком большая.".into());
    }
    let items = board.get("items").and_then(|v| v.as_array()).map_or(0, |a| a.len()) as u32;
    let has_ink = board.get("ink").and_then(|v| v.as_str()).is_some_and(|s| !s.is_empty());
    store.save_board_text(date_s, &text)?;
    let now_s = fmt_dt(c.at);
    day.result.board_items = items;
    day.result.has_ink = has_ink;
    day.result.updated_at = Some(now_s.clone());
    store.save_day(&day)?;
    Ok(now_s)
}

const IMAGE_EXT: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const MAX_IMAGE: usize = 40 * 1024 * 1024;

fn image_ext(ext: &str) -> Result<String, String> {
    let e = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    if IMAGE_EXT.contains(&e.as_str()) {
        Ok(e)
    } else {
        Err(format!("Это не картинка (.{e}). Подойдут png, jpg, gif, webp, bmp."))
    }
}

pub fn import_image(store: &Store, at: NaiveDateTime, date_s: &str, ext: &str, bytes: &[u8]) -> Result<AssetInfo, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    open_day(store, &c, date_s)?;
    let ext = image_ext(ext)?;
    if bytes.is_empty() {
        return Err("Пустая картинка.".into());
    }
    if bytes.len() > MAX_IMAGE {
        return Err("Картинка больше 40 МБ, она слишком тяжёлая.".into());
    }
    let dir = store.assets_dir(date_s);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = format!("img-{}.{ext}", uid());
    let path = dir.join(&file);
    std::fs::write(&path, bytes).map_err(|e| format!("Не удалось сохранить картинку: {e}"))?;
    Ok(AssetInfo { file, path: path.to_string_lossy().to_string() })
}

pub fn import_image_path(store: &Store, at: NaiveDateTime, date_s: &str, src: &Path) -> Result<AssetInfo, String> {
    let ext = src.extension().map(|e| e.to_string_lossy().to_string()).unwrap_or_default();
    image_ext(&ext)?;
    let meta = std::fs::metadata(src).map_err(|e| format!("Файл не найден: {e}"))?;
    if meta.len() as usize > MAX_IMAGE {
        return Err("Картинка больше 40 МБ, она слишком тяжёлая.".into());
    }
    let bytes = std::fs::read(src).map_err(|e| format!("Не удалось прочитать файл: {e}"))?;
    import_image(store, at, date_s, &ext, &bytes)
}

pub fn seal(store: &Store, at: NaiveDateTime, date_s: &str, rating: u8, summary: Option<String>) -> Result<Day, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let mut day = open_day(store, &c, date_s)?;
    if !(1..=5).contains(&rating) {
        return Err("Оцените день от 1 до 5.".into());
    }
    let summary = summary.map(|s| s.trim().to_string()).filter(|s| !s.is_empty());
    if summary.as_deref().is_some_and(|s| chars(s) > 200) {
        return Err("Главное за день должно быть не длиннее 200 символов.".into());
    }
    day.result.rating = Some(rating);
    day.result.summary = summary;
    day.result.sealed = true;
    day.result.sealed_at = Some(fmt_dt(c.at));
    day.result.auto_sealed = false;
    store.save_day(&day)?;
    store.gc_assets(date_s);
    Ok(day)
}

pub fn auto_seal_due(store: &Store, at: NaiveDateTime) -> u32 {
    let _g = store.lock();
    let c = ctx(store, at);
    let limit = prev(c.today);
    let mut count = 0;
    for date_s in store.list_dates() {
        let Some(date) = parse_date(&date_s) else { continue };
        if date >= limit {
            continue;
        }
        if let Some(mut day) = store.load_day(&date_s) {
            if day.result_open() {
                day.result.sealed = true;
                day.result.auto_sealed = true;
                day.result.sealed_at = Some(fmt_dt(c.at));
                if store.save_day(&day).is_ok() {
                    store.gc_assets(&date_s);
                    count += 1;
                }
            }
        }
    }
    count
}

pub fn streaks(dates: &[NaiveDate], today: NaiveDate) -> (u32, u32) {
    let set: HashSet<NaiveDate> = dates.iter().copied().collect();
    let mut sorted: Vec<NaiveDate> = set.iter().copied().collect();
    sorted.sort();
    let (mut best, mut run) = (0u32, 0u32);
    let mut last: Option<NaiveDate> = None;
    for d in sorted {
        run = if last.is_some_and(|p| next(p) == d) { run + 1 } else { 1 };
        best = best.max(run);
        last = Some(d);
    }
    let tomorrow = next(today);
    let mut d = if set.contains(&tomorrow) {
        tomorrow
    } else if set.contains(&today) {
        today
    } else {
        prev(today)
    };
    let mut cur = 0;
    while set.contains(&d) {
        cur += 1;
        d = prev(d);
    }
    (cur, best)
}

fn planned_dates(store: &Store) -> Vec<NaiveDate> {
    store.list_dates().iter().filter_map(|s| parse_date(s)).collect()
}

pub fn overview(store: &Store, at: NaiveDateTime, autostart: bool, debug: bool) -> Overview {
    let c = ctx(store, at);
    let dsh = c.settings.day_start_hour;
    let (today, tomorrow, yesterday) = (c.today, next(c.today), prev(c.today));
    let today_day = store.load_day(&fmt_date(today)).filter(|d| d.has_plan());
    let tomorrow_day = store.load_day(&fmt_date(tomorrow)).filter(|d| d.has_plan());
    let yesterday_day = store.load_day(&fmt_date(yesterday)).filter(|d| d.has_plan());
    let evening_at = clock::moment_in(today, clock::parse_hm(&c.settings.evening_time).unwrap_or((21, 0)), dsh);
    let next_start = clock::day_start(tomorrow, dsh);
    let dates = planned_dates(store);
    let (streak, best_streak) = streaks(&dates, today);
    Overview {
        now: fmt_dt(at),
        today: fmt_date(today),
        tomorrow: fmt_date(tomorrow),
        yesterday: fmt_date(yesterday),
        yesterday_open: yesterday_day.as_ref().is_some_and(|d| d.result_open()),
        today_day,
        tomorrow_day,
        yesterday_day,
        evening: at >= evening_at,
        evening_at: fmt_dt(evening_at),
        next_day_in_sec: (next_start - at).num_seconds().max(0),
        streak,
        best_streak,
        total_days: dates.iter().filter(|d| **d <= today).count() as u32,
        settings: c.settings,
        autostart,
        data_dir: store.dir.to_string_lossy().to_string(),
        debug,
        version: crate::updater::VERSION.to_string(),
    }
}

pub fn list_days(store: &Store, at: NaiveDateTime) -> Vec<DaySummary> {
    let c = ctx(store, at);
    let tomorrow = fmt_date(next(c.today));
    let mut out = Vec::new();
    for date_s in store.list_dates().into_iter().rev() {
        if date_s >= tomorrow {
            continue;
        }
        let Some(day) = store.load_day(&date_s) else { continue };
        let Some(plan) = day.plan.as_ref() else { continue };
        let items = plan.checklist.as_deref().unwrap_or(&[]);
        let hours_total: f64 = items.iter().filter_map(|i| i.hours).sum();
        let hours_done: f64 = items.iter().filter(|i| i.done).filter_map(|i| i.hours).sum();
        let mut description: String = plan.description.chars().take(160).collect();
        if chars(&plan.description) > 160 {
            description.push('…');
        }
        out.push(DaySummary {
            date: date_s.clone(),
            name: plan.name.clone(),
            description,
            late: plan.late,
            has_checklist: plan.checklist.is_some(),
            items_total: items.len() as u32,
            items_done: items.iter().filter(|i| i.done).count() as u32,
            hours_total,
            hours_done,
            rating: day.result.rating,
            summary: day.result.summary.clone(),
            sealed: day.result.sealed,
            auto_sealed: day.result.auto_sealed,
            has_result: day.result.board_items > 0 || day.result.has_ink,
        });
    }
    out
}

pub fn get_day(store: &Store, at: NaiveDateTime, date_s: &str) -> Option<Day> {
    let c = ctx(store, at);
    let date = parse_date(date_s)?;
    if date > next(c.today) {
        return None;
    }
    store.load_day(date_s).filter(|d| d.has_plan())
}

pub fn get_board(store: &Store, date_s: &str) -> Option<Value> {
    parse_date(date_s)?;
    store.load_board(date_s)
}

pub fn save_settings(store: &Store, mut s: Settings) -> Result<Settings, String> {
    let _g = store.lock();
    let old = store.load_settings();
    if s.day_start_hour > 6 {
        return Err("Новый день может начинаться с 00:00 до 06:00.".into());
    }
    for t in [&s.evening_time, &s.morning_time] {
        if clock::parse_hm(t).is_none() {
            return Err(format!("Непонятное время: {t}"));
        }
    }
    s.evening_repeat_min = s.evening_repeat_min.min(240);
    s.tray_hint_shown = old.tray_hint_shown;
    store.save_settings(&s)?;
    Ok(s)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::parse_dt;

    fn tmp_store(tag: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("nextday-test-{tag}-{}", uid()));
        let _ = std::fs::remove_dir_all(&dir);
        Store::open(dir).unwrap()
    }

    fn at(s: &str) -> NaiveDateTime {
        parse_dt(s).unwrap()
    }

    fn plan(name: &str, items: &[(&str, Option<f64>)]) -> PlanInput {
        PlanInput {
            name: name.into(),
            description: "описание".into(),
            checklist: Some(
                items
                    .iter()
                    .map(|(t, h)| CheckItemInput { id: None, text: t.to_string(), hours: *h, attach: None, subs: vec![], start: None, from: None })
                    .collect(),
            ),
        }
    }

    #[test]
    fn only_tomorrow_can_be_planned() {
        let s = tmp_store("plan");
        let t = at("2026-10-06T21:00:00");
        assert!(save_plan(&s, t, "2026-10-07", plan("День 3D", &[("видос", Some(1.5))])).is_ok());
        assert!(save_plan(&s, t, "2026-10-08", plan("x", &[])).is_err());
        assert!(save_plan(&s, t, "2026-10-05", plan("x", &[])).is_err());
        let d = save_plan(&s, t, "2026-10-07", plan("День 3D-моделирования", &[("видос", Some(1.4))])).unwrap();
        let p = d.plan.unwrap();
        assert_eq!(p.name, "День 3D-моделирования");
        assert_eq!(p.edits, 1);
        assert_eq!(p.checklist.unwrap()[0].hours, Some(1.5));
        let t2 = at("2026-10-07T04:00:01");
        assert!(save_plan(&s, t2, "2026-10-07", plan("другое", &[])).is_err());
        let t3 = at("2026-10-07T01:00:00");
        assert!(save_plan(&s, t3, "2026-10-07", plan("ночная правка", &[])).is_ok());
    }

    #[test]
    fn late_plan_for_today_once() {
        let s = tmp_store("late");
        let t = at("2026-10-07T10:00:00");
        let d = save_plan(&s, t, "2026-10-07", plan("Поздний", &[])).unwrap();
        assert!(d.plan.unwrap().late);
        assert!(save_plan(&s, t, "2026-10-07", plan("Ещё раз", &[])).is_err());
    }

    #[test]
    fn checks_board_and_seal() {
        let s = tmp_store("seal");
        let d = save_plan(&s, at("2026-10-06T22:00:00"), "2026-10-07", plan("День", &[("a", None), ("b", Some(2.0))])).unwrap();
        let id = d.plan.unwrap().checklist.unwrap()[0].id.clone();
        assert!(set_check(&s, at("2026-10-06T23:00:00"), "2026-10-07", &id, true).is_err());
        let t = at("2026-10-07T12:00:00");
        let d = set_check(&s, t, "2026-10-07", &id, true).unwrap();
        assert!(d.plan.unwrap().checklist.unwrap()[0].done);
        let board = serde_json::json!({ "v": 1, "items": [{ "id": "n1", "kind": "note", "text": "ok" }], "ink": "" });
        assert!(save_board(&s, t, "2026-10-07", &board).is_ok());
        assert!(seal(&s, t, "2026-10-07", 0, None).is_err());
        let d = seal(&s, t, "2026-10-07", 4, Some("  получилось  ".into())).unwrap();
        assert!(d.result.sealed);
        assert_eq!(d.result.summary.as_deref(), Some("получилось"));
        assert_eq!(d.result.board_items, 1);
        assert!(save_board(&s, t, "2026-10-07", &board).is_err());
        assert!(set_check(&s, t, "2026-10-07", &id, false).is_err());
    }

    #[test]
    fn grace_and_auto_seal() {
        let s = tmp_store("auto");
        save_plan(&s, at("2026-10-06T22:00:00"), "2026-10-07", plan("День", &[])).unwrap();
        let t = at("2026-10-08T20:00:00");
        let board = serde_json::json!({ "v": 1, "items": [] });
        assert!(save_board(&s, t, "2026-10-07", &board).is_ok());
        assert_eq!(auto_seal_due(&s, t), 0);
        let t2 = at("2026-10-09T04:00:00");
        assert!(save_board(&s, t2, "2026-10-07", &board).is_err());
        assert_eq!(auto_seal_due(&s, t2), 1);
        let d = s.load_day("2026-10-07").unwrap();
        assert!(d.result.sealed && d.result.auto_sealed);
    }

    fn plan_with_subs(subs: &[&str]) -> PlanInput {
        PlanInput {
            name: "День".into(),
            description: String::new(),
            checklist: Some(vec![CheckItemInput {
                id: None,
                text: "Модель персонажа".into(),
                hours: Some(3.0),
                attach: None,
                subs: subs.iter().map(|t| SubItemInput { id: None, text: t.to_string() }).collect(),
                start: None,
                from: None,
            }]),
        }
    }

    #[test]
    fn at_most_three_subs() {
        let s = tmp_store("subs-limit");
        let t = at("2026-10-06T21:00:00");
        assert!(save_plan(&s, t, "2026-10-07", plan_with_subs(&["a", "b", "c", "d"])).is_err());
        let d = save_plan(&s, t, "2026-10-07", plan_with_subs(&["a", " ", "b", "c"])).unwrap();
        assert_eq!(d.plan.unwrap().checklist.unwrap()[0].subs.len(), 3);
    }

    #[test]
    fn subs_drive_parent() {
        let s = tmp_store("subs-check");
        let d = save_plan(&s, at("2026-10-06T21:00:00"), "2026-10-07", plan_with_subs(&["a", "b"])).unwrap();
        let item = d.plan.unwrap().checklist.unwrap().remove(0);
        let t = at("2026-10-07T12:00:00");
        let d = set_check(&s, t, "2026-10-07", &item.subs[0].id, true).unwrap();
        assert!(!d.plan.unwrap().checklist.unwrap()[0].done);
        let d = set_check(&s, t, "2026-10-07", &item.subs[1].id, true).unwrap();
        assert!(d.plan.unwrap().checklist.unwrap()[0].done);
        let d = set_check(&s, t, "2026-10-07", &item.id, false).unwrap();
        let it = d.plan.unwrap().checklist.unwrap().remove(0);
        assert!(!it.done && it.subs.iter().all(|x| !x.done));
    }

    #[test]
    fn start_hours_for_today_and_tomorrow() {
        let s = tmp_store("start");
        let mut p = plan("День", &[("работа", None)]);
        p.checklist.as_mut().unwrap()[0].start = Some(10);
        let d = save_plan(&s, at("2026-10-06T21:00:00"), "2026-10-07", p).unwrap();
        let item = d.plan.unwrap().checklist.unwrap().remove(0);
        assert_eq!(item.start, Some(10));
        let d = set_start(&s, at("2026-10-06T22:00:00"), "2026-10-07", &item.id, Some(14)).unwrap();
        assert_eq!(d.plan.unwrap().checklist.unwrap()[0].start, Some(14));
        assert!(set_start(&s, at("2026-10-06T22:00:00"), "2026-10-07", &item.id, Some(24)).is_err());
        let d = set_start(&s, at("2026-10-07T12:00:00"), "2026-10-07", &item.id, None).unwrap();
        assert_eq!(d.plan.unwrap().checklist.unwrap()[0].start, None);
        assert!(set_start(&s, at("2026-10-09T12:00:00"), "2026-10-07", &item.id, Some(9)).is_err());
        let mut bad = plan("x", &[("y", None)]);
        bad.checklist.as_mut().unwrap()[0].start = Some(30);
        assert!(save_plan(&s, at("2026-10-07T21:00:00"), "2026-10-08", bad).is_err());
    }

    #[test]
    fn tasks_link_to_earlier_days() {
        let s = tmp_store("links");
        let d = save_plan(&s, at("2026-10-06T21:00:00"), "2026-10-07", plan("Первый", &[("Пример 1", None)])).unwrap();
        let first = d.plan.unwrap().checklist.unwrap().remove(0);
        let board = serde_json::json!({ "v": 1, "items": [{ "id": "t1", "kind": "task", "ref": first.id, "text": "Сделал половину" }] });
        save_board(&s, at("2026-10-07T12:00:00"), "2026-10-07", &board).unwrap();
        let mut p = plan("Второй", &[("Пример 2", None)]);
        p.checklist.as_mut().unwrap()[0].from = Some(TaskRef { date: "2026-10-07".into(), id: first.id.clone(), text: "подмена".into() });
        let d = save_plan(&s, at("2026-10-07T21:00:00"), "2026-10-08", p).unwrap();
        let link = d.plan.unwrap().checklist.unwrap().remove(0).from.unwrap();
        assert_eq!(link.text, "Пример 1");
        let mut bad = plan("Третий", &[("x", None)]);
        bad.checklist.as_mut().unwrap()[0].from = Some(TaskRef { date: "2026-10-07".into(), id: "нет такого".into(), text: String::new() });
        assert!(save_plan(&s, at("2026-10-07T21:00:00"), "2026-10-08", bad).is_err());
        let mut same_day = plan("Четвёртый", &[("y", None)]);
        same_day.checklist.as_mut().unwrap()[0].from = Some(TaskRef { date: "2026-10-08".into(), id: first.id.clone(), text: String::new() });
        assert!(save_plan(&s, at("2026-10-07T21:00:00"), "2026-10-08", same_day).is_err());
        let nodes = list_tasks(&s);
        assert_eq!(nodes.len(), 2);
        assert_eq!(nodes[0].note.as_deref(), Some("Сделал половину"));
        assert_eq!(nodes[1].from.as_ref().map(|r| r.id.as_str()), Some(first.id.as_str()));
    }

    #[test]
    fn streak_counting() {
        let d = |s: &str| parse_date(s).unwrap();
        let dates = vec![d("2026-10-01"), d("2026-10-02"), d("2026-10-03"), d("2026-10-05"), d("2026-10-06"), d("2026-10-07")];
        assert_eq!(streaks(&dates, d("2026-10-06")), (3, 3));
        assert_eq!(streaks(&dates, d("2026-10-08")), (3, 3));
        assert_eq!(streaks(&dates, d("2026-10-10")), (0, 3));
    }

    #[test]
    fn images_need_open_day() {
        let s = tmp_store("img");
        save_plan(&s, at("2026-10-06T22:00:00"), "2026-10-07", plan("День", &[])).unwrap();
        assert!(import_image(&s, at("2026-10-06T23:00:00"), "2026-10-07", "png", b"x").is_err());
        let a = import_image(&s, at("2026-10-07T09:00:00"), "2026-10-07", "PNG", b"x").unwrap();
        assert!(a.file.ends_with(".png"));
        assert!(import_image(&s, at("2026-10-07T09:00:00"), "2026-10-07", "exe", b"x").is_err());
        seal(&s, at("2026-10-07T21:00:00"), "2026-10-07", 3, None).unwrap();
        assert!(!std::path::Path::new(&a.path).exists());
    }
}
