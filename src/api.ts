import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Lang } from "./i18n";

export type SubItem = {
  id: string;
  text: string;
  done: boolean;
  doneAt: string | null;
};

export type CheckItem = {
  id: string;
  text: string;
  hours: number | null;
  attach: string | null;
  done: boolean;
  doneAt: string | null;
  subs?: SubItem[];
  start?: number | null;
  from?: TaskRef | null;
  goal?: GoalRef | null;
};

export type TaskRef = { date: string; id: string; text: string };
export type GoalRef = { goal: string; task: string };

export type GoalStatus = "draft" | "active" | "paused" | "done" | "archived";
export type TaskKind = "learn" | "practice" | "review" | "check";
export type TaskStatus = "todo" | "planned" | "done" | "skipped";
export type Author = "user" | "ai";

export type TaskResult = {
  minutes: number | null;
  score: number | null;
  confidence: number | null;
  note: string;
  at: string;
  by: Author;
};
export type GoalTask = {
  id: string;
  text: string;
  minutes: number | null;
  kind: TaskKind;
  doneWhen: string;
  status: TaskStatus;
  plannedFor: string | null;
  doneAt: string | null;
  result: TaskResult | null;
};
export type Topic = { id: string; title: string; note: string; requires: string[]; tasks: GoalTask[] };
export type GoalProgress = {
  topicsTotal: number;
  topicsDone: number;
  tasksTotal: number;
  tasksDone: number;
  tasksLeft: number;
  minutesTotal: number;
  minutesDone: number;
  checksTotal: number;
  checksDone: number;
  readiness: number | null;
};
export type ForecastDay = { date: string; tasks: string[]; minutes: number };
export type Goal = {
  id: string;
  title: string;
  outcome: string;
  note: string;
  deadline: string | null;
  minutesPerDay: number | null;
  days: number[];
  startHour: number | null;
  status: GoalStatus;
  author: Author;
  topics: Topic[];
  createdAt: string;
  updatedAt: string;
  progress: GoalProgress;
  forecast: ForecastDay[];
  finish: string | null;
};
export type GoalTaskInput = { id?: string; text: string; minutes: number | null; kind: TaskKind; doneWhen: string };
export type TopicInput = { id?: string; title?: string; note?: string; requires?: string[]; tasks?: GoalTaskInput[] };
export type GoalInput = {
  id?: string;
  title: string;
  outcome: string;
  note: string;
  deadline: string | null;
  minutesPerDay: number | null;
  days: number[];
  startHour: number | null;
  topics: TopicInput[];
};
export type ResultInput = {
  status?: TaskStatus | null;
  minutes?: number | null;
  score?: number | null;
  confidence?: number | null;
  note?: string | null;
};
export type McpInfo = {
  enabled: boolean;
  running: boolean;
  url: string | null;
  token: string | null;
  exe: string;
  error: string | null;
};

export type TaskNode = {
  date: string;
  id: string;
  text: string;
  done: boolean;
  dayName: string;
};

export type Plan = {
  name: string;
  description: string;
  checklist: CheckItem[] | null;
  createdAt: string;
  updatedAt: string;
  late: boolean;
  edits: number;
  auto?: boolean;
};

export type DayResult = {
  boardItems: number;
  hasInk: boolean;
  rating: number | null;
  summary: string | null;
  sealed: boolean;
  sealedAt: string | null;
  autoSealed: boolean;
  updatedAt: string | null;
};

export type Day = { date: string; plan: Plan | null; result: DayResult };

export type Settings = {
  dayStartHour: number;
  eveningEnabled: boolean;
  eveningTime: string;
  eveningRepeatMin: number;
  morningEnabled: boolean;
  morningTime: string;
  sounds: boolean;
  autostartWanted: boolean;
  trayHintShown: boolean;
  autoUpdate: boolean;
  taskAlerts: boolean;
  mcpEnabled: boolean;
  language: Lang;
};

export type Overview = {
  now: string;
  today: string;
  tomorrow: string;
  yesterday: string;
  todayDay: Day | null;
  tomorrowDay: Day | null;
  yesterdayDay: Day | null;
  yesterdayOpen: boolean;
  evening: boolean;
  eveningAt: string;
  nextDayInSec: number;
  streak: number;
  bestStreak: number;
  totalDays: number;
  settings: Settings;
  autostart: boolean;
  dataDir: string;
  debug: boolean;
  version: string;
};

export type UpdatePhase = "idle" | "checking" | "downloading" | "ready" | "installing" | "latest" | "failed";
export type UpdateStatus = { allowed: boolean; phase: UpdatePhase; version: string | null; error: string | null };

export type DaySummary = {
  date: string;
  name: string;
  description: string;
  late: boolean;
  hasChecklist: boolean;
  itemsTotal: number;
  itemsDone: number;
  hoursTotal: number;
  hoursDone: number;
  rating: number | null;
  summary: string | null;
  sealed: boolean;
  autoSealed: boolean;
  hasResult: boolean;
};

export type SubInput = { id?: string; text: string };
export type ItemInput = {
  id?: string;
  text: string;
  hours: number | null;
  attach: string | null;
  subs: SubInput[];
  start: number | null;
  from: TaskRef | null;
  goal?: GoalRef | null;
};
export type PlanInput = { name: string; description: string; checklist: ItemInput[] | null };
export type AssetInfo = { file: string; path: string };

export type CheckMode = "text" | "python" | "shape" | "number" | "choice" | "self";
export type CheckSpec = {
  mode: CheckMode;
  caseSensitive: boolean;
  ignoreSpaces: boolean;
  tolerance: number;
  strictTypes: boolean;
  hint: string;
};
export type CheckTemplate = { id: string; group: string; name: string; check: CheckSpec };
export type Gate = { enabled: boolean; percent: number; window: number };
export type DrillSource = { deck: string; topics: string[] };
export type DrillOrder = "smart" | "random" | "sequence";
export type DrillGoal = "correct" | "cards" | "minutes";
export type DrillScreenKind = "lock" | "window";
export type DrillEscape = "hold" | "none";
export type DrillPreset = {
  id: string;
  name: string;
  sources: DrillSource[];
  order: DrillOrder;
  goal: DrillGoal;
  amount: number;
  retry: boolean;
  explain: boolean;
  screen: DrillScreenKind;
  escape: DrillEscape;
  limitMinutes: number;
  selfCheck: boolean;
  theoryLabel: string;
  peekKeepsBox: boolean;
};
export type DrillTopic = {
  id: string;
  title: string;
  cards: number;
  open: boolean;
  answered: number;
  recent: number;
  recentRight: number;
  seen: number;
  due: number;
  boxes: number[];
};
export type DrillDeckKind = "deck" | "bank" | "generator";
export type DrillDeckInfo = {
  id: string;
  title: string;
  description: string;
  kind: DrillDeckKind;
  enabled: boolean;
  author: Author;
  cards: number;
  variants: number;
  check: CheckSpec | null;
  gate: Gate;
  topics: DrillTopic[];
  updatedAt: string;
};
export type DrillOutcome = "done" | "escape" | "timeout" | "stopped";
export type DrillRecord = {
  id: string;
  preset: string;
  name: string;
  startedAt: string;
  endedAt: string;
  outcome: DrillOutcome;
  screen: DrillScreenKind;
  goal: DrillGoal;
  amount: number;
  answered: number;
  correct: number;
  firstTry: number;
  wrong: number;
  seconds: number;
  misses: { deck: string; card: string; topic: string }[];
  hinted: number;
};
export type WeakCard = {
  deck: string;
  card: string;
  topic: string;
  prompt: string;
  code: string;
  answer: string;
  rule: string;
  right: number;
  wrong: number;
  level: number;
  lastWrong: string[];
};
export type WalkItem = { name: string; repr: string; shape: string };
export type WalkVar = [string, string, string];
export type WalkStep = [number, number | null, WalkVar[]];
export type Walk = {
  steps: WalkStep[];
  focus: { step: number; line: number; inputs: string[]; target: string | null } | null;
  error: { line: number | null; type: string; message: string } | null;
};
export type DrillReveal = { expected: string; explain: string; walk: Walk | null };
export type DrillCardMode = "python" | "shape" | "trace" | "pick" | "output" | "text" | "number" | "choice" | "self";
export type DrillCard = {
  deck: string;
  topic: string;
  deckId: string;
  topicId: string;
  hinted: boolean;
  hint: string;
  kind: string;
  mode: DrillCardMode;
  prompt: string;
  code: string;
  choices: string[];
  retry: boolean;
  selfCheck: boolean;
  revealed: DrillReveal | null;
};
export type DrillSessionView = {
  id: string;
  name: string;
  screen: DrillScreenKind;
  escape: DrillEscape;
  startedAt: string;
  elapsed: number;
  limit: number | null;
  goal: DrillGoal;
  amount: number;
  answered: number;
  correct: number;
  firstTry: number;
  wrong: number;
  hinted: number;
  theoryLabel: string;
  card: DrillCard | null;
  ended: DrillRecord | null;
};
export type DrillAnswer = {
  correct: boolean;
  expected: string;
  given: string;
  note: string | null;
  explain: string;
  walk: Walk | null;
  hinted: boolean;
  opened: string | null;
  session: DrillSessionView;
};
export type Article = {
  id: string;
  deck: string;
  topic: string;
  title: string;
  body: string;
  author: Author;
  builtin: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ArticleInput = { id?: string; deck: string; topic: string; title: string; body: string };
export type DrillOverview = {
  presets: DrillPreset[];
  checks: CheckTemplate[];
  defaultPreset: string;
  decks: DrillDeckInfo[];
  streak: number;
  bestStreak: number;
  today: { sessions: number; answers: number; correct: number };
  due: number;
  weak: WeakCard[];
  sessions: DrillRecord[];
  active: DrillSessionView | null;
};
export type DrillCardData = {
  id?: string;
  topic: string;
  prompt: string;
  code: string;
  answer: string;
  alternatives: string[];
  choices: string[];
  check: CheckSpec | null;
  explain: string;
};
export type DrillDeck = {
  id: string;
  title: string;
  description: string;
  author: Author;
  check: CheckSpec;
  gate: Gate;
  cards: DrillCardData[];
  createdAt: string;
  updatedAt: string;
};
export type DrillDeckInput = { id?: string; title: string; description: string; check: CheckSpec; gate: Gate; cards: DrillCardData[] };
export type BankTopic = { id: string; title: string; theory: string };
export type BankCard = { id: string; topic: string; kind: string; rule: string; check?: CheckSpec | null };
export type GenVariant = { question: string; code: string; answer: string; choices: string[]; alternatives: string[]; explain: string };
export type Generated = Record<string, Record<string, GenVariant[]>>;
export type DrillGenerator = {
  id: string;
  title: string;
  description: string;
  author: Author;
  code: string;
  enabled: boolean;
  topics: BankTopic[];
  templates: BankCard[];
  gate: Gate;
  createdAt: string;
  updatedAt: string;
};
export type GeneratorInput = {
  id?: string;
  title: string;
  description: string;
  code: string;
  enabled: boolean;
  topics: BankTopic[];
  templates: BankCard[];
};
export type GenSource = { id: string; title: string; code: string; templates: string[] };
export type GenCheck = { templates: number; ready: number; variants: number; problems: string[] };
export type ImportReport = {
  id: string;
  title: string;
  topics: number;
  cards: number;
  variants: number;
  dropped: number;
  problems: string[];
  replaced: boolean;
};

export const api = {
  overview: () => invoke<Overview>("get_overview"),
  day: (date: string) => invoke<Day | null>("get_day", { date }),
  board: (date: string) => invoke<unknown | null>("get_board", { date }),
  days: () => invoke<DaySummary[]>("list_days"),
  tasks: () => invoke<TaskNode[]>("list_tasks"),
  savePlan: (date: string, plan: PlanInput) => invoke<Day>("save_plan", { date, plan }),
  setCheck: (date: string, itemId: string, done: boolean) => invoke<Day>("set_check", { date, itemId, done }),
  setStart: (date: string, itemId: string, hour: number | null) => invoke<Day>("set_start", { date, itemId, hour }),
  saveBoard: (date: string, board: unknown) => invoke<string>("save_board", { date, board }),
  importImage: (date: string, ext: string, bytes: Uint8Array) =>
    invoke<AssetInfo>("import_image", bytes, { headers: { "x-date": date, "x-ext": ext } }),
  importImagePath: (date: string, path: string) => invoke<AssetInfo>("import_image_path", { date, path }),
  seal: (date: string, rating: number, summary: string | null) => invoke<Day>("seal_day", { date, rating, summary }),
  saveSettings: (settings: Settings) => invoke<Settings>("save_settings", { settings }),
  setAutostart: (enabled: boolean) => invoke<boolean>("set_autostart", { enabled }),
  testNotification: () => invoke<void>("test_notification"),
  hideToTray: () => invoke<void>("hide_to_tray"),
  quit: () => invoke<void>("quit_app"),
  takePendingRoute: () => invoke<string | null>("take_pending_route"),
  updateStatus: () => invoke<UpdateStatus>("update_status"),
  checkUpdate: () => invoke<void>("check_update"),
  installUpdate: () => invoke<void>("install_update"),
  goals: () => invoke<Goal[]>("list_goals"),
  saveGoal: (goal: GoalInput) => invoke<Goal>("save_goal", { goal }),
  setGoalStatus: (id: string, status: GoalStatus) => invoke<Goal>("set_goal_status", { id, status }),
  deleteGoal: (id: string) => invoke<void>("delete_goal", { id }),
  editTopics: (goalId: string, upsert: TopicInput[], remove: string[] = []) => invoke<Goal>("edit_topics", { goalId, upsert, remove }),
  recordTaskResult: (goalId: string, taskId: string, result: ResultInput) => invoke<Goal>("record_task_result", { goalId, taskId, result }),
  mcpInfo: () => invoke<McpInfo>("mcp_info"),
  setMcpEnabled: (enabled: boolean) => invoke<McpInfo>("set_mcp_enabled", { enabled }),
  debugShift: (minutes: number) => invoke<string>("debug_shift_time", { minutes }),
  debugTick: () => invoke<void>("debug_tick"),
  drillOverview: () => invoke<DrillOverview>("drill_overview"),
  drillDeck: (id: string) => invoke<DrillDeck>("drill_deck", { id }),
  drillSaveDeck: (deck: DrillDeckInput) => invoke<DrillDeck>("drill_save_deck", { deck }),
  drillDeleteDeck: (id: string) => invoke<void>("drill_delete_deck", { id }),
  drillResetProgress: (deck: string) => invoke<void>("drill_reset_progress", { deck }),
  drillSavePreset: (preset: DrillPreset, makeDefault: boolean) => invoke<DrillPreset>("drill_save_preset", { preset, makeDefault }),
  drillDeletePreset: (id: string) => invoke<void>("drill_delete_preset", { id }),
  drillSetDefault: (id: string) => invoke<void>("drill_set_default", { id }),
  drillSetTopic: (deck: string, topic: string, open: boolean) => invoke<void>("drill_set_topic", { deck, topic, open }),
  drillStart: (presetId: string, generated: Generated = {}) => invoke<DrillSessionView>("drill_start", { presetId, generated }),
  drillGenSources: (presetId: string) => invoke<GenSource[]>("drill_gen_sources", { presetId }),
  drillGenerator: (id: string) => invoke<DrillGenerator>("drill_generator", { id }),
  drillCheckGenerator: (topics: BankTopic[], templates: BankCard[], made: Record<string, GenVariant[]>) =>
    invoke<GenCheck>("drill_check_generator", { topics, templates, made }),
  drillSaveGenerator: (generator: GeneratorInput) => invoke<DrillGenerator>("drill_save_generator", { generator }),
  drillDisableGenerator: (id: string) => invoke<void>("drill_disable_generator", { id }),
  drillImportBank: (text: string, replace: string | null) => invoke<ImportReport>("drill_import_bank", { text, replace }),
  drillSetGate: (deck: string, gate: Gate) => invoke<void>("drill_set_gate", { deck, gate }),
  drillSaveCheck: (check: CheckTemplate) => invoke<CheckTemplate>("drill_save_check", { check }),
  drillDeleteCheck: (id: string | null, group: string | null) => invoke<number>("drill_delete_check", { id, group }),
  drillResetChecks: () => invoke<number>("drill_reset_checks"),
  drillSession: () => invoke<DrillSessionView | null>("drill_session"),
  drillReveal: () => invoke<DrillSessionView>("drill_reveal"),
  drillAnswer: (input: { text?: string; knew?: boolean }) => invoke<DrillAnswer>("drill_answer", { input }),
  drillEscape: () => invoke<DrillRecord>("drill_escape"),
  drillClose: () => invoke<void>("drill_close"),
  drillDismiss: () => invoke<void>("drill_dismiss"),
  drillArticles: () => invoke<Article[]>("drill_articles"),
  drillSaveArticle: (article: ArticleInput) => invoke<Article>("drill_save_article", { article }),
  drillDeleteArticle: (id: string) => invoke<void>("drill_delete_article", { id }),
  drillHint: () => invoke<{ deck: string; topic: string } | null>("drill_hint"),
};

export function assetUrl(dataDir: string, date: string, file: string) {
  return convertFileSrc(`${dataDir}\\assets\\${date}\\${file}`);
}

export function assetPath(dataDir: string, date: string, file: string) {
  return `${dataDir}\\assets\\${date}\\${file}`;
}

export function errText(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
