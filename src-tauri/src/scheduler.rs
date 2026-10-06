use crate::clock::{self, fmt_date, next, parse_dt, parse_hm, prev};
use crate::model::Day;
use crate::store::Store;
use crate::{logic, notify, tray};
use chrono::{Duration, NaiveDate};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

static LAST_TODAY: Mutex<Option<NaiveDate>> = Mutex::new(None);

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        loop {
            tick(&app);
            std::thread::sleep(std::time::Duration::from_secs(15));
        }
    });
}

fn short(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let mut t: String = s.chars().take(n.saturating_sub(1)).collect();
        t.push('…');
        t
    }
}

fn pretty_links(text: &str) -> String {
    let mut out = String::new();
    let mut rest = text;
    while let Some(pos) = rest.find("http://").into_iter().chain(rest.find("https://")).min() {
        out.push_str(&rest[..pos]);
        let tail = &rest[pos..];
        let end = tail.find(|c: char| c.is_whitespace() || "<>\"'".contains(c)).unwrap_or(tail.len());
        let url = tail[..end].trim_end_matches(|c: char| ".,;:!?)]}".contains(c));
        out.push_str("ссылка");
        rest = &tail[url.len()..];
    }
    out.push_str(rest);
    out
}

pub fn hours_text(h: f64) -> String {
    let s = format!("{:.2}", h);
    let s = s.trim_end_matches('0').trim_end_matches('.');
    s.replace('.', ",")
}

pub fn plural(n: usize, one: &str, few: &str, many: &str) -> String {
    let (m10, m100) = (n % 10, n % 100);
    let w = if m10 == 1 && m100 != 11 {
        one
    } else if (2..=4).contains(&m10) && !(12..=14).contains(&m100) {
        few
    } else {
        many
    };
    format!("{n} {w}")
}

fn plan_name(d: Option<&Day>, n: usize) -> Option<String> {
    d.and_then(|d| d.plan.as_ref()).map(|p| short(&p.name, n))
}

struct Status {
    today: Option<Day>,
    tomorrow: Option<Day>,
    yesterday: Option<Day>,
    evening: bool,
    plan_missing: bool,
    result_open: bool,
}

fn status(store: &Store, c: &logic::Ctx) -> Status {
    let today = store.load_day(&fmt_date(c.today)).filter(|d| d.has_plan());
    let tomorrow = store.load_day(&fmt_date(next(c.today))).filter(|d| d.has_plan());
    let yesterday = store.load_day(&fmt_date(prev(c.today))).filter(|d| d.has_plan());
    let evening_at = clock::moment_in(
        c.today,
        parse_hm(&c.settings.evening_time).unwrap_or((21, 0)),
        c.settings.day_start_hour,
    );
    let result_open = today.as_ref().is_some_and(|d| d.result_open());
    Status {
        evening: c.at >= evening_at,
        plan_missing: tomorrow.is_none(),
        result_open,
        today,
        tomorrow,
        yesterday,
    }
}

fn apply_tray(app: &AppHandle, s: &Status) {
    let t = plan_name(s.today.as_ref(), 34)
        .map(|n| format!("Сегодня: «{n}»"))
        .unwrap_or_else(|| "Сегодня: день без имени".into());
    let m = plan_name(s.tomorrow.as_ref(), 34)
        .map(|n| format!("Завтра: «{n}»"))
        .unwrap_or_else(|| "Завтра: ещё не назван".into());
    let alert = s.evening && (s.plan_missing || s.result_open);
    tray::update(app, alert, &format!("Next Day\n{t}\n{m}"));
}

pub fn refresh_tray(app: &AppHandle) {
    let store = app.state::<Store>();
    let c = logic::ctx(&store, clock::now());
    let s = status(&store, &c);
    apply_tray(app, &s);
}

pub fn tick(app: &AppHandle) {
    let store = app.state::<Store>();
    let at = clock::now();
    let c = logic::ctx(&store, at);

    {
        let mut last = LAST_TODAY.lock().unwrap_or_else(|e| e.into_inner());
        if *last != Some(c.today) {
            let sealed = logic::auto_seal_due(&store, at);
            if last.is_some() || sealed > 0 {
                let _ = app.emit("day-changed", fmt_date(c.today));
            }
            *last = Some(c.today);
        }
    }

    let s = status(&store, &c);
    let dsh = c.settings.day_start_hour;
    let today_s = fmt_date(c.today);
    let morning_at = clock::moment_in(c.today, parse_hm(&c.settings.morning_time).unwrap_or((9, 0)), dsh)
        .max(clock::day_start(c.today, dsh));
    let evening_at = clock::moment_in(c.today, parse_hm(&c.settings.evening_time).unwrap_or((21, 0)), dsh);

    {
        let _g = store.lock();
        let mut ns = store.load_notify();
        let mut changed = false;

        if ns.morning_for.as_deref() != Some(today_s.as_str()) && at >= morning_at {
            ns.morning_for = Some(today_s.clone());
            changed = true;
            let fresh = s.today.is_none() && store.list_dates().is_empty();
            if c.settings.morning_enabled && !s.evening && !fresh {
                morning_toast(app, &s);
            }
        }

        let pending = c.settings.evening_enabled && s.evening && (s.plan_missing || s.result_open);
        if pending {
            let snooze = ns.snooze_until.as_deref().and_then(parse_dt);
            if let Some(until) = snooze {
                if at >= until {
                    evening_toast(app, &s);
                    ns.snooze_until = None;
                    ns.evening_for = Some(today_s.clone());
                    changed = true;
                }
            } else if ns.evening_for.as_deref() != Some(today_s.as_str()) {
                evening_toast(app, &s);
                ns.evening_for = Some(today_s.clone());
                changed = true;
            } else if c.settings.evening_repeat_min > 0
                && ns.evening_repeat_for.as_deref() != Some(today_s.as_str())
                && at >= evening_at + Duration::minutes(c.settings.evening_repeat_min as i64)
            {
                evening_toast(app, &s);
                ns.evening_repeat_for = Some(today_s.clone());
                changed = true;
            }
        } else if ns.snooze_until.is_some() {
            ns.snooze_until = None;
            changed = true;
        }

        if changed {
            let _ = store.save_notify(&ns);
        }
    }

    apply_tray(app, &s);
}

fn morning_toast(app: &AppHandle, s: &Status) {
    let (title, mut body) = match s.today.as_ref().and_then(|d| d.plan.as_ref()) {
        Some(p) => {
            let title = format!("Сегодня: «{}»", short(&p.name, 48));
            let body = match p.checklist.as_deref() {
                Some(items) if !items.is_empty() => {
                    let h: f64 = items.iter().filter_map(|i| i.hours).sum();
                    let n = plural(items.len(), "пункт", "пункта", "пунктов");
                    if h > 0.0 {
                        format!("В чеклисте {n}, примерно {} ч.", hours_text(h))
                    } else {
                        format!("В чеклисте {n}.")
                    }
                }
                _ if !p.description.is_empty() => short(&pretty_links(&p.description), 120),
                _ => "Хорошего дня!".to_string(),
            };
            (title, body)
        }
        None => (
            "Сегодня безымянный день".to_string(),
            "Вчера день не назвали. Можно назвать его прямо сейчас.".to_string(),
        ),
    };
    if s.yesterday.as_ref().is_some_and(|d| d.result_open()) {
        body.push_str("\nВчерашний день ждёт итогов.");
    }
    notify::show(app, &title, &body, "today", &[("Открыть", "open:today")]);
}

fn evening_toast(app: &AppHandle, s: &Status) {
    let name = plan_name(s.today.as_ref(), 40).unwrap_or_default();
    let (title, body, route) = if s.plan_missing && s.result_open {
        (
            "Вечерний ритуал".to_string(),
            format!("Подведите итоги дня «{name}» и назовите завтрашний день."),
            "ritual",
        )
    } else if s.plan_missing {
        (
            "Как назовём завтрашний день?".to_string(),
            "Пара минут на план, и завтра начнётся без раскачки.".to_string(),
            "tomorrow",
        )
    } else {
        (
            format!("Итоги дня «{name}»"),
            "Отметьте сделанное, прикрепите скрины и запечатайте день.".to_string(),
            "results",
        )
    };
    let open = format!("open:{route}");
    notify::show(app, &title, &body, route, &[("Открыть", open.as_str()), ("Позже", "snooze")]);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn russian_plural() {
        assert_eq!(plural(1, "пункт", "пункта", "пунктов"), "1 пункт");
        assert_eq!(plural(3, "пункт", "пункта", "пунктов"), "3 пункта");
        assert_eq!(plural(11, "пункт", "пункта", "пунктов"), "11 пунктов");
        assert_eq!(plural(22, "пункт", "пункта", "пунктов"), "22 пункта");
        assert_eq!(plural(25, "пункт", "пункта", "пунктов"), "25 пунктов");
    }

    #[test]
    fn hours() {
        assert_eq!(hours_text(5.0), "5");
        assert_eq!(hours_text(1.5), "1,5");
        assert_eq!(hours_text(0.25), "0,25");
    }

    #[test]
    fn links_become_words() {
        assert_eq!(pretty_links("по референсу (https://sketchfab.com/3d-models/x-4fda).").as_str(), "по референсу (ссылка).");
        assert_eq!(pretty_links("http://a.ru и https://b.ru/c?d=1").as_str(), "ссылка и ссылка");
        assert_eq!(pretty_links("без ссылок").as_str(), "без ссылок");
    }
}
