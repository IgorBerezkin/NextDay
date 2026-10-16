use crate::ai_guide::{GUIDE, INSTRUCTIONS};
use crate::model::*;
use crate::store::Store;
use crate::{clock, drill, goals, insights};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::hash::{BuildHasher, Hasher};
use std::io::{BufRead, Read, Write};
use std::path::PathBuf;
use std::time::Duration;

pub const LATEST: &str = "2026-07-28";
pub const LEGACY: [&str; 3] = ["2025-11-25", "2025-06-18", "2025-03-26"];
pub const DEFAULT_PORT: u16 = 47328;
pub const CONFIG_FILE: &str = "mcp.json";
const MAX_BODY: u64 = 2_000_000;
const PROTOCOL_KEY: &str = "/_meta/io.modelcontextprotocol~1protocolVersion";
const OFFLINE: &str = "Next Day is not reachable. Start Next Day and turn on AI access (MCP) in its Settings.";

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct McpConfig {
    pub port: u16,
    pub token: String,
}

fn supported() -> Vec<&'static str> {
    std::iter::once(LATEST).chain(LEGACY).collect()
}

fn server_info() -> Value {
    json!({ "name": "next-day", "title": "Next Day", "version": crate::updater::VERSION })
}

fn capabilities() -> Value {
    json!({ "tools": {}, "resources": {}, "prompts": {} })
}

fn rpc_error(id: Value, code: i64, message: &str, data: Option<Value>) -> Value {
    let mut e = json!({ "code": code, "message": message });
    if let Some(d) = data {
        e["data"] = d;
    }
    json!({ "jsonrpc": "2.0", "id": id, "error": e })
}

fn schema(props: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": props, "required": required })
}

fn task_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "An existing task id, to keep its status and result while editing a topic. Omit for a new task." },
            "text": { "type": "string", "description": "What to do, concrete and short. Max 300 chars." },
            "minutes": { "type": "integer", "minimum": 1, "maximum": 960, "description": "Estimated minutes; the app fills each day's budget with them. Without minutes a task counts as 30." },
            "kind": { "type": "string", "enum": ["learn", "practice", "review", "check"], "description": "Default learn. Use check for readiness tests that get a score." },
            "doneWhen": { "type": "string", "description": "Verifiable acceptance criterion. Max 300 chars." }
        },
        "required": ["text"]
    })
}

fn topic_schema(create: bool) -> Value {
    let required: Vec<&str> = if create { vec!["title"] } else { Vec::new() };
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "Topic id. In create_goal: your own short id (letters, digits, - and _) that other topics use in requires. In edit_topics: an existing id changes that topic; a missing or new id adds a topic." },
            "title": { "type": "string", "description": "Topic name, unique within the goal. Max 120 chars." },
            "note": { "type": "string", "description": "Materials, links, hints. Max 4000 chars." },
            "requires": { "type": "array", "items": { "type": "string" }, "description": "Prerequisite topics (ids or exact titles) that must be mastered before this one. On the map the arrows go from them to this topic." },
            "tasks": { "type": "array", "items": task_schema(), "maxItems": 30, "description": "Ranked from the simplest to the hardest; the app plans them in this order. In edit_topics this replaces the whole list: omitted tasks are deleted, except done ones." }
        },
        "required": required
    })
}

fn goal_fields() -> serde_json::Map<String, Value> {
    let v = json!({
        "title": { "type": "string", "description": "Short goal name. Max 80 chars." },
        "outcome": { "type": "string", "description": "Concrete, checkable definition of success. Max 600 chars." },
        "note": { "type": "string", "description": "Context: current level, materials, constraints. Max 4000 chars." },
        "deadline": { "type": "string", "description": "YYYY-MM-DD. An empty string clears it in update_goal." },
        "minutesPerDay": { "type": "integer", "minimum": 1, "maximum": 960, "description": "Daily budget: how many task minutes the app puts into each planned day. Default 60." },
        "days": { "type": "array", "items": { "type": "integer", "minimum": 1, "maximum": 7 }, "description": "ISO weekdays (1 Mon .. 7 Sun) to work on the goal. Empty means every day." },
        "startHour": { "type": "integer", "minimum": 0, "maximum": 23, "description": "Hour when the goal's tasks start; the tasks of a day follow each other from it." }
    });
    v.as_object().cloned().unwrap_or_default()
}

fn check_schema(what: &str) -> Value {
    json!({
        "type": "object",
        "description": what,
        "properties": {
            "mode": { "type": "string", "enum": ["text", "python", "shape", "number", "choice", "self"], "description": "text: normalized text; python: a Python literal compared with types, or an exception name; shape: notation like list[tuple[str, int]]; number: numeric with tolerance; choice: pick one of the choices; self: the user reveals the answer and grades themselves." },
            "caseSensitive": { "type": "boolean", "description": "text and choice. Default false." },
            "ignoreSpaces": { "type": "boolean", "description": "text: remove all spaces before comparing. Default false." },
            "tolerance": { "type": "number", "minimum": 0, "description": "number: allowed absolute difference. Default 0." },
            "strictTypes": { "type": "boolean", "description": "python: 3 and 3.0, a tuple and a list differ. Default true." }
        }
    })
}

fn drill_card_schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "id": { "type": "string", "description": "edit_drill_deck: an existing card id replaces that card. Omit for a new card." },
            "topic": { "type": "string", "description": "Optional section name. Max 80 chars." },
            "prompt": { "type": "string", "description": "The question. Max 2000 chars." },
            "code": { "type": "string", "description": "Optional code shown with line numbers. Max 4000 chars." },
            "answer": { "type": "string", "description": "Canonical answer, shown after a miss. Max 500 chars." },
            "alternatives": { "type": "array", "items": { "type": "string" }, "maxItems": 10, "description": "Other accepted answers." },
            "choices": { "type": "array", "items": { "type": "string" }, "maxItems": 8, "description": "Choice mode: the options; the answer is added if missing." },
            "check": check_schema("Overrides the deck's check for this card."),
            "explain": { "type": "string", "description": "The rule or explanation shown after a miss. Max 2000 chars." }
        },
        "required": ["prompt", "answer"]
    })
}

fn gate_schema() -> Value {
    json!({
        "type": "object",
        "description": "Open topics one by one: the next topic opens when every open topic has at least `window` answers and `percent` of the last `window` are right.",
        "properties": {
            "enabled": { "type": "boolean" },
            "percent": { "type": "integer", "minimum": 50, "maximum": 100 },
            "window": { "type": "integer", "minimum": 5, "maximum": 50 }
        }
    })
}

fn deck_fields() -> serde_json::Map<String, Value> {
    let v = json!({
        "title": { "type": "string", "description": "Max 80 chars." },
        "description": { "type": "string", "description": "Max 1000 chars." },
        "check": check_schema("How answers to the deck's cards are compared. Default mode text."),
        "gate": gate_schema()
    });
    v.as_object().cloned().unwrap_or_default()
}

fn preset_fields() -> Value {
    json!({
        "id": { "type": "string", "description": "An existing preset id changes that preset; omitted fields keep their values. Omit to create a preset." },
        "name": { "type": "string", "description": "Max 60 chars." },
        "sources": { "type": "array", "description": "What to drill.", "items": { "type": "object", "properties": {
            "deck": { "type": "string", "description": "Deck id; the built-in Python deck is `python`." },
            "topics": { "type": "array", "items": { "type": "string" }, "description": "Topic ids or titles. Empty means the deck's open topics." }
        }, "required": ["deck"] } },
        "order": { "type": "string", "enum": ["smart", "random", "sequence"], "description": "smart: Leitner spaced repetition with due and missed cards first; random; sequence: deck order, continuing where the last session stopped." },
        "goal": { "type": "string", "enum": ["correct", "cards", "minutes"], "description": "The session ends after `amount` right answers, `amount` answers or `amount` minutes." },
        "amount": { "type": "integer", "minimum": 1, "maximum": 200 },
        "retry": { "type": "boolean", "description": "A missed card comes back later in the same session." },
        "explain": { "type": "boolean", "description": "Also show the rule after right answers (after a miss it is always shown)." },
        "screen": { "type": "string", "enum": ["lock", "window"], "description": "lock: full screen on every monitor until the goal is met; window: inside the app." },
        "escape": { "type": "string", "enum": ["hold", "none"], "description": "lock only: hold Esc 5 seconds to leave (recorded as an escape) or no exit except the ceiling." },
        "limitMinutes": { "type": "integer", "minimum": 5, "maximum": 180, "description": "lock only: the lock opens by itself after this many minutes." },
        "selfCheck": { "type": "boolean", "description": "The user reveals each answer and grades themselves instead of typing." },
        "makeDefault": { "type": "boolean", "description": "Make it the preset the app suggests first." }
    })
}

fn ro() -> Value {
    json!({ "readOnlyHint": true, "openWorldHint": false })
}

fn rw(destructive: bool) -> Value {
    json!({ "readOnlyHint": false, "destructiveHint": destructive, "idempotentHint": false, "openWorldHint": false })
}

pub fn tools() -> Value {
    let mut create = goal_fields();
    create.insert("topics".into(), json!({ "type": "array", "items": topic_schema(true), "maxItems": 60, "description": "The map: topics with prerequisites and ranked tasks." }));
    let mut update = goal_fields();
    update.insert("goalId".into(), json!({ "type": "string" }));
    let mut deck_create = deck_fields();
    deck_create.insert("cards".into(), json!({ "type": "array", "items": drill_card_schema(), "maxItems": 2000 }));
    let mut deck_edit = deck_fields();
    deck_edit.insert("deckId".into(), json!({ "type": "string" }));
    deck_edit.insert("upsert".into(), json!({ "type": "array", "items": drill_card_schema() }));
    deck_edit.insert("remove".into(), json!({ "type": "array", "items": { "type": "string" } }));
    json!([
        {
            "name": "get_overview",
            "title": "Overview",
            "description": "Current state: now, today and tomorrow dates, dayStartHour, today's and tomorrow's plans (tomorrow is planned automatically from active goals; auto=true means the user has not touched that plan yet), and active, draft and paused goals with progress, projected finish and the tasks of their next day. Call this first.",
            "inputSchema": schema(json!({}), &[]),
            "annotations": ro()
        },
        {
            "name": "get_profile",
            "title": "Work rhythm",
            "description": "Statistics over the last N complete days, starting from the first day with data when the history is shorter: planning rate, median planned and done hours per day, item completion, ratings, streaks, histograms of start hours and of tick times, most active hours, per-weekday averages, settings. Use it to size a goal's daily budget and choose its start hour.",
            "inputSchema": schema(json!({ "days": { "type": "integer", "minimum": 7, "maximum": 180, "description": "Window size, default 42." } }), &[]),
            "annotations": ro()
        },
        {
            "name": "get_history",
            "title": "History",
            "description": "Planned days in a date range (max 62 days, up to tomorrow): name, description, auto flag, checklist items (text, hours, start, done, doneAt, sub-items, continued task, goal link), rating, summary, sealed. With includeBoard, adds text notes from the results board.",
            "inputSchema": schema(json!({
                "from": { "type": "string", "description": "YYYY-MM-DD" },
                "to": { "type": "string", "description": "YYYY-MM-DD" },
                "includeBoard": { "type": "boolean", "description": "Default false." }
            }), &["from", "to"]),
            "annotations": ro()
        },
        {
            "name": "list_goals",
            "title": "List goals",
            "description": "All goals with status, settings, progress, projected finish date and a compact map (topic id, title, requires, task counts).",
            "inputSchema": schema(json!({ "status": { "type": "string", "enum": ["draft", "active", "paused", "done", "archived"], "description": "Optional filter." } }), &[]),
            "annotations": ro()
        },
        {
            "name": "get_goal",
            "title": "Get goal",
            "description": "One goal with every topic and task (status, plannedFor, result), progress, the forecast of the next working days with their tasks and the projected finish date.",
            "inputSchema": schema(json!({ "goalId": { "type": "string" } }), &["goalId"]),
            "annotations": ro()
        },
        {
            "name": "create_goal",
            "title": "Create goal (draft)",
            "description": "Creates a goal as a DRAFT authored by AI: settings plus a map of topics with prerequisites and tasks ranked from simple to hard. Drafts are never planned: the user reviews the map and activates the goal in the app. The whole input is validated (known prerequisites, no cycles, unique titles). Returns the goal with ids.",
            "inputSchema": schema(Value::Object(create), &["title", "outcome", "topics"]),
            "annotations": rw(false)
        },
        {
            "name": "update_goal",
            "title": "Update goal",
            "description": "Changes goal settings (title, outcome, note, deadline, minutesPerDay, days, startHour). Omitted fields stay. Does not change status: only the user activates, pauses or finishes goals. Tomorrow's plan is recomputed.",
            "inputSchema": schema(Value::Object(update), &["goalId"]),
            "annotations": rw(false)
        },
        {
            "name": "edit_topics",
            "title": "Edit the map",
            "description": "Adds, changes or removes topics. upsert: topics to add or change; for an existing id only the given fields change (tasks, if given, replace the whole ranked list, keeping done tasks and the state of tasks passed with their id). remove: topic ids to delete together with their tasks. Tomorrow's plan is recomputed.",
            "inputSchema": schema(json!({
                "goalId": { "type": "string" },
                "upsert": { "type": "array", "items": topic_schema(false) },
                "remove": { "type": "array", "items": { "type": "string" } }
            }), &["goalId"]),
            "annotations": rw(true)
        },
        {
            "name": "record_result",
            "title": "Record task result",
            "description": "Stores how a task went: minutes spent, score 0-100 (needed on check tasks for readiness), confidence 1-5, a note, and optionally a status (done, skipped, todo). Result fields replace the recorded result; a call with only status keeps it. Done also ticks the task's item in an open day plan. Ask the user or verify the work before recording.",
            "inputSchema": schema(json!({
                "goalId": { "type": "string" },
                "taskId": { "type": "string" },
                "status": { "type": "string", "enum": ["todo", "done", "skipped"] },
                "minutes": { "type": "integer", "minimum": 1, "maximum": 1440 },
                "score": { "type": "integer", "minimum": 0, "maximum": 100 },
                "confidence": { "type": "integer", "minimum": 1, "maximum": 5 },
                "note": { "type": "string", "description": "Max 2000 chars." }
            }), &["goalId", "taskId"]),
            "annotations": rw(false)
        },
        {
            "name": "get_drill",
            "title": "Drill overview",
            "description": "The drill trainer (Зубрилка): presets (what to drill, how, session conditions), decks with topics and per-topic progress (open or locked, accuracy over the gate window, Leitner boxes, due cards), the streak of days with finished sessions, today's counts, the most missed cards with the user's last wrong answers, and recent sessions (done, escape, timeout or stopped). Call it before coaching or building decks.",
            "inputSchema": schema(json!({}), &[]),
            "annotations": ro()
        },
        {
            "name": "get_drill_deck",
            "title": "Get drill deck",
            "description": "One deck with every card. For the built-in deck `python` it returns the card templates (topic, kind, rule, number of variants, one sample), because its variants are generated by executing code.",
            "inputSchema": schema(json!({ "deckId": { "type": "string" } }), &["deckId"]),
            "annotations": ro()
        },
        {
            "name": "create_drill_deck",
            "title": "Create drill deck",
            "description": "Creates a deck of cards authored by AI: questions with a canonical answer, optional code, accepted alternatives, choices and an explanation shown after a miss. The deck's check says how answers are compared; a card may override it. The whole input is validated first. The deck is drilled only after it is added to a preset. Returns the deck with card ids.",
            "inputSchema": schema(Value::Object(deck_create), &["title", "cards"]),
            "annotations": rw(false)
        },
        {
            "name": "edit_drill_deck",
            "title": "Edit drill deck",
            "description": "Changes a user deck: title, description, check, gate; upsert cards (an existing id replaces the card, no id adds one) and remove card ids. The built-in deck `python` can not be edited. Progress of kept cards stays.",
            "inputSchema": schema(Value::Object(deck_edit), &["deckId"]),
            "annotations": rw(true)
        },
        {
            "name": "get_drill_theory",
            "title": "Get drill theory",
            "description": "Theory articles of the drill reference (Справочник): the built-in articles of the `python` deck and articles written by the user or AI, each attached to a deck and optionally a topic. The user opens them from the lightbulb button during a session. Optional filters: deckId, and topic (id) together with deckId, which also returns the articles about the whole deck.",
            "inputSchema": schema(json!({ "deckId": { "type": "string" }, "topic": { "type": "string" } }), &[]),
            "annotations": ro()
        },
        {
            "name": "save_drill_theory",
            "title": "Save drill theory",
            "description": "Creates a theory article or replaces one (pass id). An article gives the model of a topic: how to picture the data, before and after pairs of the main operations, traps, a shape table. Body is Markdown in the app's dialect (headings, lists, tables, code, and the blocks data, chart, plot, graph described in nextday://guide). Built-in articles can not be changed; add your own next to them.",
            "inputSchema": schema(json!({
                "id": { "type": "string", "description": "An existing article id to replace it. Omit to create." },
                "deckId": { "type": "string", "description": "Deck id; the built-in deck is `python`." },
                "topic": { "type": "string", "description": "Topic id or title; empty for an article about the whole deck." },
                "title": { "type": "string", "description": "Max 120 chars." },
                "body": { "type": "string", "description": "Markdown, max 100000 chars." }
            }), &["deckId", "title", "body"]),
            "annotations": rw(false)
        },
        {
            "name": "install_drill_generator",
            "title": "Install drill generator",
            "description": "Saves a card generator plugin: a JavaScript script that declares `const plugin = { title, description, topics, templates }`, where every template has `make(r)` that returns one variant { prompt, code, answer, choices, alternatives, explain } built with the random helpers in r. The app runs the script in a sandboxed worker (no network, no access to the app) when a session starts, so cards get fresh data every session and a missed card comes back with new data. A new or changed generator is saved switched off: the user checks the code and sample cards and enables it in the app (Зубрилка, tab Наборы). Pass id to replace the code of an existing generator. Read the Generators section of nextday://guide first and run the script with node before installing.",
            "inputSchema": schema(json!({
                "id": { "type": "string", "description": "An existing generator id to replace its code. Omit to create one." },
                "title": { "type": "string", "description": "Max 80 chars." },
                "description": { "type": "string", "description": "Max 1000 chars." },
                "code": { "type": "string", "description": "The plugin script, max 300000 chars." }
            }), &["title", "code"]),
            "annotations": rw(false)
        },
        {
            "name": "import_drill_bank",
            "title": "Import drill bank (DataEater)",
            "description": "Imports a prepared bank of cards in the format of the built-in deck `python`: { title, description, gate, topics: [{id, title, theory}], cards: [{id, topic, kind, rule, check, variants: [{question, code, answer, choices, alternatives, explain}]}] }. A card is a template whose variants differ only in data; after a miss the user gets the same card with another variant. Give the bank inline or as an absolute path to a .json file (max 16 MB), for example the output of a script that executes code to compute the answers. Invalid variants and cards are dropped and listed in the report. Pass replaceId to replace a bank imported before; progress of cards with the same ids stays.",
            "inputSchema": schema(json!({
                "bank": { "type": "object", "description": "The bank object." },
                "path": { "type": "string", "description": "Absolute path to a .json file with the bank." },
                "replaceId": { "type": "string", "description": "An imported bank to replace." }
            }), &[]),
            "annotations": rw(false)
        },
        {
            "name": "save_drill_preset",
            "title": "Save drill preset",
            "description": "Creates a preset or changes one (pass id; omitted fields keep their values). A preset says what to drill (decks and topics), how (order, session goal and size, retry, explanations, self-check) and the conditions (full-screen lock or a window, escape, time ceiling). Only the user starts sessions, in the app. Never turn on the lock or set escape none unless the user asked for it.",
            "inputSchema": schema(preset_fields(), &[]),
            "annotations": rw(false)
        }
    ])
}

fn resources() -> Value {
    json!([
        { "uri": "nextday://guide", "name": "guide", "title": "Next Day guide for AI", "description": "The data model, rules, tools and recommended workflows. Read before planning.", "mimeType": "text/markdown" },
        { "uri": "nextday://goals", "name": "goals", "title": "Goals", "description": "All goals with progress.", "mimeType": "application/json" },
        { "uri": "nextday://profile", "name": "profile", "title": "Work rhythm", "description": "Statistics over the last 42 days.", "mimeType": "application/json" },
        { "uri": "nextday://drill", "name": "drill", "title": "Drill", "description": "Drill presets, decks, progress and weak cards.", "mimeType": "application/json" }
    ])
}

fn templates() -> Value {
    json!([
        { "uriTemplate": "nextday://goal/{goalId}", "name": "goal", "title": "Goal", "description": "One goal with steps and results.", "mimeType": "application/json" },
        { "uriTemplate": "nextday://day/{date}", "name": "day", "title": "Day", "description": "One planned day, YYYY-MM-DD.", "mimeType": "application/json" }
    ])
}

fn prompts() -> Value {
    json!([
        {
            "name": "plan_goal",
            "title": "Plan a goal",
            "description": "Interview the user, read their rhythm and history, and create a personal goal map as a draft.",
            "arguments": [
                { "name": "goal", "description": "What the user wants to achieve.", "required": true },
                { "name": "deadline", "description": "Optional deadline, YYYY-MM-DD.", "required": false }
            ]
        },
        {
            "name": "evening_review",
            "title": "Evening review",
            "description": "Review today's goal tasks with the user, record results and adjust the map.",
            "arguments": []
        },
        {
            "name": "readiness_check",
            "title": "Readiness check",
            "description": "Run a practical test that mirrors the goal's outcome and record the score.",
            "arguments": [{ "name": "goalId", "description": "The goal to check.", "required": true }]
        },
        {
            "name": "drill_coach",
            "title": "Drill coach",
            "description": "Look at the drill progress and the most missed cards, explain the rules behind the mistakes and offer a deck that targets them.",
            "arguments": []
        }
    ])
}

fn prompt_text(name: &str, args: &Value) -> Option<(String, String)> {
    let arg = |k: &str| args.get(k).and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()).map(str::to_string);
    match name {
        "plan_goal" => {
            let goal = arg("goal")?;
            let deadline = arg("deadline").map(|d| format!(" The deadline is {d}.")).unwrap_or_default();
            Some((
                "Plan a goal".into(),
                format!(
                    "I want to reach this goal with Next Day: {goal}.{deadline}\n\nPlease: read the resource nextday://guide; call get_overview, get_profile (days 60) and get_history for the last 21 days; tell me in two or three sentences what my real working rhythm looks like; ask me the questions you need (current level per topic, materials, preferred days and hours); then build a map of topics with prerequisites, each with tasks ranked from simple to hard and sized in minutes, choose a realistic daily budget and start hour, and create it with create_goal. Finish with a short summary (topics, daily time, the projected finish from the result) and remind me to look at the Map tab and activate the goal on the Goals tab."
                ),
            ))
        }
        "evening_review" => Some((
            "Evening review".into(),
            "Let's review today with Next Day. Read nextday://guide if you have not yet, call get_overview and today's day via get_history. For every goal task in today's plan, ask me how it went and quiz me briefly on its topic (2-5 short questions, one at a time). Then record_result for each task with minutes, score and a short note, marking it done only when its doneWhen is met. If I struggled, add review tasks to that topic with edit_topics; if I am ahead, say so. End with what tomorrow's plan holds for my goals.".into(),
        )),
        "readiness_check" => {
            let id = arg("goalId")?;
            Some((
                "Readiness check".into(),
                format!(
                    "Run a readiness check for my Next Day goal {id}. Call get_goal, look at the outcome and at the topics already mastered, design a practical test that mirrors the real target (time limit, tasks, rubric), run it with me here one part at a time, grade it honestly against the rubric, and record_result with a score 0-100 on a check task (add one with edit_topics if there is none). Tell me what to fix before the real thing and add review tasks for the weakest topics."
                ),
            ))
        }
        "drill_coach" => Some((
            "Drill coach".into(),
            "Let's work on my drill (Зубрилка) in Next Day. Read nextday://guide if you have not yet and call get_drill. Tell me in a few sentences where I stand: open topics, accuracy, streak and how my recent sessions ended. Group my most missed cards by the rule behind them and use my last wrong answers to find what I misunderstand. Explain each rule with a tiny example and check me with one short question at a time. Then offer a deck that targets exactly these mistakes (create_drill_deck, 15-30 cards, python check mode for code questions, a short explain on every card) and, if I agree, add it to a preset with save_drill_preset.".into(),
        )),
        _ => None,
    }
}

fn str_arg(args: &Value, k: &str) -> Result<String, String> {
    args.get(k).and_then(Value::as_str).map(str::to_string).ok_or_else(|| format!("missing string argument {k}"))
}

fn parse<T: for<'de> Deserialize<'de>>(v: Value, what: &str) -> Result<T, String> {
    serde_json::from_value(v).map_err(|e| format!("invalid {what}: {e}"))
}

fn compact_goal(v: &GoalView) -> Value {
    let g = &v.goal;
    json!({
        "id": g.id,
        "title": g.title,
        "outcome": g.outcome,
        "status": g.status,
        "author": g.author,
        "deadline": g.deadline,
        "minutesPerDay": g.minutes_per_day,
        "days": g.days,
        "startHour": g.start_hour,
        "progress": v.progress,
        "finish": v.finish,
        "topics": g.topics.iter().map(|t| json!({
            "id": t.id,
            "title": t.title,
            "requires": t.requires,
            "tasks": t.tasks.len(),
            "done": t.tasks.iter().filter(|k| k.status == TaskStatus::Done).count(),
        })).collect::<Vec<_>>(),
    })
}

fn full_goal(v: &GoalView) -> Value {
    let mut out = serde_json::to_value(v).unwrap_or(Value::Null);
    out["forecast"] = Value::from(
        v.forecast
            .iter()
            .map(|d| {
                json!({
                    "date": d.date,
                    "minutes": d.minutes,
                    "tasks": d.tasks.iter().filter_map(|id| goals::find_task(&v.goal, id)).map(|(t, k)| json!({ "taskId": k.id, "topic": t.title, "text": k.text })).collect::<Vec<_>>(),
                })
            })
            .collect::<Vec<_>>(),
    );
    out
}

fn call(store: &Store, name: &str, args: Value) -> Result<(Value, bool), String> {
    let at = clock::now();
    let found = |id: &str| goals::view(store, at, id).ok_or_else(|| "goal not found".to_string());
    match name {
        "get_overview" => Ok((insights::overview(store, at), false)),
        "get_profile" => {
            let days = args.get("days").and_then(Value::as_u64).unwrap_or(42) as u32;
            Ok((insights::profile(store, at, days), false))
        }
        "get_history" => {
            let board = args.get("includeBoard").and_then(Value::as_bool).unwrap_or(false);
            Ok((insights::history(store, at, &str_arg(&args, "from")?, &str_arg(&args, "to")?, board)?, false))
        }
        "list_goals" => {
            let filter = args.get("status").and_then(Value::as_str).map(str::to_string);
            let list: Vec<Value> = goals::views(store, at)
                .iter()
                .filter(|v| filter.as_deref().is_none_or(|f| serde_json::to_value(v.goal.status).ok().and_then(|s| s.as_str().map(str::to_string)).as_deref() == Some(f)))
                .map(compact_goal)
                .collect();
            Ok((json!({ "goals": list }), false))
        }
        "get_goal" => Ok((full_goal(&found(&str_arg(&args, "goalId")?)?), false)),
        "create_goal" => {
            let mut input: GoalInput = parse(args, "goal")?;
            input.id = None;
            let g = goals::save(store, at, input, Author::Ai)?;
            let note = "Created as a draft. Ask the user to look at the map (Map tab) and activate the goal on the Goals tab.";
            Ok((json!({ "goal": full_goal(&found(&g.id)?), "note": note }), true))
        }
        "update_goal" => {
            let id = str_arg(&args, "goalId")?;
            let s = |k: &str| args.get(k).and_then(Value::as_str).map(str::to_string);
            let patch = goals::GoalPatch {
                title: s("title"),
                outcome: s("outcome"),
                note: s("note"),
                deadline: s("deadline"),
                minutes_per_day: args.get("minutesPerDay").and_then(Value::as_u64).map(|m| m.min(u32::MAX as u64) as u32),
                days: args.get("days").map(|d| parse::<Vec<u8>>(d.clone(), "days")).transpose()?,
                start_hour: args.get("startHour").and_then(Value::as_u64).map(|h| h.min(255) as u8),
            };
            goals::update(store, at, &id, patch)?;
            Ok((full_goal(&found(&id)?), true))
        }
        "edit_topics" => {
            let id = str_arg(&args, "goalId")?;
            let upsert: Vec<TopicInput> = parse(args.get("upsert").cloned().unwrap_or(json!([])), "upsert")?;
            let remove: Vec<String> = parse(args.get("remove").cloned().unwrap_or(json!([])), "remove")?;
            if upsert.is_empty() && remove.is_empty() {
                return Err("nothing to change: give upsert or remove".into());
            }
            goals::edit_topics(store, at, &id, upsert, remove)?;
            Ok((full_goal(&found(&id)?), true))
        }
        "record_result" => {
            let id = str_arg(&args, "goalId")?;
            let task = str_arg(&args, "taskId")?;
            let input: ResultInput = parse(args, "result")?;
            goals::record(store, at, &id, &task, input, Author::Ai)?;
            Ok((compact_goal(&found(&id)?), true))
        }
        "get_drill" => Ok((serde_json::to_value(drill::overview(store, at)).unwrap_or(Value::Null), false)),
        "get_drill_deck" => Ok((drill::get_deck(store, &str_arg(&args, "deckId")?)?, false)),
        "create_drill_deck" => {
            let mut input: drill::DeckInput = parse(args, "deck")?;
            input.id = None;
            let d = drill::save_deck(store, at, input, Author::Ai)?;
            let note = "Created. The user sees it in the app under Зубрилка, tab Наборы; it is drilled after it is added to a preset.";
            Ok((json!({ "deck": d, "note": note }), true))
        }
        "edit_drill_deck" => {
            let id = str_arg(&args, "deckId")?;
            let patch: drill::DeckPatch = parse(args, "patch")?;
            Ok((serde_json::to_value(drill::edit_deck(store, at, &id, patch)?).unwrap_or(Value::Null), true))
        }
        "get_drill_theory" => {
            let deck = args.get("deckId").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);
            let topic = args.get("topic").and_then(Value::as_str).filter(|s| !s.is_empty()).map(str::to_string);
            let list: Vec<drill::Article> = match (&deck, &topic) {
                (Some(d), Some(t)) => drill::topic_articles(store, d, t),
                _ => drill::articles(store).into_iter().filter(|a| deck.as_ref().is_none_or(|d| a.deck == *d)).collect(),
            };
            Ok((json!({ "articles": list }), false))
        }
        "save_drill_theory" => {
            let input = drill::ArticleInput {
                id: args.get("id").and_then(Value::as_str).map(str::to_string),
                deck: str_arg(&args, "deckId")?,
                topic: args.get("topic").and_then(Value::as_str).unwrap_or("").to_string(),
                title: str_arg(&args, "title")?,
                body: str_arg(&args, "body")?,
            };
            Ok((serde_json::to_value(drill::save_article(store, at, input, Author::Ai)?).unwrap_or(Value::Null), true))
        }
        "install_drill_generator" => {
            let s = |k: &str| args.get(k).and_then(Value::as_str).map(str::to_string);
            let g = drill::install_generator(store, at, s("id").filter(|x| !x.is_empty()), str_arg(&args, "title")?, s("description"), str_arg(&args, "code")?)?;
            let note = "Saved switched off. Ask the user to open Зубрилка, tab Наборы, press Проверить on the generator (it runs the script and shows sample cards), enable it and add it to a preset.";
            Ok((json!({ "generator": { "id": g.id, "title": g.title, "enabled": g.enabled }, "note": note }), true))
        }
        "import_drill_bank" => {
            let replace = args.get("replaceId").and_then(Value::as_str).map(str::to_string);
            let input: drill::BankInput = match (args.get("bank").filter(|b| b.is_object()), args.get("path").and_then(Value::as_str)) {
                (Some(b), _) => parse(b.clone(), "bank")?,
                (None, Some(p)) => drill::read_bank_file(p)?,
                (None, None) => return Err("give bank or path".into()),
            };
            let report = drill::import_bank(store, at, input, replace.as_deref(), Author::Ai)?;
            let note = "Imported. The user sees it in the app under Зубрилка, tab Наборы; it is drilled after it is added to a preset.";
            Ok((json!({ "report": report, "note": note }), true))
        }
        "save_drill_preset" => {
            let make_default = args.get("makeDefault").and_then(Value::as_bool).unwrap_or(false);
            let id = args.get("id").and_then(Value::as_str).unwrap_or("").to_string();
            let base = if id.is_empty() {
                drill::Preset::default()
            } else {
                drill::load_state(store).presets.into_iter().find(|p| p.id == id).ok_or("preset not found")?
            };
            let mut v = serde_json::to_value(base).map_err(|e| e.to_string())?;
            if let (Some(obj), Some(given)) = (v.as_object_mut(), args.as_object()) {
                for (k, x) in given {
                    if k != "makeDefault" && k != "id" {
                        obj.insert(k.clone(), x.clone());
                    }
                }
            }
            let p: drill::Preset = parse(v, "preset")?;
            Ok((serde_json::to_value(drill::save_preset(store, p, make_default)?).unwrap_or(Value::Null), true))
        }
        _ => Err(format!("unknown tool {name}")),
    }
}

fn tool_result(r: Result<(Value, bool), String>, changed: &dyn Fn()) -> Value {
    match r {
        Ok((v, wrote)) => {
            if wrote {
                changed();
            }
            json!({
                "content": [{ "type": "text", "text": serde_json::to_string_pretty(&v).unwrap_or_default() }],
                "structuredContent": v,
                "isError": false
            })
        }
        Err(e) => json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
    }
}

fn read_resource(store: Option<&Store>, params: &Value) -> Result<Value, (i64, String)> {
    let uri = params.get("uri").and_then(Value::as_str).ok_or((-32602, "missing uri".to_string()))?;
    let (mime, text) = match (uri, store) {
        ("nextday://guide", _) => ("text/markdown", GUIDE.to_string()),
        (_, Some(s)) => data_resource(s, uri)?,
        (_, None) => return Err((-32603, OFFLINE.to_string())),
    };
    Ok(json!({ "contents": [{ "uri": uri, "mimeType": mime, "text": text }], "ttlMs": 0, "cacheScope": "private" }))
}

fn data_resource(store: &Store, uri: &str) -> Result<(&'static str, String), (i64, String)> {
    let at = clock::now();
    Ok(if uri == "nextday://goals" {
        let list: Vec<Value> = goals::views(store, at).iter().map(compact_goal).collect();
        ("application/json", serde_json::to_string_pretty(&json!({ "goals": list })).unwrap_or_default())
    } else if uri == "nextday://drill" {
        ("application/json", serde_json::to_string_pretty(&drill::overview(store, at)).unwrap_or_default())
    } else if uri == "nextday://profile" {
        ("application/json", serde_json::to_string_pretty(&insights::profile(store, at, 42)).unwrap_or_default())
    } else if let Some(id) = uri.strip_prefix("nextday://goal/") {
        let v = goals::view(store, at, id).ok_or((-32602, format!("resource not found: {uri}")))?;
        ("application/json", serde_json::to_string_pretty(&full_goal(&v)).unwrap_or_default())
    } else if let Some(date) = uri.strip_prefix("nextday://day/") {
        crate::clock::parse_date(date).ok_or((-32602, format!("resource not found: {uri}")))?;
        let day = store.load_day(date).filter(|d| d.has_plan()).ok_or((-32602, format!("resource not found: {uri}")))?;
        ("application/json", serde_json::to_string_pretty(&insights::day_json(store, &day, true)).unwrap_or_default())
    } else {
        return Err((-32602, format!("resource not found: {uri}")));
    })
}

fn get_prompt(params: &Value) -> Result<Value, (i64, String)> {
    let name = params.get("name").and_then(Value::as_str).ok_or((-32602, "missing name".to_string()))?;
    let args = params.get("arguments").cloned().unwrap_or(json!({}));
    let (description, text) = prompt_text(name, &args).ok_or((-32602, format!("unknown prompt or missing arguments: {name}")))?;
    Ok(json!({ "description": description, "messages": [{ "role": "user", "content": { "type": "text", "text": text } }] }))
}

pub fn handle(store: &Store, changed: &dyn Fn(), msg: &Value) -> Option<(u16, Value)> {
    answer(Some(store), changed, msg)
}

fn answer(store: Option<&Store>, changed: &dyn Fn(), msg: &Value) -> Option<(u16, Value)> {
    let method = msg.get("method").and_then(Value::as_str)?;
    let id = msg.get("id").cloned()?;
    let params = msg.get("params").cloned().unwrap_or(json!({}));
    if let Some(v) = params.pointer(PROTOCOL_KEY).and_then(Value::as_str) {
        if !supported().contains(&v) {
            let data = json!({ "supported": supported(), "requested": v });
            return Some((400, rpc_error(id, -32022, "Unsupported protocol version", Some(data))));
        }
    }
    let result: Result<Value, (i64, String)> = match method {
        "server/discover" => Ok(json!({
            "supportedVersions": supported(),
            "capabilities": capabilities(),
            "instructions": INSTRUCTIONS,
            "ttlMs": 0,
            "cacheScope": "private"
        })),
        "initialize" => {
            let asked = params.get("protocolVersion").and_then(Value::as_str).unwrap_or(LEGACY[0]);
            let chosen = if LEGACY.contains(&asked) { asked } else { LEGACY[0] };
            Ok(json!({ "protocolVersion": chosen, "capabilities": capabilities(), "serverInfo": server_info(), "instructions": INSTRUCTIONS }))
        }
        "ping" => Ok(json!({})),
        "tools/list" => Ok(json!({ "tools": tools(), "ttlMs": 0, "cacheScope": "private" })),
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let args = params.get("arguments").cloned().unwrap_or(json!({}));
            Ok(tool_result(store.ok_or_else(|| OFFLINE.to_string()).and_then(|s| call(s, name, args)), changed))
        }
        "resources/list" => Ok(json!({ "resources": resources(), "ttlMs": 0, "cacheScope": "private" })),
        "resources/templates/list" => Ok(json!({ "resourceTemplates": templates(), "ttlMs": 0, "cacheScope": "private" })),
        "resources/read" => read_resource(store, &params),
        "prompts/list" => Ok(json!({ "prompts": prompts(), "ttlMs": 0, "cacheScope": "private" })),
        "prompts/get" => get_prompt(&params),
        _ => Err((-32601, format!("Method not found: {method}"))),
    };
    Some(match result {
        Ok(mut r) => {
            r["resultType"] = json!("complete");
            r["_meta"] = json!({ "io.modelcontextprotocol/serverInfo": server_info() });
            (200, json!({ "jsonrpc": "2.0", "id": id, "result": r }))
        }
        Err((code, message)) => (200, rpc_error(id, code, &message, None)),
    })
}

pub fn token() -> String {
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
    (0..2u64)
        .map(|i| {
            let mut h = std::collections::hash_map::RandomState::new().build_hasher();
            h.write_u64(i);
            h.write_u128(nanos);
            h.write_u32(std::process::id());
            format!("{:016x}", h.finish())
        })
        .collect()
}

pub fn bind(preferred: u16) -> Result<(tiny_http::Server, u16), String> {
    let mut ports = vec![preferred; 5];
    ports.extend((DEFAULT_PORT..DEFAULT_PORT + 10).filter(|p| *p != preferred));
    let mut last = String::new();
    for (i, p) in ports.into_iter().enumerate() {
        if (1..5).contains(&i) {
            std::thread::sleep(Duration::from_millis(100));
        }
        match tiny_http::Server::http(("127.0.0.1", p)) {
            Ok(s) => return Ok((s, p)),
            Err(e) => last = e.to_string(),
        }
    }
    Err(format!("Не удалось занять порт для MCP: {last}"))
}

fn header<'a>(req: &'a tiny_http::Request, name: &str) -> Option<&'a str> {
    req.headers().iter().find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name)).map(|h| h.value.as_str())
}

fn respond(req: tiny_http::Request, status: u16, body: Option<&Value>) {
    let text = body.map(|b| serde_json::to_string(b).unwrap_or_default()).unwrap_or_default();
    let mut res = tiny_http::Response::from_string(text).with_status_code(status);
    if body.is_some() {
        if let Ok(h) = tiny_http::Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]) {
            res = res.with_header(h);
        }
    }
    if status == 405 {
        if let Ok(h) = tiny_http::Header::from_bytes(&b"Allow"[..], &b"POST"[..]) {
            res = res.with_header(h);
        }
    }
    let _ = req.respond(res);
}

fn local_origin(o: &str) -> bool {
    o == "null" || ["http://127.0.0.1", "http://localhost", "https://127.0.0.1", "https://localhost"].iter().any(|p| o == *p || o.starts_with(&format!("{p}:")))
}

pub fn serve_one(store: &Store, changed: &dyn Fn(), token: &str, mut req: tiny_http::Request) {
    let path = req.url().split('?').next().unwrap_or("").to_string();
    if path != "/mcp" {
        return respond(req, 404, None);
    }
    if *req.method() != tiny_http::Method::Post {
        return respond(req, 405, None);
    }
    if header(&req, "Origin").is_some_and(|o| !local_origin(o)) {
        return respond(req, 403, None);
    }
    if header(&req, "Authorization") != Some(format!("Bearer {token}").as_str()) {
        return respond(req, 401, Some(&rpc_error(Value::Null, -32001, "Unauthorized: missing or wrong bearer token", None)));
    }
    let mut buf = Vec::new();
    if req.as_reader().take(MAX_BODY + 1).read_to_end(&mut buf).is_err() || buf.len() as u64 > MAX_BODY {
        return respond(req, 413, None);
    }
    let msg: Value = match serde_json::from_slice(&buf) {
        Ok(v) => v,
        Err(_) => return respond(req, 400, Some(&rpc_error(Value::Null, -32700, "Parse error", None))),
    };
    if !msg.is_object() {
        return respond(req, 400, Some(&rpc_error(Value::Null, -32600, "Invalid request: batches are not supported", None)));
    }
    let in_body = msg.pointer(&format!("/params{PROTOCOL_KEY}")).and_then(Value::as_str).map(str::to_string);
    let in_header = header(&req, "MCP-Protocol-Version").map(str::to_string);
    if let (Some(b), Some(h)) = (&in_body, &in_header) {
        if b != h {
            let id = msg.get("id").cloned().unwrap_or(Value::Null);
            return respond(req, 400, Some(&rpc_error(id, -32020, "MCP-Protocol-Version header does not match the request", None)));
        }
    }
    match handle(store, changed, &msg) {
        Some((status, v)) => respond(req, status, Some(&v)),
        None => respond(req, 202, None),
    }
}

pub fn bridge_config() -> Option<(String, String)> {
    let dir = match std::env::var_os("NEXTDAY_DATA_DIR") {
        Some(d) => PathBuf::from(d),
        None => PathBuf::from(std::env::var_os("APPDATA")?).join("ru.igorberezkin.nextday"),
    };
    let cfg: Option<McpConfig> = std::fs::read_to_string(dir.join(CONFIG_FILE)).ok().and_then(|t| serde_json::from_str(t.trim_start_matches('\u{feff}')).ok());
    let url = std::env::var("NEXTDAY_MCP_URL").ok().or_else(|| cfg.as_ref().map(|c| format!("http://127.0.0.1:{}/mcp", c.port)))?;
    let token = std::env::var("NEXTDAY_MCP_TOKEN").ok().or_else(|| cfg.map(|c| c.token))?;
    Some((url, token))
}

pub fn bridge() -> i32 {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(60)))
        .build()
        .into();
    let stdin = std::io::stdin();
    let mut out = std::io::stdout();
    let local = |msg: &Value| answer(None, &|| {}, msg).map(|(_, v)| v);
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => {
                let _ = writeln!(out, "{}", rpc_error(Value::Null, -32700, "Parse error", None));
                let _ = out.flush();
                continue;
            }
        };
        let id = msg.get("id").cloned();
        let reply: Option<Value> = match bridge_config() {
            None => local(&msg),
            Some((url, token)) => {
                let sent = agent
                    .post(&url)
                    .header("Authorization", &format!("Bearer {token}"))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json, text/event-stream")
                    .send(line.as_str());
                match sent {
                    Ok(mut r) => {
                        let body = r.body_mut().read_to_string().unwrap_or_default();
                        match serde_json::from_str::<Value>(&body) {
                            Ok(v) => Some(v),
                            Err(_) if body.trim().is_empty() && id.is_none() => None,
                            Err(_) => local(&msg),
                        }
                    }
                    Err(_) => local(&msg),
                }
            }
        };
        if let (Some(v), true) = (reply, id.is_some()) {
            let _ = writeln!(out, "{v}");
            let _ = out.flush();
        }
    }
    0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::uid;
    use std::sync::Arc;

    fn store() -> Store {
        Store::open(std::env::temp_dir().join(format!("nextday-mcp-{}", uid()))).unwrap()
    }

    fn req(method: &str, params: Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": 7, "method": method, "params": params })
    }

    fn modern(method: &str, mut params: Value) -> Value {
        params["_meta"] = json!({ "io.modelcontextprotocol/protocolVersion": LATEST, "io.modelcontextprotocol/clientCapabilities": {} });
        req(method, params)
    }

    fn tool(s: &Store, name: &str, args: Value) -> Value {
        let (_, r) = handle(s, &|| {}, &modern("tools/call", json!({ "name": name, "arguments": args }))).unwrap();
        r["result"].clone()
    }

    #[test]
    fn handshakes_old_and_new() {
        let s = store();
        let (st, r) = handle(&s, &|| {}, &modern("server/discover", json!({}))).unwrap();
        assert_eq!(st, 200);
        assert_eq!(r["result"]["supportedVersions"][0], LATEST);
        assert_eq!(r["result"]["resultType"], "complete");
        let (_, r) = handle(&s, &|| {}, &req("initialize", json!({ "protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": { "name": "t", "version": "1" } }))).unwrap();
        assert_eq!(r["result"]["protocolVersion"], "2025-06-18");
        assert_eq!(r["result"]["serverInfo"]["name"], "next-day");
        let (_, r) = handle(&s, &|| {}, &req("initialize", json!({ "protocolVersion": "2099-01-01" }))).unwrap();
        assert_eq!(r["result"]["protocolVersion"], LEGACY[0]);
        assert!(handle(&s, &|| {}, &json!({ "jsonrpc": "2.0", "method": "notifications/initialized" })).is_none());
        let mut bad = modern("tools/list", json!({}));
        bad["params"]["_meta"]["io.modelcontextprotocol/protocolVersion"] = json!("1900-01-01");
        let (st, r) = handle(&s, &|| {}, &bad).unwrap();
        assert_eq!(st, 400);
        assert_eq!(r["error"]["code"], -32022);
        let (_, r) = handle(&s, &|| {}, &modern("nope", json!({}))).unwrap();
        assert_eq!(r["error"]["code"], -32601);
        let (_, r) = handle(&s, &|| {}, &modern("tools/list", json!({}))).unwrap();
        assert_eq!(r["result"]["tools"].as_array().unwrap().len(), 18);
        let (_, r) = handle(&s, &|| {}, &modern("resources/read", json!({ "uri": "nextday://guide" }))).unwrap();
        assert!(r["result"]["contents"][0]["text"].as_str().unwrap().contains("# Next Day for AI agents"));
        let (_, r) = handle(&s, &|| {}, &modern("prompts/get", json!({ "name": "plan_goal", "arguments": { "goal": "выучить Rust" } }))).unwrap();
        assert!(r["result"]["messages"][0]["content"]["text"].as_str().unwrap().contains("выучить Rust"));
        let (_, r) = handle(&s, &|| {}, &modern("prompts/get", json!({ "name": "plan_goal", "arguments": {} }))).unwrap();
        assert_eq!(r["error"]["code"], -32602);
    }

    #[test]
    fn bridge_answers_without_the_app() {
        let ask = |method: &str, params: Value| answer(None, &|| {}, &req(method, params)).unwrap().1;
        assert_eq!(ask("initialize", json!({ "protocolVersion": "2025-11-25" }))["result"]["serverInfo"]["name"], "next-day");
        assert_eq!(ask("tools/list", json!({}))["result"]["tools"].as_array().unwrap().len(), 18);
        assert!(ask("resources/read", json!({ "uri": "nextday://guide" }))["result"]["contents"][0]["text"].as_str().unwrap().starts_with("# Next Day"));
        assert_eq!(ask("tools/call", json!({ "name": "get_overview" }))["result"]["isError"], true);
        assert_eq!(ask("resources/read", json!({ "uri": "nextday://goals" }))["error"]["code"], -32603);
    }

    #[test]
    fn tools_manage_drill() {
        let s = store();
        let r = tool(&s, "get_drill", json!({}));
        assert_eq!(r["isError"], false);
        assert_eq!(r["structuredContent"]["decks"][0]["id"], "python");
        let r = tool(&s, "create_drill_deck", json!({ "title": "ML", "check": { "mode": "python" }, "cards": [
            { "prompt": "len([1, [2, 3]])?", "answer": "2", "explain": "Вложенный список считается одним элементом." },
            { "topic": "numpy", "prompt": "np.zeros((2, 3)).shape?", "answer": "(2, 3)" }
        ] }));
        assert_eq!(r["isError"], false, "{r}");
        let id = r["structuredContent"]["deck"]["id"].as_str().unwrap().to_string();
        let r = tool(&s, "create_drill_deck", json!({ "title": "bad", "check": { "mode": "python" }, "cards": [{ "prompt": "?", "answer": "[1," }] }));
        assert_eq!(r["isError"], true);
        let r = tool(&s, "edit_drill_deck", json!({ "deckId": id, "upsert": [{ "prompt": "1 / 2?", "answer": "0.5" }] }));
        assert_eq!(r["structuredContent"]["cards"].as_array().unwrap().len(), 3);
        assert_eq!(tool(&s, "edit_drill_deck", json!({ "deckId": "python", "title": "x" }))["isError"], true);
        let r = tool(&s, "save_drill_preset", json!({ "name": "ML в окне", "screen": "window", "sources": [{ "deck": id, "topics": ["numpy"] }], "goal": "cards", "amount": 5, "makeDefault": true }));
        assert_eq!(r["isError"], false, "{r}");
        let pid = r["structuredContent"]["id"].as_str().unwrap().to_string();
        let r = tool(&s, "save_drill_preset", json!({ "id": pid, "amount": 7 }));
        assert_eq!(r["structuredContent"]["amount"], 7);
        assert_eq!(r["structuredContent"]["screen"], "window");
        assert_eq!(tool(&s, "get_drill", json!({}))["structuredContent"]["defaultPreset"], pid);
        let r = tool(&s, "get_drill_deck", json!({ "deckId": "python" }));
        assert!(r["structuredContent"]["cards"].as_array().unwrap().len() > 10);
        let (_, r) = handle(&s, &|| {}, &modern("resources/read", json!({ "uri": "nextday://drill" }))).unwrap();
        assert!(r["result"]["contents"][0]["text"].as_str().unwrap().contains("presets"));
        let r = tool(&s, "save_drill_theory", json!({ "deckId": id, "topic": "numpy", "title": "Формы массивов", "body": "## Модель\n```data\n[[1, 2], [3, 4]]\n```" }));
        assert_eq!(r["isError"], false, "{r}");
        assert_eq!(r["structuredContent"]["author"], "ai");
        let r = tool(&s, "get_drill_theory", json!({ "deckId": id }));
        assert_eq!(r["structuredContent"]["articles"].as_array().unwrap().len(), 1);
        assert_eq!(tool(&s, "save_drill_theory", json!({ "deckId": "nope", "title": "x", "body": "y" }))["isError"], true);
        let r = tool(&s, "install_drill_generator", json!({ "title": "Глаголы", "code": "const plugin = { topics: [], templates: [] };" }));
        assert_eq!(r["isError"], false, "{r}");
        assert_eq!(r["structuredContent"]["generator"]["enabled"], false);
        let gid = r["structuredContent"]["generator"]["id"].as_str().unwrap().to_string();
        let r = tool(&s, "get_drill_deck", json!({ "deckId": gid }));
        assert_eq!(r["structuredContent"]["kind"], "generator");
        assert_eq!(r["structuredContent"]["author"], "ai");
        assert_eq!(tool(&s, "install_drill_generator", json!({ "id": "shapes", "title": "x", "code": "y" }))["isError"], true);
        let bank = json!({ "title": "Глаголы", "topics": [{ "id": "irr", "title": "Неправильные", "theory": "## be\nwas, were" }], "cards": [
            { "id": "past", "topic": "irr", "kind": "text", "rule": "Past Simple", "variants": [
                { "question": "go?", "answer": "went" }, { "question": "see?", "answer": "saw" }, { "question": "", "answer": "x" }
            ] },
            { "id": "bad", "topic": "irr", "kind": "nope", "variants": [{ "question": "?", "answer": "1" }] },
            { "id": "pick", "topic": "irr", "kind": "pick", "variants": [{ "question": "?", "code": "x = [1]", "answer": "[1]", "choices": ["(1,)", "1"], "walk": { "steps": [[1, null, [["x", "[1]", "list[int]"]]]], "focus": null, "error": null } }] }
        ] });
        let r = tool(&s, "import_drill_bank", json!({ "bank": bank }));
        assert_eq!(r["isError"], false, "{r}");
        let rep = &r["structuredContent"]["report"];
        assert_eq!(rep["cards"], 2);
        assert_eq!(rep["variants"], 3);
        assert_eq!(rep["dropped"], 2);
        let bid = rep["id"].as_str().unwrap().to_string();
        let r = tool(&s, "get_drill_deck", json!({ "deckId": bid }));
        assert_eq!(r["structuredContent"]["kind"], "bank");
        assert_eq!(r["structuredContent"]["cards"][0]["variants"], 2);
        let r = tool(&s, "get_drill_theory", json!({ "deckId": bid }));
        assert_eq!(r["structuredContent"]["articles"][0]["builtin"], true);
        let path = s.dir.join("bank.json");
        std::fs::write(&path, serde_json::to_string(&bank).unwrap()).unwrap();
        let r = tool(&s, "import_drill_bank", json!({ "path": path.to_string_lossy(), "replaceId": bid }));
        assert_eq!(r["structuredContent"]["report"]["replaced"], true, "{r}");
        assert_eq!(r["structuredContent"]["report"]["id"], bid);
        assert_eq!(tool(&s, "import_drill_bank", json!({}))["isError"], true);
        let mut kinds: Vec<String> = tool(&s, "get_drill", json!({}))["structuredContent"]["decks"].as_array().unwrap().iter().map(|d| d["kind"].as_str().unwrap().to_string()).collect();
        assert_eq!(kinds[..2], ["bank", "generator"]);
        kinds.sort();
        assert_eq!(kinds, vec!["bank", "bank", "deck", "generator", "generator"]);
    }

    #[test]
    fn tools_create_and_drive_goals() {
        let s = store();
        let calls = std::sync::atomic::AtomicU32::new(0);
        let bump = || {
            calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        };
        let r = handle(
            &s,
            &bump,
            &modern(
                "tools/call",
                json!({ "name": "create_goal", "arguments": {
                    "title": "Тест Яндекса",
                    "outcome": "3 задачи из 6",
                    "minutesPerDay": 120,
                    "topics": [
                        { "id": "py", "title": "Python", "tasks": [{ "text": "01-05", "minutes": 90 }] },
                        { "id": "mock", "title": "Мок", "requires": ["py"], "tasks": [{ "text": "Мок 1", "kind": "check", "doneWhen": "2 задачи из 5" }] }
                    ]
                } }),
            ),
        )
        .unwrap()
        .1;
        assert_eq!(r["result"]["isError"], false, "{r}");
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
        let goal = &r["result"]["structuredContent"]["goal"];
        assert_eq!(goal["status"], "draft");
        assert_eq!(goal["author"], "ai");
        assert_eq!(goal["topics"][1]["requires"][0], "py");
        assert_eq!(goal["forecast"][0]["tasks"][0]["text"], "01-05");
        let id = goal["id"].as_str().unwrap().to_string();
        let check = goal["topics"][1]["tasks"][0]["id"].as_str().unwrap().to_string();
        let r = tool(&s, "record_result", json!({ "goalId": id, "taskId": check, "score": 70, "status": "done" }));
        assert_eq!(r["structuredContent"]["progress"]["readiness"], 70);
        let r = tool(&s, "record_result", json!({ "goalId": id, "taskId": check, "score": 170 }));
        assert_eq!(r["isError"], true);
        let r = tool(&s, "edit_topics", json!({ "goalId": id, "upsert": [{ "title": "Алгоритмы", "requires": ["Python"], "tasks": [{ "text": "две задачи", "minutes": 60 }] }] }));
        let topics = r["structuredContent"]["topics"].as_array().unwrap();
        assert_eq!(topics.iter().map(|t| t["title"].as_str().unwrap()).collect::<Vec<_>>(), ["Python", "Мок", "Алгоритмы"]);
        assert_eq!(topics[2]["requires"][0], "py");
        let r = tool(&s, "edit_topics", json!({ "goalId": id, "upsert": [{ "id": "py", "requires": ["mock"] }] }));
        assert_eq!(r["isError"], true);
        let r = tool(&s, "edit_topics", json!({ "goalId": id }));
        assert_eq!(r["isError"], true);
        let r = tool(&s, "update_goal", json!({ "goalId": id, "minutesPerDay": 45 }));
        assert_eq!(r["structuredContent"]["minutesPerDay"], 45);
        let r = tool(&s, "list_goals", json!({ "status": "active" }));
        assert_eq!(r["structuredContent"]["goals"].as_array().unwrap().len(), 0);
        let r = tool(&s, "list_goals", json!({}));
        assert_eq!(r["structuredContent"]["goals"][0]["topics"][0]["tasks"], 1);
        let r = tool(&s, "get_overview", json!({}));
        assert_eq!(r["structuredContent"]["goals"][0]["status"], "draft");
        let r = tool(&s, "get_goal", json!({ "goalId": id }));
        assert!(r["structuredContent"]["finish"].is_string());
        let r = tool(&s, "get_history", json!({ "from": "2026-10-01" }));
        assert_eq!(r["isError"], true);
        let r = tool(&s, "schedule_step", json!({ "goalId": id }));
        assert_eq!(r["isError"], true);
    }

    #[test]
    fn http_server_answers_with_token_only() {
        let s = Arc::new(store());
        let (server, port) = bind(DEFAULT_PORT + 30).unwrap();
        let server = Arc::new(server);
        let srv = server.clone();
        let st = s.clone();
        let worker = std::thread::spawn(move || {
            for r in srv.incoming_requests() {
                serve_one(&st, &|| {}, "secret", r);
            }
        });
        let agent: ureq::Agent = ureq::Agent::config_builder().http_status_as_error(false).build().into();
        let url = format!("http://127.0.0.1:{port}/mcp");
        let body = serde_json::to_string(&modern("tools/list", json!({}))).unwrap();
        let r = agent.post(&url).header("Content-Type", "application/json").send(body.as_str()).unwrap();
        assert_eq!(r.status().as_u16(), 401);
        let mut r = agent.post(&url).header("Authorization", "Bearer secret").send(body.as_str()).unwrap();
        assert_eq!(r.status().as_u16(), 200);
        let v: Value = serde_json::from_str(&r.body_mut().read_to_string().unwrap()).unwrap();
        assert_eq!(v["result"]["tools"][0]["name"], "get_overview");
        let r = agent.post(&url).header("Authorization", "Bearer secret").header("Origin", "https://evil.example").send(body.as_str()).unwrap();
        assert_eq!(r.status().as_u16(), 403);
        let note = r#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#;
        let r = agent.post(&url).header("Authorization", "Bearer secret").send(note).unwrap();
        assert_eq!(r.status().as_u16(), 202);
        let r = agent.post(&url).header("Authorization", "Bearer secret").header("MCP-Protocol-Version", "2025-11-25").send(body.as_str()).unwrap();
        assert_eq!(r.status().as_u16(), 400);
        let r = agent.get(&url).header("Authorization", "Bearer secret").call().unwrap();
        assert_eq!(r.status().as_u16(), 405);
        server.unblock();
        worker.join().unwrap();
    }
}
