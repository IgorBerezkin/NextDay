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
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SubItemInput {
    #[serde(default)]
    pub id: Option<String>,
    pub text: String,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct AssetInfo {
    pub file: String,
    pub path: String,
}
