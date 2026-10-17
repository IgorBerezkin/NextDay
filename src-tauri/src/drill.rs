use crate::clock::{self, fmt_date, fmt_dt, next, parse_date, parse_dt, prev};
use crate::i18n::pick;
use crate::model::Author;
use crate::pylit::{self, CheckSpec, Mode};
use crate::store::{uid, Store};
use chrono::{Duration, NaiveDate, NaiveDateTime};
use serde::{Deserialize, Serialize};
use serde_json::value::RawValue;
use serde_json::{json, Value};
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::SystemTime;

pub const STATE_FILE: &str = "drill.json";
pub const DECKS: &str = "drill";
pub const THEORY: &str = "theory";
pub const BANKS: &str = "banks";
pub const GENS: &str = "gens";
const INTERVALS: [i64; 5] = [0, 1, 2, 4, 8];
const HISTORY: usize = 300;
const RECENT: usize = 50;
const MAX_CARDS: usize = 2000;
const MAX_DECKS: usize = 200;
const MAX_PRESETS: usize = 30;
const MAX_CHECKS: usize = 100;
const MAX_TOPICS: usize = 100;
const MAX_TEMPLATES: usize = 500;
const MAX_VARIANTS: usize = 200;
const MAX_BANK_VARIANTS: usize = 100_000;
const MAX_GENERATED: usize = 40;
const MAX_CODE: usize = 300_000;
const MAX_BANK_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Bank {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: Author,
    pub gate: Gate,
    pub topics: Vec<BankTopic>,
    pub cards: Vec<BankCard>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(default)]
pub struct BankTopic {
    pub id: String,
    pub title: String,
    pub theory: String,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(default)]
pub struct BankCard {
    pub id: String,
    pub topic: String,
    pub kind: String,
    pub rule: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub check: Option<CheckSpec>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub variants: Vec<Variant>,
}

#[derive(Deserialize, Serialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Variant {
    pub code: String,
    #[serde(alias = "prompt")]
    pub question: String,
    pub answer: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub choices: Vec<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub alternatives: Vec<String>,
    #[serde(skip_serializing_if = "String::is_empty")]
    pub explain: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub walk: Option<Box<RawValue>>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Generator {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: Author,
    pub code: String,
    pub enabled: bool,
    pub topics: Vec<BankTopic>,
    pub templates: Vec<BankCard>,
    pub gate: Gate,
    pub created_at: String,
    pub updated_at: String,
}

pub type Generated = HashMap<String, HashMap<String, Vec<Variant>>>;

fn kind_spec(kind: &str) -> Option<(Mode, &'static str, &'static str)> {
    Some(match kind {
        "value" | "python" => (Mode::Python, pick("значение", "value"), "python"),
        "pick" => (Mode::Python, pick("выбор", "choice"), "pick"),
        "shape" => (Mode::Shape, pick("форма", "shape"), "shape"),
        "step" => (Mode::Python, pick("проход цикла", "loop pass"), "python"),
        "trace" => (Mode::Python, pick("трассировка", "trace"), "python"),
        "error" => (Mode::Error, pick("значение", "value"), "python"),
        "output" => (Mode::Output, pick("вывод", "output"), "output"),
        "text" => (Mode::Text, pick("вопрос", "question"), "text"),
        "number" => (Mode::Number, pick("число", "number"), "number"),
        "choice" => (Mode::Choice, pick("выбор", "choice"), "choice"),
        "self" => (Mode::SelfCheck, pick("вспомни", "recall"), "self"),
        _ => return None,
    })
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Order {
    #[default]
    Smart,
    Random,
    Sequence,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum GoalKind {
    #[default]
    Correct,
    Cards,
    Minutes,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Screen {
    #[default]
    Lock,
    Window,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Escape {
    #[default]
    Hold,
    #[serde(rename = "none")]
    Off,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Done,
    Escape,
    Timeout,
    Stopped,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Source {
    pub deck: String,
    pub topics: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Preset {
    pub id: String,
    pub name: String,
    pub sources: Vec<Source>,
    pub order: Order,
    pub goal: GoalKind,
    pub amount: u32,
    pub retry: bool,
    pub explain: bool,
    pub screen: Screen,
    pub escape: Escape,
    pub limit_minutes: u32,
    pub self_check: bool,
    pub theory_label: String,
    pub peek_keeps_box: bool,
}

impl Default for Preset {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: String::new(),
            sources: Vec::new(),
            order: Order::Smart,
            goal: GoalKind::Correct,
            amount: 10,
            retry: true,
            explain: false,
            screen: Screen::Lock,
            escape: Escape::Hold,
            limit_minutes: 30,
            self_check: false,
            theory_label: local(THEORY_LABEL),
            peek_keeps_box: true,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CheckTemplate {
    pub id: String,
    pub group: String,
    pub name: String,
    pub check: CheckSpec,
}

const THEORY_LABEL: [&str; 2] = ["Теория", "Theory"];
const BASIC: [&str; 2] = ["Основные", "Basic"];
const CODERS: [&str; 2] = ["Для программистов", "For programmers"];
const OWN: [&str; 2] = ["Свои", "Custom"];
const NO_TOPIC: [&str; 2] = ["Без темы", "No topic"];

const DEFAULT_CHECKS: [(&str, [&str; 2], [&str; 2], Mode); 6] = [
    ("text", BASIC, ["Текст", "Text"], Mode::Text),
    ("choice", BASIC, ["Выбор из вариантов", "Multiple choice"], Mode::Choice),
    ("number", BASIC, ["Число", "Number"], Mode::Number),
    ("self", BASIC, ["Самопроверка", "Self-check"], Mode::SelfCheck),
    ("python", CODERS, ["Значение Python", "Python value"], Mode::Python),
    ("shape", CODERS, ["Форма данных Python", "Python data shape"], Mode::Shape),
];

const DEFAULT_PRESETS: [(&str, [&str; 2]); 2] = [("lock", ["Замок: 10 верных", "Lock: 10 right"]), ("window", ["Разминка в окне", "Warm-up in a window"])];

fn local(pair: [&str; 2]) -> String {
    pair[usize::from(crate::i18n::en())].to_string()
}

fn default_checks() -> Vec<CheckTemplate> {
    DEFAULT_CHECKS
        .iter()
        .map(|&(id, group, name, mode)| CheckTemplate { id: id.into(), group: local(group), name: local(name), check: CheckSpec { mode, ..CheckSpec::default() } })
        .collect()
}

pub fn relabel(store: &Store, lang: &str) -> Result<(), String> {
    let to = usize::from(lang == "en");
    let swap = |text: &mut String, pair: [&str; 2]| {
        if *text == pair[1 - to] {
            *text = pair[to].to_string();
        }
    };
    let _g = store.lock();
    let mut state = load_state(store);
    for p in &mut state.presets {
        if let Some((_, names)) = DEFAULT_PRESETS.iter().find(|(id, _)| *id == p.id) {
            swap(&mut p.name, *names);
        }
        swap(&mut p.theory_label, THEORY_LABEL);
    }
    for c in &mut state.checks {
        for group in [BASIC, CODERS, OWN] {
            swap(&mut c.group, group);
        }
        if let Some((_, _, names, _)) = DEFAULT_CHECKS.iter().find(|(id, ..)| *id == c.id) {
            swap(&mut c.name, *names);
        }
    }
    save_state(store, &state)
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Gate {
    pub enabled: bool,
    pub percent: u8,
    pub window: u8,
}

impl Default for Gate {
    fn default() -> Self {
        Self { enabled: false, percent: 85, window: 20 }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CardProgress {
    #[serde(rename = "box")]
    pub level: u8,
    pub due: String,
    pub seen: u32,
    pub right: u32,
    pub wrong: u32,
    pub last_variant: Option<usize>,
    pub last_wrong: Vec<String>,
    pub last_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shot: Option<Shot>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(default)]
pub struct Shot {
    pub prompt: String,
    pub code: String,
    pub answer: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TopicState {
    pub recent: Vec<bool>,
    pub open: bool,
    pub opened_at: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Miss {
    pub deck: String,
    pub card: String,
    pub topic: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SessionRecord {
    pub id: String,
    pub preset: String,
    pub name: String,
    pub started_at: String,
    pub ended_at: String,
    pub outcome: Outcome,
    pub screen: Screen,
    pub goal: GoalKind,
    pub amount: u32,
    pub answered: u32,
    pub correct: u32,
    pub first_try: u32,
    pub wrong: u32,
    pub seconds: u32,
    #[serde(default)]
    pub misses: Vec<Miss>,
    #[serde(default)]
    pub hinted: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DrillState {
    pub presets: Vec<Preset>,
    pub default_preset: String,
    pub progress: BTreeMap<String, CardProgress>,
    pub topics: BTreeMap<String, TopicState>,
    pub sessions: Vec<SessionRecord>,
    pub cursors: BTreeMap<String, usize>,
    pub checks: Vec<CheckTemplate>,
    pub checks_seeded: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Card {
    pub id: String,
    #[serde(default)]
    pub topic: String,
    pub prompt: String,
    #[serde(default)]
    pub code: String,
    pub answer: String,
    #[serde(default)]
    pub alternatives: Vec<String>,
    #[serde(default)]
    pub choices: Vec<String>,
    #[serde(default)]
    pub check: Option<CheckSpec>,
    #[serde(default)]
    pub explain: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Deck {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: Author,
    #[serde(default)]
    pub check: CheckSpec,
    #[serde(default)]
    pub gate: Gate,
    #[serde(default)]
    pub cards: Vec<Card>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CardInput {
    pub id: Option<String>,
    pub topic: String,
    pub prompt: String,
    pub code: String,
    pub answer: String,
    pub alternatives: Vec<String>,
    pub choices: Vec<String>,
    pub check: Option<CheckSpec>,
    pub template: Option<String>,
    pub explain: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DeckInput {
    pub id: Option<String>,
    pub title: String,
    pub description: String,
    pub check: CheckSpec,
    pub template: Option<String>,
    pub gate: Gate,
    pub cards: Vec<CardInput>,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct DeckPatch {
    pub title: Option<String>,
    pub description: Option<String>,
    pub check: Option<CheckSpec>,
    pub template: Option<String>,
    pub gate: Option<Gate>,
    pub upsert: Vec<CardInput>,
    pub remove: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Key {
    pub deck: String,
    pub card: String,
    pub topic: String,
}

impl Key {
    fn id(&self) -> String {
        pkey(&self.deck, &self.card)
    }
}

fn pkey(deck: &str, card: &str) -> String {
    format!("{deck}:{card}")
}

fn tkey(deck: &str, topic: &str) -> String {
    format!("{deck}#{topic}")
}

fn chars(s: &str) -> usize {
    s.chars().count()
}

fn text(s: &str, max: usize, what: &str) -> Result<String, String> {
    let t = s.trim().to_string();
    if chars(&t) > max {
        return Err(tr!("{what}: не длиннее {max} символов.", "{what}: at most {max} characters."));
    }
    Ok(t)
}

pub struct Rng(u64);

impl Rng {
    pub fn new() -> Self {
        let n = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(7);
        Self(n | 1)
    }

    #[cfg(test)]
    pub fn seeded(seed: u64) -> Self {
        Self(seed | 1)
    }

    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn below(&mut self, n: usize) -> usize {
        if n == 0 {
            0
        } else {
            (self.next() % n as u64) as usize
        }
    }

    fn shuffle<T>(&mut self, v: &mut [T]) {
        for i in (1..v.len()).rev() {
            let j = self.below(i + 1);
            v.swap(i, j);
        }
    }
}

pub fn load_state(store: &Store) -> DrillState {
    let mut s: DrillState = store.load_json(STATE_FILE).unwrap_or_default();
    if s.presets.is_empty() {
        s.presets = default_presets();
    }
    if !s.presets.iter().any(|p| p.id == s.default_preset) {
        s.default_preset = s.presets[0].id.clone();
    }
    if !s.checks_seeded {
        s.checks = default_checks();
        s.checks_seeded = true;
    }
    s
}

pub fn save_state(store: &Store, s: &DrillState) -> Result<(), String> {
    store.save_json(STATE_FILE, s)
}

fn default_presets() -> Vec<Preset> {
    let [(lock, lock_name), (window, window_name)] = DEFAULT_PRESETS;
    vec![
        Preset { id: lock.into(), name: local(lock_name), ..Preset::default() },
        Preset { id: window.into(), name: local(window_name), goal: GoalKind::Cards, amount: 15, screen: Screen::Window, ..Preset::default() },
    ]
}

pub fn user_decks(store: &Store) -> Vec<Deck> {
    let mut v: Vec<Deck> = store.list_items(DECKS);
    v.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
    v
}

fn deck_topics(d: &Deck) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = Vec::new();
    for c in &d.cards {
        if !out.iter().any(|(id, _)| *id == c.topic) {
            let title = if c.topic.is_empty() { local(NO_TOPIC) } else { c.topic.clone() };
            out.push((c.topic.clone(), title));
        }
    }
    out
}

fn bank_topics(b: &Bank) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = b.topics.iter().map(|t| (t.id.clone(), t.title.clone())).collect();
    for c in &b.cards {
        if !out.iter().any(|(id, _)| *id == c.topic) {
            let title = if c.topic.is_empty() { local(NO_TOPIC) } else { c.topic.clone() };
            out.push((c.topic.clone(), title));
        }
    }
    out
}

fn topic_open(state: &DrillState, deck: &str, topics: &[(String, String)], gate: &Gate) -> Vec<String> {
    if !gate.enabled {
        return topics.iter().map(|(id, _)| id.clone()).collect();
    }
    topics
        .iter()
        .enumerate()
        .filter(|(i, (id, _))| *i == 0 || state.topics.get(&tkey(deck, id)).is_some_and(|t| t.open))
        .map(|(_, (id, _))| id.clone())
        .collect()
}

fn recent_ok(state: &DrillState, deck: &str, topic: &str, gate: &Gate) -> (usize, usize) {
    let r = state.topics.get(&tkey(deck, topic)).map(|t| t.recent.as_slice()).unwrap_or(&[]);
    let w = gate.window.max(1) as usize;
    let tail = &r[r.len().saturating_sub(w)..];
    (tail.iter().filter(|x| **x).count(), tail.len())
}

fn advance(state: &mut DrillState, deck: &str, topics: &[(String, String)], gate: &Gate, at: NaiveDateTime) -> Option<String> {
    if !gate.enabled {
        return None;
    }
    let open = topic_open(state, deck, topics, gate);
    let (next_id, next_title) = topics.iter().find(|(id, _)| !open.contains(id))?.clone();
    let w = gate.window.max(1) as usize;
    let ready = open.iter().all(|id| {
        let (ok, n) = recent_ok(state, deck, id, gate);
        n >= w && ok * 100 >= gate.percent as usize * n
    });
    if !ready {
        return None;
    }
    let t = state.topics.entry(tkey(deck, &next_id)).or_default();
    t.open = true;
    t.opened_at = Some(fmt_dt(at));
    Some(next_title)
}

#[derive(Serialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DeckKind {
    Deck,
    Bank,
    Generator,
}

pub struct Catalog {
    pub decks: HashMap<String, Deck>,
    pub banks: HashMap<String, Arc<Bank>>,
    pub gens: HashMap<String, Generator>,
}

impl Catalog {
    pub fn load(store: &Store) -> Self {
        let mut banks: HashMap<String, Arc<Bank>> = stored_banks(store).into_iter().map(|b| (b.id.clone(), b)).collect();
        let mut gens = HashMap::new();
        for g in user_gens(store) {
            banks.insert(g.id.clone(), Arc::new(gen_bank(&g)));
            gens.insert(g.id.clone(), g);
        }
        Self { decks: user_decks(store).into_iter().map(|d| (d.id.clone(), d)).collect(), banks, gens }
    }

    pub fn attach(&mut self, generated: Generated) {
        for (id, made) in generated {
            if !self.gens.get(&id).is_some_and(|g| g.enabled) {
                continue;
            }
            let Some(b) = self.banks.get_mut(&id) else { continue };
            for c in Arc::make_mut(b).cards.iter_mut() {
                if let Some(list) = made.get(&c.id) {
                    c.variants = list.iter().take(MAX_GENERATED).filter_map(|v| clean_variant(v.clone(), &c.kind, false).ok()).collect();
                }
            }
        }
    }

    pub fn kind(&self, deck: &str) -> Option<DeckKind> {
        if self.gens.contains_key(deck) {
            Some(DeckKind::Generator)
        } else if self.banks.contains_key(deck) {
            Some(DeckKind::Bank)
        } else {
            self.decks.contains_key(deck).then_some(DeckKind::Deck)
        }
    }

    fn topics(&self, deck: &str) -> Option<Vec<(String, String)>> {
        match self.banks.get(deck) {
            Some(b) => Some(bank_topics(b)),
            None => self.decks.get(deck).map(deck_topics),
        }
    }

    fn ids(&self) -> Vec<String> {
        let mut all: Vec<(String, String)> =
            self.decks.values().map(|d| (d.created_at.clone(), d.id.clone())).chain(self.banks.values().map(|b| (b.created_at.clone(), b.id.clone()))).collect();
        all.sort();
        all.into_iter().map(|(_, id)| id).collect()
    }

    fn gate(&self, deck: &str) -> Gate {
        match self.banks.get(deck) {
            Some(b) => b.gate.clone(),
            None => self.decks.get(deck).map(|d| d.gate.clone()).unwrap_or_default(),
        }
    }

    fn keys(&self, deck: &str) -> Vec<Key> {
        match self.banks.get(deck) {
            Some(b) => b.cards.iter().map(|c| Key { deck: deck.into(), card: c.id.clone(), topic: c.topic.clone() }).collect(),
            None => self
                .decks
                .get(deck)
                .map(|d| d.cards.iter().map(|c| Key { deck: d.id.clone(), card: c.id.clone(), topic: c.topic.clone() }).collect())
                .unwrap_or_default(),
        }
    }

    fn card(&self, k: &Key) -> Option<&BankCard> {
        self.banks.get(&k.deck)?.cards.iter().find(|c| c.id == k.card)
    }

    fn playable(&self, k: &Key) -> bool {
        match self.banks.get(&k.deck) {
            Some(_) => self.card(k).is_some_and(|c| !c.variants.is_empty()),
            None => true,
        }
    }

    fn title(&self, deck: &str) -> String {
        match self.banks.get(deck) {
            Some(b) => b.title.clone(),
            None => self.decks.get(deck).map(|d| d.title.clone()).unwrap_or_default(),
        }
    }

    fn exists(&self, deck: &str) -> bool {
        self.banks.contains_key(deck) || self.decks.contains_key(deck)
    }
}

fn gen_bank(g: &Generator) -> Bank {
    Bank {
        id: g.id.clone(),
        title: g.title.clone(),
        description: g.description.clone(),
        author: g.author,
        gate: g.gate.clone(),
        topics: g.topics.clone(),
        cards: g.templates.clone(),
        created_at: g.created_at.clone(),
        updated_at: g.updated_at.clone(),
    }
}

fn user_gens(store: &Store) -> Vec<Generator> {
    store.list_items::<Generator>(GENS).into_iter().filter(|g| !g.id.is_empty()).collect()
}

type BankCache = HashMap<PathBuf, ((SystemTime, u64), Arc<Bank>)>;

fn stored_banks(store: &Store) -> Vec<Arc<Bank>> {
    static CACHE: OnceLock<Mutex<BankCache>> = OnceLock::new();
    let cache = CACHE.get_or_init(|| Mutex::new(HashMap::new()));
    let mut out = Vec::new();
    for id in store.item_ids(BANKS) {
        let Some(stamp) = store.item_stamp(BANKS, &id) else { continue };
        let key = store.dir.join(BANKS).join(&id);
        let hit = cache.lock().unwrap_or_else(|e| e.into_inner()).get(&key).filter(|(s, _)| *s == stamp).map(|(_, b)| b.clone());
        let b = match hit {
            Some(b) => b,
            None => {
                let Some(mut b) = store.load_item::<Bank>(BANKS, &id) else { continue };
                b.id = id.clone();
                let b = Arc::new(b);
                cache.lock().unwrap_or_else(|e| e.into_inner()).insert(key, (stamp, b.clone()));
                b
            }
        };
        out.push(b);
    }
    out
}

fn deck_count(store: &Store) -> usize {
    store.item_ids(DECKS).len() + store.item_ids(BANKS).len() + store.item_ids(GENS).len()
}

pub fn candidates(cat: &Catalog, state: &DrillState, preset: &Preset) -> Vec<Key> {
    source_keys(cat, state, preset).into_iter().filter(|k| cat.playable(k)).collect()
}

fn source_keys(cat: &Catalog, state: &DrillState, preset: &Preset) -> Vec<Key> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let sources: Vec<Source> = if preset.sources.is_empty() { cat.ids().into_iter().map(|deck| Source { deck, topics: Vec::new() }).collect() } else { preset.sources.clone() };
    for src in &sources {
        let Some(topics) = cat.topics(&src.deck) else { continue };
        let allowed: Vec<String> = if src.topics.is_empty() {
            topic_open(state, &src.deck, &topics, &cat.gate(&src.deck))
        } else {
            src.topics.iter().filter(|t| topics.iter().any(|(id, _)| id == *t)).cloned().collect()
        };
        for k in cat.keys(&src.deck) {
            if allowed.contains(&k.topic) && seen.insert(k.id()) {
                out.push(k);
            }
        }
    }
    out
}

fn spread(list: Vec<Key>) -> Vec<Key> {
    let mut v = list;
    for i in 1..v.len() {
        if v[i].topic == v[i - 1].topic {
            if let Some(j) = (i + 1..v.len().min(i + 5)).find(|&j| v[j].topic != v[i - 1].topic) {
                v.swap(i, j);
            }
        }
    }
    v
}

pub fn ordered(state: &DrillState, preset: &Preset, keys: Vec<Key>, today: NaiveDate, rng: &mut Rng) -> Vec<Key> {
    match preset.order {
        Order::Random => {
            let mut v = keys;
            rng.shuffle(&mut v);
            v
        }
        Order::Sequence => {
            let n = keys.len();
            if n == 0 {
                return keys;
            }
            let start = state.cursors.get(&preset.id).copied().unwrap_or(0) % n;
            let mut v = keys;
            v.rotate_left(start);
            v
        }
        Order::Smart => {
            let mut due: Vec<(u8, String, usize, Key)> = Vec::new();
            let mut fresh: Vec<Key> = Vec::new();
            let mut later: Vec<(String, usize, Key)> = Vec::new();
            for k in keys {
                let tie = rng.below(1 << 20);
                match state.progress.get(&k.id()) {
                    None => fresh.push(k),
                    Some(p) => match parse_date(&p.due) {
                        Some(d) if d > today => later.push((p.due.clone(), tie, k)),
                        _ => due.push((p.level, p.due.clone(), tie, k)),
                    },
                }
            }
            due.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)).then_with(|| a.2.cmp(&b.2)));
            later.sort_by(|a, b| a.0.cmp(&b.0).then_with(|| a.1.cmp(&b.1)));
            let mut by_topic: Vec<(String, VecDeque<Key>)> = Vec::new();
            for k in fresh {
                match by_topic.iter_mut().find(|(t, _)| *t == k.topic) {
                    Some((_, q)) => q.push_back(k),
                    None => by_topic.push((k.topic.clone(), VecDeque::from([k]))),
                }
            }
            let mut fresh_mixed = Vec::new();
            while by_topic.iter().any(|(_, q)| !q.is_empty()) {
                for (_, q) in by_topic.iter_mut() {
                    if let Some(k) = q.pop_front() {
                        fresh_mixed.push(k);
                    }
                }
            }
            let mut due: VecDeque<Key> = due.into_iter().map(|x| x.3).collect();
            let mut fresh_q: VecDeque<Key> = fresh_mixed.into();
            let mut out = Vec::new();
            loop {
                let mut took = false;
                for _ in 0..2 {
                    if let Some(k) = due.pop_front() {
                        out.push(k);
                        took = true;
                    }
                }
                if let Some(k) = fresh_q.pop_front() {
                    out.push(k);
                    took = true;
                }
                if !took {
                    break;
                }
            }
            let mut out = spread(out);
            out.extend(later.into_iter().map(|x| x.2));
            out
        }
    }
}

#[derive(Clone, Debug)]
pub struct Slot {
    pub key: Key,
    pub variant: usize,
    pub retry: bool,
    pub revealed: bool,
    pub hinted: bool,
    pub choices: Vec<String>,
}

pub struct Session {
    pub id: String,
    pub preset: Preset,
    pub started: NaiveDateTime,
    pub catalog: Catalog,
    pub pool: Vec<Key>,
    pub queue: VecDeque<Slot>,
    pub current: Option<Slot>,
    pub answered: u32,
    pub correct: u32,
    pub first_try: u32,
    pub wrong: u32,
    pub hinted: u32,
    pub met: HashSet<String>,
    pub misses: Vec<Miss>,
    pub ended: Option<SessionRecord>,
    pub rng: Rng,
}

struct Resolved {
    deck_title: String,
    topic: String,
    kind: &'static str,
    ui_mode: &'static str,
    spec: CheckSpec,
    prompt: String,
    code: String,
    expected: Vec<String>,
    shown: String,
    explain: String,
    walk: Option<Box<RawValue>>,
    choices: Vec<String>,
}

fn topic_title(cat: &Catalog, deck: &str, topic: &str) -> String {
    cat.topics(deck).and_then(|ts| ts.into_iter().find(|(id, _)| id == topic).map(|(_, t)| t)).unwrap_or_default()
}

fn resolve(cat: &Catalog, slot: &Slot) -> Option<Resolved> {
    let k = &slot.key;
    if let Some(b) = cat.banks.get(&k.deck) {
        let c = b.cards.iter().find(|c| c.id == k.card)?;
        let v = c.variants.get(slot.variant).or_else(|| c.variants.first())?;
        let (mode, kind, ui) = kind_spec(&c.kind)?;
        let mut spec = c.check.clone().unwrap_or_default();
        spec.mode = mode;
        let mut expected = vec![v.answer.clone()];
        expected.extend(v.alternatives.iter().cloned());
        let explain = [c.rule.as_str(), v.explain.as_str()].into_iter().filter(|x| !x.is_empty()).collect::<Vec<_>>().join("\n\n");
        return Some(Resolved {
            deck_title: b.title.clone(),
            topic: topic_title(cat, &k.deck, &c.topic),
            kind,
            ui_mode: ui,
            spec,
            prompt: v.question.clone(),
            code: v.code.clone(),
            expected,
            shown: v.answer.clone(),
            explain,
            walk: v.walk.clone(),
            choices: slot.choices.clone(),
        });
    }
    let d = cat.decks.get(&k.deck)?;
    let c = d.cards.iter().find(|c| c.id == k.card)?;
    let spec = c.check.clone().unwrap_or_else(|| d.check.clone());
    let (kind, ui) = match spec.mode {
        Mode::Python | Mode::Error => (pick("значение", "value"), "python"),
        Mode::Shape => (pick("форма", "shape"), "shape"),
        Mode::Number => (pick("число", "number"), "number"),
        Mode::Choice => (pick("выбор", "choice"), "choice"),
        Mode::SelfCheck => (pick("вспомни", "recall"), "self"),
        Mode::Output => (pick("вывод", "output"), "output"),
        Mode::Text => (pick("вопрос", "question"), "text"),
    };
    let mut expected = vec![c.answer.clone()];
    expected.extend(c.alternatives.iter().cloned());
    Some(Resolved {
        deck_title: d.title.clone(),
        topic: if c.topic.is_empty() { String::new() } else { c.topic.clone() },
        kind,
        ui_mode: ui,
        spec,
        prompt: c.prompt.clone(),
        code: c.code.clone(),
        expected,
        shown: c.answer.clone(),
        explain: c.explain.clone(),
        walk: None,
        choices: slot.choices.clone(),
    })
}

fn make_slot(cat: &Catalog, state: &DrillState, key: Key, retry: bool, rng: &mut Rng) -> Slot {
    let mut variant = 0;
    let mut choices = Vec::new();
    if let Some(c) = cat.card(&key) {
        let n = c.variants.len();
        let last = state.progress.get(&key.id()).and_then(|p| p.last_variant);
        variant = rng.below(n);
        if n > 1 && Some(variant) == last {
            variant = (variant + 1 + rng.below(n - 1)) % n;
        }
        if let Some(v) = c.variants.get(variant) {
            choices = v.choices.clone();
            rng.shuffle(&mut choices);
        }
    } else if let Some(c) = cat.decks.get(&key.deck).and_then(|d| d.cards.iter().find(|c| c.id == key.card)) {
        let spec = c.check.clone().unwrap_or_else(|| cat.decks.get(&key.deck).map(|d| d.check.clone()).unwrap_or_default());
        if spec.mode == Mode::Choice {
            choices = c.choices.clone();
            if !choices.iter().any(|x| *x == c.answer) {
                choices.push(c.answer.clone());
            }
            rng.shuffle(&mut choices);
        }
    }
    Slot { key, variant, retry, revealed: false, hinted: false, choices }
}

fn today_of(store: &Store, at: NaiveDateTime) -> NaiveDate {
    clock::logical_date(at, store.load_settings().day_start_hour)
}

pub fn start(store: &Store, at: NaiveDateTime, preset_id: &str, generated: Generated) -> Result<Session, String> {
    let state = load_state(store);
    let preset = state.presets.iter().find(|p| p.id == preset_id).cloned().ok_or_else(|| tr!("Режим не найден.", "Mode not found."))?;
    let mut cat = Catalog::load(store);
    cat.attach(generated);
    let pool = candidates(&cat, &state, &preset);
    if pool.is_empty() {
        return Err(tr!("В выбранных наборах и темах нет карточек.", "The chosen decks and topics have no cards."));
    }
    let mut rng = Rng::new();
    let today = today_of(store, at);
    let order = ordered(&state, &preset, pool.clone(), today, &mut rng);
    let queue: VecDeque<Slot> = order.into_iter().map(|k| make_slot(&cat, &state, k, false, &mut rng)).collect();
    let mut s = Session {
        id: uid(),
        preset,
        started: at,
        catalog: cat,
        pool,
        queue,
        current: None,
        answered: 0,
        correct: 0,
        first_try: 0,
        wrong: 0,
        hinted: 0,
        met: HashSet::new(),
        misses: Vec::new(),
        ended: None,
        rng,
    };
    s.current = s.queue.pop_front();
    Ok(s)
}

fn refill(s: &mut Session, state: &DrillState, today: NaiveDate) {
    if !s.queue.is_empty() {
        return;
    }
    let mut order = ordered(state, &s.preset, s.pool.clone(), today, &mut s.rng);
    if order.len() > 1 {
        if let Some(cur) = &s.current {
            if order[0] == cur.key {
                order.rotate_left(1);
            }
        }
    }
    for k in order {
        let slot = make_slot(&s.catalog, state, k, false, &mut s.rng);
        s.queue.push_back(slot);
    }
}

fn elapsed(s: &Session, at: NaiveDateTime) -> u32 {
    (at - s.started).num_seconds().max(0) as u32
}

pub fn limit_sec(s: &Session) -> Option<u32> {
    (s.preset.screen == Screen::Lock).then(|| s.preset.limit_minutes.max(1) * 60)
}

fn goal_met(s: &Session, at: NaiveDateTime) -> bool {
    match s.preset.goal {
        GoalKind::Correct => s.correct >= s.preset.amount,
        GoalKind::Cards => s.answered >= s.preset.amount,
        GoalKind::Minutes => elapsed(s, at) >= s.preset.amount * 60,
    }
}

pub fn finish(store: &Store, s: &mut Session, at: NaiveDateTime, outcome: Outcome) -> SessionRecord {
    if let Some(r) = &s.ended {
        return r.clone();
    }
    let rec = SessionRecord {
        id: s.id.clone(),
        preset: s.preset.id.clone(),
        name: s.preset.name.clone(),
        started_at: fmt_dt(s.started),
        ended_at: fmt_dt(at),
        outcome,
        screen: s.preset.screen,
        goal: s.preset.goal,
        amount: s.preset.amount,
        answered: s.answered,
        correct: s.correct,
        first_try: s.first_try,
        wrong: s.wrong,
        seconds: elapsed(s, at),
        misses: s.misses.clone(),
        hinted: s.hinted,
    };
    let _g = store.lock();
    let mut state = load_state(store);
    state.sessions.push(rec.clone());
    if state.sessions.len() > HISTORY {
        let cut = state.sessions.len() - HISTORY;
        state.sessions.drain(..cut);
    }
    if s.preset.order == Order::Sequence {
        let n = s.pool.len().max(1);
        let c = state.cursors.entry(s.preset.id.clone()).or_insert(0);
        *c = (*c + s.answered as usize) % n;
    }
    let _ = save_state(store, &state);
    s.current = None;
    s.queue.clear();
    s.ended = Some(rec.clone());
    rec
}

pub fn tick(store: &Store, s: &mut Session, at: NaiveDateTime) -> Option<SessionRecord> {
    if s.ended.is_some() {
        return None;
    }
    if s.preset.goal == GoalKind::Minutes && goal_met(s, at) {
        return Some(finish(store, s, at, Outcome::Done));
    }
    if limit_sec(s).is_some_and(|l| elapsed(s, at) >= l) {
        return Some(finish(store, s, at, Outcome::Timeout));
    }
    None
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reveal {
    pub expected: String,
    pub explain: String,
    pub walk: Option<Box<RawValue>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CardView {
    pub deck: String,
    pub topic: String,
    pub deck_id: String,
    pub topic_id: String,
    pub kind: String,
    pub mode: String,
    pub prompt: String,
    pub code: String,
    pub choices: Vec<String>,
    pub retry: bool,
    pub self_check: bool,
    pub hinted: bool,
    pub hint: String,
    pub revealed: Option<Reveal>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SessionView {
    pub id: String,
    pub name: String,
    pub screen: Screen,
    pub escape: Escape,
    pub started_at: String,
    pub elapsed: u32,
    pub limit: Option<u32>,
    pub goal: GoalKind,
    pub amount: u32,
    pub answered: u32,
    pub correct: u32,
    pub first_try: u32,
    pub wrong: u32,
    pub hinted: u32,
    pub theory_label: String,
    pub card: Option<CardView>,
    pub ended: Option<SessionRecord>,
}

pub fn view(s: &Session, at: NaiveDateTime) -> SessionView {
    let card = s.current.as_ref().and_then(|slot| {
        let r = resolve(&s.catalog, slot)?;
        let self_check = s.preset.self_check || r.spec.mode == Mode::SelfCheck;
        Some(CardView {
            deck: r.deck_title,
            topic: r.topic,
            deck_id: slot.key.deck.clone(),
            topic_id: slot.key.topic.clone(),
            kind: r.kind.into(),
            mode: if self_check { "self".into() } else { r.ui_mode.into() },
            prompt: r.prompt,
            code: r.code,
            choices: r.choices,
            retry: slot.retry,
            self_check,
            hinted: slot.hinted,
            hint: r.spec.hint.clone(),
            revealed: slot.revealed.then(|| Reveal { expected: r.shown, explain: r.explain, walk: r.walk }),
        })
    });
    SessionView {
        id: s.id.clone(),
        name: s.preset.name.clone(),
        screen: s.preset.screen,
        escape: s.preset.escape,
        started_at: fmt_dt(s.started),
        elapsed: elapsed(s, at),
        limit: limit_sec(s),
        goal: s.preset.goal,
        amount: s.preset.amount,
        answered: s.answered,
        correct: s.correct,
        first_try: s.first_try,
        wrong: s.wrong,
        hinted: s.hinted,
        theory_label: s.preset.theory_label.clone(),
        card,
        ended: s.ended.clone(),
    }
}

pub fn reveal(s: &mut Session) -> Result<(), String> {
    let slot = s.current.as_mut().ok_or_else(|| tr!("Сеанс закончен.", "The session is over."))?;
    slot.revealed = true;
    Ok(())
}

pub fn hint(s: &mut Session) -> Option<(String, String)> {
    let slot = s.current.as_mut()?;
    slot.hinted = true;
    Some((slot.key.deck.clone(), slot.key.topic.clone()))
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AnswerInput {
    pub text: Option<String>,
    pub knew: Option<bool>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnswerView {
    pub correct: bool,
    pub expected: String,
    pub given: String,
    pub note: Option<String>,
    pub explain: String,
    pub walk: Option<Box<RawValue>>,
    pub hinted: bool,
    pub opened: Option<String>,
    pub session: SessionView,
}

pub fn answer(store: &Store, s: &mut Session, at: NaiveDateTime, input: AnswerInput) -> Result<AnswerView, String> {
    if s.ended.is_some() {
        return Err(tr!("Сеанс уже закончен.", "The session is already over."));
    }
    let slot = s.current.clone().ok_or_else(|| tr!("Сеанс закончен.", "The session is over."))?;
    let _g = store.lock();
    let mut state = load_state(store);
    let r = resolve(&s.catalog, &slot).ok_or_else(|| tr!("Карточка пропала из набора.", "The card is gone from the deck."))?;
    let self_check = s.preset.self_check || r.spec.mode == Mode::SelfCheck;
    let given = input.text.clone().unwrap_or_default();
    let (correct, note) = if self_check {
        let knew = input.knew.ok_or_else(|| tr!("Отметь, знал ли ответ.", "Mark whether you knew the answer."))?;
        (knew, None)
    } else {
        if given.trim().is_empty() {
            return Err(tr!("Ответ пустой.", "The answer is empty."));
        }
        let exp: Vec<&str> = r.expected.iter().map(String::as_str).collect();
        let v = pylit::check(&r.spec, &exp, &given);
        (v.correct, v.note)
    };
    let today = today_of(store, at);
    let id = slot.key.id();
    let first = !slot.retry && s.met.insert(id.clone());
    let peeked = slot.hinted && s.preset.peek_keeps_box;
    s.answered += 1;
    if slot.hinted {
        s.hinted += 1;
    }
    if correct {
        s.correct += 1;
        if first && !slot.hinted {
            s.first_try += 1;
        }
    } else {
        s.wrong += 1;
        let m = Miss { deck: slot.key.deck.clone(), card: slot.key.card.clone(), topic: r.topic.clone() };
        if !s.misses.contains(&m) {
            s.misses.push(m);
        }
    }
    let p = state.progress.entry(id).or_default();
    if p.level == 0 {
        p.level = 1;
    }
    if first || !correct {
        let level = if !correct {
            1
        } else if peeked {
            p.level.max(1)
        } else {
            (p.level + 1).min(5)
        };
        p.level = level;
        p.due = fmt_date(today + Duration::days(if peeked { 0 } else { INTERVALS[(level - 1) as usize] }));
    }
    p.seen += 1;
    p.last_at = fmt_dt(at);
    p.last_variant = s.catalog.banks.contains_key(&slot.key.deck).then_some(slot.variant);
    if correct {
        p.right += 1;
    } else {
        p.wrong += 1;
        if !given.trim().is_empty() {
            p.last_wrong.push(given.trim().chars().take(200).collect());
            if p.last_wrong.len() > 3 {
                p.last_wrong.remove(0);
            }
        }
        if s.catalog.gens.contains_key(&slot.key.deck) {
            p.shot = Some(Shot { prompt: r.prompt.clone(), code: r.code.clone(), answer: r.shown.clone() });
        }
    }
    let t = state.topics.entry(tkey(&slot.key.deck, &slot.key.topic)).or_default();
    t.recent.push(correct && !peeked);
    if t.recent.len() > RECENT {
        t.recent.remove(0);
    }
    let gate = s.catalog.gate(&slot.key.deck);
    let topics = s.catalog.topics(&slot.key.deck).unwrap_or_default();
    let opened = advance(&mut state, &slot.key.deck, &topics, &gate, at);
    save_state(store, &state)?;
    drop(_g);
    if !correct && s.preset.retry {
        let again = make_slot(&s.catalog, &state, slot.key.clone(), true, &mut s.rng);
        let pos = 2.min(s.queue.len());
        s.queue.insert(pos, again);
    }
    if goal_met(s, at) {
        finish(store, s, at, Outcome::Done);
    } else {
        refill(s, &state, today);
        s.current = s.queue.pop_front();
        if s.current.is_none() {
            finish(store, s, at, Outcome::Done);
        }
    }
    Ok(AnswerView {
        correct,
        expected: r.shown,
        given,
        note,
        explain: if s.preset.explain || !correct || slot.hinted { r.explain } else { String::new() },
        walk: if correct && !s.preset.explain { None } else { r.walk },
        hinted: slot.hinted,
        opened,
        session: view(s, at),
    })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TopicInfo {
    pub id: String,
    pub title: String,
    pub cards: usize,
    pub open: bool,
    pub answered: usize,
    pub recent: usize,
    pub recent_right: usize,
    pub seen: usize,
    pub due: usize,
    pub boxes: [usize; 5],
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeckInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub kind: DeckKind,
    pub enabled: bool,
    pub author: Author,
    pub cards: usize,
    pub variants: usize,
    pub check: Option<CheckSpec>,
    pub gate: Gate,
    pub topics: Vec<TopicInfo>,
    pub updated_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeakCard {
    pub deck: String,
    pub card: String,
    pub topic: String,
    pub prompt: String,
    pub code: String,
    pub answer: String,
    pub rule: String,
    pub right: u32,
    pub wrong: u32,
    pub level: u8,
    pub last_wrong: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayCount {
    pub sessions: u32,
    pub answers: u32,
    pub correct: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Overview {
    pub presets: Vec<Preset>,
    pub checks: Vec<CheckTemplate>,
    pub default_preset: String,
    pub decks: Vec<DeckInfo>,
    pub streak: u32,
    pub best_streak: u32,
    pub today: DayCount,
    pub due: usize,
    pub weak: Vec<WeakCard>,
    pub sessions: Vec<SessionRecord>,
}

fn deck_info(cat: &Catalog, state: &DrillState, deck: &str, today: NaiveDate) -> Option<DeckInfo> {
    let topics = cat.topics(deck)?;
    let gate = cat.gate(deck);
    let open = topic_open(state, deck, &topics, &gate);
    let keys = cat.keys(deck);
    let infos = topics
        .iter()
        .map(|(id, title)| {
            let ks: Vec<&Key> = keys.iter().filter(|k| k.topic == *id).collect();
            let mut boxes = [0usize; 5];
            let mut seen = 0;
            let mut due = 0;
            for k in &ks {
                if let Some(p) = state.progress.get(&k.id()) {
                    seen += 1;
                    boxes[(p.level.clamp(1, 5) - 1) as usize] += 1;
                    if parse_date(&p.due).is_none_or(|d| d <= today) {
                        due += 1;
                    }
                }
            }
            let (right, n) = recent_ok(state, deck, id, &gate);
            let answered = state.topics.get(&tkey(deck, id)).map(|t| t.recent.len()).unwrap_or(0);
            TopicInfo { id: id.clone(), title: title.clone(), cards: ks.len(), open: open.contains(id), answered, recent: n, recent_right: right, seen, due, boxes }
        })
        .collect();
    let kind = cat.kind(deck)?;
    let (description, author, check, updated_at, enabled, variants) = match cat.banks.get(deck) {
        Some(b) => (b.description.clone(), b.author, None, b.updated_at.clone(), cat.gens.get(deck).is_none_or(|g| g.enabled), b.cards.iter().map(|c| c.variants.len()).sum()),
        None => {
            let d = cat.decks.get(deck)?;
            (d.description.clone(), d.author, Some(d.check.clone()), d.updated_at.clone(), true, 0)
        }
    };
    Some(DeckInfo { id: deck.into(), title: cat.title(deck), description, kind, enabled, author, cards: keys.len(), variants, check, gate, topics: infos, updated_at })
}

fn streaks(state: &DrillState, dsh: u32, today: NaiveDate) -> (u32, u32) {
    let last_escape = state.sessions.iter().filter(|r| r.outcome == Outcome::Escape).map(|r| r.ended_at.clone()).max();
    let done: Vec<&SessionRecord> = state.sessions.iter().filter(|r| r.outcome == Outcome::Done).collect();
    let day = |r: &SessionRecord| parse_dt(&r.ended_at).map(|t| clock::logical_date(t, dsh));
    let all: BTreeSet<NaiveDate> = done.iter().filter_map(|r| day(r)).collect();
    let fresh: BTreeSet<NaiveDate> = done.iter().filter(|r| last_escape.as_ref().is_none_or(|e| r.ended_at > *e)).filter_map(|r| day(r)).collect();
    let mut d = if fresh.contains(&today) { today } else { prev(today) };
    let mut cur = 0;
    while fresh.contains(&d) {
        cur += 1;
        d = prev(d);
    }
    let (mut best, mut run) = (0u32, 0u32);
    let mut last: Option<NaiveDate> = None;
    for d in &all {
        run = if last.is_some_and(|p| next(p) == *d) { run + 1 } else { 1 };
        best = best.max(run);
        last = Some(*d);
    }
    (cur, best.max(cur))
}

fn weak_cards(cat: &Catalog, state: &DrillState, limit: usize) -> Vec<WeakCard> {
    let mut list: Vec<(&String, &CardProgress)> = state.progress.iter().filter(|(_, p)| p.wrong > 0).collect();
    list.sort_by(|a, b| b.1.wrong.cmp(&a.1.wrong).then_with(|| a.1.level.cmp(&b.1.level)).then_with(|| b.1.last_at.cmp(&a.1.last_at)));
    let mut out = Vec::new();
    for (key, p) in list {
        let Some((deck, card)) = key.split_once(':') else { continue };
        let entry = if let Some(b) = cat.banks.get(deck) {
            b.cards.iter().find(|c| c.id == card).map(|c| {
                let shot = match c.variants.get(p.last_variant.unwrap_or(0)).or_else(|| c.variants.first()) {
                    Some(v) => Shot { prompt: v.question.clone(), code: v.code.clone(), answer: v.answer.clone() },
                    None => p.shot.clone().unwrap_or_default(),
                };
                WeakCard {
                    deck: deck.into(),
                    card: card.into(),
                    topic: topic_title(cat, deck, &c.topic),
                    prompt: shot.prompt,
                    code: shot.code,
                    answer: shot.answer,
                    rule: c.rule.clone(),
                    right: p.right,
                    wrong: p.wrong,
                    level: p.level,
                    last_wrong: p.last_wrong.clone(),
                }
            })
        } else {
            cat.decks.get(deck).and_then(|d| d.cards.iter().find(|c| c.id == card)).map(|c| WeakCard {
                deck: deck.into(),
                card: card.into(),
                topic: c.topic.clone(),
                prompt: c.prompt.clone(),
                code: c.code.clone(),
                answer: c.answer.clone(),
                rule: c.explain.clone(),
                right: p.right,
                wrong: p.wrong,
                level: p.level,
                last_wrong: p.last_wrong.clone(),
            })
        };
        if let Some(w) = entry {
            out.push(w);
        }
        if out.len() >= limit {
            break;
        }
    }
    out
}

pub fn overview(store: &Store, at: NaiveDateTime) -> Overview {
    let state = load_state(store);
    let cat = Catalog::load(store);
    let dsh = store.load_settings().day_start_hour;
    let today = clock::logical_date(at, dsh);
    let decks: Vec<DeckInfo> = cat.ids().iter().filter_map(|id| deck_info(&cat, &state, id, today)).collect();
    let (streak, best_streak) = streaks(&state, dsh, today);
    let mut count = DayCount { sessions: 0, answers: 0, correct: 0 };
    for r in &state.sessions {
        if parse_dt(&r.ended_at).map(|t| clock::logical_date(t, dsh)) == Some(today) {
            count.sessions += u32::from(r.outcome == Outcome::Done);
            count.answers += r.answered;
            count.correct += r.correct;
        }
    }
    let default = state.presets.iter().find(|p| p.id == state.default_preset).cloned().unwrap_or_default();
    let due = source_keys(&cat, &state, &default)
        .iter()
        .filter(|k| state.progress.get(&k.id()).is_some_and(|p| parse_date(&p.due).is_none_or(|d| d <= today)))
        .count();
    Overview {
        presets: state.presets.clone(),
        checks: state.checks.clone(),
        default_preset: state.default_preset.clone(),
        decks,
        streak,
        best_streak,
        today: count,
        due,
        weak: weak_cards(&cat, &state, 12),
        sessions: state.sessions.iter().rev().take(40).cloned().collect(),
    }
}

fn clean_card(c: CardInput, deck_check: &CheckSpec, seen: &mut HashSet<String>) -> Result<Card, String> {
    let prompt = text(&c.prompt, 2000, &tr!("Вопрос", "Question"))?;
    let code = c.code.trim_end().trim_start_matches('\n').to_string();
    if chars(&code) > 4000 {
        return Err(tr!("Код в карточке: не длиннее 4000 символов.", "Card code: at most 4000 characters."));
    }
    if prompt.is_empty() && code.is_empty() {
        return Err(tr!("У карточки нет вопроса.", "The card has no question."));
    }
    let answer = text(&c.answer, 500, &tr!("Ответ", "Answer"))?;
    if answer.is_empty() {
        return Err(tr!("У карточки «{}» нет ответа.", "The card \"{}\" has no answer.", prompt.chars().take(40).collect::<String>()));
    }
    let alternatives: Vec<String> = c.alternatives.iter().map(|a| text(a, 500, &tr!("Другой ответ", "Other answer"))).collect::<Result<Vec<_>, _>>()?.into_iter().filter(|a| !a.is_empty()).take(10).collect();
    let mut choices: Vec<String> = c.choices.iter().map(|a| text(a, 300, &tr!("Вариант ответа", "Option"))).collect::<Result<Vec<_>, _>>()?.into_iter().filter(|a| !a.is_empty()).take(8).collect();
    let spec = c.check.clone().unwrap_or_else(|| deck_check.clone());
    if spec.mode == Mode::Choice {
        if !choices.contains(&answer) {
            choices.insert(0, answer.clone());
        }
        if choices.len() < 2 {
            return Err(tr!("Для выбора нужно хотя бы два варианта.", "Multiple choice needs at least two options."));
        }
    }
    for a in std::iter::once(&answer).chain(alternatives.iter()) {
        pylit::valid_expected(&spec, a)?;
    }
    let id = match c.id.filter(|i| !i.is_empty() && i.len() <= 40 && !seen.contains(i)) {
        Some(i) => i,
        None => uid(),
    };
    seen.insert(id.clone());
    Ok(Card { id, topic: text(&c.topic, 80, &tr!("Тема", "Topic"))?, prompt, code, answer, alternatives, choices, check: c.check, explain: text(&c.explain, 2000, &tr!("Пояснение", "Explanation"))? })
}

fn clean_spec(mut s: CheckSpec) -> Result<CheckSpec, String> {
    if matches!(s.mode, Mode::Error | Mode::Output) {
        s.mode = Mode::Text;
    }
    s.hint = text(&s.hint, 200, &tr!("Подсказка к ответу", "Answer hint"))?;
    if !s.tolerance.is_finite() || s.tolerance < 0.0 {
        return Err(tr!("Допуск должен быть неотрицательным числом.", "The tolerance must be a non-negative number."));
    }
    Ok(s)
}

fn clean_gate(mut g: Gate) -> Gate {
    g.percent = g.percent.clamp(50, 100);
    g.window = g.window.clamp(5, 50);
    g
}

pub fn save_deck(store: &Store, at: NaiveDateTime, input: DeckInput, author: Author) -> Result<Deck, String> {
    let _g = store.lock();
    let existing: Option<Deck> = input.id.as_deref().filter(|i| !i.is_empty()).and_then(|i| store.load_item(DECKS, i));
    if input.id.as_deref().is_some_and(|i| !i.is_empty()) && existing.is_none() {
        return Err(tr!("Набор не найден.", "Deck not found."));
    }
    if existing.is_none() && user_decks(store).len() >= MAX_DECKS {
        return Err(tr!("Наборов не больше {MAX_DECKS}.", "At most {MAX_DECKS} decks."));
    }
    let title = text(&input.title, 80, &tr!("Название набора", "Deck title"))?;
    if title.is_empty() {
        return Err(tr!("Дай набору название.", "Give the deck a title."));
    }
    if input.cards.len() > MAX_CARDS {
        return Err(tr!("В наборе не больше {MAX_CARDS} карточек.", "A deck holds at most {MAX_CARDS} cards."));
    }
    let state = load_state(store);
    let check = match input.template.as_deref().filter(|t| !t.trim().is_empty()) {
        Some(t) => find_check(&state, t)?,
        None => clean_spec(input.check)?,
    };
    let mut seen = HashSet::new();
    let mut cards = Vec::new();
    for c in input.cards {
        let mut c = c;
        if let Some(t) = c.template.as_deref().filter(|t| !t.trim().is_empty()) {
            c.check = Some(find_check(&state, t)?);
        }
        c.check = c.check.map(clean_spec).transpose()?;
        cards.push(clean_card(c, &check, &mut seen)?);
    }
    let now = fmt_dt(at);
    let deck = Deck {
        id: existing.as_ref().map(|d| d.id.clone()).unwrap_or_else(uid),
        title,
        description: text(&input.description, 1000, &tr!("Описание", "Description"))?,
        author: existing.as_ref().map(|d| d.author).unwrap_or(author),
        check,
        gate: clean_gate(input.gate),
        cards,
        created_at: existing.as_ref().map(|d| d.created_at.clone()).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    store.save_item(DECKS, &deck.id, &deck)?;
    Ok(deck)
}

pub fn edit_deck(store: &Store, at: NaiveDateTime, id: &str, patch: DeckPatch) -> Result<Deck, String> {
    let d: Deck = store.load_item(DECKS, id).ok_or_else(|| tr!("Набор не найден.", "Deck not found."))?;
    let mut cards: Vec<CardInput> = d
        .cards
        .iter()
        .filter(|c| !patch.remove.contains(&c.id))
        .map(|c| CardInput {
            id: Some(c.id.clone()),
            topic: c.topic.clone(),
            prompt: c.prompt.clone(),
            code: c.code.clone(),
            answer: c.answer.clone(),
            alternatives: c.alternatives.clone(),
            choices: c.choices.clone(),
            check: c.check.clone(),
            template: None,
            explain: c.explain.clone(),
        })
        .collect();
    for u in patch.upsert {
        match u.id.as_deref().and_then(|i| cards.iter().position(|c| c.id.as_deref() == Some(i))) {
            Some(i) => cards[i] = u,
            None => cards.push(u),
        }
    }
    save_deck(
        store,
        at,
        DeckInput {
            id: Some(d.id.clone()),
            title: patch.title.unwrap_or(d.title),
            description: patch.description.unwrap_or(d.description),
            check: patch.check.unwrap_or(d.check),
            template: patch.template,
            gate: patch.gate.unwrap_or(d.gate),
            cards,
        },
        d.author,
    )
}

pub fn delete_deck(store: &Store, id: &str) -> Result<(), String> {
    let _g = store.lock();
    let sub = [DECKS, BANKS, GENS].into_iter().find(|s| store.has_item(s, id)).ok_or_else(|| tr!("Набор не найден.", "Deck not found."))?;
    store.delete_item(sub, id)?;
    let mut state = load_state(store);
    let prefix = format!("{id}:");
    let tprefix = format!("{id}#");
    state.progress.retain(|k, _| !k.starts_with(&prefix));
    state.topics.retain(|k, _| !k.starts_with(&tprefix));
    for a in store.list_items::<Article>(THEORY) {
        if a.deck == id {
            let _ = store.delete_item(THEORY, &a.id);
        }
    }
    for p in state.presets.iter_mut() {
        p.sources.retain(|s| s.deck != id);
    }
    save_state(store, &state)
}

pub fn get_deck(store: &Store, id: &str) -> Result<Value, String> {
    let cat = Catalog::load(store);
    if let Some(g) = cat.gens.get(id) {
        return Ok(json!({
            "id": g.id,
            "kind": "generator",
            "title": g.title,
            "description": g.description,
            "author": g.author,
            "enabled": g.enabled,
            "topics": g.topics,
            "templates": g.templates,
            "code": g.code,
        }));
    }
    if let Some(b) = cat.banks.get(id) {
        let cards: Vec<Value> = b
            .cards
            .iter()
            .map(|c| {
                let v = c.variants.first();
                json!({
                    "id": c.id,
                    "topic": c.topic,
                    "kind": c.kind,
                    "rule": c.rule,
                    "variants": c.variants.len(),
                    "sample": v.map(|v| json!({ "code": v.code, "question": v.question, "answer": v.answer, "choices": v.choices })),
                })
            })
            .collect();
        return Ok(json!({ "id": b.id, "kind": "bank", "title": b.title, "description": b.description, "author": b.author, "topics": b.topics, "cards": cards }));
    }
    let d = cat.decks.get(id).ok_or_else(|| tr!("Набор не найден.", "Deck not found."))?;
    serde_json::to_value(d).map_err(|e| e.to_string())
}

pub fn clean_preset(store: &Store, mut p: Preset) -> Result<Preset, String> {
    let cat = Catalog::load(store);
    p.name = text(&p.name, 60, &tr!("Название режима", "Mode name"))?;
    if p.name.is_empty() {
        p.name = tr!("Режим", "Mode");
    }
    let mut sources: Vec<Source> = Vec::new();
    for s in p.sources {
        if !cat.exists(&s.deck) {
            return Err(tr!("Набор {} не найден.", "Deck {} not found.", s.deck));
        }
        let topics = cat.topics(&s.deck).unwrap_or_default();
        let mut picked: Vec<String> = Vec::new();
        for t in s.topics {
            let found = topics.iter().find(|(id, title)| *id == t || *title == t).map(|(id, _)| id.clone());
            match found {
                Some(id) if !picked.contains(&id) => picked.push(id),
                Some(_) => {}
                None => return Err(tr!("В наборе «{}» нет темы «{t}».", "The deck \"{}\" has no topic \"{t}\".", cat.title(&s.deck))),
            }
        }
        if !sources.iter().any(|x| x.deck == s.deck) {
            sources.push(Source { deck: s.deck, topics: picked });
        }
    }
    p.sources = sources;
    let max = if p.goal == GoalKind::Minutes { 180 } else { 200 };
    if p.amount == 0 || p.amount > max {
        return Err(tr!("Объём сеанса: от 1 до {max}.", "Session size: from 1 to {max}."));
    }
    p.limit_minutes = p.limit_minutes.clamp(5, 180);
    p.theory_label = text(&p.theory_label, 24, &tr!("Подпись кнопки теории", "Theory button caption"))?;
    if p.screen == Screen::Lock && p.goal == GoalKind::Minutes && p.limit_minutes < p.amount {
        return Err(tr!("Потолок времени замка меньше длительности сеанса.", "The lock time limit is shorter than the session."));
    }
    if p.id.is_empty() {
        p.id = uid();
    }
    Ok(p)
}

pub fn save_preset(store: &Store, preset: Preset, make_default: bool) -> Result<Preset, String> {
    let p = clean_preset(store, preset)?;
    let _g = store.lock();
    let mut state = load_state(store);
    match state.presets.iter().position(|x| x.id == p.id) {
        Some(i) => state.presets[i] = p.clone(),
        None => {
            if state.presets.len() >= MAX_PRESETS {
                return Err(tr!("Режимов не больше {MAX_PRESETS}.", "At most {MAX_PRESETS} modes."));
            }
            state.presets.push(p.clone());
        }
    }
    if make_default {
        state.default_preset = p.id.clone();
    }
    save_state(store, &state)?;
    Ok(p)
}

pub fn delete_preset(store: &Store, id: &str) -> Result<(), String> {
    let _g = store.lock();
    let mut state = load_state(store);
    state.presets.retain(|p| p.id != id);
    state.cursors.remove(id);
    save_state(store, &state)
}

pub fn set_default(store: &Store, id: &str) -> Result<(), String> {
    let _g = store.lock();
    let mut state = load_state(store);
    if !state.presets.iter().any(|p| p.id == id) {
        return Err(tr!("Режим не найден.", "Mode not found."));
    }
    state.default_preset = id.into();
    save_state(store, &state)
}

pub fn set_topic(store: &Store, at: NaiveDateTime, deck: &str, topic: &str, open: bool) -> Result<(), String> {
    let cat = Catalog::load(store);
    let topics = cat.topics(deck).ok_or_else(|| tr!("Набор не найден.", "Deck not found."))?;
    if !topics.iter().any(|(id, _)| id == topic) {
        return Err(tr!("Тема не найдена.", "Topic not found."));
    }
    let _g = store.lock();
    let mut state = load_state(store);
    let t = state.topics.entry(tkey(deck, topic)).or_default();
    t.open = open;
    t.opened_at = open.then(|| fmt_dt(at));
    save_state(store, &state)
}

fn find_check(state: &DrillState, key: &str) -> Result<CheckSpec, String> {
    let key = key.trim();
    state
        .checks
        .iter()
        .find(|c| c.id == key)
        .or_else(|| state.checks.iter().find(|c| c.name.to_lowercase() == key.to_lowercase()))
        .map(|c| c.check.clone())
        .ok_or_else(|| tr!("Шаблон проверки «{key}» не найден.", "Check template \"{key}\" not found."))
}

pub fn save_check(store: &Store, input: CheckTemplate) -> Result<CheckTemplate, String> {
    let name = text(&input.name, 60, &tr!("Название шаблона", "Template name"))?;
    if name.is_empty() {
        return Err(tr!("Дай шаблону название.", "Give the template a name."));
    }
    let group = text(&input.group, 40, &tr!("Группа", "Group"))?;
    let group = if group.is_empty() { local(OWN) } else { group };
    let check = clean_spec(input.check)?;
    let _g = store.lock();
    let mut state = load_state(store);
    let id = input.id.trim().to_string();
    let old = state.checks.iter().position(|c| !id.is_empty() && c.id == id);
    if old.is_none() && state.checks.len() >= MAX_CHECKS {
        return Err(tr!("Шаблонов не больше {MAX_CHECKS}.", "At most {MAX_CHECKS} templates."));
    }
    let id = if old.is_some() || (!id.is_empty() && id.len() <= 40) { id } else { uid() };
    let t = CheckTemplate { id, group, name, check };
    match old {
        Some(i) if state.checks[i].group == t.group => state.checks[i] = t.clone(),
        _ => {
            if let Some(i) = old {
                state.checks.remove(i);
            }
            let at = state.checks.iter().rposition(|c| c.group == t.group).map(|i| i + 1).unwrap_or(state.checks.len());
            state.checks.insert(at, t.clone());
        }
    }
    save_state(store, &state)?;
    Ok(t)
}

pub fn delete_check(store: &Store, id: Option<&str>, group: Option<&str>) -> Result<usize, String> {
    let _g = store.lock();
    let mut state = load_state(store);
    let before = state.checks.len();
    match (id.filter(|x| !x.is_empty()), group.filter(|x| !x.is_empty())) {
        (Some(id), _) => state.checks.retain(|c| c.id != id),
        (None, Some(group)) => state.checks.retain(|c| c.group != group),
        _ => return Err(tr!("Укажи шаблон или группу.", "Give a template or a group.")),
    }
    let gone = before - state.checks.len();
    if gone == 0 {
        return Err(tr!("Такого шаблона нет.", "There is no such template."));
    }
    save_state(store, &state)?;
    Ok(gone)
}

pub fn reset_checks(store: &Store) -> Result<usize, String> {
    let _g = store.lock();
    let mut state = load_state(store);
    let mut added = 0;
    for d in default_checks() {
        if state.checks.iter().any(|c| c.id == d.id) {
            continue;
        }
        let at = state.checks.iter().rposition(|c| c.group == d.group).map(|i| i + 1).unwrap_or(state.checks.len());
        state.checks.insert(at, d);
        added += 1;
    }
    save_state(store, &state)?;
    Ok(added)
}

pub fn set_gate(store: &Store, deck: &str, gate: Gate) -> Result<(), String> {
    let gate = clean_gate(gate);
    let _g = store.lock();
    if let Some(mut g) = store.load_item::<Generator>(GENS, deck) {
        g.gate = gate;
        return store.save_item(GENS, deck, &g);
    }
    if let Some(mut b) = store.load_item::<Bank>(BANKS, deck) {
        b.gate = gate;
        return store.save_item_compact(BANKS, deck, &b);
    }
    if let Some(mut d) = store.load_item::<Deck>(DECKS, deck) {
        d.gate = gate;
        return store.save_item(DECKS, deck, &d);
    }
    Err(tr!("Набор не найден.", "Deck not found."))
}

fn note(problems: &mut Vec<String>, text: String) {
    if problems.len() < 30 {
        problems.push(text);
    }
}

fn valid_walk(w: &RawValue) -> bool {
    #[derive(Deserialize)]
    struct Focus {
        step: usize,
        #[allow(dead_code)]
        line: u32,
        #[allow(dead_code)]
        inputs: Vec<String>,
        #[allow(dead_code)]
        target: Option<String>,
    }
    #[derive(Deserialize)]
    struct Fail {
        #[allow(dead_code)]
        line: Option<u32>,
        #[allow(dead_code)]
        #[serde(rename = "type")]
        kind: String,
        #[allow(dead_code)]
        message: String,
    }
    #[derive(Deserialize)]
    struct WalkShape {
        steps: Vec<(u32, Option<u32>, Vec<(String, String, String)>)>,
        focus: Option<Focus>,
        #[allow(dead_code)]
        error: Option<Fail>,
    }
    serde_json::from_str::<WalkShape>(w.get()).is_ok_and(|x| x.steps.len() <= 200 && x.focus.is_none_or(|f| f.step <= x.steps.len()))
}

fn clean_variant(v: Variant, kind: &str, keep_walk: bool) -> Result<Variant, String> {
    let (mode, _, ui) = kind_spec(kind).ok_or_else(|| tr!("неизвестный вид карточки «{kind}»", "unknown card kind \"{kind}\""))?;
    let question = text(&v.question, 2000, &tr!("Вопрос", "Question"))?;
    let code = v.code.trim_end().trim_start_matches('\n').to_string();
    if chars(&code) > 4000 {
        return Err(tr!("Код: не длиннее 4000 символов.", "Code: at most 4000 characters."));
    }
    if question.is_empty() && code.is_empty() {
        return Err(tr!("нет ни вопроса, ни кода", "no question and no code"));
    }
    let answer = text(&v.answer, 500, &tr!("Ответ", "Answer"))?;
    if answer.is_empty() {
        return Err(tr!("нет ответа", "no answer"));
    }
    let spec = CheckSpec { mode, ..CheckSpec::default() };
    let alternatives: Vec<String> = v.alternatives.iter().map(|a| text(a, 500, &tr!("Другой ответ", "Other answer"))).collect::<Result<Vec<_>, _>>()?.into_iter().filter(|a| !a.is_empty()).take(10).collect();
    for a in std::iter::once(&answer).chain(alternatives.iter()) {
        pylit::valid_expected(&spec, a)?;
    }
    let mut choices: Vec<String> = Vec::new();
    for c in &v.choices {
        let c = text(c, 300, &tr!("Вариант ответа", "Option"))?;
        if !c.is_empty() && !choices.contains(&c) {
            choices.push(c);
        }
    }
    if matches!(ui, "pick" | "choice") {
        if !choices.contains(&answer) {
            choices.insert(0, answer.clone());
        }
        if choices.len() < 2 {
            return Err(tr!("для выбора нужно хотя бы два варианта", "multiple choice needs at least two options"));
        }
        if choices.len() > 8 {
            return Err(tr!("вариантов не больше 8", "at most 8 options"));
        }
    } else {
        choices.clear();
    }
    let walk = if keep_walk { v.walk.filter(|w| valid_walk(w)) } else { None };
    Ok(Variant { code, question, answer, choices, alternatives, explain: text(&v.explain, 2000, &tr!("Пояснение", "Explanation"))?, walk })
}

fn clean_topics(topics: Vec<BankTopic>) -> Result<Vec<BankTopic>, String> {
    if topics.len() > MAX_TOPICS {
        return Err(tr!("Тем не больше {MAX_TOPICS}.", "At most {MAX_TOPICS} topics."));
    }
    let mut out: Vec<BankTopic> = Vec::new();
    for t in topics {
        let id = text(&t.id, 60, &tr!("Идентификатор темы", "Topic id"))?;
        if id.is_empty() {
            return Err(tr!("У темы нет id.", "A topic has no id."));
        }
        if out.iter().any(|x| x.id == id) {
            return Err(tr!("Тема {id} повторяется.", "Topic {id} is repeated."));
        }
        if chars(&t.theory) > 100_000 {
            return Err(tr!("Теория темы {id}: не длиннее 100000 символов.", "Theory of topic {id}: at most 100000 characters."));
        }
        let title = text(&t.title, 80, &tr!("Название темы", "Topic title"))?;
        out.push(BankTopic { title: if title.is_empty() { id.clone() } else { title }, id, theory: t.theory.trim_end().to_string() });
    }
    Ok(out)
}

fn clean_template(c: &BankCard, topics: &mut Vec<BankTopic>, seen: &mut HashSet<String>) -> Result<BankCard, String> {
    let id = text(&c.id, 60, &tr!("Идентификатор карточки", "Card id"))?;
    if id.is_empty() {
        return Err(tr!("У карточки нет id.", "A card has no id."));
    }
    if !seen.insert(id.clone()) {
        return Err(tr!("Карточка {id} повторяется.", "Card {id} is repeated."));
    }
    let kind = match c.kind.trim() {
        "" => "choice".to_string(),
        k => k.to_string(),
    };
    if kind_spec(&kind).is_none() {
        return Err(tr!("Карточка {id}: неизвестный вид «{kind}».", "Card {id}: unknown kind \"{kind}\"."));
    }
    let want = c.topic.trim();
    let topic = match topics.iter().find(|t| t.id == want || t.title == want) {
        Some(t) => t.id.clone(),
        None => {
            if topics.len() >= MAX_TOPICS || chars(want) > 60 {
                return Err(tr!("Карточка {id}: тема «{want}» не подходит.", "Card {id}: topic \"{want}\" does not fit."));
            }
            topics.push(BankTopic { id: want.into(), title: if want.is_empty() { local(NO_TOPIC) } else { want.into() }, theory: String::new() });
            want.to_string()
        }
    };
    Ok(BankCard { id, topic, kind, rule: text(&c.rule, 2000, &tr!("Правило", "Rule"))?, check: c.check.clone().map(clean_spec).transpose()?, variants: Vec::new() })
}

fn clean_meta(topics: Vec<BankTopic>, templates: &[BankCard]) -> Result<(Vec<BankTopic>, Vec<BankCard>), String> {
    if templates.len() > MAX_TEMPLATES {
        return Err(tr!("Шаблонов не больше {MAX_TEMPLATES}.", "At most {MAX_TEMPLATES} templates."));
    }
    let mut topics = clean_topics(topics)?;
    let mut seen = HashSet::new();
    let cards = templates.iter().map(|c| clean_template(c, &mut topics, &mut seen)).collect::<Result<Vec<_>, _>>()?;
    topics.retain(|t| cards.iter().any(|c| c.topic == t.id));
    Ok((topics, cards))
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneratorInput {
    pub id: Option<String>,
    pub title: String,
    pub description: String,
    pub code: String,
    pub enabled: bool,
    pub topics: Vec<BankTopic>,
    pub templates: Vec<BankCard>,
}

fn existing_gen(store: &Store, id: Option<&str>) -> Result<Option<Generator>, String> {
    match id.filter(|i| !i.is_empty()) {
        None => Ok(None),
        Some(i) => store.load_item(GENS, i).map(Some).ok_or_else(|| tr!("Генератор не найден.", "Generator not found.")),
    }
}

pub fn get_generator(store: &Store, id: &str) -> Result<Generator, String> {
    store.load_item(GENS, id).ok_or_else(|| tr!("Генератор не найден.", "Generator not found."))
}

fn fresh_id(store: &Store, wanted: &str) -> String {
    let ok = !wanted.is_empty() && wanted.len() <= 40 && wanted.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_');
    if ok && ![DECKS, BANKS, GENS].iter().any(|s| store.has_item(s, wanted)) {
        wanted.to_string()
    } else {
        uid()
    }
}

pub fn save_generator(store: &Store, at: NaiveDateTime, input: GeneratorInput, author: Author) -> Result<Generator, String> {
    let _g = store.lock();
    let wanted = input.id.clone().unwrap_or_default();
    let existing: Option<Generator> = store.load_item(GENS, &wanted);
    if existing.is_none() && deck_count(store) >= MAX_DECKS {
        return Err(tr!("Наборов не больше {MAX_DECKS}.", "At most {MAX_DECKS} decks."));
    }
    let title = text(&input.title, 80, &tr!("Название генератора", "Generator title"))?;
    if title.is_empty() {
        return Err(tr!("Дай генератору название.", "Give the generator a title."));
    }
    if input.code.trim().is_empty() {
        return Err(tr!("В генераторе нет кода.", "The generator has no code."));
    }
    if chars(&input.code) > MAX_CODE {
        return Err(tr!("Код генератора: не длиннее {MAX_CODE} символов.", "Generator code: at most {MAX_CODE} characters."));
    }
    let (topics, templates) = clean_meta(input.topics, &input.templates)?;
    let now = fmt_dt(at);
    let g = Generator {
        id: existing.as_ref().map(|g| g.id.clone()).unwrap_or_else(|| fresh_id(store, &wanted)),
        title,
        description: text(&input.description, 1000, &tr!("Описание", "Description"))?,
        author: existing.as_ref().map(|g| g.author).unwrap_or(author),
        code: input.code,
        enabled: input.enabled && !templates.is_empty(),
        topics,
        templates,
        gate: existing.as_ref().map(|g| g.gate.clone()).unwrap_or_default(),
        created_at: existing.map(|g| g.created_at).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    store.save_item(GENS, &g.id, &g)?;
    Ok(g)
}

pub fn install_generator(store: &Store, at: NaiveDateTime, id: Option<String>, title: String, description: Option<String>, code: String) -> Result<Generator, String> {
    let base: Generator = id.as_deref().and_then(|i| store.load_item(GENS, i)).unwrap_or_default();
    let input = GeneratorInput { id, title, description: description.unwrap_or(base.description), code, enabled: false, topics: base.topics, templates: base.templates };
    save_generator(store, at, input, Author::Ai)
}

pub fn disable_generator(store: &Store, id: &str) -> Result<(), String> {
    let _g = store.lock();
    let mut g = existing_gen(store, Some(id))?.ok_or_else(|| tr!("Генератор не найден.", "Generator not found."))?;
    g.enabled = false;
    store.save_item(GENS, id, &g)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenCheck {
    pub templates: usize,
    pub ready: usize,
    pub variants: usize,
    pub problems: Vec<String>,
}

pub fn check_generator(topics: Vec<BankTopic>, templates: Vec<BankCard>, made: &HashMap<String, Vec<Variant>>) -> Result<GenCheck, String> {
    if templates.is_empty() {
        return Err(tr!("В генераторе нет шаблонов: объяви plugin.templates.", "The generator has no templates: declare plugin.templates."));
    }
    let (_, cards) = clean_meta(topics, &templates)?;
    let mut problems = Vec::new();
    let (mut ready, mut variants) = (0, 0);
    for c in &cards {
        let list = made.get(&c.id).map(Vec::as_slice).unwrap_or(&[]);
        if list.is_empty() {
            note(&mut problems, tr!("{}: шаблон не дал ни одного варианта", "{}: the template gave no variants", c.id));
        }
        let mut ok = 0;
        for (i, v) in list.iter().enumerate() {
            match clean_variant(v.clone(), &c.kind, false) {
                Ok(_) => ok += 1,
                Err(e) => note(&mut problems, tr!("{}, вариант {}: {e}", "{}, variant {}: {e}", c.id, i + 1)),
            }
        }
        ready += usize::from(ok > 0);
        variants += ok;
    }
    Ok(GenCheck { templates: cards.len(), ready, variants, problems })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenSource {
    pub id: String,
    pub title: String,
    pub code: String,
    pub templates: Vec<String>,
}

pub fn gen_sources(store: &Store, preset_id: &str) -> Result<Vec<GenSource>, String> {
    let state = load_state(store);
    let preset = state.presets.iter().find(|p| p.id == preset_id).ok_or_else(|| tr!("Режим не найден.", "Mode not found."))?;
    let cat = Catalog::load(store);
    let mut out: Vec<GenSource> = Vec::new();
    for k in source_keys(&cat, &state, preset) {
        let Some(g) = cat.gens.get(&k.deck).filter(|g| g.enabled) else { continue };
        match out.iter_mut().find(|x| x.id == g.id) {
            Some(x) => x.templates.push(k.card),
            None => out.push(GenSource { id: g.id.clone(), title: g.title.clone(), code: g.code.clone(), templates: vec![k.card] }),
        }
    }
    Ok(out)
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct BankInput {
    pub id: String,
    pub title: String,
    pub description: String,
    pub gate: Option<Gate>,
    pub topics: Vec<BankTopic>,
    pub cards: Vec<BankCard>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportReport {
    pub id: String,
    pub title: String,
    pub topics: usize,
    pub cards: usize,
    pub variants: usize,
    pub dropped: usize,
    pub problems: Vec<String>,
    pub replaced: bool,
}

pub fn parse_bank(text: &str) -> Result<BankInput, String> {
    if text.len() as u64 > MAX_BANK_BYTES {
        return Err(tr!("Файл набора больше 16 МБ.", "The deck file is larger than 16 MB."));
    }
    serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|e| tr!("Файл набора не читается как JSON: {e}.", "The deck file is not valid JSON: {e}."))
}

pub fn read_bank_file(path: &str) -> Result<BankInput, String> {
    let p = Path::new(path);
    if !p.extension().is_some_and(|e| e.eq_ignore_ascii_case("json")) {
        return Err(tr!("Нужен файл .json.", "A .json file is needed."));
    }
    let len = std::fs::metadata(p).map_err(|e| tr!("Файл не найден: {e}.", "File not found: {e}."))?.len();
    if len > MAX_BANK_BYTES {
        return Err(tr!("Файл набора больше 16 МБ.", "The deck file is larger than 16 MB."));
    }
    parse_bank(&std::fs::read_to_string(p).map_err(|e| tr!("Файл не читается: {e}.", "The file can't be read: {e}."))?)
}

pub fn import_bank(store: &Store, at: NaiveDateTime, input: BankInput, replace: Option<&str>, author: Author) -> Result<ImportReport, String> {
    let _g = store.lock();
    let existing: Option<Bank> = match replace.filter(|r| !r.is_empty()) {
        Some(r) => Some(store.load_item(BANKS, r).ok_or_else(|| tr!("Набор для замены не найден.", "The deck to replace was not found."))?),
        None => None,
    };
    if existing.is_none() && deck_count(store) >= MAX_DECKS {
        return Err(tr!("Наборов не больше {MAX_DECKS}.", "At most {MAX_DECKS} decks."));
    }
    let title = text(&input.title, 80, &tr!("Название набора", "Deck title"))?;
    if title.is_empty() {
        return Err(tr!("У набора нет названия: заполни title.", "The deck has no title: fill in title."));
    }
    if input.cards.len() > MAX_CARDS {
        return Err(tr!("В наборе не больше {MAX_CARDS} карточек.", "A deck holds at most {MAX_CARDS} cards."));
    }
    let mut topics = clean_topics(input.topics)?;
    let mut seen = HashSet::new();
    let mut problems = Vec::new();
    let (mut dropped, mut total, mut overflow) = (0, 0, false);
    let mut cards = Vec::new();
    for c in input.cards {
        let mut card = match clean_template(&c, &mut topics, &mut seen) {
            Ok(x) => x,
            Err(e) => {
                dropped += c.variants.len();
                note(&mut problems, e);
                continue;
            }
        };
        for (i, v) in c.variants.into_iter().enumerate() {
            if card.variants.len() >= MAX_VARIANTS || total >= MAX_BANK_VARIANTS {
                dropped += 1;
                overflow = true;
                continue;
            }
            match clean_variant(v, &card.kind, true) {
                Ok(v) => {
                    card.variants.push(v);
                    total += 1;
                }
                Err(e) => {
                    dropped += 1;
                    note(&mut problems, tr!("{}, вариант {}: {e}", "{}, variant {}: {e}", card.id, i + 1));
                }
            }
        }
        if card.variants.is_empty() {
            note(&mut problems, tr!("{}: не осталось ни одного варианта", "{}: no variants left", card.id));
            continue;
        }
        cards.push(card);
    }
    if overflow {
        note(&mut problems, tr!("Часть вариантов не вошла: не больше {MAX_VARIANTS} на карточку и {MAX_BANK_VARIANTS} на набор.", "Some variants were left out: at most {MAX_VARIANTS} per card and {MAX_BANK_VARIANTS} per deck."));
    }
    if cards.is_empty() {
        return Err(tr!("В наборе нет ни одной рабочей карточки. {}", "The deck has no working cards. {}", problems.join(" ")));
    }
    topics.retain(|t| cards.iter().any(|c| c.topic == t.id));
    let now = fmt_dt(at);
    let gate = input.gate.or_else(|| existing.as_ref().map(|b| b.gate.clone())).unwrap_or_default();
    let b = Bank {
        id: existing.as_ref().map(|b| b.id.clone()).unwrap_or_else(|| fresh_id(store, &input.id)),
        title,
        description: text(&input.description, 1000, &tr!("Описание", "Description"))?,
        author: existing.as_ref().map(|b| b.author).unwrap_or(author),
        gate: clean_gate(gate),
        topics,
        cards,
        created_at: existing.as_ref().map(|b| b.created_at.clone()).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    store.save_item_compact(BANKS, &b.id, &b)?;
    Ok(ImportReport { id: b.id.clone(), title: b.title.clone(), topics: b.topics.len(), cards: b.cards.len(), variants: total, dropped, problems, replaced: existing.is_some() })
}

pub fn reset_progress(store: &Store, deck: &str) -> Result<(), String> {
    let _g = store.lock();
    let mut state = load_state(store);
    let prefix = format!("{deck}:");
    let tprefix = format!("{deck}#");
    state.progress.retain(|k, _| !k.starts_with(&prefix));
    state.topics.retain(|k, _| !k.starts_with(&tprefix));
    save_state(store, &state)
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Article {
    pub id: String,
    pub deck: String,
    #[serde(default)]
    pub topic: String,
    pub title: String,
    #[serde(default)]
    pub body: String,
    #[serde(default)]
    pub author: Author,
    #[serde(default)]
    pub builtin: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct ArticleInput {
    pub id: Option<String>,
    pub deck: String,
    pub topic: String,
    pub title: String,
    pub body: String,
}

fn bank_articles(cat: &Catalog) -> Vec<Article> {
    let mut banks: Vec<&Arc<Bank>> = cat.banks.values().collect();
    banks.sort_by_key(|b| (b.created_at.clone(), b.id.clone()));
    banks
        .into_iter()
        .flat_map(|b| {
            b.topics.iter().filter(|t| !t.theory.is_empty()).map(move |t| Article {
                id: format!("{}-{}", b.id, t.id),
                deck: b.id.clone(),
                topic: t.id.clone(),
                title: t.title.clone(),
                body: t.theory.clone(),
                author: b.author,
                builtin: true,
                created_at: String::new(),
                updated_at: String::new(),
            })
        })
        .collect()
}

pub fn articles(store: &Store) -> Vec<Article> {
    let mut out = bank_articles(&Catalog::load(store));
    let mut own: Vec<Article> = store.list_items(THEORY);
    own.sort_by(|a, b| a.created_at.cmp(&b.created_at).then_with(|| a.id.cmp(&b.id)));
    out.extend(own);
    out
}

pub fn topic_articles(store: &Store, deck: &str, topic: &str) -> Vec<Article> {
    let mut list: Vec<Article> = articles(store).into_iter().filter(|a| a.deck == deck && (a.topic == topic || a.topic.is_empty())).collect();
    list.sort_by_key(|a| (a.topic != topic, !a.builtin));
    list
}

pub fn save_article(store: &Store, at: NaiveDateTime, input: ArticleInput, author: Author) -> Result<Article, String> {
    let cat = Catalog::load(store);
    let topics = cat.topics(&input.deck).ok_or_else(|| tr!("Набор не найден.", "Deck not found."))?;
    let topic = input.topic.trim().to_string();
    let topic = topics.iter().find(|(id, title)| *id == topic || *title == topic).map(|(id, _)| id.clone()).unwrap_or(topic);
    if !topic.is_empty() && !topics.iter().any(|(id, _)| *id == topic) {
        return Err(tr!("В наборе нет темы «{topic}».", "The deck has no topic \"{topic}\"."));
    }
    let title = text(&input.title, 120, &tr!("Заголовок", "Title"))?;
    if title.is_empty() {
        return Err(tr!("Дай статье заголовок.", "Give the article a title."));
    }
    if chars(&input.body) > 100_000 {
        return Err(tr!("Статья: не длиннее 100000 символов.", "Article: at most 100000 characters."));
    }
    let _g = store.lock();
    let existing: Option<Article> = match input.id.as_deref().filter(|i| !i.is_empty()) {
        Some(i) if bank_articles(&cat).iter().any(|a| a.id == i) => return Err(tr!("Статью из набора менять нельзя, добавь свою.", "An article from the deck can't be changed, add your own.")),
        Some(i) => Some(store.load_item(THEORY, i).ok_or_else(|| tr!("Статья не найдена.", "Article not found."))?),
        None => None,
    };
    let now = fmt_dt(at);
    let a = Article {
        id: existing.as_ref().map(|e| e.id.clone()).unwrap_or_else(uid),
        deck: input.deck,
        topic,
        title,
        body: input.body.trim_end().to_string(),
        author: existing.as_ref().map(|e| e.author).unwrap_or(author),
        builtin: false,
        created_at: existing.as_ref().map(|e| e.created_at.clone()).unwrap_or_else(|| now.clone()),
        updated_at: now,
    };
    store.save_item(THEORY, &a.id, &a)?;
    Ok(a)
}

pub fn delete_article(store: &Store, id: &str) -> Result<(), String> {
    if bank_articles(&Catalog::load(store)).iter().any(|a| a.id == id) {
        return Err(tr!("Статью из набора удалить нельзя.", "An article from the deck can't be deleted."));
    }
    let _g = store.lock();
    store.delete_item(THEORY, id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_store(name: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("nd-drill-{name}-{}", uid()));
        Store::open(dir).unwrap()
    }

    fn at(s: &str) -> NaiveDateTime {
        parse_dt(s).unwrap()
    }

    fn user_deck(store: &Store) -> Deck {
        let cards = (0..4)
            .map(|i| CardInput { topic: if i < 2 { "A".into() } else { "B".into() }, prompt: format!("q{i}"), answer: format!("a{i}"), ..Default::default() })
            .collect();
        save_deck(store, at("2026-10-16T10:00:00"), DeckInput { title: "Слова".into(), cards, ..Default::default() }, Author::User).unwrap()
    }

    fn code_bank(store: &Store) -> String {
        let walk = json!({ "steps": [[1, null, [["x", "1", "int"]]]], "focus": { "step": 1, "line": 1, "inputs": [], "target": "x" }, "error": null });
        let card = |id: String, topic: &str, n: usize| {
            let variants: Vec<Value> = (0..3).map(|k| json!({ "code": format!("x = {}", n + k), "question": "What is in `x`?", "answer": (n + k).to_string(), "walk": walk })).collect();
            json!({ "id": id, "topic": topic, "kind": "value", "rule": format!("rule {n}"), "variants": variants })
        };
        let cards: Vec<Value> = (0..16).map(|i| card(format!("c{i}"), if i < 12 { "t01" } else { "t02" }, i * 10)).collect();
        let input: BankInput = serde_json::from_value(json!({
            "id": "python",
            "title": "Code",
            "gate": { "enabled": true, "percent": 85, "window": 20 },
            "topics": [{ "id": "t01", "title": "One", "theory": "## One" }, { "id": "t02", "title": "Two" }],
            "cards": cards
        }))
        .unwrap();
        import_bank(store, at("2026-10-16T09:00:00"), input, None, Author::User).unwrap().id
    }

    #[test]
    fn session_until_ten_correct_with_retry() {
        let store = tmp_store("ten");
        let t0 = at("2026-10-16T10:00:00");
        code_bank(&store);
        let mut s = start(&store, t0, "lock", Generated::new()).unwrap();
        let mut answered = 0;
        while s.ended.is_none() && answered < 100 {
            let slot = s.current.clone().unwrap();
            let r = resolve(&s.catalog, &slot).unwrap();
            let text = if answered % 3 == 0 { "definitely wrong".to_string() } else { r.shown.clone() };
            let v = answer(&store, &mut s, t0 + Duration::seconds(answered as i64 * 10), AnswerInput { text: Some(text), knew: None }).unwrap();
            assert_eq!(v.correct, answered % 3 != 0);
            if !v.correct {
                assert!(v.walk.is_some());
                assert!(!v.explain.is_empty());
            }
            answered += 1;
        }
        let rec = s.ended.clone().unwrap();
        assert_eq!(rec.outcome, Outcome::Done);
        assert_eq!(rec.correct, 10);
        assert!(rec.wrong >= 4);
        let st = load_state(&store);
        assert_eq!(st.sessions.len(), 1);
        assert!(st.progress.values().any(|p| p.level == 1 && p.wrong > 0));
        assert!(st.progress.values().any(|p| p.level == 2));
        let ov = overview(&store, t0 + Duration::minutes(30));
        assert_eq!(ov.streak, 1);
        assert_eq!(ov.today.sessions, 1);
        assert!(!ov.weak.is_empty());
    }

    #[test]
    fn leitner_boxes_and_due_dates() {
        let store = tmp_store("leitner");
        let deck = user_deck(&store);
        let p = save_preset(&store, Preset { name: "t".into(), sources: vec![Source { deck: deck.id.clone(), topics: vec![] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 1, retry: false, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        let day1 = at("2026-10-16T10:00:00");
        let mut s = start(&store, day1, &p.id, Generated::new()).unwrap();
        let first = s.current.clone().unwrap().key;
        answer(&store, &mut s, day1, AnswerInput { text: Some("a0".into()), knew: None }).unwrap();
        let st = load_state(&store);
        let pr = &st.progress[&first.id()];
        assert_eq!(pr.level, 2);
        assert_eq!(pr.due, "2026-10-17");
        let mut s = start(&store, day1, &p.id, Generated::new()).unwrap();
        let second = s.current.clone().unwrap().key;
        assert_ne!(second, first);
        answer(&store, &mut s, day1, AnswerInput { text: Some("nope".into()), knew: None }).unwrap();
        let st = load_state(&store);
        assert_eq!(st.progress[&second.id()].level, 1);
        assert_eq!(st.progress[&second.id()].due, "2026-10-16");
    }

    #[test]
    fn smart_order_puts_due_and_new_first() {
        let store = tmp_store("smart");
        let deck = user_deck(&store);
        let mut st = load_state(&store);
        let today = parse_date("2026-10-16").unwrap();
        let ids: Vec<String> = deck.cards.iter().map(|c| pkey(&deck.id, &c.id)).collect();
        st.progress.insert(ids[0].clone(), CardProgress { level: 4, due: "2026-10-20".into(), ..Default::default() });
        st.progress.insert(ids[1].clone(), CardProgress { level: 1, due: "2026-10-16".into(), ..Default::default() });
        let cat = Catalog::load(&store);
        let preset = Preset { sources: vec![Source { deck: deck.id.clone(), topics: vec![] }], ..Preset::default() };
        let keys = candidates(&cat, &st, &preset);
        assert_eq!(keys.len(), 4);
        let order = ordered(&st, &preset, keys, today, &mut Rng::seeded(5));
        assert_eq!(order.last().unwrap().id(), ids[0]);
        assert_eq!(order[0].id(), ids[1]);
    }

    #[test]
    fn topics_open_by_accuracy() {
        let store = tmp_store("gate");
        let t0 = at("2026-10-16T10:00:00");
        let id = code_bank(&store);
        assert_eq!(id, "python");
        assert_ne!(code_bank(&store), "python");
        let mut st = load_state(&store);
        let cat = Catalog::load(&store);
        let topics = cat.topics(&id).unwrap();
        let gate = cat.gate(&id);
        assert_eq!(topic_open(&st, &id, &topics, &gate), vec![topics[0].0.clone()]);
        st.topics.entry(tkey(&id, &topics[0].0)).or_default().recent = [vec![true; 16], vec![false; 4]].concat();
        assert_eq!(advance(&mut st, &id, &topics, &gate, t0), None);
        st.topics.get_mut(&tkey(&id, &topics[0].0)).unwrap().recent = [vec![false; 3], vec![true; 17]].concat();
        assert_eq!(advance(&mut st, &id, &topics, &gate, t0), Some(topics[1].1.clone()));
        let preset = Preset::default();
        let keys = candidates(&cat, &st, &preset);
        assert!(!keys.is_empty());
        assert!(keys.iter().all(|k| k.topic == topics[0].0 || k.topic == topics[1].0));
        let last = topics.last().unwrap().0.clone();
        let picked = Preset { sources: vec![Source { deck: id.clone(), topics: vec![last.clone()] }], ..Preset::default() };
        let keys = candidates(&cat, &st, &picked);
        assert!(!keys.is_empty());
        assert!(keys.iter().all(|k| k.topic == last));
    }

    #[test]
    fn escape_breaks_streak_and_timeout_does_not_count() {
        let mut st = DrillState::default();
        let rec = |day: &str, outcome: Outcome| SessionRecord {
            id: uid(),
            preset: "p".into(),
            name: "p".into(),
            started_at: format!("{day}T10:00:00"),
            ended_at: format!("{day}T10:10:00"),
            outcome,
            screen: Screen::Lock,
            goal: GoalKind::Correct,
            amount: 10,
            answered: 10,
            correct: 10,
            first_try: 10,
            wrong: 0,
            seconds: 600,
            misses: vec![],
            hinted: 0,
        };
        st.sessions = vec![rec("2026-10-13", Outcome::Done), rec("2026-10-14", Outcome::Done), rec("2026-10-15", Outcome::Done), rec("2026-10-16", Outcome::Timeout)];
        let today = parse_date("2026-10-16").unwrap();
        assert_eq!(streaks(&st, 0, today), (3, 3));
        st.sessions.push(rec("2026-10-16", Outcome::Escape));
        assert_eq!(streaks(&st, 0, today).0, 0);
        let mut later = rec("2026-10-16", Outcome::Done);
        later.ended_at = "2026-10-16T11:00:00".into();
        st.sessions.push(later);
        assert_eq!(streaks(&st, 0, today).0, 1);
    }

    #[test]
    fn self_check_and_choice_cards() {
        let store = tmp_store("modes");
        let cards = vec![
            CardInput { prompt: "Столица Франции?".into(), answer: "Париж".into(), choices: vec!["Лион".into(), "Ницца".into()], check: Some(CheckSpec { mode: Mode::Choice, ..Default::default() }), ..Default::default() },
            CardInput { prompt: "Формула".into(), answer: "E = mc^2".into(), check: Some(CheckSpec { mode: Mode::SelfCheck, ..Default::default() }), ..Default::default() },
        ];
        let deck = save_deck(&store, at("2026-10-16T10:00:00"), DeckInput { title: "Смесь".into(), cards, ..Default::default() }, Author::Ai).unwrap();
        assert_eq!(deck.cards[0].choices.len(), 3);
        let p = save_preset(&store, Preset { name: "m".into(), sources: vec![Source { deck: deck.id.clone(), topics: vec![] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 2, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        let t0 = at("2026-10-16T10:00:00");
        let mut s = start(&store, t0, &p.id, Generated::new()).unwrap();
        let v = view(&s, t0);
        let card = v.card.unwrap();
        assert_eq!(card.mode, "choice");
        assert_eq!(card.choices.len(), 3);
        let r = answer(&store, &mut s, t0, AnswerInput { text: Some("Париж".into()), knew: None }).unwrap();
        assert!(r.correct);
        assert_eq!(r.session.card.as_ref().unwrap().mode, "self");
        assert!(answer(&store, &mut s, t0, AnswerInput { text: None, knew: None }).is_err());
        reveal(&mut s).unwrap();
        assert!(view(&s, t0).card.unwrap().revealed.is_some());
        let r = answer(&store, &mut s, t0, AnswerInput { text: None, knew: Some(false) }).unwrap();
        assert!(!r.correct);
        assert_eq!(s.ended.as_ref().unwrap().answered, 2);
    }

    #[test]
    fn deck_validation_and_edit() {
        let store = tmp_store("deck");
        let bad = DeckInput { title: "x".into(), check: CheckSpec { mode: Mode::Python, ..Default::default() }, cards: vec![CardInput { prompt: "?".into(), answer: "[1, 2".into(), ..Default::default() }], ..Default::default() };
        assert!(save_deck(&store, at("2026-10-16T10:00:00"), bad, Author::User).is_err());
        let d = user_deck(&store);
        let keep = d.cards[1].id.clone();
        let e = edit_deck(
            &store,
            at("2026-10-16T11:00:00"),
            &d.id,
            DeckPatch { title: Some("Новое".into()), remove: vec![d.cards[0].id.clone()], upsert: vec![CardInput { id: Some(keep.clone()), prompt: "q1x".into(), answer: "a1".into(), ..Default::default() }, CardInput { prompt: "new".into(), answer: "n".into(), ..Default::default() }], ..Default::default() },
        )
        .unwrap();
        assert_eq!(e.title, "Новое");
        assert_eq!(e.cards.len(), 4);
        assert_eq!(e.cards[0].id, keep);
        assert_eq!(e.cards[0].prompt, "q1x");
        assert_eq!(e.created_at, d.created_at);
        delete_deck(&store, &d.id).unwrap();
        assert!(user_decks(&store).is_empty());
        assert!(delete_deck(&store, "nope").is_err());
    }

    #[test]
    fn lock_ceiling_times_out() {
        let store = tmp_store("ceiling");
        let t0 = at("2026-10-16T10:00:00");
        assert!(start(&store, t0, "lock", Generated::new()).is_err());
        code_bank(&store);
        let mut s = start(&store, t0, "lock", Generated::new()).unwrap();
        assert!(tick(&store, &mut s, t0 + Duration::minutes(29)).is_none());
        let rec = tick(&store, &mut s, t0 + Duration::minutes(30)).unwrap();
        assert_eq!(rec.outcome, Outcome::Timeout);
        assert!(s.current.is_none());
    }

    #[test]
    fn theory_articles_and_hints() {
        let store = tmp_store("theory");
        let t0 = at("2026-10-16T10:00:00");
        let d = user_deck(&store);
        assert!(save_article(&store, t0, ArticleInput { deck: d.id.clone(), topic: "нет такой".into(), title: "x".into(), body: "y".into(), ..Default::default() }, Author::Ai).is_err());
        let a = save_article(&store, t0, ArticleInput { deck: d.id.clone(), topic: "A".into(), title: "Модель".into(), body: "# Заголовок\n```data\n[1, 2]\n```".into(), ..Default::default() }, Author::Ai).unwrap();
        assert_eq!(a.author, Author::Ai);
        let b = save_article(&store, t0, ArticleInput { deck: d.id.clone(), topic: String::new(), title: "Обо всём".into(), body: String::new(), ..Default::default() }, Author::User).unwrap();
        let edited = save_article(&store, at("2026-10-16T11:00:00"), ArticleInput { id: Some(a.id.clone()), deck: d.id.clone(), topic: "A".into(), title: "Модель 2".into(), body: "z".into() }, Author::User).unwrap();
        assert_eq!(edited.author, Author::Ai);
        assert_eq!(edited.created_at, a.created_at);
        let list = topic_articles(&store, &d.id, "A");
        assert_eq!(list.iter().map(|x| x.id.clone()).collect::<Vec<_>>(), vec![a.id.clone(), b.id.clone()]);
        assert!(topic_articles(&store, &d.id, "B").iter().all(|x| x.topic.is_empty()));
        let bank = code_bank(&store);
        assert!(delete_article(&store, &format!("{bank}-t01")).is_err());
        let p = save_preset(&store, Preset { name: "h".into(), sources: vec![Source { deck: d.id.clone(), topics: vec![] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 2, retry: false, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        assert_eq!(p.theory_label, "Теория");
        let mut s = start(&store, t0, &p.id, Generated::new()).unwrap();
        let first = s.current.clone().unwrap().key;
        assert_eq!(hint(&mut s), Some((d.id.clone(), first.topic.clone())));
        let r = answer(&store, &mut s, t0, AnswerInput { text: Some("a0".into()), knew: None }).unwrap();
        assert!(r.correct && r.hinted);
        let st = load_state(&store);
        assert_eq!(st.progress[&first.id()].level, 1);
        assert_eq!(st.progress[&first.id()].due, "2026-10-16");
        assert_eq!(st.topics[&tkey(&d.id, "A")].recent, vec![false]);
        assert_eq!(s.first_try, 0);
        delete_deck(&store, &d.id).unwrap();
        assert!(articles(&store).iter().all(|x| x.deck != d.id));
    }

    #[test]
    fn generator_sessions_use_fresh_variants() {
        let store = tmp_store("gen");
        let t0 = at("2026-10-16T10:00:00");
        let tpl = |id: &str, kind: &str| BankCard { id: id.into(), topic: "Оси".into(), kind: kind.into(), rule: "Сумма по оси убирает ось.".into(), ..Default::default() };
        let g = install_generator(&store, t0, None, "Формы".into(), None, "const plugin = {};".into()).unwrap();
        assert!(!g.enabled);
        let input = GeneratorInput { id: Some(g.id.clone()), title: "Формы".into(), code: "const plugin = {};".into(), enabled: true, templates: vec![tpl("sum", "pick"), tpl("word", "text")], ..Default::default() };
        let g = save_generator(&store, t0, input, Author::User).unwrap();
        assert!(g.enabled);
        assert_eq!(g.author, Author::Ai);
        assert_eq!(g.topics.len(), 1);
        let p = save_preset(&store, Preset { name: "g".into(), sources: vec![Source { deck: g.id.clone(), topics: vec![] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 3, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        let src = gen_sources(&store, &p.id).unwrap();
        assert_eq!(src.len(), 1);
        assert_eq!(src[0].templates, vec!["sum".to_string(), "word".to_string()]);
        assert!(start(&store, t0, &p.id, Generated::new()).is_err());
        let pick = |n: usize| Variant {
            question: "Какой будет `y.shape`?".into(),
            code: format!("y = np.zeros(({n}, 3)).sum(axis=0)"),
            answer: "(3,)".into(),
            choices: vec![format!("({n},)"), "(3,)".into(), "(1, 3)".into(), format!("({n}, 3)")],
            explain: format!("({n}, 3) -> (3,)"),
            ..Default::default()
        };
        let broken = Variant { question: "?".into(), ..Default::default() };
        let made = HashMap::from([("sum".to_string(), vec![pick(2), pick(4), pick(5), broken]), ("word".to_string(), vec![Variant { question: "go?".into(), answer: "went".into(), ..Default::default() }])]);
        let check = check_generator(g.topics.clone(), g.templates.clone(), &made).unwrap();
        assert_eq!((check.templates, check.ready, check.variants, check.problems.len()), (2, 2, 4, 1));
        let mut s = start(&store, t0, &p.id, HashMap::from([(g.id.clone(), made)])).unwrap();
        let v = view(&s, t0).card.unwrap();
        assert_eq!(v.mode, "pick");
        assert_eq!(v.choices.len(), 4);
        let first = s.current.clone().unwrap();
        let r = answer(&store, &mut s, t0, AnswerInput { text: Some("(9,)".into()), knew: None }).unwrap();
        assert!(!r.correct);
        assert!(r.explain.contains("Сумма по оси") && r.explain.contains("-> (3,)"));
        let again = s.queue.iter().find(|x| x.key == first.key).unwrap();
        assert!(again.retry);
        assert_ne!(again.variant, first.variant);
        let ov = overview(&store, t0);
        assert_eq!(ov.weak[0].code, s.catalog.card(&first.key).unwrap().variants[first.variant].code);
        let d = ov.decks.iter().find(|d| d.id == g.id).unwrap();
        assert_eq!((d.kind, d.enabled, d.cards), (DeckKind::Generator, true, 2));
        disable_generator(&store, &g.id).unwrap();
        assert!(gen_sources(&store, &p.id).unwrap().is_empty());
        let named = save_generator(&store, t0, GeneratorInput { id: Some("shapes".into()), title: "x".into(), code: "y".into(), ..Default::default() }, Author::User).unwrap();
        assert_eq!(named.id, "shapes");
        delete_deck(&store, &g.id).unwrap();
        assert!(!Catalog::load(&store).gens.contains_key(&g.id));
    }

    #[test]
    fn imported_bank_plays_and_reimports() {
        let store = tmp_store("bank");
        let t0 = at("2026-10-16T10:00:00");
        let input = BankInput {
            title: "Глаголы".into(),
            topics: vec![BankTopic { id: "irr".into(), title: "Неправильные".into(), theory: "Модель".into() }],
            cards: vec![BankCard {
                id: "past".into(),
                topic: "irr".into(),
                kind: "text".into(),
                rule: "Past Simple".into(),
                variants: (0..3).map(|i| Variant { question: format!("v{i}?"), answer: format!("a{i}"), ..Default::default() }).collect(),
                ..Default::default()
            }],
            ..Default::default()
        };
        let r = import_bank(&store, t0, input.clone(), None, Author::User).unwrap();
        assert_eq!((r.cards, r.variants, r.dropped, r.replaced), (1, 3, 0, false));
        let p = save_preset(&store, Preset { name: "b".into(), sources: vec![Source { deck: r.id.clone(), topics: vec!["Неправильные".into()] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 1, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        let mut s = start(&store, t0, &p.id, Generated::new()).unwrap();
        let slot = s.current.clone().unwrap();
        let shown = resolve(&s.catalog, &slot).unwrap().shown;
        assert!(answer(&store, &mut s, t0, AnswerInput { text: Some(shown), knew: None }).unwrap().correct);
        assert_eq!(load_state(&store).progress[&slot.key.id()].last_variant, Some(slot.variant));
        assert!(articles(&store).iter().any(|a| a.deck == r.id && a.builtin));
        assert!(delete_article(&store, &format!("{}-irr", r.id)).is_err());
        set_gate(&store, &r.id, Gate { enabled: true, percent: 90, window: 10 }).unwrap();
        let again = import_bank(&store, t0, input, Some(&r.id), Author::Ai).unwrap();
        assert!(again.replaced);
        let ov = overview(&store, t0);
        let d = ov.decks.iter().find(|d| d.id == r.id).unwrap();
        assert_eq!((d.kind, d.variants, d.gate.percent, d.author), (DeckKind::Bank, 3, 90, Author::User));
        assert!(import_bank(&store, t0, BankInput { title: "x".into(), ..Default::default() }, None, Author::User).is_err());
        delete_deck(&store, &r.id).unwrap();
        assert!(!Catalog::load(&store).banks.contains_key(&r.id));
    }

    #[test]
    fn check_templates_group_and_feed_decks() {
        let store = tmp_store("checks");
        let t0 = at("2026-10-16T10:00:00");
        let st = load_state(&store);
        assert_eq!(st.checks.len(), 6);
        assert_eq!(st.checks[4].group, "Для программистов");
        let word = CheckTemplate { group: "Языки".into(), name: "Английское слово".into(), check: CheckSpec { hint: "в начальной форме".into(), ..CheckSpec::default() }, ..Default::default() };
        let word = save_check(&store, word).unwrap();
        assert_eq!(load_state(&store).checks.last().unwrap().id, word.id);
        let num = CheckTemplate { group: "Основные".into(), name: "Число с допуском".into(), check: CheckSpec { mode: Mode::Number, tolerance: 0.5, ..CheckSpec::default() }, ..Default::default() };
        let num = save_check(&store, num).unwrap();
        assert_eq!(load_state(&store).checks.iter().position(|c| c.id == num.id), Some(4));
        let cards = vec![
            CardInput { prompt: "go?".into(), answer: "went".into(), ..Default::default() },
            CardInput { prompt: "pi?".into(), answer: "3.14".into(), template: Some(num.id.clone()), ..Default::default() },
        ];
        let deck = save_deck(&store, t0, DeckInput { title: "Слова".into(), template: Some("английское слово".into()), cards, ..Default::default() }, Author::User).unwrap();
        assert_eq!(deck.check.hint, "в начальной форме");
        assert_eq!(deck.cards[1].check.as_ref().unwrap().tolerance, 0.5);
        let bad = DeckInput { title: "x".into(), template: Some("нет такого".into()), cards: vec![CardInput { prompt: "q".into(), answer: "a".into(), ..Default::default() }], ..Default::default() };
        assert!(save_deck(&store, t0, bad, Author::User).is_err());
        let p = save_preset(&store, Preset { name: "s".into(), sources: vec![Source { deck: deck.id.clone(), topics: vec![] }], order: Order::Sequence, goal: GoalKind::Cards, amount: 1, screen: Screen::Window, ..Preset::default() }, false).unwrap();
        let s = start(&store, t0, &p.id, Generated::new()).unwrap();
        assert_eq!(view(&s, t0).card.unwrap().hint, "в начальной форме");
        assert_eq!(delete_check(&store, None, Some("Для программистов")).unwrap(), 2);
        assert!(delete_check(&store, Some("nope"), None).is_err());
        assert_eq!(reset_checks(&store).unwrap(), 2);
        assert_eq!(load_state(&store).checks.len(), 8);
        delete_check(&store, Some(&word.id), None).unwrap();
        assert_eq!(load_state(&store).checks.len(), 7);
        assert_eq!(overview(&store, t0).checks.len(), 7);
    }

    #[test]
    fn relabel_switches_untouched_default_names() {
        let store = tmp_store("relabel");
        let mut st = load_state(&store);
        st.checks[1].name = "Мой выбор".into();
        st.checks.push(CheckTemplate { id: "x".into(), group: "Свои".into(), name: "Слово".into(), ..Default::default() });
        save_state(&store, &st).unwrap();
        relabel(&store, "en").unwrap();
        let st = load_state(&store);
        assert_eq!(st.presets[0].name, "Lock: 10 right");
        assert_eq!(st.presets[1].theory_label, "Theory");
        assert_eq!((st.checks[0].group.as_str(), st.checks[0].name.as_str()), ("Basic", "Text"));
        assert_eq!(st.checks[1].name, "Мой выбор");
        assert_eq!((st.checks[6].group.as_str(), st.checks[6].name.as_str()), ("Custom", "Слово"));
        relabel(&store, "ru").unwrap();
        let st = load_state(&store);
        assert_eq!(st.presets[0].name, "Замок: 10 верных");
        assert_eq!(st.checks[4].group, "Для программистов");
    }
}
