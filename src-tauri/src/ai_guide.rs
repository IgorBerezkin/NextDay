pub const INSTRUCTIONS: &str = "Next Day is the user's local day planner (Windows tray app). The user plans only TOMORROW, ticks checklist items during the day and seals the day with a rating. A goal is a map: topics linked by prerequisites, each with tasks ranked from simple to hard. While a goal is active the app itself puts its next tasks into tomorrow's plan, as many as fit the goal's daily minutes, and ticks move the goal forward. Start with get_overview and take dates from it. Before building a goal, read get_profile (real working rhythm) and recent get_history. create_goal makes a DRAFT that only the user can activate in the app; never pretend a draft is active. The drill trainer (tab Зубрилка) keeps decks of cards and presets of how to drill them: read get_drill before coaching, build decks with create_drill_deck and a fitting check template, tasks that need fresh data every time with install_drill_generator (a sandboxed JavaScript plugin) or import_drill_bank (a prepared JSON bank), and never turn on the screen lock or remove its escape unless the user asked. Read the resource nextday://guide for the data model, planning rules, tool reference and workflows.";

const ENGLISH_UI: [(&str, &str); 26] = [
    ("ИИ через MCP", "AI over MCP"),
    ("Зубрилка", "Drill"),
    ("Справочник", "Reference"),
    ("Наборы", "Decks"),
    ("Проверить", "Test"),
    ("Основные", "Basic"),
    ("Для программистов", "For programmers"),
    ("Выбор из вариантов", "Multiple choice"),
    ("Самопроверка", "Self-check"),
    ("Значение Python", "Python value"),
    ("Форма данных Python", "Python data shape"),
    ("Текст", "Text"),
    ("Число", "Number"),
    ("Свои", "Custom"),
    ("Языки", "Languages"),
    ("Английское слово", "English word"),
    ("Формы неправильных глаголов", "Forms of irregular verbs"),
    ("Неправильные глаголы", "Irregular verbs"),
    ("Три формы", "Three forms"),
    ("У неправильного глагола три формы: go, went, gone.", "An irregular verb has three forms: go, went, gone."),
    ("Past Simple неправильного глагола нужно помнить.", "The past simple of an irregular verb has to be remembered."),
    ("Past Simple от ", "Past simple of "),
    ("даёт остаток", "gives the remainder"),
    ("the letters ё and е are ignored", "the Cyrillic letters yo and ye count as one"),
    ("(понедельник)", "(Monday)"),
    ("(воскресенье)", "(Sunday)"),
];

pub fn english(text: &str) -> String {
    ENGLISH_UI.iter().fold(text.to_string(), |s, (ru, en)| s.replace(ru, en))
}

pub fn local(text: &str) -> String {
    if crate::i18n::en() {
        english(text)
    } else {
        text.to_string()
    }
}

pub const GUIDE: &str = r##"# Next Day for AI agents

Technical reference for assistants connected to Next Day through MCP. Read it once per conversation before planning or changing anything.

## 1. The app

Next Day is a local, single-user day planner for Windows that lives in the tray. All data is stored as JSON files on the user's computer. This MCP server runs inside the app, listens on 127.0.0.1 only and is the only way for an assistant to read or change the data. Everything you read is private: use it only for the user's current request.

The rhythm of the app:

- Evening: the user names TOMORROW (the theme of the day) and may add a description and a checklist. Only tomorrow can be planned, never further ahead. A day that was not named the evening before can still be named on the day itself (`namedLate`).
- Day: the plan is frozen; the user only ticks checklist items and sub-items.
- Night or next morning: the user collects results on a board (notes, images, finished tasks) and seals the day with a rating 1-5 and an optional short summary. Sealed days are read-only history.
- Goals: a goal is a map of topics. Arrows (prerequisites) say what must be mastered before what; every topic holds tasks ranked from simple to hard. While a goal is active, the app plans tomorrow by itself from the map and the goal's daily minutes. The user sees the map on the Map tab and the goal on the Goals tab.
- Drill trainer (tab Зубрилка): short cards answered in a row until a session goal is met. The user chooses what to drill (decks and topics), how (order, session size, self-check) and under which conditions (a full-screen lock or a normal window, an escape, a time ceiling). The app has no decks of its own: the user builds them, imports banks or installs generators (JavaScript plugins), by hand or with your help. How answers are compared (text, a number, a choice of options, self-check, Python values and shapes) comes from check templates that the user keeps in groups and can extend.

## 2. Connecting

| Transport | How |
|---|---|
| Streamable HTTP | `POST http://127.0.0.1:{port}/mcp`, default port 47328, header `Authorization: Bearer {token}`. Responses are plain JSON, never SSE. `GET` returns 405, notifications return 202. Requests with a foreign `Origin` are rejected. |
| stdio | Run `Next Day.exe --mcp` from the install folder (`next-day.exe` in development builds). The bridge relays JSON-RPC lines to the running app, reading the port and token from `%APPDATA%\ru.igorberezkin.nextday\mcp.json`. When the app is not running, the bridge still answers the handshake, the lists and this guide; data calls fail with "Next Day is not reachable". |

- The user turns the server on in Settings (card "ИИ через MCP"). The card shows the URL and copies ready-made setups for Claude Code and Claude Desktop.
- Protocol versions: `2026-07-28` (stateless: `server/discover`, version in `_meta`) and `2025-11-25`, `2025-06-18`, `2025-03-26` through `initialize`.
- Capabilities: tools, resources (read only), prompts. No sessions, subscriptions, sampling or list-change notifications.

## 3. Time

- Dates are `YYYY-MM-DD`; timestamps are local `YYYY-MM-DDTHH:MM:SS` without a zone.
- The logical day starts at `dayStartHour` (0-6). With `dayStartHour` 4, a tick at 01:30 belongs to the previous date.
- Take `now`, `today` and `tomorrow` from `get_overview`; do not rely on your own clock.

## 4. Data model

### Day

Returned by `get_history` and `nextday://day/{date}`.

| Field | Type | Meaning |
|---|---|---|
| date | date | |
| name | string | Theme of the day |
| description | string | Free text, clipped to 1500 chars |
| namedLate | bool | Named on the day itself, not the evening before |
| auto | bool | The app made this plan from goals and the user has not touched it yet |
| checklist | Item[] or null | null when the user chose no checklist |
| rating | 1-5 or null | Set when the day is sealed |
| summary | string or null | Up to 200 chars, written when sealing |
| sealed | bool | Read-only history when true |
| board | string[] | Only with `includeBoard`: text notes and finished tasks from the results board, then `[N image(s)]` |

### Item

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque |
| text | string | Up to 300 chars |
| hours | number or null | Estimate, a multiple of 0.25 |
| start | 0-23 or null | Planned start hour, shown on the clock tab |
| done | bool | Ticked |
| doneAt | timestamp or null | When it was ticked |
| subs | {text, done}[] | Up to 3 sub-items; ticking all of them ticks the item |
| continues | {date, text} or null | Continues a task from an earlier day |
| goal | {goalId, taskId} or null | The goal task this item stands for |

A checklist holds at most 40 items and is always sorted by start hour counted from `dayStartHour`; items without a start come last.

### Goal

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque |
| title | string | Up to 80 chars |
| outcome | string | Concrete, checkable definition of success, up to 600 chars |
| note | string | Context: current level, materials, constraints, up to 4000 chars |
| deadline | date or null | |
| minutesPerDay | 1-960 or null | Daily budget in task minutes; null means 60 |
| days | int[] | ISO weekdays 1 (Mon) to 7 (Sun) to work on the goal; empty means every day |
| startHour | 0-23 or null | Hour when the goal's tasks start in a day |
| status | draft, active, paused, done, archived | Only the user changes it |
| author | user or ai | Who created the goal |
| topics | Topic[] | The map, up to 60 topics |
| createdAt, updatedAt | timestamp | |
| progress | Progress | Computed on every read |
| forecast | Day plan[] | The next 14 working days as the app would plan them |
| finish | date or null | Projected date of the last task; null when nothing is left or the rest can never be planned |

### Topic

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque inside the app; in `create_goal` you choose it |
| title | string | Up to 120 chars, unique within the goal |
| note | string | Materials, links, hints, up to 4000 chars |
| requires | string[] | Ids of prerequisite topics. On the map arrows go from them to this topic |
| tasks | Task[] | Up to 30, ranked from the simplest to the hardest |

### Task

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque |
| text | string | Up to 300 chars |
| minutes | 1-960 or null | Estimate used to fill the daily budget; null counts as 30 |
| kind | learn, practice, review, check | `check` is a readiness test that gets a score |
| doneWhen | string | Verifiable acceptance criterion, up to 300 chars |
| status | todo, planned, done, skipped | See section 5 |
| plannedFor | date or null | The day whose plan holds the task (kept after done) |
| doneAt | timestamp or null | |
| result | Result or null | The recorded result |

- Result: `{minutes, score, confidence, note, at, by}`; minutes 1-1440, score 0-100, confidence 1-5 (each may be null), note up to 2000 chars, `by` is user or ai.
- Progress: `{topicsTotal, topicsDone, tasksTotal, tasksDone, tasksLeft, minutesTotal, minutesDone, checksTotal, checksDone, readiness}`. Skipped tasks are left out. A topic is done when it has tasks and all of them are done or skipped. `readiness` is the integer average of the scores recorded on check tasks, null when there are none.

### Drill deck

Decks come in three kinds, all drilled the same way through presets:

- deck: cards written by hand or by AI with `create_drill_deck`. The fields are below.
- bank: a prepared bank imported from JSON with `import_drill_bank` (DataEater). Every card is a template with many variants that differ only in data, for example code cards whose answers come from executing the code.
- generator: a JavaScript plugin that makes fresh variants at the start of every session, installed with `install_drill_generator`.

After a miss, a card of a bank or a generator comes back with another variant: the same task with new data.

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque |
| title | string | Up to 80 chars |
| description | string | Up to 1000 chars |
| author | user or ai | |
| check | Check | How answers to the deck's cards are compared, usually copied from a check template |
| gate | Gate | When enabled, topics open one by one |
| cards | Card[] | Up to 2000 |

### Card

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque |
| topic | string | Optional section name, up to 80 chars; topics follow the order of their first card |
| prompt | string | The question, up to 2000 chars |
| code | string | Optional code shown with line numbers, up to 4000 chars |
| answer | string | Canonical answer shown after a miss, up to 500 chars |
| alternatives | string[] | Other accepted answers, up to 10 |
| choices | string[] | Choice mode: the options; the answer is added if missing |
| check | Check or null | Overrides the deck's check for this card |
| explain | string | Rule or explanation shown after a miss, up to 2000 chars |

### Check

`{mode, caseSensitive, ignoreSpaces, tolerance, strictTypes, hint}`

| mode | The answer is right when |
|---|---|
| text | It is equal after trimming and collapsing spaces; case and the letters ё and е are ignored unless `caseSensitive`; `ignoreSpaces` removes all spaces |
| python | The Python literal equals the answer together with types (3 and 3.0 differ, a tuple is not a list) unless `strictTypes` is false; dict keys and set items in any order, either quotes, spaces ignored. An exception name such as `TypeError`, quoted or not, answers code that fails |
| shape | The shape notation matches with spaces ignored: `int`, `list[str]`, `tuple[str, int]`, `dict[str, list[int]]`, `set[int]` |
| number | It is within `tolerance` of the answer; a comma works as the decimal point |
| choice | The picked option is the answer |
| self | The user reveals the answer and says whether they knew it |

`hint` (up to 200 chars) is shown under the answer field during a session instead of the default hint of the mode. Use it for the expected form of the answer: the base form of a word, a unit, a date format. Write it in the user's language.

### Check template

`{id, group, name, check}`: a named Check that the user picks when building a deck or a card. Templates are listed in groups, and a new group name makes a new group. A new install starts with two groups: Основные with `text` (Текст), `choice` (Выбор из вариантов), `number` (Число) and `self` (Самопроверка), and Для программистов with `python` (Значение Python) and `shape` (Форма данных Python). The user can change and delete any template and bring the default ones back.

A deck or a card copies the check of its template. Changing or deleting the template later does not touch existing decks.

### Bank

`{id, title, description, gate, topics, cards}`: the format of `import_drill_bank`. `id` is optional: when it is free (letters, digits, `-` and `_`, up to 40 chars) the bank keeps it, so progress survives a fresh import after the bank was deleted.

- `topics`: up to 100 `{id, title, theory}`. `theory` is Markdown in the app's dialect (see Theory article) and becomes a read-only article of the topic. Topics without cards are dropped.
- `cards`: up to 2000 `{id, topic, kind, rule, check, variants}`. `id` is up to 60 chars and unique; `topic` is a topic id or title; `rule` (up to 2000 chars) is shown after a miss; `check` may tune the comparison (caseSensitive, ignoreSpaces, tolerance, strictTypes, hint) while its mode always comes from `kind`.
- `variants`: up to 200 per card and 100000 per bank, `{question, code, answer, choices, alternatives, explain}`; `prompt` works as another name for `question`. `explain` (Markdown, up to 2000 chars) is shown after a miss under the rule: put the explanation of this very data there, for example a table of every line with its result.

| kind | The user | answer |
|---|---|---|
| value, python, step | types a Python literal | a literal, or an exception name when the code fails |
| pick | picks one of 2-8 options shown as code, keys a-h | one of `choices`, compared as Python values |
| shape | types a shape such as `list[tuple[str, int]]` | a shape |
| error | types the exception name | for example `TypeError` |
| output | types what print shows | the printed text |
| text | types text | text |
| number | types a number | a number |
| choice | picks one of 2-8 text options, keys a-h | one of `choices` |
| self | reveals the answer and grades themselves | any text |

Invalid variants are dropped and listed in the import report; a card left without variants is dropped too.

### Generator

A plain JavaScript script, without import or export, that declares `plugin`:

```js
const VERBS = [["go", "went", "gone"], ["see", "saw", "seen"]];
const plugin = {
  title: "Неправильные глаголы",
  description: "Формы неправильных глаголов",
  topics: [{ id: "forms", title: "Три формы", theory: "У неправильного глагола три формы: go, went, gone." }],
  templates: [
    {
      id: "past",
      topic: "forms",
      kind: "choice",
      rule: "Past Simple неправильного глагола нужно помнить.",
      make(r) {
        const [base, past, done] = r.pick(VERBS);
        return { prompt: `Past Simple от \`${base}\`?`, answer: past, choices: [past, done, base + "ed", base], explain: `${base}, ${past}, ${done}` };
      },
    },
  ],
};
```

- `plugin.id` is optional: when it is free, the installed generator keeps it, so progress survives a reinstall.
- A template is `{id, topic, kind, rule, check, make}`. `id` is up to 60 chars and must stay stable: progress is stored by it. `kind` is one from the Bank table, choice by default. `make(r)` returns one variant with the fields of a bank variant.
- `r` is a seeded random source: `r.random()`, `r.int(a, b)` with both ends included, `r.pick(list)`, `r.chance(p)`, `r.shuffle(list)` (returns a copy), `r.sample(list, k)`. Use it instead of Math.random. Numbers in answers and choices become strings.
- At the start of a session the app calls `make` up to 12 times per template, drops repeats and checks every variant like a bank variant. The whole run must finish within 6 seconds.
- The script runs in a sandboxed worker: no network, no DOM, no access to the app or its data, only computation. The global `lang` holds the app language, `ru` or `en`: write the texts of the cards in it.
- A generator installed or changed through MCP is saved switched off. The user presses Проверить in the app, sees sample cards and enables it.
- Make the four options of a choice or pick card the typical mistakes of this exact task (forgot an operation, took the wrong axis, mixed up two similar functions), not random noise.

Gate: `{enabled, percent, window}`, default 85 and 20. The first topic is always open; the next one opens when every open topic has at least `window` answers and at least `percent` of the last `window` are right. The user can also open or close topics by hand.

### Preset

| Field | Type | Meaning |
|---|---|---|
| id | string | |
| name | string | Up to 60 chars |
| sources | `[{deck, topics}]` | What to drill; an empty list means all decks, empty `topics` means the deck's open topics |
| order | smart, random, sequence | smart: Leitner spaced repetition (below); sequence continues where the last session stopped |
| goal | correct, cards, minutes | The session ends after `amount` right answers, `amount` answers, or `amount` minutes |
| amount | integer | 1-200; for minutes 1-180 |
| retry | bool | A missed card comes back later in the same session; cards of banks and generators come back with new data |
| explain | bool | Also show the rule after right answers |
| screen | lock, window | lock: full screen on every monitor, on top, Alt+F4 blocked, focus comes back; window: inside the app, can be left any time |
| escape | hold, none | lock only: hold Esc for 5 seconds and confirm, recorded as an escape; none: no exit except the ceiling |
| limitMinutes | 5-180 | lock only: the lock opens by itself after this time (outcome timeout) |
| selfCheck | bool | Self-grading instead of typed answers for every card |
| theoryLabel | string | Caption of the theory button, up to 24 chars, may be empty |
| peekKeepsBox | bool | A card answered after opening the theory is not promoted |

- Every card has a Leitner box 1-5. A right answer the first time a card appears in a session moves it one box up; a miss sends it to box 1. Next show: box 1 the same day, boxes 2-5 after 1, 2, 4 and 8 days. Smart order takes due cards first (lower boxes first), mixes new cards in and interleaves topics; when nothing is due it continues with the cards due soonest.
- Session outcomes: done, escape (lock exit by Esc), timeout (lock ceiling), stopped (a window session ended early). The drill streak counts consecutive days with a done session; an escape resets it.
- `theoryLabel` (up to 24 chars, may be empty) is the caption of the lightbulb button that opens the theory during a session. With `peekKeepsBox` (default true) a card answered after opening the theory stays in its box and comes back the same day.

### Theory article

| Field | Type | Meaning |
|---|---|---|
| id | string | `{deck}-{topic}` for the articles that come with banks and generators |
| deck | string | Deck id |
| topic | string | Topic id, empty for the whole deck |
| title | string | Up to 120 chars |
| body | string | Markdown, up to 100000 chars |
| author | user or ai | |
| builtin | bool | The article comes with a bank or a generator and is read-only |

The body uses the app's Markdown dialect: headings `#` to `###`, paragraphs, `**bold**`, `*italic*`, `` `code` ``, links, lists (`- ` and `1. `, nested by two spaces), quotes `> `, tables with a `|---|` row, `---` rules and fenced code blocks. Special fenced blocks:

- `data`: one item per line, `name = literal`, `literal` or `literal -> literal` (before and after). The app draws the Python value as a structure picture (list cells with indexes, a matrix grid, key and value pairs, tuples, sets) with its shape. Literals only: numbers, strings, True, False, None, lists, tuples, dicts, sets, set().
- `chart`: JSON `{"type": "line" | "bar" | "scatter", "title", "x": [...], "series": [{"name", "y": [...]}], "xlabel", "ylabel"}`.
- `plot`: lines `y = <expression of x>` (several allowed; operators + - * / ** ^, functions sin cos tan exp log sqrt abs, pi, e), a range line `x = -3..3` and an optional `title: ...`.
- `graph`: edges, one per line or comma separated: `a -> b` directed, `a - b` undirected, `a -> b: 3` with a label.

A good article gives the model, not a list of functions: how to picture the data, before and after pairs for the main operations, traps, and a table of expressions with their shapes.

In every text the user reads (articles, card `explain`, bank and generator `rule` and `explain`, prompts) wrap each piece of code, variable name and value in backticks: write `a % b` даёт остаток, not a % b даёт остаток. The app shows them as code chips, so they never merge with the words around them.

## 5. How the app plans

Goal status belongs to the user. `create_goal` always makes a draft. Only active goals are planned; drafts, paused, done and archived goals never are. Never claim that a draft is active.

Picking the tasks of one day for one goal:

1. A topic is mastered when all its tasks are done or skipped. A topic is open when every topic in its `requires` is mastered.
2. Topics are walked in prerequisite order; topics that do not depend on each other keep their order in the goal.
3. In each open topic the first task that is not done is taken, in rank order. Tasks are added while their minutes fit `minutesPerDay`; the first task of a day is always taken, even when it is longer than the budget.
4. Finishing the last task of a topic during the day opens its dependents for the same day.

Tomorrow is planned automatically and kept up to date until tomorrow starts: after any change to a goal or its map, after ticks, after sealing a day, after a settings change, and every 15 seconds in the background.

- If tomorrow has no plan, the app creates one with `auto: true`, named after the topics of its tasks.
- If the user planned tomorrow already, the goal tasks are merged into the checklist; the user's own items and name stay.
- Goal items cannot be deleted by the user. To free a day the user pauses the goal; its items then leave tomorrow's plan.
- Items get `hours` from minutes (rounded to 0.25) and a `start`: the tasks of a goal follow each other from its `startHour`. If the set of tasks does not change, the user's own start changes are kept.
- While tomorrow is planned, tasks planned for today count as done. When today is sealed with goal tasks unfinished, they return to the pool and go into tomorrow first. A planned day that passed without the task done also returns it to the pool.

Task status changes:

| From | To | When |
|---|---|---|
| todo | planned | The app put the task into tomorrow's plan |
| planned | done | The user ticked the item, or `record_result` with status done |
| planned | todo | The planned day passed or was sealed without it, or the goal stopped being active |
| done | planned | The user unticked the item |
| any | todo, done, skipped | `record_result` with a status; only the app sets planned |

## 6. Tools

Every tool returns `structuredContent` and the same JSON as text. Tool errors come back with `isError: true` and a short message in the app language, Russian or English. Read them and adjust instead of retrying the same call.

### get_overview (read)

No arguments. Returns `{now, today, tomorrow, dayStartHour, eveningTime, todayPlan, tomorrowPlan, goals}`.

- `todayPlan`, `tomorrowPlan`: null or `{date, name, auto, sealed, checklist}` where items are `{text, start, hours, done, goal: {goalId, taskId} or null}`.
- `goals`: active, draft and paused goals as `{id, title, status, deadline, minutesPerDay, progress, finish, nextDay: {date, tasks: [{topic, task}]}}`.

### get_profile (read)

`days`: window 7-180, default 42. Statistics over complete days before today, starting from the first day with data when the history is shorter.

Returns `{windowDays, from, to, daysCovered, daysPlanned, planningRate, daysWithChecklist, medianPlannedHours, medianDoneHours, maxDoneHours, itemsPlanned, itemsDone, itemCompletion, avgRating, streak, bestStreak, startHourHistogram, doneHourHistogram, mostActiveHours, weekdays, settings, notes}`.

- Hours come from estimates: planned hours of a day are the sum over its items, done hours the sum over ticked items. They are not measured time.
- `planningRate` is `daysPlanned / daysCovered`.
- `startHourHistogram[h]`: items planned to start at hour h. `doneHourHistogram[h]`: items ticked during hour h. `mostActiveHours`: up to four hours with the most ticks.
- `weekdays.mon` to `weekdays.sun`: `{plannedDays, avgDoneHours, completion}`.
- `streak`, `bestStreak`: runs of consecutive days the user worked with; untouched automatic plans do not count.

### get_history (read)

`from`, `to` (required), `includeBoard` (default false). At most 62 days; `to` is capped at tomorrow. Returns `{from, to, today, days}` with planned days only, each a Day.

### list_goals (read)

`status`: optional filter. Returns `{goals}`; each goal has its settings, `progress`, `finish` and a compact map `{id, title, requires, tasks, done}` per topic, where `tasks` and `done` are counts.

### get_goal (read)

`goalId`. Returns the full goal: every topic and task with status and result, `progress`, `finish` and `forecast` as `[{date, minutes, tasks: [{taskId, topic, text}]}]`.

### create_goal (write)

Required: `title`, `outcome`, `topics`. Optional: `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. A topic is `{id, title, note, requires, tasks}` and a task is `{text, minutes, kind, doneWhen}`.

- Give every topic your own short `id` (letters, digits, `-` and `_`) and use these ids in `requires`. Exact titles work too.
- The whole input is validated first: unknown prerequisites, self references, cycles and duplicate titles are rejected and nothing is saved.
- Creates a draft with `author: ai` and returns `{goal, note}`; `goal.finish` and `goal.forecast` show at once how the map fits the budget.

### update_goal (write)

`goalId` plus any of `title`, `outcome`, `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. Omitted fields stay; `deadline: ""` clears the deadline. The status never changes. Returns the full goal; tomorrow's plan is recomputed.

### edit_topics (write)

`goalId`, `upsert` (topics to add or change), `remove` (topic ids to delete). At least one of them is required.

- An `upsert` entry with an existing `id` changes only the fields it gives. A missing or unknown `id` adds a topic, and then `title` is required.
- `tasks`, when given, replaces the topic's whole ranked list. Pass existing tasks with their `id` to keep their status and result; omitted tasks are deleted, except done ones, which are kept at the top.
- `requires`, when given, replaces the prerequisites. Ids and exact titles work, including topics added in the same call.
- Removing a topic deletes its tasks, done ones included, and drops it from other topics' `requires`.
- Returns the full goal; tomorrow's plan is recomputed.

### record_result (write)

`goalId`, `taskId`, and any of `status` (todo, done, skipped), `minutes` (1-1440), `score` (0-100), `confidence` (1-5), `note` (up to 2000 chars).

- With any result field, the task's result is replaced by the given values.
- With only `status`, the status changes and the recorded result stays.
- Status done also ticks the task's item in today's or yesterday's open plan.
- Record scores on check tasks so they count toward readiness.
- Ask the user or verify the work before recording. Returns the compact goal.

### get_drill (read)

No arguments. Returns `{presets, checks, defaultPreset, decks, streak, bestStreak, today, due, weak, sessions}`.

- `checks`: the check templates in the order the user sees them, `{id, group, name, check}`.
- `decks`: `[{id, title, description, kind, enabled, author, cards, variants, check, gate, topics, updatedAt}]`; `kind` is deck, bank or generator, `cards` of a generator counts its templates, `variants` counts the prepared variants of a bank, `enabled` is false for a generator waiting for the user's check. `topics` are `{id, title, cards, open, answered, recent, recentRight, seen, due, boxes}`. `recentRight` of `recent` is the accuracy over the gate window; `boxes` counts seen cards per Leitner box.
- `today`: `{sessions, answers, correct}`. `due`: cards due in the default preset.
- `weak`: the most missed cards `{deck, card, topic, prompt, code, answer, rule, right, wrong, level, lastWrong}`. `lastWrong` holds the user's last wrong answers, the best evidence of a misconception.
- `sessions`: the last 40, newest first, `{name, startedAt, endedAt, outcome, screen, goal, amount, answered, correct, firstTry, wrong, seconds, misses}`.

### get_drill_deck (read)

`deckId`. A user deck with all its cards. A generator returns `{kind: generator, title, description, author, enabled, topics, templates, code}`. A bank returns `{kind: bank, topics, cards}` where each card is a template `{id, topic, kind, rule, variants, sample}`; kind is value (type a literal), pick (choose one of four literals: the right one and three typical structural mistakes), shape (type the shape), step (the value after pass k of a loop), error (the code fails, type the exception name) or output (what print shows). After a miss the user gets the same template with new data.

### create_drill_deck (write)

Required: `title`, `cards`. Optional: `description`, `check` or `template`, `gate`. Every card needs `prompt` and `answer` and may have its own `check` or `template`.

- `template` is the id or name of a check template from `get_drill`; its check is copied into the deck or the card. Prefer a template that fits over a hand-made `check`.
- The whole input is validated first: in python mode every answer and alternative must be a literal or an exception name, in number mode a number; choice cards need at least two options.
- Creates the deck with `author: ai` and returns `{deck, note}`. The deck is drilled only after it is added to a preset.

### edit_drill_deck (write)

`deckId` plus any of `title`, `description`, `check` or `template`, `gate`, `upsert` (cards; a card with an existing `id` is replaced, one without `id` is added) and `remove` (card ids). Banks and generators are changed by `import_drill_bank` and `install_drill_generator`. Progress of kept cards stays. Returns the deck.

### get_drill_theory (read)

Optional `deckId`; with it, `topic` (a topic id) narrows the list to that topic plus the articles about the whole deck. Returns `{articles}`: `[{id, deck, topic, title, body, author, builtin, createdAt, updatedAt}]`. Articles that come with the topics of banks and generators have `builtin: true`.

### save_drill_theory (write)

`deckId`, `title`, `body`, optional `topic` (id or title, empty for the whole deck) and `id` (replaces that article). Creates the article with `author: ai`. Articles of banks and generators can not be changed; write your own next to them. Returns the article.

### install_drill_generator (write)

`title`, `code`, optional `description` and `id` (replaces the code of that generator, or becomes the id of a new one when it is free). Saves the generator switched off and returns `{generator: {id, title, enabled}, note}`. The app runs the script only after the user checks and enables it; then add it to a preset.

### import_drill_bank (write)

`bank` (the object) or `path` (an absolute path to a .json file up to 16 MB), optional `replaceId` (an imported bank to replace; progress of cards with the same ids stays). Returns `{report: {id, title, topics, cards, variants, dropped, problems, replaced}, note}`. Read `problems`: they name the dropped cards and variants and why.

### save_drill_check (write)

`name` (up to 60 chars), `check`, optional `group` (up to 40 chars, default Свои) and `id` (replaces that template). A new group name creates the group; a new template goes to the end of its group. Returns the template.

### delete_drill_check (write)

`id` deletes one template, `group` deletes the whole group. Decks keep their copies of the check. Returns `{deleted}`.

### save_drill_preset (write)

Any preset fields plus `makeDefault`. Without `id` a preset is created from the defaults (all decks, 10 right answers, smart order, retry, lock with the Esc escape and a 30-minute ceiling); with `id` only the given fields change. Returns the preset.

- Sessions are started only by the user, in the app.
- Never turn on `screen: lock` or set `escape: none` unless the user asked for it in their own words.

## 7. Resources and prompts

| URI | Content |
|---|---|
| nextday://guide | This guide |
| nextday://goals | The same as `list_goals` |
| nextday://profile | `get_profile` for 42 days |
| nextday://goal/{goalId} | The same as `get_goal` |
| nextday://day/{date} | One planned day with board notes |
| nextday://drill | The same as `get_drill` |

Prompts: `plan_goal(goal, deadline?)`, `evening_review()`, `readiness_check(goalId)`, `drill_coach()`. Each returns one user message that starts the matching workflow below.

## 8. Workflows

### Build a goal map

1. Read `get_overview`, `get_profile` with `days` 42-60, and `get_history` for the last two or three weeks.
2. Describe the user's real rhythm in two or three sentences: planning rate, `medianDoneHours`, active hours, strong and weak weekdays.
3. Ask what you cannot know: the outcome and deadline, the current level per topic, materials, preferred days and hours. Do not invent the user's level.
4. Size the budget from facts. `medianDoneHours` is what the user really finishes per day, and other tasks still need time, so a goal usually gets 30-50% of it. If the user wants more, show what the data says and let them decide.
5. Put `startHour` inside `mostActiveHours`; keep heavy learning out of late hours unless the history shows otherwise. Give different goals different start hours.
6. Build the map:
   - A topic is one skill or area of knowledge worth a few days of work, usually 3-10 tasks.
   - `requires` holds what must really be known first. Do not add arrows just in case: every arrow delays the dependent topic.
   - Inside a topic go from simple to hard: learn, then practice, a review, and a check when the topic matters for the outcome.
   - End with a final topic that requires the key topics and holds a check that mirrors the real target.
   - Give every task minutes, and every practice and check task a verifiable `doneWhen`.
7. Look at `finish` in the result. If it misses the deadline, say so and offer a smaller map, a bigger budget or a later deadline, then apply the choice with `update_goal` or `edit_topics`.
8. Summarize: topics, daily time, projected finish. Ask the user to look at the Map tab and to activate the goal on the Goals tab.

### Evening review

1. Call `get_overview` and read today's day through `get_history` or `nextday://day/{today}`.
2. For each goal item of today, ask how it went. Quiz briefly (two to five short questions, one at a time) or check the work; run the user's tests when you have a shell.
3. Call `record_result` for each task with minutes, score and a short note. Mark a task done only when its `doneWhen` is met.
4. If the user struggled, add review or practice tasks to that topic with `edit_topics` (send the full task list with the existing ids and the new tasks where they belong). If they are ahead, say so.
5. Tell the user what tomorrow's plan holds for their goals; it is in `tomorrowPlan`.

### Readiness check

1. Call `get_goal` and read the outcome and the mastered topics.
2. Design a test that mirrors the real target (time limit, tasks, rubric), run it in the chat one part at a time and grade it honestly.
3. Call `record_result` with the score on a check task; add one with `edit_topics` if there is none.
4. Name what to fix first and add review tasks to the weakest topics.

### Reshape a map

- To insert work, send the topic's full task list in the new order with the existing ids.
- To put a topic between two others, add it and update the `requires` of the topics that depend on it.
- Avoid removing topics with finished work: their done tasks would be lost. Add tasks or topics instead.

### Coach the drill

1. Call `get_drill`. Name the open topics, accuracy, streak and the outcomes of recent sessions; escapes and timeouts mean the sessions are too long or too hard.
2. Study `weak`: group the misses by the rule behind them and read `lastWrong` to find the misconception.
3. Explain each rule with a tiny example and check the user with one question at a time in the chat.
4. Offer a deck that targets these mistakes: create it with `create_drill_deck` (a fitting check template from `checks`, python for code questions, a short `explain` on every card) and, if the user agrees, add it to a preset with `save_drill_preset`. When the user will drill the same kind of answer again (words of a language, dates, formulas), offer a check template for it with `save_drill_check` and a `hint` that names the expected form.
5. When a rule keeps failing, write the model down for later with `save_drill_theory` on that deck and topic: a short article with `data` blocks that show the structure before and after.
6. When the user needs the same kind of task again and again with new data (shapes after transformations, verb forms, unit conversions), write a generator instead of a deck. See below.

### Write a generator

1. Agree on the task with the user: what is shown, what is asked, which mistakes the wrong options stand for, and the topics.
2. Write the script. Keep data small and readable: the task should train recognizing structure, not mental arithmetic. Put a step by step `explain` into every variant.
3. Test it before installing: load the script with node (`new Function(code + "; return plugin")()`), call every `make` a few hundred times with a seeded `r` like the one above, and check that the answer is among the choices, the options are unique and the texts fit the limits. When answers come from code (Python, NumPy, PyTorch), execute that code and compare.
4. Install it with `install_drill_generator`, then ask the user to open Зубрилка, tab Наборы, press Проверить, look at the sample cards and enable it.
5. Offer a preset with `save_drill_preset` that uses it, for example a window session of 10 cards.

## 9. Conventions

- The app speaks Russian or English, as the user chose in Settings; names of tabs and buttons in this guide follow that language.
- Write goal texts in the user's language; look at their day names and checklist items.
- Texts are plain text. URLs and Windows paths become clickable links in the app.
- Ids are opaque strings; take them from tool results, except the topic ids you choose in `create_goal`.
- Keep tasks concrete and short: "Solve 3 sliding-window problems", not "Study algorithms".
- Every write shows up in the open app immediately.
"##;
