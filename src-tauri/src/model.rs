use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckItem {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub hours: Option<f64>,
    #[serde(default)]
    pub attach: Option<String>,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub done_at: Option<String>,
    #[serde(default)]
    pub subs: Vec<SubItem>,
    #[serde(default)]
    pub start: Option<u8>,
    #[serde(default)]
    pub from: Option<TaskRef>,
    #[serde(default)]
    pub goal: Option<GoalRef>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct GoalRef {
    pub goal: String,
    pub task: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskRef {
    pub date: String,
    pub id: String,
    #[serde(default)]
    pub text: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubItem {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub done: bool,
    #[serde(default)]
    pub done_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub checklist: Option<Vec<CheckItem>>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub late: bool,
    #[serde(default)]
    pub edits: u32,
    #[serde(default)]
    pub auto: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct DayResult {
    #[serde(default)]
    pub board_items: u32,
    #[serde(default)]
    pub has_ink: bool,
    #[serde(default)]
    pub rating: Option<u8>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub sealed: bool,
    #[serde(default)]
    pub sealed_at: Option<String>,
    #[serde(default)]
    pub auto_sealed: bool,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Day {
    pub date: String,
    #[serde(default)]
    pub plan: Option<Plan>,
    #[serde(default)]
    pub result: DayResult,
}

impl Day {
    pub fn new(date: &str) -> Self {
        Self { date: date.to_string(), plan: None, result: DayResult::default() }
    }

    pub fn has_plan(&self) -> bool {
        self.plan.is_some()
    }

    pub fn result_open(&self) -> bool {
        self.plan.is_some() && !self.result.sealed
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub day_start_hour: u32,
    pub evening_enabled: bool,
    pub evening_time: String,
    pub evening_repeat_min: u32,
    pub morning_enabled: bool,
    pub morning_time: String,
    pub sounds: bool,
    pub autostart_wanted: bool,
    pub tray_hint_shown: bool,
    pub auto_update: bool,
    pub task_alerts: bool,
    pub mcp_enabled: bool,
    #[serde(default)]
    pub language: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            day_start_hour: 4,
            evening_enabled: true,
            evening_time: "21:00".into(),
            evening_repeat_min: 60,
            morning_enabled: true,
            morning_time: "09:00".into(),
            sounds: true,
            autostart_wanted: true,
            tray_hint_shown: false,
            auto_update: true,
            task_alerts: true,
            mcp_enabled: false,
            language: crate::i18n::system(),
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct NotifyState {
    pub morning_for: Option<String>,
    pub evening_for: Option<String>,
    pub evening_repeat_for: Option<String>,
    pub snooze_until: Option<String>,
    pub last_version: Option<String>,
    pub update_tried: Option<String>,
    pub task_alerts_for: Option<String>,
    pub task_alerts_sent: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DaySummary {
    pub date: String,
    pub name: String,
    pub description: String,
    pub late: bool,
    pub has_checklist: bool,
    pub items_total: u32,
    pub items_done: u32,
    pub hours_total: f64,
    pub hours_done: f64,
    pub rating: Option<u8>,
    pub summary: Option<String>,
    pub sealed: bool,
    pub auto_sealed: bool,
    pub has_result: bool,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub now: String,
    pub today: String,
    pub tomorrow: String,
    pub yesterday: String,
    pub today_day: Option<Day>,
    pub tomorrow_day: Option<Day>,
    pub yesterday_day: Option<Day>,
    pub yesterday_open: bool,
    pub evening: bool,
    pub evening_at: String,
    pub next_day_in_sec: i64,
    pub streak: u32,
    pub best_streak: u32,
    pub total_days: u32,
    pub settings: Settings,
    pub autostart: bool,
    pub data_dir: String,
    pub debug: bool,
    pub version: String,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct PlanInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub checklist: Option<Vec<CheckItemInput>>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CheckItemInput {
    #[serde(default)]
    pub id: Option<String>,
    pub text: String,
    #[serde(default)]
    pub hours: Option<f64>,
    #[serde(default)]
    pub attach: Option<String>,
    #[serde(default)]
    pub subs: Vec<SubItemInput>,
    #[serde(default)]
    pub start: Option<u8>,
    #[serde(default)]
    pub from: Option<TaskRef>,
    #[serde(default)]
    pub goal: Option<GoalRef>,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubItemInput {
    #[serde(default)]
    pub id: Option<String>,
    pub text: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TaskNode {
    pub date: String,
    pub id: String,
    pub text: String,
    pub done: bool,
    pub day_name: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub file: String,
    pub path: String,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum GoalStatus {
    #[default]
    Draft,
    Active,
    Paused,
    Done,
    Archived,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TaskKind {
    #[default]
    Learn,
    Practice,
    Review,
    Check,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    #[default]
    Todo,
    Planned,
    Done,
    Skipped,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum Author {
    #[default]
    User,
    Ai,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TaskResult {
    pub minutes: Option<u32>,
    pub score: Option<u8>,
    pub confidence: Option<u8>,
    pub note: String,
    pub at: String,
    pub by: Author,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GoalTask {
    pub id: String,
    pub text: String,
    pub minutes: Option<u32>,
    pub kind: TaskKind,
    pub done_when: String,
    pub status: TaskStatus,
    pub planned_for: Option<String>,
    pub done_at: Option<String>,
    pub result: Option<TaskResult>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Topic {
    pub id: String,
    pub title: String,
    pub note: String,
    pub requires: Vec<String>,
    pub tasks: Vec<GoalTask>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub outcome: String,
    pub note: String,
    pub deadline: Option<String>,
    pub minutes_per_day: Option<u32>,
    pub days: Vec<u8>,
    pub start_hour: Option<u8>,
    pub status: GoalStatus,
    pub author: Author,
    pub topics: Vec<Topic>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GoalTaskInput {
    pub id: Option<String>,
    pub text: String,
    pub minutes: Option<u32>,
    pub kind: TaskKind,
    pub done_when: String,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TopicInput {
    pub id: Option<String>,
    pub title: Option<String>,
    pub note: Option<String>,
    pub requires: Option<Vec<String>>,
    pub tasks: Option<Vec<GoalTaskInput>>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GoalInput {
    pub id: Option<String>,
    pub title: String,
    pub outcome: String,
    pub note: String,
    pub deadline: Option<String>,
    pub minutes_per_day: Option<u32>,
    pub days: Vec<u8>,
    pub start_hour: Option<u8>,
    pub topics: Vec<TopicInput>,
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ResultInput {
    pub status: Option<TaskStatus>,
    pub minutes: Option<u32>,
    pub score: Option<u8>,
    pub confidence: Option<u8>,
    pub note: Option<String>,
}

#[derive(Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct GoalProgress {
    pub topics_total: u32,
    pub topics_done: u32,
    pub tasks_total: u32,
    pub tasks_done: u32,
    pub tasks_left: u32,
    pub minutes_total: u32,
    pub minutes_done: u32,
    pub checks_total: u32,
    pub checks_done: u32,
    pub readiness: Option<u8>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ForecastDay {
    pub date: String,
    pub tasks: Vec<String>,
    pub minutes: u32,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GoalView {
    #[serde(flatten)]
    pub goal: Goal,
    pub progress: GoalProgress,
    pub forecast: Vec<ForecastDay>,
    pub finish: Option<String>,
}
