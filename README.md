# Next Day

Планировщик на один день вперёд для Windows.

Вечером программа спрашивает, как назвать завтрашний день и чем вы будете заниматься. Можно добавить чеклист, указать часы на каждый пункт и время, когда его начинать. Днём отмечаете сделанное, вечером собираете итоги на доске: сделанные пункты, скриншоты, заметки, рисунки. Потом день запечатывается и остаётся в истории, менять его уже нельзя.

На вкладке «Часы» видно, какая задача стоит на какой час, а когда этот час наступает, приходит напоминание.

Задача может продолжать задачу из прошлого дня, тогда у пункта видно, откуда он вырос.

Планировать можно только завтрашний день, один план на день.

Программа запускается вместе с Windows, живёт в трее и напоминает о себе утром и вечером.

![План на завтра](screenshots/plan.png)

![Сегодня](screenshots/today.png)

![Доска итогов](screenshots/board.png)

![История](screenshots/history.png)

## Цели

Большую цель можно разложить на темы: что нужно уметь и в каком порядке. У каждой темы свои задачи, от простых к сложным, и у каждой задачи примерное время.

На вкладке «Карта» темы видны как граф. Стрелка ведёт от темы, которую нужно знать, к теме, для которой она нужна. Тема открывается, когда пройдены все темы до неё. Если нажать на тему, видно её задачи и то, что она открывает. Темы, связи и задачи можно править прямо на карте.

![Карта цели](screenshots/map.png)

Пока цель идёт, Next Day сам ставит её задачи в план на завтра, столько, сколько помещается во время, которое вы отвели цели на день. Если завтрашний день ещё не назван, план появится сам: его можно переименовать и дополнить своими пунктами. Отметки в чеклисте двигают цель вперёд, а недоделанные задачи возвращаются в план. Чтобы пропустить несколько дней, цель ставится на паузу.

На вкладке «Цели» видно, что стоит на сегодня и на ближайшие дни и успеваете ли вы к сроку.

![Цель](screenshots/goal.png)

## ИИ через MCP

Карту цели можно собрать самому или поручить ИИ. В настройках включается MCP-сервер. Через него Claude Code, Claude Desktop или другой клиент MCP видит историю дней, составляет черновик цели, правит карту и записывает результаты. Черновик начинает работать, только когда вы его примете. Сервер доступен только с этого компьютера и пускает только с ключом.

Команду для Claude Code и настройку для Claude Desktop можно скопировать из карточки в настройках. Подробное описание сервера есть ниже, в английской части.

![ИИ через MCP](screenshots/mcp.png)

## Установка

Скачайте установщик из раздела Releases и запустите. Права администратора не нужны, папку можно выбрать.

![Установщик](screenshots/installer.png)

Новые версии программа ставит сама, пока окно спрятано в трей. Автообновление можно выключить в настройках.

Удалить программу можно через «Приложения» Windows.

## Сборка

Нужны Node.js и Rust.

```
npm install
npm run release
```

Установщик появится в `release/NextDaySetup.exe`.

Если есть ключ подписи `~/.tauri/next-day.key`, рядом появится `latest.json`. Его нужно приложить к релизу вместе с установщиком, тогда установленные программы обновятся сами.

Запуск для разработки:

```
npm run tauri dev
```

## Лицензия

MIT

## English

Next Day is a planner for one day ahead, for Windows. The interface is in Russian for now.

In the evening the app asks you to name the next day and to write what you are going to do. You can add a checklist, set the hours for each item and the hour to start it. During the day you tick what is done. In the evening you collect the results on a board: finished items, screenshots, notes and drawings. Then the day is sealed and stays in the history. A sealed day can not be changed.

Only the next day can be planned, one plan per day. The Clock tab shows which task starts at which hour and reminds you when that hour comes. The app starts with Windows, lives in the tray and reminds you about the plan in the morning and in the evening.

### Goals

A big goal can be split into topics: what you need to know and in which order. Each topic has its own tasks, from simple to hard, and each task has an estimated time.

The Map tab shows the topics as a graph. An arrow goes from a topic you need to know to the topic that needs it. A topic opens when all topics before it are done. Click a topic to see its tasks and the topics it opens. Topics, arrows and tasks can be edited right on the map.

While a goal is active, Next Day puts its next tasks into the plan for the next day, as many as fit into the time you give the goal per day. If the next day has no plan yet, the app creates one, and you can rename it and add your own items. Ticks move the goal forward, and unfinished tasks come back into the plan. To skip some days, pause the goal.

The Goals tab shows the tasks for today and for the next days, and tells you if you will finish before the deadline.

### AI over MCP

You can build the goal map yourself or ask an AI to do it. Turn on the MCP server in the settings. Then Claude Code, Claude Desktop or any other MCP client can read your day history, create a draft goal, change the map and record results. A draft starts to work only after you accept it in the app. The server can be reached only from your own computer, and only with a token.

The settings card shows the server address and copies a ready command for Claude Code and a ready config for Claude Desktop. They look like this:

```
claude mcp add --scope user --transport http next-day http://127.0.0.1:47328/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

```json
{
  "mcpServers": {
    "next-day": {
      "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\Next Day\\next-day.exe",
      "args": ["--mcp"]
    }
  }
}
```

The second one goes into `claude_desktop_config.json`. After that, ask the AI to make a goal in Next Day.

<details>
<summary>MCP reference</summary>

This is the reference the app gives to AI clients as the resource `nextday://guide`. It is written for AI assistants, so it addresses the assistant directly.

#### 1. The app

Next Day is a local, single-user day planner for Windows that lives in the tray. All data is stored as JSON files on the user's computer. This MCP server runs inside the app, listens on 127.0.0.1 only and is the only way for an assistant to read or change the data. Everything you read is private: use it only for the user's current request.

The rhythm of the app:

- Evening: the user names TOMORROW (the theme of the day) and may add a description and a checklist. Only tomorrow can be planned, never further ahead. A day that was not named the evening before can still be named on the day itself (`namedLate`).
- Day: the plan is frozen; the user only ticks checklist items and sub-items.
- Night or next morning: the user collects results on a board (notes, images, finished tasks) and seals the day with a rating 1-5 and an optional short summary. Sealed days are read-only history.
- Goals: a goal is a map of topics. Arrows (prerequisites) say what must be mastered before what; every topic holds tasks ranked from simple to hard. While a goal is active, the app plans tomorrow by itself from the map and the goal's daily minutes. The user sees the map on the Map tab and the goal on the Goals tab.

#### 2. Connecting

| Transport | How |
|---|---|
| Streamable HTTP | `POST http://127.0.0.1:{port}/mcp`, default port 47328, header `Authorization: Bearer {token}`. Responses are plain JSON, never SSE. `GET` returns 405, notifications return 202. Requests with a foreign `Origin` are rejected. |
| stdio | Run `next-day.exe --mcp`. The bridge relays JSON-RPC lines to the running app, reading the port and token from `%APPDATA%\ru.igorberezkin.nextday\mcp.json`. When the app is not running, the bridge still answers the handshake, the lists and this guide; data calls fail with "Next Day is not reachable". |

- The user turns the server on in Settings (card "ИИ через MCP"). The card shows the URL and copies ready-made setups for Claude Code and Claude Desktop.
- Protocol versions: `2026-07-28` (stateless: `server/discover`, version in `_meta`) and `2025-11-25`, `2025-06-18`, `2025-03-26` through `initialize`.
- Capabilities: tools, resources (read only), prompts. No sessions, subscriptions, sampling or list-change notifications.

#### 3. Time

- Dates are `YYYY-MM-DD`; timestamps are local `YYYY-MM-DDTHH:MM:SS` without a zone.
- The logical day starts at `dayStartHour` (0-6). With `dayStartHour` 4, a tick at 01:30 belongs to the previous date.
- Take `now`, `today` and `tomorrow` from `get_overview`; do not rely on your own clock.

#### 4. Data model

##### Day

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

##### Item

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

##### Goal

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

##### Topic

| Field | Type | Meaning |
|---|---|---|
| id | string | Opaque inside the app; in `create_goal` you choose it |
| title | string | Up to 120 chars, unique within the goal |
| note | string | Materials, links, hints, up to 4000 chars |
| requires | string[] | Ids of prerequisite topics. On the map arrows go from them to this topic |
| tasks | Task[] | Up to 30, ranked from the simplest to the hardest |

##### Task

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

#### 5. How the app plans

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

#### 6. Tools

Every tool returns `structuredContent` and the same JSON as text. Tool errors come back with `isError: true` and a short message. The app speaks Russian, so these messages may be in Russian. Read them and adjust instead of retrying the same call.

##### get_overview (read)

No arguments. Returns `{now, today, tomorrow, dayStartHour, eveningTime, todayPlan, tomorrowPlan, goals}`.

- `todayPlan`, `tomorrowPlan`: null or `{date, name, auto, sealed, checklist}` where items are `{text, start, hours, done, goal: {goalId, taskId} or null}`.
- `goals`: active, draft and paused goals as `{id, title, status, deadline, minutesPerDay, progress, finish, nextDay: {date, tasks: [{topic, task}]}}`.

##### get_profile (read)

`days`: window 7-180, default 42. Statistics over complete days before today, starting from the first day with data when the history is shorter.

Returns `{windowDays, from, to, daysCovered, daysPlanned, planningRate, daysWithChecklist, medianPlannedHours, medianDoneHours, maxDoneHours, itemsPlanned, itemsDone, itemCompletion, avgRating, streak, bestStreak, startHourHistogram, doneHourHistogram, mostActiveHours, weekdays, settings, notes}`.

- Hours come from estimates: planned hours of a day are the sum over its items, done hours the sum over ticked items. They are not measured time.
- `planningRate` is `daysPlanned / daysCovered`.
- `startHourHistogram[h]`: items planned to start at hour h. `doneHourHistogram[h]`: items ticked during hour h. `mostActiveHours`: up to four hours with the most ticks.
- `weekdays.mon` to `weekdays.sun`: `{plannedDays, avgDoneHours, completion}`.
- `streak`, `bestStreak`: runs of consecutive days the user worked with; untouched automatic plans do not count.

##### get_history (read)

`from`, `to` (required), `includeBoard` (default false). At most 62 days; `to` is capped at tomorrow. Returns `{from, to, today, days}` with planned days only, each a Day.

##### list_goals (read)

`status`: optional filter. Returns `{goals}`; each goal has its settings, `progress`, `finish` and a compact map `{id, title, requires, tasks, done}` per topic, where `tasks` and `done` are counts.

##### get_goal (read)

`goalId`. Returns the full goal: every topic and task with status and result, `progress`, `finish` and `forecast` as `[{date, minutes, tasks: [{taskId, topic, text}]}]`.

##### create_goal (write)

Required: `title`, `outcome`, `topics`. Optional: `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. A topic is `{id, title, note, requires, tasks}` and a task is `{text, minutes, kind, doneWhen}`.

- Give every topic your own short `id` (letters, digits, `-` and `_`) and use these ids in `requires`. Exact titles work too.
- The whole input is validated first: unknown prerequisites, self references, cycles and duplicate titles are rejected and nothing is saved.
- Creates a draft with `author: ai` and returns `{goal, note}`; `goal.finish` and `goal.forecast` show at once how the map fits the budget.

##### update_goal (write)

`goalId` plus any of `title`, `outcome`, `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. Omitted fields stay; `deadline: ""` clears the deadline. The status never changes. Returns the full goal; tomorrow's plan is recomputed.

##### edit_topics (write)

`goalId`, `upsert` (topics to add or change), `remove` (topic ids to delete). At least one of them is required.

- An `upsert` entry with an existing `id` changes only the fields it gives. A missing or unknown `id` adds a topic, and then `title` is required.
- `tasks`, when given, replaces the topic's whole ranked list. Pass existing tasks with their `id` to keep their status and result; omitted tasks are deleted, except done ones, which are kept at the top.
- `requires`, when given, replaces the prerequisites. Ids and exact titles work, including topics added in the same call.
- Removing a topic deletes its tasks, done ones included, and drops it from other topics' `requires`.
- Returns the full goal; tomorrow's plan is recomputed.

##### record_result (write)

`goalId`, `taskId`, and any of `status` (todo, done, skipped), `minutes` (1-1440), `score` (0-100), `confidence` (1-5), `note` (up to 2000 chars).

- With any result field, the task's result is replaced by the given values.
- With only `status`, the status changes and the recorded result stays.
- Status done also ticks the task's item in today's or yesterday's open plan.
- Record scores on check tasks so they count toward readiness.
- Ask the user or verify the work before recording. Returns the compact goal.

#### 7. Resources and prompts

| URI | Content |
|---|---|
| nextday://guide | This guide |
| nextday://goals | The same as `list_goals` |
| nextday://profile | `get_profile` for 42 days |
| nextday://goal/{goalId} | The same as `get_goal` |
| nextday://day/{date} | One planned day with board notes |

Prompts: `plan_goal(goal, deadline?)`, `evening_review()`, `readiness_check(goalId)`. Each returns one user message that starts the matching workflow below.

#### 8. Workflows

##### Build a goal map

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

##### Evening review

1. Call `get_overview` and read today's day through `get_history` or `nextday://day/{today}`.
2. For each goal item of today, ask how it went. Quiz briefly (two to five short questions, one at a time) or check the work; run the user's tests when you have a shell.
3. Call `record_result` for each task with minutes, score and a short note. Mark a task done only when its `doneWhen` is met.
4. If the user struggled, add review or practice tasks to that topic with `edit_topics` (send the full task list with the existing ids and the new tasks where they belong). If they are ahead, say so.
5. Tell the user what tomorrow's plan holds for their goals; it is in `tomorrowPlan`.

##### Readiness check

1. Call `get_goal` and read the outcome and the mastered topics.
2. Design a test that mirrors the real target (time limit, tasks, rubric), run it in the chat one part at a time and grade it honestly.
3. Call `record_result` with the score on a check task; add one with `edit_topics` if there is none.
4. Name what to fix first and add review tasks to the weakest topics.

##### Reshape a map

- To insert work, send the topic's full task list in the new order with the existing ids.
- To put a topic between two others, add it and update the `requires` of the topics that depend on it.
- Avoid removing topics with finished work: their done tasks would be lost. Add tasks or topics instead.

#### 9. Conventions

- Write goal texts in the user's language; look at their day names and checklist items.
- Texts are plain text. URLs and Windows paths become clickable links in the app.
- Ids are opaque strings; take them from tool results, except the topic ids you choose in `create_goal`.
- Keep tasks concrete and short: "Solve 3 sliding-window problems", not "Study algorithms".
- Every write shows up in the open app immediately.

</details>

### Install

Download the installer from Releases and run it. Admin rights are not needed, and you can choose the folder. New versions install themselves while the window is hidden in the tray. Auto update can be turned off in the settings. To remove the app, use Apps in the Windows settings.

### Build

You need Node.js and Rust.

```
npm install
npm run release
```

The installer appears in `release/NextDaySetup.exe`. To run the app for development, use `npm run tauri dev`.

### License

MIT
