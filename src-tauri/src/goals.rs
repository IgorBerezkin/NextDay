use crate::clock::{fmt_date, fmt_dt, next, parse_date};
use crate::logic::{self, ctx, Ctx};
use crate::model::*;
use crate::store::{uid, Store};
use chrono::{Datelike, NaiveDate, NaiveDateTime};
use std::collections::{BTreeSet, HashMap, HashSet};

const MAX_TOPICS: usize = 60;
const MAX_TASKS: usize = 30;
const MAX_ITEMS: usize = 40;
const DEFAULT_BUDGET: u32 = 60;
const DEFAULT_MINUTES: u32 = 30;
const FORECAST_DAYS: usize = 14;
const HORIZON_DAYS: usize = 730;

#[derive(Default, Debug)]
pub struct GoalPatch {
    pub title: Option<String>,
    pub outcome: Option<String>,
    pub note: Option<String>,
    pub deadline: Option<String>,
    pub minutes_per_day: Option<u32>,
    pub days: Option<Vec<u8>>,
    pub start_hour: Option<u8>,
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

fn text(s: &str, max: usize, what: &str) -> Result<String, String> {
    let t = s.trim().to_string();
    if chars(&t) > max {
        return Err(format!("{what}: не длиннее {max} символов."));
    }
    Ok(t)
}

fn date_opt(s: Option<&str>, what: &str) -> Result<Option<String>, String> {
    match s.map(str::trim).filter(|s| !s.is_empty()) {
        None => Ok(None),
        Some(d) => parse_date(d).map(|_| Some(d.to_string())).ok_or_else(|| format!("{what}: дата нужна в виде ГГГГ-ММ-ДД.")),
    }
}

fn hour(h: Option<u8>) -> Result<Option<u8>, String> {
    match h {
        Some(h) if h > 23 => Err("Час начала должен быть от 0 до 23.".into()),
        _ => Ok(h),
    }
}

fn minutes(m: Option<u32>, max: u32) -> Result<Option<u32>, String> {
    match m {
        Some(0) => Ok(None),
        Some(m) if m > max => Err(format!("Минут должно быть не больше {max}.")),
        _ => Ok(m),
    }
}

fn days(d: &[u8]) -> Result<Vec<u8>, String> {
    let mut out: Vec<u8> = Vec::new();
    for &x in d {
        if !(1..=7).contains(&x) {
            return Err("Дни недели задаются числами от 1 (понедельник) до 7 (воскресенье).".into());
        }
        if !out.contains(&x) {
            out.push(x);
        }
    }
    out.sort_unstable();
    Ok(out)
}

fn valid_id(w: &str) -> bool {
    !w.is_empty() && w.len() <= 40 && w.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn fresh_id(want: Option<&str>, seen: &mut HashSet<String>) -> String {
    let id = want.filter(|w| valid_id(w) && !seen.contains(*w)).map(str::to_string).unwrap_or_else(|| {
        let mut id = uid();
        while seen.contains(&id) {
            id = uid();
        }
        id
    });
    seen.insert(id.clone());
    id
}

fn apply_fields(goal: &mut Goal, input: &GoalInput) -> Result<(), String> {
    let title = text(&input.title, 80, "Название цели")?;
    if title.is_empty() {
        return Err("Дай цели название.".into());
    }
    goal.title = title;
    goal.outcome = text(&input.outcome, 600, "Итог цели")?;
    goal.note = text(&input.note, 4000, "Заметка цели")?;
    goal.deadline = date_opt(input.deadline.as_deref(), "Срок")?;
    goal.minutes_per_day = minutes(input.minutes_per_day, 960)?;
    goal.days = days(&input.days)?;
    goal.start_hour = hour(input.start_hour)?;
    Ok(())
}

fn all_ids(goal: &Goal) -> HashSet<String> {
    goal.topics.iter().flat_map(|t| std::iter::once(t.id.clone()).chain(t.tasks.iter().map(|k| k.id.clone()))).collect()
}

fn tasks_mut(goal: &mut Goal) -> impl Iterator<Item = &mut GoalTask> {
    goal.topics.iter_mut().flat_map(|t| t.tasks.iter_mut())
}

fn tasks(goal: &Goal) -> impl Iterator<Item = &GoalTask> {
    goal.topics.iter().flat_map(|t| t.tasks.iter())
}

pub fn find_task<'a>(goal: &'a Goal, id: &str) -> Option<(&'a Topic, &'a GoalTask)> {
    goal.topics.iter().find_map(|t| t.tasks.iter().find(|k| k.id == id).map(|k| (t, k)))
}

fn build_tasks(inputs: &[GoalTaskInput], old: &[GoalTask], seen: &mut HashSet<String>) -> Result<Vec<GoalTask>, String> {
    let mut out: Vec<GoalTask> = Vec::new();
    for inp in inputs {
        let txt = text(&inp.text, 300, "Задача")?;
        if txt.is_empty() {
            continue;
        }
        let prev = inp.id.as_deref().and_then(|id| old.iter().find(|t| t.id == id && !out.iter().any(|o| o.id == id)));
        let mut task = match prev {
            Some(p) => p.clone(),
            None => GoalTask { id: fresh_id(inp.id.as_deref(), seen), ..GoalTask::default() },
        };
        task.text = txt;
        task.minutes = minutes(inp.minutes, 960)?;
        task.kind = inp.kind;
        task.done_when = text(&inp.done_when, 300, "Критерий готовности")?;
        out.push(task);
    }
    let mut all: Vec<GoalTask> = old.iter().filter(|t| t.status == TaskStatus::Done && !out.iter().any(|o| o.id == t.id)).cloned().collect();
    all.extend(out);
    if all.len() > MAX_TASKS {
        return Err(format!("В теме может быть не больше {MAX_TASKS} задач."));
    }
    Ok(all)
}

fn find_topic(key: &str, alias: &HashMap<String, String>, titles: &[(String, String)]) -> Option<String> {
    if let Some(id) = alias.get(key) {
        return Some(id.clone());
    }
    let k = key.trim().to_lowercase();
    titles.iter().find(|(_, t)| t.to_lowercase() == k).map(|(id, _)| id.clone())
}

fn find_cycle(topics: &[Topic]) -> Option<Vec<String>> {
    fn visit(i: usize, topics: &[Topic], idx: &HashMap<&str, usize>, color: &mut [u8], stack: &mut Vec<usize>) -> Option<Vec<usize>> {
        color[i] = 1;
        stack.push(i);
        for r in &topics[i].requires {
            let Some(&j) = idx.get(r.as_str()) else { continue };
            if color[j] == 1 {
                let pos = stack.iter().position(|&k| k == j).unwrap_or(0);
                let mut cycle = stack[pos..].to_vec();
                cycle.push(j);
                return Some(cycle);
            }
            if color[j] == 0 {
                if let Some(c) = visit(j, topics, idx, color, stack) {
                    return Some(c);
                }
            }
        }
        stack.pop();
        color[i] = 2;
        None
    }
    let idx: HashMap<&str, usize> = topics.iter().enumerate().map(|(i, t)| (t.id.as_str(), i)).collect();
    let mut color = vec![0u8; topics.len()];
    let mut stack = Vec::new();
    for i in 0..topics.len() {
        if color[i] == 0 {
            if let Some(c) = visit(i, topics, &idx, &mut color, &mut stack) {
                return Some(c.iter().map(|&k| topics[k].title.clone()).collect());
            }
        }
    }
    None
}

fn upsert_topics(goal: &mut Goal, upsert: Vec<TopicInput>, remove: &[String]) -> Result<(), String> {
    goal.topics.retain(|t| !remove.contains(&t.id));
    let alive: HashSet<String> = goal.topics.iter().map(|t| t.id.clone()).collect();
    for t in &mut goal.topics {
        t.requires.retain(|r| alive.contains(r));
    }
    let mut seen = all_ids(goal);
    let mut alias: HashMap<String, String> = goal.topics.iter().map(|t| (t.id.clone(), t.id.clone())).collect();
    let mut wiring: Vec<(String, Vec<String>)> = Vec::new();
    for inp in upsert {
        let idx = match inp.id.as_deref().and_then(|id| goal.topics.iter().position(|t| t.id == id)) {
            Some(i) => i,
            None => {
                let id = fresh_id(inp.id.as_deref(), &mut seen);
                if let Some(given) = inp.id.as_deref() {
                    alias.insert(given.to_string(), id.clone());
                }
                alias.insert(id.clone(), id.clone());
                goal.topics.push(Topic { id, ..Topic::default() });
                goal.topics.len() - 1
            }
        };
        if let Some(title) = inp.title.as_deref() {
            goal.topics[idx].title = text(title, 120, "Название темы")?;
        }
        if goal.topics[idx].title.is_empty() {
            return Err("У каждой темы должно быть название.".into());
        }
        if let Some(note) = inp.note.as_deref() {
            goal.topics[idx].note = text(note, 4000, "Заметка темы")?;
        }
        if let Some(list) = inp.tasks.as_ref() {
            let old = std::mem::take(&mut goal.topics[idx].tasks);
            goal.topics[idx].tasks = build_tasks(list, &old, &mut seen)?;
        }
        if let Some(req) = inp.requires {
            wiring.push((goal.topics[idx].id.clone(), req));
        }
    }
    if goal.topics.len() > MAX_TOPICS {
        return Err(format!("В цели может быть не больше {MAX_TOPICS} тем."));
    }
    let titles: Vec<(String, String)> = goal.topics.iter().map(|t| (t.id.clone(), t.title.clone())).collect();
    let mut names = HashSet::new();
    for (_, t) in &titles {
        if !names.insert(t.to_lowercase()) {
            return Err(format!("Две темы называются одинаково: «{t}»."));
        }
    }
    for (id, raw) in wiring {
        let mut reqs: Vec<String> = Vec::new();
        for r in raw {
            let rid = find_topic(&r, &alias, &titles).ok_or_else(|| format!("Неизвестная тема в зависимостях: «{r}»."))?;
            if rid == id {
                return Err("Тема не может зависеть от самой себя.".into());
            }
            if !reqs.contains(&rid) {
                reqs.push(rid);
            }
        }
        if let Some(t) = goal.topics.iter_mut().find(|t| t.id == id) {
            t.requires = reqs;
        }
    }
    if let Some(c) = find_cycle(&goal.topics) {
        return Err(format!("Темы зависят друг от друга по кругу: {}.", c.join(" → ")));
    }
    Ok(())
}

pub fn save(store: &Store, at: NaiveDateTime, input: GoalInput, author: Author) -> Result<Goal, String> {
    let _g = store.lock();
    let now = fmt_dt(at);
    let mut goal = match input.id.as_deref() {
        Some(id) => store.load_goal(id).ok_or("Цель не найдена.")?,
        None => Goal { id: uid(), author, created_at: now.clone(), ..Goal::default() },
    };
    apply_fields(&mut goal, &input)?;
    if input.id.is_none() {
        upsert_topics(&mut goal, input.topics, &[])?;
    }
    goal.updated_at = now;
    store.save_goal(&goal)?;
    plan_ahead(store, &ctx(store, at));
    Ok(goal)
}

pub fn update(store: &Store, at: NaiveDateTime, id: &str, patch: GoalPatch) -> Result<Goal, String> {
    let _g = store.lock();
    let mut goal = store.load_goal(id).ok_or("Цель не найдена.")?;
    let input = GoalInput {
        id: Some(goal.id.clone()),
        title: patch.title.unwrap_or_else(|| goal.title.clone()),
        outcome: patch.outcome.unwrap_or_else(|| goal.outcome.clone()),
        note: patch.note.unwrap_or_else(|| goal.note.clone()),
        deadline: patch.deadline.or_else(|| goal.deadline.clone()),
        minutes_per_day: patch.minutes_per_day.or(goal.minutes_per_day),
        days: patch.days.unwrap_or_else(|| goal.days.clone()),
        start_hour: patch.start_hour.or(goal.start_hour),
        topics: Vec::new(),
    };
    apply_fields(&mut goal, &input)?;
    goal.updated_at = fmt_dt(at);
    store.save_goal(&goal)?;
    plan_ahead(store, &ctx(store, at));
    Ok(goal)
}

pub fn edit_topics(store: &Store, at: NaiveDateTime, id: &str, upsert: Vec<TopicInput>, remove: Vec<String>) -> Result<Goal, String> {
    let _g = store.lock();
    let mut goal = store.load_goal(id).ok_or("Цель не найдена.")?;
    upsert_topics(&mut goal, upsert, &remove)?;
    goal.updated_at = fmt_dt(at);
    store.save_goal(&goal)?;
    plan_ahead(store, &ctx(store, at));
    Ok(goal)
}

pub fn set_status(store: &Store, at: NaiveDateTime, id: &str, status: GoalStatus) -> Result<Goal, String> {
    let _g = store.lock();
    let mut goal = store.load_goal(id).ok_or("Цель не найдена.")?;
    if status == GoalStatus::Active && tasks(&goal).next().is_none() {
        return Err("В цели нет ни одной задачи: добавь темы и задачи на карте.".into());
    }
    goal.status = status;
    goal.updated_at = fmt_dt(at);
    store.save_goal(&goal)?;
    plan_ahead(store, &ctx(store, at));
    Ok(goal)
}

pub fn delete(store: &Store, at: NaiveDateTime, id: &str) -> Result<(), String> {
    let _g = store.lock();
    store.delete_goal(id)?;
    plan_ahead(store, &ctx(store, at));
    Ok(())
}

fn tick_planned(store: &Store, at: NaiveDateTime, goal_id: &str, task_id: &str, date: &str) {
    let Some(mut day) = store.load_day(date) else { return };
    if day.result.sealed {
        return;
    }
    let Some(items) = day.plan.as_mut().and_then(|p| p.checklist.as_mut()) else { return };
    let stamp = fmt_dt(at);
    let mut hit = false;
    for it in items.iter_mut().filter(|i| !i.done && i.goal.as_ref().is_some_and(|r| r.goal == goal_id && r.task == task_id)) {
        it.done = true;
        it.done_at = Some(stamp.clone());
        for s in &mut it.subs {
            s.done = true;
            s.done_at = Some(stamp.clone());
        }
        hit = true;
    }
    if hit {
        let _ = store.save_day(&day);
    }
}

pub fn record(store: &Store, at: NaiveDateTime, goal_id: &str, task_id: &str, input: ResultInput, by: Author) -> Result<Goal, String> {
    let _g = store.lock();
    let c = ctx(store, at);
    let mut goal = store.load_goal(goal_id).ok_or("Цель не найдена.")?;
    if input.score.is_some_and(|s| s > 100) {
        return Err("Балл задаётся от 0 до 100.".into());
    }
    if input.confidence.is_some_and(|c| !(1..=5).contains(&c)) {
        return Err("Уверенность задаётся от 1 до 5.".into());
    }
    if input.status == Some(TaskStatus::Planned) {
        return Err("Статус planned ставит само приложение, когда задача попадает в план.".into());
    }
    let has_result = input.minutes.is_some() || input.score.is_some() || input.confidence.is_some() || input.note.is_some();
    if !has_result && input.status.is_none() {
        return Err("Нечего записать: укажи статус или результат.".into());
    }
    let now = fmt_dt(at);
    let result = if has_result {
        Some(TaskResult {
            minutes: minutes(input.minutes, 1440)?,
            score: input.score,
            confidence: input.confidence,
            note: text(input.note.as_deref().unwrap_or(""), 2000, "Заметка к результату")?,
            at: now.clone(),
            by,
        })
    } else {
        None
    };
    let task = tasks_mut(&mut goal).find(|t| t.id == task_id).ok_or("Задача не найдена.")?;
    let planned = task.planned_for.clone();
    if result.is_some() {
        task.result = result;
    }
    if let Some(st) = input.status {
        task.status = st;
        task.done_at = (st == TaskStatus::Done).then(|| now.clone());
        if st != TaskStatus::Done {
            task.planned_for = None;
        }
    }
    goal.updated_at = now;
    store.save_goal(&goal)?;
    if input.status == Some(TaskStatus::Done) {
        if let Some(d) = planned.filter(|d| *d <= fmt_date(c.today)) {
            tick_planned(store, at, goal_id, task_id, &d);
        }
    }
    plan_ahead(store, &c);
    Ok(goal)
}

fn settle(goal: &mut Goal, today_s: &str, sealed: bool) -> bool {
    let mut changed = false;
    for t in tasks_mut(goal).filter(|t| t.status == TaskStatus::Planned) {
        let ended = t.planned_for.as_deref().is_none_or(|d| d < today_s || (d == today_s && sealed));
        if ended {
            t.status = TaskStatus::Todo;
            t.planned_for = None;
            changed = true;
        }
    }
    changed
}

fn done_set(goal: &Goal, today_s: &str) -> HashSet<String> {
    tasks(goal)
        .filter(|t| {
            matches!(t.status, TaskStatus::Done | TaskStatus::Skipped)
                || (t.status == TaskStatus::Planned && t.planned_for.as_deref() == Some(today_s))
        })
        .map(|t| t.id.clone())
        .collect()
}

fn topo_order(goal: &Goal) -> Vec<usize> {
    let n = goal.topics.len();
    let idx: HashMap<&str, usize> = goal.topics.iter().enumerate().map(|(i, t)| (t.id.as_str(), i)).collect();
    let mut indeg = vec![0usize; n];
    let mut out: Vec<Vec<usize>> = vec![Vec::new(); n];
    for (i, t) in goal.topics.iter().enumerate() {
        for r in &t.requires {
            if let Some(&j) = idx.get(r.as_str()) {
                indeg[i] += 1;
                out[j].push(i);
            }
        }
    }
    let mut ready: BTreeSet<usize> = (0..n).filter(|&i| indeg[i] == 0).collect();
    let mut order = Vec::with_capacity(n);
    while let Some(i) = ready.pop_first() {
        order.push(i);
        for &k in &out[i] {
            indeg[k] -= 1;
            if indeg[k] == 0 {
                ready.insert(k);
            }
        }
    }
    for i in 0..n {
        if !order.contains(&i) {
            order.push(i);
        }
    }
    order
}

fn unlocked(goal: &Goal, topic: &Topic, done: &HashSet<String>) -> bool {
    topic.requires.iter().all(|r| goal.topics.iter().find(|t| &t.id == r).is_none_or(|t| t.tasks.iter().all(|k| done.contains(&k.id))))
}

fn next_task<'a>(goal: &'a Goal, order: &[usize], done: &HashSet<String>) -> Option<&'a GoalTask> {
    order.iter().map(|&i| &goal.topics[i]).filter(|t| unlocked(goal, t, done)).find_map(|t| t.tasks.iter().find(|k| !done.contains(&k.id)))
}

fn pick_day(goal: &Goal, order: &[usize], done: &mut HashSet<String>) -> Vec<String> {
    let budget = goal.minutes_per_day.unwrap_or(DEFAULT_BUDGET);
    let mut used = 0;
    let mut out = Vec::new();
    while let Some(t) = next_task(goal, order, done) {
        let m = t.minutes.unwrap_or(DEFAULT_MINUTES);
        if !out.is_empty() && used + m > budget {
            break;
        }
        used += m;
        done.insert(t.id.clone());
        out.push(t.id.clone());
    }
    out
}

fn works_on(goal: &Goal, date: NaiveDate) -> bool {
    goal.days.is_empty() || goal.days.contains(&(date.weekday().number_from_monday() as u8))
}

fn task_minutes(goal: &Goal, ids: &[String]) -> u32 {
    ids.iter().filter_map(|id| find_task(goal, id)).map(|(_, t)| t.minutes.unwrap_or(0)).sum()
}

fn forecast(goal: &Goal, today_s: &str, tomorrow: NaiveDate) -> (Vec<ForecastDay>, Option<String>) {
    if matches!(goal.status, GoalStatus::Done | GoalStatus::Archived) {
        return (Vec::new(), None);
    }
    let order = topo_order(goal);
    let mut done = done_set(goal, today_s);
    let mut out = Vec::new();
    let mut finish = tasks(goal)
        .any(|t| t.status == TaskStatus::Planned && t.planned_for.as_deref() == Some(today_s))
        .then(|| today_s.to_string());
    let mut date = tomorrow;
    for _ in 0..HORIZON_DAYS {
        if works_on(goal, date) {
            let picked = pick_day(goal, &order, &mut done);
            if picked.is_empty() {
                break;
            }
            finish = Some(fmt_date(date));
            if out.len() < FORECAST_DAYS {
                out.push(ForecastDay { date: fmt_date(date), minutes: task_minutes(goal, &picked), tasks: picked });
            }
        }
        date = next(date);
    }
    if next_task(goal, &order, &done).is_some() {
        finish = None;
    }
    (out, finish)
}

pub fn progress(goal: &Goal) -> GoalProgress {
    let live: Vec<&GoalTask> = tasks(goal).filter(|t| t.status != TaskStatus::Skipped).collect();
    let done: Vec<&GoalTask> = live.iter().copied().filter(|t| t.status == TaskStatus::Done).collect();
    let checks: Vec<&GoalTask> = live.iter().copied().filter(|t| t.kind == TaskKind::Check).collect();
    let scores: Vec<u32> = checks.iter().filter_map(|t| t.result.as_ref()?.score.map(u32::from)).collect();
    GoalProgress {
        topics_total: goal.topics.len() as u32,
        topics_done: goal
            .topics
            .iter()
            .filter(|t| !t.tasks.is_empty() && t.tasks.iter().all(|k| matches!(k.status, TaskStatus::Done | TaskStatus::Skipped)))
            .count() as u32,
        tasks_total: live.len() as u32,
        tasks_done: done.len() as u32,
        tasks_left: (live.len() - done.len()) as u32,
        minutes_total: live.iter().map(|t| t.minutes.unwrap_or(0)).sum(),
        minutes_done: done.iter().map(|t| t.minutes.unwrap_or(0)).sum(),
        checks_total: checks.len() as u32,
        checks_done: checks.iter().filter(|t| t.status == TaskStatus::Done).count() as u32,
        readiness: (!scores.is_empty()).then(|| (scores.iter().sum::<u32>() / scores.len() as u32) as u8),
    }
}

fn rank(s: GoalStatus) -> u8 {
    match s {
        GoalStatus::Active => 0,
        GoalStatus::Draft => 1,
        GoalStatus::Paused => 2,
        GoalStatus::Done => 3,
        GoalStatus::Archived => 4,
    }
}

fn day_sealed(store: &Store, date: &str) -> bool {
    store.load_day(date).is_some_and(|d| d.result.sealed)
}

fn view_of(mut goal: Goal, c: &Ctx, sealed: bool) -> GoalView {
    let today_s = fmt_date(c.today);
    settle(&mut goal, &today_s, sealed);
    let (forecast, finish) = forecast(&goal, &today_s, next(c.today));
    GoalView { progress: progress(&goal), forecast, finish, goal }
}

pub fn views(store: &Store, at: NaiveDateTime) -> Vec<GoalView> {
    let c = ctx(store, at);
    let sealed = day_sealed(store, &fmt_date(c.today));
    let mut goals = store.list_goals();
    goals.sort_by_key(|g| rank(g.status));
    goals.into_iter().map(|g| view_of(g, &c, sealed)).collect()
}

pub fn view(store: &Store, at: NaiveDateTime, id: &str) -> Option<GoalView> {
    let c = ctx(store, at);
    let sealed = day_sealed(store, &fmt_date(c.today));
    store.load_goal(id).map(|g| view_of(g, &c, sealed))
}

fn hours_of(task: &GoalTask) -> Option<f64> {
    task.minutes.map(|m| ((m as f64 / 15.0).round() * 0.25).max(0.25))
}

fn start_hours(goal: &Goal, picked: &[String]) -> Vec<Option<u8>> {
    let mut cursor = goal.start_hour.map(|h| u32::from(h) * 60);
    picked
        .iter()
        .map(|id| {
            let begin = cursor;
            let m = find_task(goal, id).and_then(|(_, t)| t.minutes).unwrap_or(DEFAULT_MINUTES);
            cursor = cursor.map(|c| c + m);
            begin.map(|b| ((b + 30) / 60).min(23) as u8)
        })
        .collect()
}

fn auto_name(topics: &[String]) -> String {
    let joined = topics.join(", ");
    if chars(&joined) <= 80 {
        return joined;
    }
    let mut out: String = joined.chars().take(79).collect();
    out.push('…');
    out
}

pub fn autoplan(store: &Store, at: NaiveDateTime) -> bool {
    let _g = store.lock();
    plan_ahead(store, &ctx(store, at))
}

pub(crate) fn plan_ahead(store: &Store, c: &Ctx) -> bool {
    let today_s = fmt_date(c.today);
    let tomorrow = next(c.today);
    let tomorrow_s = fmt_date(tomorrow);
    let sealed = day_sealed(store, &today_s);
    let mut goals = store.list_goals();
    let mut dirty: BTreeSet<usize> = BTreeSet::new();
    for (i, g) in goals.iter_mut().enumerate() {
        if settle(g, &today_s, sealed) {
            dirty.insert(i);
        }
    }

    let day = store.load_day(&tomorrow_s).filter(|d| d.has_plan());
    let items = day.as_ref().and_then(|d| d.plan.as_ref()).and_then(|p| p.checklist.clone());
    let (mine, linked): (Vec<CheckItem>, Vec<CheckItem>) = items.clone().unwrap_or_default().into_iter().partition(|i| i.goal.is_none());
    let mut old: HashMap<(String, String), CheckItem> =
        linked.iter().filter_map(|i| i.goal.as_ref().map(|r| ((r.goal.clone(), r.task.clone()), i.clone()))).collect();
    let mut room = MAX_ITEMS.saturating_sub(mine.len());
    let mut fresh: Vec<CheckItem> = Vec::new();
    let mut placed: HashSet<(String, String)> = HashSet::new();
    let mut topics_named: Vec<String> = Vec::new();
    for g in goals.iter().filter(|g| g.status == GoalStatus::Active && works_on(g, tomorrow)) {
        let order = topo_order(g);
        let mut done = done_set(g, &today_s);
        let picked = pick_day(g, &order, &mut done);
        let existing: Vec<String> = linked.iter().filter_map(|i| i.goal.as_ref().filter(|r| r.goal == g.id).map(|r| r.task.clone())).collect();
        let same = existing == picked;
        for (id, start) in picked.iter().zip(start_hours(g, &picked)) {
            if room == 0 {
                break;
            }
            let Some((topic, task)) = find_task(g, id) else { continue };
            let key = (g.id.clone(), id.clone());
            let item = match old.remove(&key) {
                Some(mut it) => {
                    it.text = task.text.clone();
                    it.hours = hours_of(task);
                    if !same {
                        it.start = start;
                    }
                    it
                }
                None => CheckItem {
                    id: uid(),
                    text: task.text.clone(),
                    hours: hours_of(task),
                    attach: None,
                    done: false,
                    done_at: None,
                    subs: Vec::new(),
                    start,
                    from: None,
                    goal: Some(GoalRef { goal: g.id.clone(), task: id.clone() }),
                },
            };
            fresh.push(item);
            placed.insert(key);
            room -= 1;
            if !topics_named.contains(&topic.title) {
                topics_named.push(topic.title.clone());
            }
        }
    }

    for (i, g) in goals.iter_mut().enumerate() {
        let gid = g.id.clone();
        for t in tasks_mut(g) {
            let here = placed.contains(&(gid.clone(), t.id.clone()));
            let planned_tomorrow = t.status == TaskStatus::Planned && t.planned_for.as_deref() == Some(tomorrow_s.as_str());
            if here && !planned_tomorrow {
                t.status = TaskStatus::Planned;
                t.planned_for = Some(tomorrow_s.clone());
                dirty.insert(i);
            } else if !here && planned_tomorrow {
                t.status = TaskStatus::Todo;
                t.planned_for = None;
                dirty.insert(i);
            }
        }
    }

    let dsh = c.settings.day_start_hour;
    let now = fmt_dt(c.at);
    let name = auto_name(&topics_named);
    let day_changed = match day {
        None if fresh.is_empty() => false,
        None => {
            let mut d = Day::new(&tomorrow_s);
            d.plan = Some(Plan {
                name,
                description: String::new(),
                checklist: Some(fresh),
                created_at: now.clone(),
                updated_at: now,
                late: false,
                edits: 0,
                auto: true,
            });
            store.save_day(&logic::arranged(d, dsh)).is_ok()
        }
        Some(mut d) => {
            let auto = d.plan.as_ref().is_some_and(|p| p.auto);
            if auto && mine.is_empty() && fresh.is_empty() {
                store.delete_day(&tomorrow_s).is_ok()
            } else {
                let before = serde_json::to_value(&items).ok();
                let mut renamed = false;
                if let Some(p) = d.plan.as_mut() {
                    if !(linked.is_empty() && fresh.is_empty()) {
                        let mut all = mine;
                        all.extend(fresh);
                        p.checklist = Some(all);
                    }
                    renamed = p.auto && !name.is_empty() && p.name != name;
                    if renamed {
                        p.name = name;
                    }
                }
                let mut d = logic::arranged(d, dsh);
                let after = serde_json::to_value(d.plan.as_ref().and_then(|p| p.checklist.clone())).ok();
                if renamed || before != after {
                    if let Some(p) = d.plan.as_mut() {
                        p.updated_at = now;
                    }
                    store.save_day(&d).is_ok()
                } else {
                    false
                }
            }
        }
    };

    for i in &dirty {
        let _ = store.save_goal(&goals[*i]);
    }
    day_changed || !dirty.is_empty()
}

pub(crate) fn valid_refs(store: &Store, items: &mut [CheckItem]) {
    let mut cache: HashMap<String, Option<Goal>> = HashMap::new();
    for it in items.iter_mut() {
        let Some(r) = it.goal.clone() else { continue };
        let goal = cache.entry(r.goal.clone()).or_insert_with(|| store.load_goal(&r.goal));
        if !goal.as_ref().is_some_and(|g| find_task(g, &r.task).is_some()) {
            it.goal = None;
        }
    }
}

pub(crate) fn link_plan(store: &Store, date_s: &str, items: &[CheckItem]) {
    let refs: HashSet<(String, String)> = items.iter().filter_map(|i| i.goal.as_ref()).map(|r| (r.goal.clone(), r.task.clone())).collect();
    for mut goal in store.list_goals() {
        let gid = goal.id.clone();
        let mut changed = false;
        for t in tasks_mut(&mut goal) {
            let here = refs.contains(&(gid.clone(), t.id.clone()));
            let planned_here = t.status == TaskStatus::Planned && t.planned_for.as_deref() == Some(date_s);
            if here && !planned_here && matches!(t.status, TaskStatus::Todo | TaskStatus::Planned) {
                t.status = TaskStatus::Planned;
                t.planned_for = Some(date_s.to_string());
                changed = true;
            } else if !here && planned_here {
                t.status = TaskStatus::Todo;
                t.planned_for = None;
                changed = true;
            }
        }
        if changed {
            let _ = store.save_goal(&goal);
        }
    }
}

pub(crate) fn on_check(store: &Store, at: NaiveDateTime, date_s: &str, item: &CheckItem) {
    let Some(r) = &item.goal else { return };
    let Some(mut goal) = store.load_goal(&r.goal) else { return };
    let Some(task) = tasks_mut(&mut goal).find(|t| t.id == r.task) else { return };
    if item.done {
        if task.status == TaskStatus::Done {
            return;
        }
        task.status = TaskStatus::Done;
        task.done_at = Some(fmt_dt(at));
        task.planned_for = Some(date_s.to_string());
    } else {
        if task.status != TaskStatus::Done {
            return;
        }
        task.status = TaskStatus::Planned;
        task.planned_for = Some(date_s.to_string());
        task.done_at = None;
    }
    goal.updated_at = fmt_dt(at);
    let _ = store.save_goal(&goal);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clock::parse_dt;

    fn tmp_store(tag: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("nextday-goals-{tag}-{}", uid()));
        let _ = std::fs::remove_dir_all(&dir);
        Store::open(dir).unwrap()
    }

    fn at(s: &str) -> NaiveDateTime {
        parse_dt(s).unwrap()
    }

    fn task(text: &str, m: u32) -> GoalTaskInput {
        GoalTaskInput { text: text.into(), minutes: Some(m), ..Default::default() }
    }

    fn topic(id: &str, title: &str, requires: &[&str], list: Vec<GoalTaskInput>) -> TopicInput {
        TopicInput {
            id: Some(id.into()),
            title: Some(title.into()),
            note: None,
            requires: Some(requires.iter().map(|s| s.to_string()).collect()),
            tasks: Some(list),
        }
    }

    fn input(topics: Vec<TopicInput>) -> GoalInput {
        GoalInput {
            title: "ML".into(),
            outcome: "собес".into(),
            minutes_per_day: Some(90),
            start_hour: Some(18),
            topics,
            ..Default::default()
        }
    }

    fn graph() -> Vec<TopicInput> {
        vec![
            topic("la", "Линейная алгебра", &[], vec![task("a1", 40), task("a2", 40)]),
            topic("mm", "Матричное умножение", &["la"], vec![task("b1", 30)]),
            topic("py", "Python", &[], vec![task("c1", 20)]),
        ]
    }

    fn plan_of(s: &Store, date: &str) -> Option<Plan> {
        s.load_day(date).and_then(|d| d.plan)
    }

    fn texts(p: &Plan) -> Vec<String> {
        p.checklist.as_deref().unwrap_or(&[]).iter().map(|i| i.text.clone()).collect()
    }

    fn item_id(s: &Store, date: &str, text: &str) -> String {
        plan_of(s, date).unwrap().checklist.unwrap().into_iter().find(|i| i.text == text).unwrap().id
    }

    fn active(s: &Store, when: &str) -> Goal {
        let g = save(s, at(when), input(graph()), Author::Ai).unwrap();
        set_status(s, at(when), &g.id, GoalStatus::Active).unwrap()
    }

    #[test]
    fn graph_is_validated() {
        let s = tmp_store("graph");
        let bad = |topics: Vec<TopicInput>| save(&s, at("2026-10-11T12:00:00"), input(topics), Author::Ai).unwrap_err();
        assert!(bad(vec![topic("a", "A", &["nope"], vec![])]).contains("Неизвестная тема"));
        assert!(bad(vec![topic("a", "A", &["a"], vec![])]).contains("самой себя"));
        let cycle = bad(vec![topic("a", "A", &["b"], vec![]), topic("b", "B", &["a"], vec![])]);
        assert!(cycle.contains("по кругу"), "{cycle}");
        assert!(bad(vec![topic("a", "A", &[], vec![]), topic("b", "a", &[], vec![])]).contains("одинаково"));
        let by_title = save(
            &s,
            at("2026-10-11T12:00:00"),
            input(vec![topic("x y", "Основы", &[], vec![task("t", 10)]), topic("z", "Дальше", &["основы"], vec![])]),
            Author::Ai,
        )
        .unwrap();
        assert_eq!(by_title.topics[1].requires, vec![by_title.topics[0].id.clone()]);
        assert_eq!(by_title.status, GoalStatus::Draft);
        assert!(plan_of(&s, "2026-10-12").is_none());
        let empty = save(&s, at("2026-10-11T12:00:00"), input(vec![]), Author::User).unwrap();
        assert!(set_status(&s, at("2026-10-11T12:00:00"), &empty.id, GoalStatus::Active).is_err());
    }

    #[test]
    fn tomorrow_is_planned_by_prerequisites_and_budget() {
        let s = tmp_store("plan");
        let g = active(&s, "2026-10-11T12:00:00");
        let p = plan_of(&s, "2026-10-12").unwrap();
        assert!(p.auto);
        assert_eq!(p.name, "Линейная алгебра");
        assert_eq!(texts(&p), ["a1", "a2"]);
        let items = p.checklist.unwrap();
        assert_eq!(items.iter().map(|i| i.start).collect::<Vec<_>>(), [Some(18), Some(19)]);
        assert_eq!(items[0].hours, Some(0.75));
        let v = view(&s, at("2026-10-11T12:00:00"), &g.id).unwrap();
        assert_eq!(v.forecast.len(), 2);
        assert_eq!(v.forecast[1].tasks.len(), 2);
        assert_eq!(v.finish.as_deref(), Some("2026-10-13"));
        assert_eq!(v.progress.tasks_left, 4);
        assert!(!autoplan(&s, at("2026-10-11T12:05:00")));
        assert_eq!(logic::overview(&s, at("2026-10-11T12:05:00"), false, false).streak, 0);
        logic::set_start(&s, at("2026-10-11T12:10:00"), "2026-10-12", &items[0].id, Some(17)).unwrap();
        assert!(!autoplan(&s, at("2026-10-11T12:15:00")));
        let p = plan_of(&s, "2026-10-12").unwrap();
        assert!(!p.auto);
        assert_eq!(p.checklist.unwrap()[0].start, Some(17));
        assert_eq!(logic::overview(&s, at("2026-10-11T12:15:00"), false, false).streak, 1);
    }

    #[test]
    fn user_edits_keep_goal_items_and_own_name() {
        let s = tmp_store("user");
        active(&s, "2026-10-11T12:00:00");
        let mine = PlanInput {
            name: "Мой день".into(),
            description: String::new(),
            checklist: Some(vec![CheckItemInput {
                id: None,
                text: "своё".into(),
                hours: Some(1.0),
                attach: None,
                subs: vec![],
                start: Some(10),
                from: None,
                goal: None,
            }]),
        };
        let d = logic::save_plan(&s, at("2026-10-11T21:00:00"), "2026-10-12", mine).unwrap();
        let p = d.plan.unwrap();
        assert_eq!(p.name, "Мой день");
        assert!(!p.auto);
        assert_eq!(texts(&p), ["своё", "a1", "a2"]);
    }

    #[test]
    fn ticks_and_sealing_move_the_route() {
        let s = tmp_store("move");
        let g = active(&s, "2026-10-11T12:00:00");
        let a1 = item_id(&s, "2026-10-12", "a1");
        logic::set_check(&s, at("2026-10-12T18:40:00"), "2026-10-12", &a1, true).unwrap();
        assert_eq!(texts(&plan_of(&s, "2026-10-13").unwrap()), ["b1", "c1"]);
        logic::seal(&s, at("2026-10-12T22:00:00"), "2026-10-12", 4, None).unwrap();
        assert_eq!(texts(&plan_of(&s, "2026-10-13").unwrap()), ["a2", "b1", "c1"]);
        let v = view(&s, at("2026-10-12T22:00:00"), &g.id).unwrap();
        assert_eq!(v.progress.tasks_done, 1);
        assert_eq!(v.finish.as_deref(), Some("2026-10-13"));
        logic::set_check(&s, at("2026-10-13T18:30:00"), "2026-10-13", &item_id(&s, "2026-10-13", "a2"), true).unwrap();
        assert!(plan_of(&s, "2026-10-14").is_none());
        let v = view(&s, at("2026-10-13T18:30:00"), &g.id).unwrap();
        assert!(v.forecast.is_empty());
        assert_eq!(v.finish.as_deref(), Some("2026-10-13"));
        assert_eq!(v.progress.tasks_left, 2);
    }

    #[test]
    fn pausing_and_deleting_clear_tomorrow() {
        let s = tmp_store("pause");
        let g = active(&s, "2026-10-11T12:00:00");
        set_status(&s, at("2026-10-11T13:00:00"), &g.id, GoalStatus::Paused).unwrap();
        assert!(s.load_day("2026-10-12").is_none());
        set_status(&s, at("2026-10-11T14:00:00"), &g.id, GoalStatus::Active).unwrap();
        assert!(plan_of(&s, "2026-10-12").is_some());
        delete(&s, at("2026-10-11T15:00:00"), &g.id).unwrap();
        assert!(s.load_day("2026-10-12").is_none());
    }

    #[test]
    fn results_and_topic_edits_keep_history() {
        let s = tmp_store("edit");
        let g = active(&s, "2026-10-11T12:00:00");
        let a1 = g.topics[0].tasks[0].id.clone();
        let a2 = g.topics[0].tasks[1].id.clone();
        let res = ResultInput { status: Some(TaskStatus::Done), score: Some(80), ..Default::default() };
        let g2 = record(&s, at("2026-10-11T19:00:00"), &g.id, &a1, res, Author::Ai).unwrap();
        assert_eq!(find_task(&g2, &a1).unwrap().1.result.as_ref().unwrap().score, Some(80));
        let keep = ResultInput { status: Some(TaskStatus::Done), ..Default::default() };
        let g3 = record(&s, at("2026-10-11T19:05:00"), &g.id, &a1, keep, Author::User).unwrap();
        assert_eq!(find_task(&g3, &a1).unwrap().1.result.as_ref().unwrap().score, Some(80));
        assert!(record(&s, at("2026-10-11T19:06:00"), &g.id, &a1, ResultInput::default(), Author::Ai).is_err());
        let planned = ResultInput { status: Some(TaskStatus::Planned), ..Default::default() };
        assert!(record(&s, at("2026-10-11T19:06:00"), &g.id, &a1, planned, Author::Ai).is_err());
        assert_eq!(texts(&plan_of(&s, "2026-10-12").unwrap()), ["a2", "b1", "c1"]);
        let edit = TopicInput {
            id: Some(g.topics[0].id.clone()),
            tasks: Some(vec![GoalTaskInput { id: Some(a2.clone()), text: "a2 новая".into(), minutes: Some(40), ..Default::default() }, task("a3", 15)]),
            ..Default::default()
        };
        let g4 = edit_topics(&s, at("2026-10-11T20:00:00"), &g.id, vec![edit], vec![]).unwrap();
        assert_eq!(g4.topics[0].tasks.iter().map(|t| t.text.as_str()).collect::<Vec<_>>(), ["a1", "a2 новая", "a3"]);
        assert_eq!(texts(&plan_of(&s, "2026-10-12").unwrap()), ["a2 новая", "a3", "b1"]);
        let mm = g.topics[1].id.clone();
        let g5 = edit_topics(&s, at("2026-10-11T20:10:00"), &g.id, vec![], vec![g.topics[0].id.clone()]).unwrap();
        assert!(g5.topics.iter().find(|t| t.id == mm).unwrap().requires.is_empty());
        assert_eq!(texts(&plan_of(&s, "2026-10-12").unwrap()), ["b1", "c1"]);
    }
}
