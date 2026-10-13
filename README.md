# Next Day

Next Day is a pixel art day planner for Windows. Every evening you plan only the next day: give it a name, write what you will do and make a checklist. During the day you tick what is done, and in the evening you collect the results on a board and seal the day. Big goals become maps of topics, and the app puts their tasks into your plan by itself. A built-in MCP server lets AI assistants such as Claude read your history and build goals with you. The interface is in Russian.

Download the installer from [Releases](https://github.com/IgorBerezkin/NextDay/releases/latest).

<details>
<summary><b>Русский</b></summary>

## Next Day

Планировщик на один день вперёд для Windows. Вечером вы называете завтрашний день и решаете, чем будете заниматься. Днём отмечаете сделанное, вечером собираете итоги и запечатываете день. Большие цели раскладываются на темы, и программа сама ставит их задачи в план. Программа запускается вместе с Windows, живёт в трее и напоминает о себе утром и вечером.

Планировать можно только завтрашний день, один план на день.

### План на завтра

![План на завтра](screenshots/plan.png)

Вечером мастер в три шага спрашивает имя завтрашнего дня, описание и чеклист. У пункта можно указать часы и время начала, добавить до трёх подпунктов, прикрепить файл или связать его с задачей из прошлого дня. То, что не успели сегодня, переносится одной кнопкой. Задачи целей уже стоят в плане и подсвечены зелёным: им можно поменять время, но удалить нельзя.

### Сегодня

![Сегодня](screenshots/today.png)

Утром вчерашний план становится сегодняшним. Менять его уже нельзя, можно только отмечать пункты. У пунктов целей есть флажок, клик по нему открывает тему на карте. Вечером справа появляется ритуал: подвести итоги и проверить план на завтра.

### Доска итогов

![Доска итогов](screenshots/board.png)

На доску складываются итоги дня. Сделанные пункты ждут слева и становятся карточками, сюда же вставляются скриншоты из буфера, заметки, рисунки и наклейки. Когда итоги собраны, день запечатывается с оценкой от 1 до 5 и остаётся в истории, менять его уже нельзя.

### Часы

![Часы](screenshots/clock.png)

Вкладка «Часы» показывает задачи с временем начала прямо на циферблате. Пункт можно перетащить на нужный час или выбрать время в списке справа. Когда час наступает, приходит напоминание. Переключатель внизу показывает часы до полудня или после.

### История

![История](screenshots/history.png)

Вверху серия дней подряд, процент сделанных пунктов и средняя оценка. «Год в пикселях» раскрашивает каждый день по оценке. Ниже список всех дней с поиском по именам и описаниям, любой день можно открыть и посмотреть его план и доску.

### Цели

Большую цель можно разложить на темы: что нужно уметь и в каком порядке. У каждой темы свои задачи, от простых к сложным, и у каждой задачи примерное время. Пока цель идёт, Next Day сам ставит её задачи в план на завтра, столько, сколько помещается во время, которое вы отвели цели на день. Если завтрашний день ещё не назван, план появится сам: его можно переименовать и дополнить своими пунктами. Отметки в чеклисте двигают цель вперёд, а недоделанные задачи возвращаются в план. Чтобы пропустить несколько дней, цель ставится на паузу.

#### Карта цели

![Карта цели](screenshots/map.png)

Вкладка «Карта» показывает цель как граф. Стрелка ведёт от темы, которую нужно знать, к теме, для которой она нужна, а справа стоит сама цель. Зелёные темы пройдены, жёлтые идут, светлые открыты, серые закрыты до тех пор, пока не пройдены темы до них. Клик по теме открывает справа её задачи от простых к сложным с пометками «сегодня» и «завтра». Там же задачу можно отметить, записать результат или пропустить. Темы, стрелки и задачи можно добавлять и править прямо на карте.

#### Цель

![Цель](screenshots/goal.png)

На вкладке «Цели» видно, что стоит на сегодня и что программа поставит в ближайшие дни. Справа прогресс по темам и задачам, готовность по проверкам и прогноз: успеваете ли вы к сроку. В режиме задаются время на день, дни недели, час начала и срок. Кнопки сверху ставят цель на паузу, завершают её или открывают карту.

### ИИ через MCP

Карту цели можно собрать самому или поручить ИИ. В программу встроен MCP-сервер. Через него Claude Code, Claude Desktop или другой клиент MCP видит историю дней, составляет черновик цели, правит карту и записывает результаты. Сервер доступен только с этого компьютера и пускает только с ключом.

#### Черновик от ИИ

![Список целей](screenshots/goals.png)

Цель, которую составил ИИ, помечена «ИИ» и сначала лежит черновиком. Она начинает работать, только когда вы откроете её, посмотрите карту и нажмёте «Принять и начать».

#### Настройки

![ИИ через MCP](screenshots/mcp.png)

Сервер включается в настройках, в карточке «ИИ через MCP». Там же видно адрес сервера и есть кнопки, которые копируют команду для Claude Code и настройку для Claude Desktop. Команда выглядит так:

```
claude mcp add --scope user --transport http next-day http://127.0.0.1:47328/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

Настройка для Claude Desktop добавляется в `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "next-day": {
      "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\Next Day\\Next Day.exe",
      "args": ["--mcp"]
    }
  }
}
```

Путь зависит от папки, которую вы выбрали при установке, поэтому настройку удобнее скопировать кнопкой: она подставит путь к вашей копии. Если переустановите программу в другую папку, скопируйте настройку заново.

После этого попросите ИИ составить цель в Next Day.

<details>
<summary>Справка по MCP</summary>

Эту справку программа отдаёт ИИ-клиентам как ресурс `nextday://guide`. Она написана для ИИ-ассистента и обращается к нему напрямую. Здесь перевод, оригинал на английском есть в английской части.

#### 1. Программа

Next Day это локальный однопользовательский планировщик для Windows, который живёт в трее. Все данные хранятся в JSON-файлах на компьютере пользователя. MCP-сервер работает внутри программы, слушает только 127.0.0.1 и остаётся единственным способом для ассистента прочитать или изменить данные. Всё прочитанное приватно: используйте это только для текущей просьбы пользователя.

Ритм программы:

- Вечер: пользователь называет ЗАВТРАШНИЙ день (тему дня) и может добавить описание и чеклист. Планировать можно только завтра, не дальше. День, который не назвали накануне, можно назвать в тот же день (`namedLate`).
- День: план заморожен, пользователь только отмечает пункты и подпункты.
- Ночь или следующее утро: пользователь собирает итоги на доске (заметки, картинки, сделанные задачи) и запечатывает день оценкой от 1 до 5 и коротким итогом. Запечатанные дни доступны только для чтения.
- Цели: цель это карта тем. Стрелки (требования) показывают, что нужно освоить раньше чего, в каждой теме задачи от простых к сложным. Пока цель активна, программа сама планирует завтрашний день по карте и минутам цели в день. Пользователь видит карту на вкладке «Карта», а цель на вкладке «Цели».

#### 2. Подключение

| Транспорт | Как |
|---|---|
| Streamable HTTP | `POST http://127.0.0.1:{port}/mcp`, порт по умолчанию 47328, заголовок `Authorization: Bearer {token}`. Ответы обычный JSON, без SSE. `GET` возвращает 405, уведомления получают 202. Запросы с чужим `Origin` отклоняются. |
| stdio | Запустите `Next Day.exe --mcp` из папки установки (в сборке для разработки файл называется `next-day.exe`). Мост пересылает строки JSON-RPC в работающую программу, порт и токен берёт из `%APPDATA%\ru.igorberezkin.nextday\mcp.json`. Если программа не запущена, мост всё равно отвечает на рукопожатие, списки и эту справку, а запросы к данным получают ошибку "Next Day is not reachable". |

- Пользователь включает сервер в настройках (карточка «ИИ через MCP»). Карточка показывает адрес и копирует готовые настройки для Claude Code и Claude Desktop.
- Версии протокола: `2026-07-28` (без состояния: `server/discover`, версия в `_meta`) и `2025-11-25`, `2025-06-18`, `2025-03-26` через `initialize`.
- Возможности: инструменты, ресурсы (только чтение), промпты. Сессий, подписок, sampling и уведомлений об изменении списков нет.

#### 3. Время

- Даты в формате `YYYY-MM-DD`, время местное, `YYYY-MM-DDTHH:MM:SS`, без часового пояса.
- Логический день начинается в `dayStartHour` (от 0 до 6). При `dayStartHour` 4 отметка в 01:30 относится к предыдущей дате.
- Берите `now`, `today` и `tomorrow` из `get_overview`, не полагайтесь на свои часы.

#### 4. Модель данных

##### День

Его возвращают `get_history` и `nextday://day/{date}`.

| Поле | Тип | Смысл |
|---|---|---|
| date | дата | |
| name | строка | Тема дня |
| description | строка | Свободный текст, обрезается до 1500 символов |
| namedLate | bool | Назван в тот же день, а не накануне |
| auto | bool | План составила программа по целям, и пользователь его ещё не трогал |
| checklist | Item[] или null | null, если пользователь отказался от чеклиста |
| rating | от 1 до 5 или null | Ставится при печати дня |
| summary | строка или null | До 200 символов, пишется при печати |
| sealed | bool | День запечатан и доступен только для чтения |
| board | string[] | Только с `includeBoard`: текстовые заметки и сделанные задачи с доски итогов, затем `[N image(s)]` |

##### Пункт

| Поле | Тип | Смысл |
|---|---|---|
| id | строка | Непрозрачный идентификатор |
| text | строка | До 300 символов |
| hours | число или null | Оценка, кратна 0.25 |
| start | от 0 до 23 или null | Час начала, виден на вкладке «Часы» |
| done | bool | Отмечен |
| doneAt | время или null | Когда отмечен |
| subs | {text, done}[] | До 3 подпунктов; если отмечены все, отмечается и пункт |
| continues | {date, text} или null | Продолжает задачу из прошлого дня |
| goal | {goalId, taskId} или null | Задача цели, которой соответствует пункт |

В чеклисте не больше 40 пунктов, он всегда отсортирован по часу начала, считая от `dayStartHour`; пункты без времени идут в конце.

##### Цель

| Поле | Тип | Смысл |
|---|---|---|
| id | строка | Непрозрачный идентификатор |
| title | строка | До 80 символов |
| outcome | строка | Конкретный проверяемый итог, до 600 символов |
| note | строка | Контекст: текущий уровень, материалы, ограничения, до 4000 символов |
| deadline | дата или null | |
| minutesPerDay | от 1 до 960 или null | Бюджет на день в минутах задач; null значит 60 |
| days | int[] | Дни недели ISO, от 1 (понедельник) до 7 (воскресенье); пусто значит каждый день |
| startHour | от 0 до 23 или null | Час, с которого в день начинаются задачи цели |
| status | draft, active, paused, done, archived | Меняет только пользователь |
| author | user или ai | Кто создал цель |
| topics | Topic[] | Карта, до 60 тем |
| createdAt, updatedAt | время | |
| progress | Progress | Считается при каждом чтении |
| forecast | планы дней | Следующие 14 рабочих дней так, как их спланирует программа |
| finish | дата или null | Прогноз даты последней задачи; null, если ничего не осталось или остаток никогда не попадёт в план |

##### Тема

| Поле | Тип | Смысл |
|---|---|---|
| id | строка | Внутри программы непрозрачный; в `create_goal` его задаёте вы |
| title | строка | До 120 символов, не повторяется внутри цели |
| note | строка | Материалы, ссылки, подсказки, до 4000 символов |
| requires | string[] | Идентификаторы тем, которые нужны раньше. На карте стрелки идут от них к этой теме |
| tasks | Task[] | До 30, от самой простой к самой сложной |

##### Задача

| Поле | Тип | Смысл |
|---|---|---|
| id | строка | Непрозрачный идентификатор |
| text | строка | До 300 символов |
| minutes | от 1 до 960 или null | Оценка, по ней заполняется бюджет дня; null считается как 30 |
| kind | learn, practice, review, check | `check` это проверка готовности с баллом |
| doneWhen | строка | Проверяемый критерий готовности, до 300 символов |
| status | todo, planned, done, skipped | Смотрите раздел 5 |
| plannedFor | дата или null | День, в плане которого стоит задача (остаётся и после выполнения) |
| doneAt | время или null | |
| result | Result или null | Записанный результат |

- Result: `{minutes, score, confidence, note, at, by}`; minutes от 1 до 1440, score от 0 до 100, confidence от 1 до 5 (каждое может быть null), note до 2000 символов, `by` это user или ai.
- Progress: `{topicsTotal, topicsDone, tasksTotal, tasksDone, tasksLeft, minutesTotal, minutesDone, checksTotal, checksDone, readiness}`. Пропущенные задачи не учитываются. Тема пройдена, когда в ней есть задачи и все они сделаны или пропущены. `readiness` это целое среднее баллов, записанных на проверках; null, если их нет.

#### 5. Как программа планирует

Статус цели принадлежит пользователю. `create_goal` всегда создаёт черновик. Планируются только активные цели; черновики, цели на паузе, завершённые и архивные не планируются никогда. Никогда не утверждайте, что черновик активен.

Как выбираются задачи одного дня для одной цели:

1. Тема освоена, когда все её задачи сделаны или пропущены. Тема открыта, когда освоены все темы из её `requires`.
2. Темы обходятся в порядке требований; темы, которые не зависят друг от друга, идут в порядке цели.
3. В каждой открытой теме берётся первая несделанная задача по рангу. Задачи добавляются, пока их минуты помещаются в `minutesPerDay`; первая задача дня берётся всегда, даже если она длиннее бюджета.
4. Если в течение дня закрыта последняя задача темы, зависимые темы открываются в тот же день.

План на завтра строится сам и обновляется, пока завтра не началось: после любого изменения цели или карты, после отметок, после печати дня, после изменения настроек и раз в 15 секунд в фоне.

- Если у завтрашнего дня нет плана, программа создаёт его с `auto: true` и называет по темам задач.
- Если пользователь уже спланировал завтра, задачи целей добавляются в его чеклист; его пункты и имя дня остаются.
- Пункты целей пользователь удалить не может. Чтобы освободить день, он ставит цель на паузу, и её пункты уходят из плана на завтра.
- Пункты получают `hours` из минут (с округлением до 0.25) и `start`: задачи цели идут друг за другом от её `startHour`. Если набор задач не меняется, время, которое пользователь поправил сам, сохраняется.
- Пока строится план на завтра, задачи, стоящие на сегодня, считаются сделанными. Если сегодняшний день запечатан с недоделанными задачами целей, они возвращаются в очередь и первыми идут в план на завтра. Если запланированный день прошёл, а задача не сделана, она тоже возвращается в очередь.

Как меняется статус задачи:

| Был | Стал | Когда |
|---|---|---|
| todo | planned | Программа поставила задачу в план на завтра |
| planned | done | Пользователь отметил пункт, или пришёл `record_result` со статусом done |
| planned | todo | Запланированный день прошёл или запечатан без неё, или цель перестала быть активной |
| done | planned | Пользователь снял отметку |
| любой | todo, done, skipped | `record_result` со статусом; planned ставит только программа |

#### 6. Инструменты

Каждый инструмент возвращает `structuredContent` и тот же JSON текстом. Ошибки инструментов приходят с `isError: true` и коротким сообщением. Программа говорит по-русски, поэтому сообщения могут быть на русском. Прочитайте их и исправьте вызов, а не повторяйте тот же самый.

##### get_overview (чтение)

Без аргументов. Возвращает `{now, today, tomorrow, dayStartHour, eveningTime, todayPlan, tomorrowPlan, goals}`.

- `todayPlan`, `tomorrowPlan`: null или `{date, name, auto, sealed, checklist}`, где пункты имеют вид `{text, start, hours, done, goal}`, а `goal` это `{goalId, taskId}` или null.
- `goals`: активные цели, черновики и цели на паузе в виде `{id, title, status, deadline, minutesPerDay, progress, finish, nextDay: {date, tasks: [{topic, task}]}}`.

##### get_profile (чтение)

`days`: окно от 7 до 180, по умолчанию 42. Статистика по завершённым дням до сегодняшнего; если история короче, окно начинается с первого дня с данными.

Возвращает `{windowDays, from, to, daysCovered, daysPlanned, planningRate, daysWithChecklist, medianPlannedHours, medianDoneHours, maxDoneHours, itemsPlanned, itemsDone, itemCompletion, avgRating, streak, bestStreak, startHourHistogram, doneHourHistogram, mostActiveHours, weekdays, settings, notes}`.

- Часы берутся из оценок пользователя: запланированные часы дня это сумма по всем пунктам, сделанные это сумма по отмеченным. Это не измеренное время.
- `planningRate` это `daysPlanned / daysCovered`.
- `startHourHistogram[h]`: пункты, которые начинаются в час h. `doneHourHistogram[h]`: пункты, отмеченные в течение часа h. `mostActiveHours`: до четырёх часов с наибольшим числом отметок.
- От `weekdays.mon` до `weekdays.sun`: `{plannedDays, avgDoneHours, completion}`.
- `streak`, `bestStreak`: серии подряд идущих дней, с которыми пользователь работал; нетронутые автоматические планы не считаются.

##### get_history (чтение)

`from`, `to` (обязательны), `includeBoard` (по умолчанию false). Не больше 62 дней; `to` ограничивается завтрашним днём. Возвращает `{from, to, today, days}`, только дни с планом, каждый в виде Дня.

##### list_goals (чтение)

`status`: необязательный фильтр. Возвращает `{goals}`; у каждой цели её настройки, `progress`, `finish` и краткая карта `{id, title, requires, tasks, done}` по каждой теме, где `tasks` и `done` это количества.

##### get_goal (чтение)

`goalId`. Возвращает цель целиком: все темы и задачи со статусами и результатами, `progress`, `finish` и `forecast` в виде `[{date, minutes, tasks: [{taskId, topic, text}]}]`.

##### create_goal (запись)

Обязательные поля: `title`, `outcome`, `topics`. Необязательные: `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. Тема это `{id, title, note, requires, tasks}`, задача это `{text, minutes, kind, doneWhen}`.

- Дайте каждой теме свой короткий `id` (латинские буквы, цифры, `-` и `_`) и используйте эти идентификаторы в `requires`. Точные названия тоже подходят.
- Сначала проверяется весь ввод: неизвестные требования, ссылки темы на саму себя, циклы и одинаковые названия отклоняются, и тогда ничего не сохраняется.
- Создаёт черновик с `author: ai` и возвращает `{goal, note}`; `goal.finish` и `goal.forecast` сразу показывают, как карта ложится в бюджет.

##### update_goal (запись)

`goalId` и любые из `title`, `outcome`, `note`, `deadline`, `minutesPerDay`, `days`, `startHour`. Пропущенные поля не меняются; `deadline: ""` убирает срок. Статус не меняется никогда. Возвращает цель целиком; план на завтра пересчитывается.

##### edit_topics (запись)

`goalId`, `upsert` (темы, которые нужно добавить или изменить), `remove` (идентификаторы тем, которые нужно удалить). Нужно хотя бы одно из двух.

- Запись в `upsert` с существующим `id` меняет только переданные поля. Без `id` или с незнакомым `id` добавляется новая тема, и тогда нужен `title`.
- `tasks`, если передан, заменяет весь ранжированный список задач темы. Передавайте существующие задачи с их `id`, чтобы сохранить статус и результат; пропущенные задачи удаляются, кроме сделанных, они остаются наверху.
- `requires`, если передан, заменяет требования. Подходят идентификаторы и точные названия, в том числе тем, добавленных в этом же вызове.
- Удаление темы удаляет её задачи вместе со сделанными и убирает её из `requires` других тем.
- Возвращает цель целиком; план на завтра пересчитывается.

##### record_result (запись)

`goalId`, `taskId` и любые из `status` (todo, done, skipped), `minutes` (от 1 до 1440), `score` (от 0 до 100), `confidence` (от 1 до 5), `note` (до 2000 символов).

- Если передано хотя бы одно поле результата, результат задачи заменяется переданными значениями.
- Если передан только `status`, меняется статус, а записанный результат остаётся.
- Статус done также отмечает пункт этой задачи в открытом плане на сегодня или на вчера.
- Записывайте баллы на задачах-проверках, чтобы они шли в готовность.
- Перед записью спросите пользователя или проверьте работу. Возвращает краткий вид цели.

#### 7. Ресурсы и промпты

| URI | Содержимое |
|---|---|
| nextday://guide | Эта справка (на английском) |
| nextday://goals | То же, что `list_goals` |
| nextday://profile | `get_profile` за 42 дня |
| nextday://goal/{goalId} | То же, что `get_goal` |
| nextday://day/{date} | Один день с планом и заметками с доски |

Промпты: `plan_goal(goal, deadline?)`, `evening_review()`, `readiness_check(goalId)`. Каждый возвращает одно сообщение от имени пользователя, которое запускает соответствующий сценарий ниже.

#### 8. Сценарии

##### Составить карту цели

1. Прочитайте `get_overview`, `get_profile` с `days` от 42 до 60 и `get_history` за последние две или три недели.
2. Опишите реальный ритм пользователя в двух или трёх предложениях: частоту планирования, `medianDoneHours`, активные часы, сильные и слабые дни недели.
3. Спросите то, чего не можете знать: итог и срок, текущий уровень по каждой теме, материалы, удобные дни и часы. Не придумывайте уровень пользователя.
4. Считайте бюджет по фактам. `medianDoneHours` это то, что пользователь на самом деле успевает за день, а другим делам тоже нужно время, поэтому цели обычно достаётся от 30 до 50% этого. Если пользователь хочет больше, покажите, что говорят данные, и дайте ему решить.
5. Ставьте `startHour` внутри `mostActiveHours`; тяжёлую учёбу не ставьте поздно, если история не говорит обратного. Разным целям давайте разные часы начала.
6. Постройте карту:
   - Тема это один навык или область знаний на несколько дней работы, обычно от 3 до 10 задач.
   - В `requires` только то, что действительно нужно знать раньше. Не добавляйте стрелки на всякий случай: каждая стрелка откладывает зависимую тему.
   - Внутри темы от простого к сложному: сначала учёба, потом практика, повторение и проверка, если тема важна для итога.
   - В конце финальная тема, которая требует ключевые темы и содержит проверку, похожую на настоящую цель.
   - У каждой задачи должны быть минуты, у практики и проверок ещё и проверяемый `doneWhen`.
7. Посмотрите на `finish` в ответе. Если он не попадает в срок, скажите об этом и предложите карту поменьше, бюджет побольше или срок позже, затем внесите выбранное через `update_goal` или `edit_topics`.
8. Подведите итог: темы, время в день, прогноз окончания. Попросите пользователя посмотреть вкладку «Карта» и включить цель на вкладке «Цели».

##### Вечерний разбор

1. Вызовите `get_overview` и прочитайте сегодняшний день через `get_history` или `nextday://day/{today}`.
2. По каждому пункту цели за сегодня спросите, как прошло. Задайте короткий опрос (от двух до пяти вопросов, по одному) или проверьте работу; запустите тесты пользователя, если у вас есть доступ к терминалу.
3. Вызовите `record_result` по каждой задаче с минутами, баллом и короткой заметкой. Отмечайте задачу сделанной, только когда выполнен её `doneWhen`.
4. Если было трудно, добавьте в тему задачи на повторение или практику через `edit_topics` (передайте весь список задач с существующими идентификаторами и новыми задачами на нужных местах). Если пользователь опережает план, скажите об этом.
5. Расскажите, что стоит в плане на завтра по целям; это видно в `tomorrowPlan`.

##### Проверка готовности

1. Вызовите `get_goal` и прочитайте итог и освоенные темы.
2. Придумайте проверку, похожую на настоящую цель (ограничение по времени, задания, критерии оценки), проведите её в чате по частям и честно оцените.
3. Вызовите `record_result` с баллом на задаче-проверке; если такой нет, добавьте её через `edit_topics`.
4. Назовите, что исправить в первую очередь, и добавьте задачи на повторение в самые слабые темы.

##### Перестроить карту

- Чтобы вставить работу, передайте весь список задач темы в новом порядке с существующими идентификаторами.
- Чтобы поставить тему между двумя другими, добавьте её и обновите `requires` тем, которые от неё зависят.
- Не удаляйте темы со сделанной работой: их сделанные задачи пропадут. Лучше добавляйте задачи или темы.

#### 9. Соглашения

- Пишите тексты цели на языке пользователя; ориентируйтесь на имена его дней и пункты чеклистов.
- Тексты это обычный текст. Ссылки и пути Windows в программе становятся кликабельными.
- Идентификаторы это непрозрачные строки; берите их из ответов инструментов, кроме идентификаторов тем, которые вы задаёте в `create_goal`.
- Задачи пишите конкретно и коротко: «Решить 3 задачи на скользящее окно», а не «Поучить алгоритмы».
- Любая запись сразу видна в открытой программе.

</details>

### Установка

![Установщик](screenshots/installer.png)

Скачайте установщик из раздела Releases и запустите. Права администратора не нужны, папку можно выбрать, ярлык на рабочем столе и автозапуск включаются галочками. Новые версии программа ставит сама, пока окно спрятано в трей. Автообновление можно выключить в настройках. Удалить программу можно через «Приложения» Windows.

### Сборка

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

### Лицензия

MIT

</details>

<details>
<summary><b>English</b></summary>

## Next Day

A planner for one day ahead, for Windows. In the evening you name the next day and decide what you will do. During the day you tick what is done, and in the evening you collect the results and seal the day. Big goals are split into topics, and the app puts their tasks into your plan by itself. The app starts with Windows, lives in the tray and reminds you about the plan in the morning and in the evening.

Only the next day can be planned, one plan per day. The interface is in Russian for now.

### Plan for tomorrow

![Plan for tomorrow](screenshots/plan.png)

In the evening a three-step wizard asks for the name of the next day, a description and a checklist. An item can have hours, a start hour and up to three sub-items, a file can be attached to it, and it can continue a task from an earlier day. Items you did not finish today move to tomorrow with one click. Goal tasks are already in the plan and shown in green: you can change their time, but you can not delete them.

### Today

![Today](screenshots/today.png)

In the morning the plan from the evening becomes the plan for today. It can not be changed any more, you only tick the items. Goal items have a flag, and a click on it opens the topic on the map. In the evening a ritual card on the right reminds you to collect the results and shows the plan for tomorrow.

### Results board

![Results board](screenshots/board.png)

The board holds the results of the day. Finished items wait on the left and become cards, and you can paste screenshots, write notes, draw and add stickers. When the results are ready, you seal the day with a rating from 1 to 5. A sealed day stays in the history and can not be changed.

### Clock

![Clock](screenshots/clock.png)

The Clock tab shows the tasks with a start hour right on the clock face. Drag an item to an hour or pick the hour in the list on the right. When the hour comes, the app reminds you. The switch below shows the hours before noon or after noon.

### History

![History](screenshots/history.png)

At the top you see your streak of days, the share of finished items and the average rating. The year in pixels colors every day by its rating. Below is the list of all days with a search by names and descriptions, and any day opens with its plan and its board.

### Goals

A big goal can be split into topics: what you need to know and in which order. Each topic has its own tasks, from simple to hard, and each task has an estimated time. While a goal is active, Next Day puts its next tasks into the plan for the next day, as many as fit into the time you give the goal per day. If the next day has no plan yet, the app creates one, and you can rename it and add your own items. Ticks move the goal forward, and unfinished tasks come back into the plan. To skip some days, pause the goal.

#### Goal map

![Goal map](screenshots/map.png)

The Map tab shows a goal as a graph. An arrow goes from a topic you need to know to the topic that needs it, and the goal itself is on the right. Green topics are done, yellow ones are in progress, light ones are open, and gray ones stay closed until the topics before them are done. Click a topic to see its tasks from simple to hard on the right, with marks for today and tomorrow. There you can tick a task, record a result or skip it. Topics, arrows and tasks can be added and edited right on the map.

#### Goal

![Goal](screenshots/goal.png)

The Goals tab shows what is planned for today and what the app will plan for the next days. On the right you see the progress by topics and tasks, the readiness from checks and a forecast that tells you if you will finish before the deadline. The settings set the time per day, the weekdays, the start hour and the deadline. The buttons at the top pause the goal, finish it or open its map.

### AI over MCP

You can build the goal map yourself or ask an AI to do it. The app has a built-in MCP server. Through it Claude Code, Claude Desktop or any other MCP client can read your day history, create a draft goal, change the map and record results. The server can be reached only from your own computer, and only with a token.

#### Draft from AI

![Goals list](screenshots/goals.png)

A goal made by an AI has the AI mark and starts as a draft. It starts to work only after you open it, look at the map and press the button to accept and start it.

#### Settings

![AI over MCP](screenshots/mcp.png)

Turn the server on in the settings, in the card for AI over MCP. The card shows the server address and has buttons that copy a ready command for Claude Code and a ready config for Claude Desktop. The command looks like this:

```
claude mcp add --scope user --transport http next-day http://127.0.0.1:47328/mcp --header "Authorization: Bearer YOUR_TOKEN"
```

The config for Claude Desktop goes into `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "next-day": {
      "command": "C:\\Users\\YOU\\AppData\\Local\\Programs\\Next Day\\Next Day.exe",
      "args": ["--mcp"]
    }
  }
}
```

The path depends on the folder you chose during installation, so it is easier to copy the config with the button: it fills in the path to your copy. If you reinstall the app into another folder, copy the config again.

After that, ask the AI to make a goal in Next Day.

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
| stdio | Run `Next Day.exe --mcp` from the install folder (`next-day.exe` in development builds). The bridge relays JSON-RPC lines to the running app, reading the port and token from `%APPDATA%\ru.igorberezkin.nextday\mcp.json`. When the app is not running, the bridge still answers the handshake, the lists and this guide; data calls fail with "Next Day is not reachable". |

- The user turns the server on in the settings, in the AI over MCP card. The card shows the URL and copies ready-made setups for Claude Code and Claude Desktop.
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

![Installer](screenshots/installer.png)

Download the installer from Releases and run it. Admin rights are not needed, you can choose the folder, and two checkboxes add a desktop shortcut and start the app with Windows. New versions install themselves while the window is hidden in the tray. Auto update can be turned off in the settings. To remove the app, use Apps in the Windows settings.

### Build

You need Node.js and Rust.

```
npm install
npm run release
```

The installer appears in `release/NextDaySetup.exe`.

If the signing key `~/.tauri/next-day.key` exists, `latest.json` appears next to it. Attach it to the release together with the installer, then installed copies update themselves.

To run the app for development:

```
npm run tauri dev
```

### License

MIT

</details>
