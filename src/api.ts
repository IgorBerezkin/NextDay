import { convertFileSrc, invoke } from "@tauri-apps/api/core";

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
};

export type Plan = {
  name: string;
  description: string;
  checklist: CheckItem[] | null;
  createdAt: string;
  updatedAt: string;
  late: boolean;
  edits: number;
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
export type ItemInput = { id?: string; text: string; hours: number | null; attach: string | null; subs: SubInput[]; start: number | null };
export type PlanInput = { name: string; description: string; checklist: ItemInput[] | null };
export type AssetInfo = { file: string; path: string };

export const api = {
  overview: () => invoke<Overview>("get_overview"),
  day: (date: string) => invoke<Day | null>("get_day", { date }),
  board: (date: string) => invoke<unknown | null>("get_board", { date }),
  days: () => invoke<DaySummary[]>("list_days"),
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
  debugShift: (minutes: number) => invoke<string>("debug_shift_time", { minutes }),
  debugTick: () => invoke<void>("debug_tick"),
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
