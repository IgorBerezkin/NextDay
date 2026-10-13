use crate::clock::{fmt_date, next, parse_date, parse_dt};
use crate::goals;
use crate::logic::{ctx, planned_dates, streaks};
use crate::model::*;
use crate::store::Store;
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, Timelike};
use serde_json::{json, Value};

const MAX_RANGE: i64 = 62;

fn clip(s: &str, max: usize) -> String {
    if s.chars().count() <= max {
        return s.to_string();
    }
    let mut out: String = s.chars().take(max).collect();
    out.push('…');
    out
}

fn median(mut v: Vec<f64>) -> Option<f64> {
    if v.is_empty() {
        return None;
    }
    v.sort_by(|a, b| a.total_cmp(b));
    let n = v.len();
    Some(if n % 2 == 1 { v[n / 2] } else { (v[n / 2 - 1] + v[n / 2]) / 2.0 })
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

fn items(day: &Day) -> &[CheckItem] {
    day.plan.as_ref().and_then(|p| p.checklist.as_deref()).unwrap_or(&[])
}

fn item_json(it: &CheckItem) -> Value {
    json!({
        "id": it.id,
        "text": it.text,
        "hours": it.hours,
        "start": it.start,
        "done": it.done,
        "doneAt": it.done_at,
        "subs": it.subs.iter().map(|s| json!({ "text": s.text, "done": s.done })).collect::<Vec<_>>(),
        "continues": it.from.as_ref().map(|f| json!({ "date": f.date, "text": f.text })),
        "goal": it.goal.as_ref().map(|g| json!({ "goalId": g.goal, "taskId": g.task })),
    })
}

pub fn day_json(store: &Store, day: &Day, board: bool) -> Value {
    let plan = day.plan.as_ref();
    let mut v = json!({
        "date": day.date,
        "name": plan.map(|p| p.name.clone()),
        "description": plan.map(|p| clip(&p.description, 1500)),
        "namedLate": plan.is_some_and(|p| p.late),
        "auto": plan.is_some_and(|p| p.auto),
        "checklist": plan.and_then(|p| p.checklist.as_ref()).map(|c| c.iter().map(item_json).collect::<Vec<_>>()),
        "rating": day.result.rating,
        "summary": day.result.summary,
        "sealed": day.result.sealed,
    });
    if board {
        v["board"] = Value::from(board_notes(store, &day.date));
    }
    v
}

fn board_notes(store: &Store, date: &str) -> Vec<String> {
    let Some(b) = store.load_board(date) else { return Vec::new() };
    let mut out = Vec::new();
    let mut images = 0;
    let mut total = 0;
    for it in b.get("items").and_then(Value::as_array).into_iter().flatten() {
        let s = |k: &str| it.get(k).and_then(Value::as_str).unwrap_or("").trim().to_string();
        let line = match it.get("kind").and_then(Value::as_str) {
            Some("note") => s("text"),
            Some("task") => [s("title"), s("text")].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join(": "),
            Some("image") => {
                images += 1;
                continue;
            }
            _ => continue,
        };
        if line.is_empty() {
            continue;
        }
        total += line.chars().count();
        if total > 3000 {
            break;
        }
        out.push(clip(&line, 600));
    }
    if images > 0 {
        out.push(format!("[{images} image(s)]"));
    }
    out
}

pub fn history(store: &Store, at: NaiveDateTime, from: &str, to: &str, board: bool) -> Result<Value, String> {
    let c = ctx(store, at);
    let from_d = parse_date(from).ok_or("from must be a date YYYY-MM-DD")?;
    let to_d = parse_date(to).ok_or("to must be a date YYYY-MM-DD")?.min(next(c.today));
    if from_d > to_d {
        return Err("from must not be after to".into());
    }
    if (to_d - from_d).num_days() >= MAX_RANGE {
        return Err(format!("the range is limited to {MAX_RANGE} days"));
    }
    let days: Vec<Value> = store
        .list_dates()
        .into_iter()
        .filter(|d| parse_date(d).is_some_and(|x| x >= from_d && x <= to_d))
        .filter_map(|d| store.load_day(&d))
        .filter(|d| d.has_plan())
        .map(|d| day_json(store, &d, board))
        .collect();
    Ok(json!({ "from": fmt_date(from_d), "to": fmt_date(to_d), "today": fmt_date(c.today), "days": days }))
}

pub fn profile(store: &Store, at: NaiveDateTime, window: u32) -> Value {
    let c = ctx(store, at);
    let window = window.clamp(7, 180) as i64;
    let first = c.today - Duration::days(window);
    let all: Vec<NaiveDate> = planned_dates(store);
    let days: Vec<Day> = all
        .iter()
        .filter(|d| **d >= first && **d < c.today)
        .filter_map(|d| store.load_day(&fmt_date(*d)))
        .filter(|d| d.has_plan())
        .collect();
    let mut planned = Vec::new();
    let mut done = Vec::new();
    let mut items_total = 0u32;
    let mut items_done = 0u32;
    let mut ratings = Vec::new();
    let mut start_hist = [0u32; 24];
    let mut done_hist = [0u32; 24];
    let mut weekday: Vec<(u32, f64, u32, u32)> = vec![(0, 0.0, 0, 0); 7];
    for d in &days {
        let its = items(d);
        if let Some(r) = d.result.rating {
            ratings.push(r as f64);
        }
        let wd = parse_date(&d.date).map(|x| x.weekday().num_days_from_monday() as usize).unwrap_or(0);
        weekday[wd].0 += 1;
        if its.is_empty() {
            continue;
        }
        let p: f64 = its.iter().filter_map(|i| i.hours).sum();
        let dn: f64 = its.iter().filter(|i| i.done).filter_map(|i| i.hours).sum();
        planned.push(p);
        done.push(dn);
        items_total += its.len() as u32;
        let n_done = its.iter().filter(|i| i.done).count() as u32;
        items_done += n_done;
        weekday[wd].1 += dn;
        weekday[wd].2 += its.len() as u32;
        weekday[wd].3 += n_done;
        for i in its {
            if let Some(h) = i.start {
                start_hist[h as usize % 24] += 1;
            }
            if let Some(t) = i.done_at.as_deref().and_then(parse_dt) {
                done_hist[t.hour() as usize] += 1;
            }
        }
    }
    let mut active: Vec<usize> = (0..24).filter(|h| done_hist[*h] > 0).collect();
    active.sort_by(|a, b| done_hist[*b].cmp(&done_hist[*a]).then(a.cmp(b)));
    active.truncate(4);
    active.sort_unstable();
    let names = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    let weekdays: Value = names
        .iter()
        .enumerate()
        .map(|(i, n)| {
            let (days_n, hours, total, dn) = weekday[i];
            (
                n.to_string(),
                json!({
                    "plannedDays": days_n,
                    "avgDoneHours": (days_n > 0).then(|| round2(hours / days_n as f64)),
                    "completion": (total > 0).then(|| round2(dn as f64 / total as f64)),
                }),
            )
        })
        .collect::<serde_json::Map<String, Value>>()
        .into();
    let (streak, best) = streaks(&all.iter().copied().filter(|d| *d <= c.today).collect::<Vec<_>>(), c.today);
    let median_done = median(done.clone());
    let since = all.iter().copied().filter(|d| *d >= first && *d < c.today).min().unwrap_or(first);
    let covered = (c.today - since).num_days().max(1);
    json!({
        "windowDays": window,
        "from": fmt_date(since),
        "to": fmt_date(c.today - Duration::days(1)),
        "daysCovered": covered,
        "daysPlanned": days.len(),
        "planningRate": round2(days.len() as f64 / covered as f64),
        "daysWithChecklist": planned.len(),
        "medianPlannedHours": median(planned.clone()).map(round2),
        "medianDoneHours": median_done.map(round2),
        "maxDoneHours": done.iter().cloned().fold(None, |m: Option<f64>, x| Some(m.map_or(x, |m| m.max(x)))).map(round2),
        "itemsPlanned": items_total,
        "itemsDone": items_done,
        "itemCompletion": (items_total > 0).then(|| round2(items_done as f64 / items_total as f64)),
        "avgRating": (!ratings.is_empty()).then(|| round2(ratings.iter().sum::<f64>() / ratings.len() as f64)),
        "streak": streak,
        "bestStreak": best,
        "startHourHistogram": start_hist,
        "doneHourHistogram": done_hist,
        "mostActiveHours": active,
        "weekdays": weekdays,
        "settings": {
            "dayStartHour": c.settings.day_start_hour,
            "eveningTime": c.settings.evening_time,
            "morningTime": c.settings.morning_time,
        },
        "notes": [
            "hours are the user's own estimates per checklist item, not measured time",
            "doneAt is the moment an item was ticked, which approximates when work finished",
            "a sensible daily goal budget is well below medianDoneHours, because other tasks still need time"
        ],
    })
}

fn plan_brief(day: Option<Day>) -> Value {
    let Some(d) = day else { return Value::Null };
    let Some(p) = d.plan.as_ref() else { return Value::Null };
    json!({
        "date": d.date,
        "name": p.name,
        "auto": p.auto,
        "sealed": d.result.sealed,
        "checklist": items(&d).iter().map(|i| json!({
            "text": i.text,
            "start": i.start,
            "hours": i.hours,
            "done": i.done,
            "goal": i.goal.as_ref().map(|g| json!({ "goalId": g.goal, "taskId": g.task })),
        })).collect::<Vec<_>>(),
    })
}

pub fn overview(store: &Store, at: NaiveDateTime) -> Value {
    let c = ctx(store, at);
    let today = fmt_date(c.today);
    let tomorrow = fmt_date(next(c.today));
    let goals: Vec<Value> = goals::views(store, at)
        .into_iter()
        .filter(|v| matches!(v.goal.status, GoalStatus::Active | GoalStatus::Draft | GoalStatus::Paused))
        .map(|v| {
            let next: Vec<Value> = v
                .forecast
                .first()
                .map(|d| d.tasks.iter().filter_map(|id| goals::find_task(&v.goal, id)).map(|(t, k)| json!({ "topic": t.title, "task": k.text })).collect())
                .unwrap_or_default();
            json!({
                "id": v.goal.id,
                "title": v.goal.title,
                "status": v.goal.status,
                "deadline": v.goal.deadline,
                "minutesPerDay": v.goal.minutes_per_day,
                "progress": v.progress,
                "finish": v.finish,
                "nextDay": v.forecast.first().map(|d| json!({ "date": d.date, "tasks": next })),
            })
        })
        .collect();
    json!({
        "now": crate::clock::fmt_dt(at),
        "today": today,
        "tomorrow": tomorrow,
        "dayStartHour": c.settings.day_start_hour,
        "eveningTime": c.settings.evening_time,
        "todayPlan": plan_brief(store.load_day(&today)),
        "tomorrowPlan": plan_brief(store.load_day(&tomorrow)),
        "goals": goals,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::parse_dt;
    use crate::logic;
    use crate::store::uid;

    fn tmp_store() -> Store {
        let dir = std::env::temp_dir().join(format!("nextday-insights-{}", uid()));
        Store::open(dir).unwrap()
    }

    fn input(items: &[(&str, Option<f64>, Option<u8>)]) -> PlanInput {
        PlanInput {
            name: "День".into(),
            description: "описание".into(),
            checklist: Some(
                items
                    .iter()
                    .map(|(t, h, s)| CheckItemInput {
                        id: None,
                        text: t.to_string(),
                        hours: *h,
                        attach: None,
                        subs: vec![],
                        start: *s,
                        from: None,
                        goal: None,
                    })
                    .collect(),
            ),
        }
    }

    #[test]
    fn profile_and_history_read_the_days() {
        let s = tmp_store();
        let d = logic::save_plan(&s, parse_dt("2026-10-05T21:00:00").unwrap(), "2026-10-06", input(&[("a", Some(2.0), Some(10)), ("b", Some(3.0), Some(14))]))
            .unwrap();
        let a = d.plan.unwrap().checklist.unwrap().remove(0);
        logic::set_check(&s, parse_dt("2026-10-06T12:30:00").unwrap(), "2026-10-06", &a.id, true).unwrap();
        logic::save_plan(&s, parse_dt("2026-10-06T21:00:00").unwrap(), "2026-10-07", input(&[("c", Some(1.0), None)])).unwrap();
        let p = profile(&s, parse_dt("2026-10-08T12:00:00").unwrap(), 14);
        assert_eq!(p["daysPlanned"], 2);
        assert_eq!(p["from"], "2026-10-06");
        assert_eq!(p["planningRate"], 1.0);
        assert_eq!(p["itemsPlanned"], 3);
        assert_eq!(p["itemsDone"], 1);
        assert_eq!(p["doneHourHistogram"][12], 1);
        assert_eq!(p["startHourHistogram"][14], 1);
        assert_eq!(p["mostActiveHours"][0], 12);
        assert_eq!(p["weekdays"]["tue"]["avgDoneHours"], 2.0);
        let h = history(&s, parse_dt("2026-10-08T12:00:00").unwrap(), "2026-10-01", "2026-10-30", false).unwrap();
        assert_eq!(h["to"], "2026-10-09");
        assert_eq!(h["days"].as_array().unwrap().len(), 2);
        assert_eq!(h["days"][0]["checklist"][0]["done"], true);
        assert!(history(&s, parse_dt("2026-10-08T12:00:00").unwrap(), "2026-01-01", "2026-10-08", false).is_err());
        assert!(history(&s, parse_dt("2026-10-08T12:00:00").unwrap(), "2026-10-08", "2026-10-01", false).is_err());
        let o = overview(&s, parse_dt("2026-10-08T12:00:00").unwrap());
        assert_eq!(o["today"], "2026-10-08");
        assert!(o["todayPlan"].is_null());
    }
}
