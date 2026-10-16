use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq)]
pub enum Py {
    None,
    Bool(bool),
    Int(String),
    Float(f64),
    Str(String),
    List(Vec<Py>),
    Tuple(Vec<Py>),
    Dict(Vec<(Py, Py)>),
    Set(Vec<Py>),
    Name(String),
}

struct Parser {
    s: Vec<char>,
    i: usize,
}

fn is_ident_start(c: char) -> bool {
    c == '_' || c.is_alphabetic()
}

fn is_ident(c: char) -> bool {
    c == '_' || c.is_alphanumeric()
}

impl Parser {
    fn peek(&self) -> Option<char> {
        self.s.get(self.i).copied()
    }

    fn skip(&mut self) {
        while self.peek().is_some_and(char::is_whitespace) {
            self.i += 1;
        }
    }

    fn eat(&mut self, c: char) -> bool {
        self.skip();
        if self.peek() == Some(c) {
            self.i += 1;
            true
        } else {
            false
        }
    }

    fn expect(&mut self, c: char) -> Result<(), String> {
        if self.eat(c) {
            Ok(())
        } else {
            Err(format!("ожидался символ {c}"))
        }
    }

    fn value(&mut self, depth: usize) -> Result<Py, String> {
        if depth > 64 {
            return Err("слишком глубокая вложенность".into());
        }
        self.skip();
        match self.peek() {
            None => Err("ответ оборвался".into()),
            Some('[') => {
                self.i += 1;
                let (items, _) = self.items(']', depth)?;
                Ok(Py::List(items))
            }
            Some('(') => {
                self.i += 1;
                let (items, comma) = self.items(')', depth)?;
                if items.len() == 1 && !comma {
                    Ok(items.into_iter().next().unwrap_or(Py::None))
                } else {
                    Ok(Py::Tuple(items))
                }
            }
            Some('{') => {
                self.i += 1;
                self.braces(depth)
            }
            Some('\'') | Some('"') => self.string(),
            Some(c) if c == '-' || c == '+' => {
                self.i += 1;
                let v = self.value(depth + 1)?;
                match (c, v) {
                    ('+', v @ (Py::Int(_) | Py::Float(_))) => Ok(v),
                    ('-', Py::Int(d)) => Ok(Py::Int(neg(&d))),
                    ('-', Py::Float(f)) => Ok(Py::Float(-f)),
                    _ => Err("знак можно ставить только перед числом".into()),
                }
            }
            Some(c) if c.is_ascii_digit() || c == '.' => self.number(),
            Some(c) if is_ident_start(c) => self.word(depth),
            Some(c) => Err(format!("непонятный символ {c}")),
        }
    }

    fn items(&mut self, close: char, depth: usize) -> Result<(Vec<Py>, bool), String> {
        let mut out = Vec::new();
        let mut comma = false;
        loop {
            if self.eat(close) {
                return Ok((out, comma));
            }
            out.push(self.value(depth + 1)?);
            if self.eat(',') {
                comma = true;
                continue;
            }
            self.expect(close)?;
            return Ok((out, comma));
        }
    }

    fn braces(&mut self, depth: usize) -> Result<Py, String> {
        if self.eat('}') {
            return Ok(Py::Dict(Vec::new()));
        }
        let first = self.value(depth + 1)?;
        if self.eat(':') {
            let mut pairs = vec![(first, self.value(depth + 1)?)];
            while self.eat(',') {
                if self.eat('}') {
                    return Ok(Py::Dict(pairs));
                }
                let k = self.value(depth + 1)?;
                self.expect(':')?;
                pairs.push((k, self.value(depth + 1)?));
            }
            self.expect('}')?;
            return Ok(Py::Dict(pairs));
        }
        let mut items = vec![first];
        while self.eat(',') {
            if self.eat('}') {
                return Ok(Py::Set(items));
            }
            items.push(self.value(depth + 1)?);
        }
        self.expect('}')?;
        Ok(Py::Set(items))
    }

    fn word(&mut self, depth: usize) -> Result<Py, String> {
        let start = self.i;
        while self.peek().is_some_and(is_ident) {
            self.i += 1;
        }
        let w: String = self.s[start..self.i].iter().collect();
        match w.as_str() {
            "True" => Ok(Py::Bool(true)),
            "False" => Ok(Py::Bool(false)),
            "None" => Ok(Py::None),
            "set" | "frozenset" if self.eat('(') => {
                if self.eat(')') {
                    return Ok(Py::Set(Vec::new()));
                }
                let inner = self.value(depth + 1)?;
                self.expect(')')?;
                match inner {
                    Py::List(v) | Py::Tuple(v) | Py::Set(v) => Ok(Py::Set(v)),
                    Py::Dict(v) if v.is_empty() => Ok(Py::Set(Vec::new())),
                    Py::Str(s) => Ok(Py::Set(dedupe(s.chars().map(|c| Py::Str(c.to_string())).collect()))),
                    _ => Err("set() понимает только список, кортеж или строку".into()),
                }
            }
            _ => Ok(Py::Name(w)),
        }
    }

    fn number(&mut self) -> Result<Py, String> {
        let start = self.i;
        let mut float = false;
        while let Some(c) = self.peek() {
            if c.is_ascii_digit() || c == '_' {
                self.i += 1;
            } else if c == '.' {
                float = true;
                self.i += 1;
            } else if c == 'e' || c == 'E' {
                float = true;
                self.i += 1;
                if matches!(self.peek(), Some('+') | Some('-')) {
                    self.i += 1;
                }
            } else {
                break;
            }
        }
        let raw: String = self.s[start..self.i].iter().filter(|c| **c != '_').collect();
        if float {
            raw.parse::<f64>().map(Py::Float).map_err(|_| format!("непонятное число {raw}"))
        } else {
            if raw.is_empty() || !raw.chars().all(|c| c.is_ascii_digit()) {
                return Err(format!("непонятное число {raw}"));
            }
            Ok(Py::Int(canon_int(&raw)))
        }
    }

    fn string(&mut self) -> Result<Py, String> {
        let q = self.peek().unwrap_or('\'');
        self.i += 1;
        let mut out = String::new();
        loop {
            let Some(c) = self.peek() else {
                return Err("строка не закрыта кавычкой".into());
            };
            self.i += 1;
            if c == q {
                return Ok(Py::Str(out));
            }
            if c != '\\' {
                out.push(c);
                continue;
            }
            let Some(e) = self.peek() else {
                return Err("строка оборвалась после \\".into());
            };
            self.i += 1;
            match e {
                'n' => out.push('\n'),
                't' => out.push('\t'),
                'r' => out.push('\r'),
                '0'..='7' => {
                    let mut code = e.to_digit(8).unwrap_or(0);
                    for _ in 0..2 {
                        match self.peek().and_then(|d| d.to_digit(8)) {
                            Some(d) => {
                                code = code * 8 + d;
                                self.i += 1;
                            }
                            None => break,
                        }
                    }
                    out.push(char::from_u32(code).unwrap_or('?'));
                }
                'a' => out.push('\u{7}'),
                'b' => out.push('\u{8}'),
                'f' => out.push('\u{c}'),
                'v' => out.push('\u{b}'),
                'x' | 'u' | 'U' => {
                    let n = match e {
                        'x' => 2,
                        'u' => 4,
                        _ => 8,
                    };
                    let hex: String = self.s.iter().skip(self.i).take(n).collect();
                    let code = u32::from_str_radix(&hex, 16).map_err(|_| "непонятный код символа после \\".to_string())?;
                    self.i += n;
                    out.push(char::from_u32(code).ok_or("непонятный код символа")?);
                }
                '\n' => {}
                '\\' | '\'' | '"' => out.push(e),
                other => {
                    out.push('\\');
                    out.push(other);
                }
            }
        }
    }
}

fn canon_int(digits: &str) -> String {
    let t = digits.trim_start_matches('0');
    if t.is_empty() {
        "0".into()
    } else {
        t.into()
    }
}

fn neg(d: &str) -> String {
    match d.strip_prefix('-') {
        Some(rest) => rest.to_string(),
        None if d == "0" => "0".into(),
        None => format!("-{d}"),
    }
}

fn dedupe(items: Vec<Py>) -> Vec<Py> {
    let mut out: Vec<Py> = Vec::new();
    for x in items {
        if !out.iter().any(|y| same(y, &x, true)) {
            out.push(x);
        }
    }
    out
}

pub fn parse(text: &str) -> Result<Py, String> {
    let mut p = Parser { s: text.chars().collect(), i: 0 };
    p.skip();
    if p.peek().is_none() {
        return Err("пустой ответ".into());
    }
    let first = p.value(0)?;
    let mut items = vec![first];
    let mut bare = false;
    while p.eat(',') {
        bare = true;
        p.skip();
        if p.peek().is_none() {
            break;
        }
        items.push(p.value(0)?);
    }
    p.skip();
    if let Some(c) = p.peek() {
        return Err(format!("лишнее в конце ответа: {c}"));
    }
    Ok(if bare { Py::Tuple(items) } else { items.pop().unwrap_or(Py::None) })
}

fn num(v: &Py) -> Option<f64> {
    match v {
        Py::Int(d) => d.parse::<f64>().ok(),
        Py::Float(f) => Some(*f),
        _ => None,
    }
}

fn seq_same(a: &[Py], b: &[Py], strict: bool) -> bool {
    a.len() == b.len() && a.iter().zip(b).all(|(x, y)| same(x, y, strict))
}

fn bag_same(a: &[Py], b: &[Py], strict: bool) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut rest: Vec<&Py> = b.iter().collect();
    for x in a {
        match rest.iter().position(|y| same(x, y, strict)) {
            Some(i) => {
                rest.swap_remove(i);
            }
            None => return false,
        }
    }
    true
}

fn dict_same(a: &[(Py, Py)], b: &[(Py, Py)], strict: bool) -> bool {
    a.len() == b.len()
        && a.iter().all(|(k, v)| {
            let found: Vec<&Py> = b.iter().filter(|(k2, _)| same(k, k2, strict)).map(|(_, v2)| v2).collect();
            found.len() == 1 && same(v, found[0], strict)
        })
}

pub fn same(a: &Py, b: &Py, strict: bool) -> bool {
    use Py::*;
    match (a, b) {
        (None, None) => true,
        (Bool(x), Bool(y)) => x == y,
        (Int(x), Int(y)) => x == y,
        (Float(x), Float(y)) => x == y,
        (Int(_), Float(_)) | (Float(_), Int(_)) => !strict && num(a) == num(b),
        (Str(x), Str(y)) => x == y,
        (List(x), List(y)) | (Tuple(x), Tuple(y)) => seq_same(x, y, strict),
        (List(x), Tuple(y)) | (Tuple(x), List(y)) => !strict && seq_same(x, y, strict),
        (Dict(x), Dict(y)) => dict_same(x, y, strict),
        (Set(x), Set(y)) => bag_same(x, y, strict),
        (Name(x), Name(y)) => x == y,
        _ => false,
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum Mode {
    #[default]
    Text,
    Python,
    Shape,
    Number,
    Choice,
    #[serde(rename = "self")]
    SelfCheck,
    Error,
    Output,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct CheckSpec {
    pub mode: Mode,
    pub case_sensitive: bool,
    pub ignore_spaces: bool,
    pub tolerance: f64,
    pub strict_types: bool,
}

impl Default for CheckSpec {
    fn default() -> Self {
        Self { mode: Mode::Text, case_sensitive: false, ignore_spaces: false, tolerance: 0.0, strict_types: true }
    }
}

pub struct Verdict {
    pub correct: bool,
    pub note: Option<String>,
}

fn text_norm(s: &str, case: bool, spaces: bool) -> String {
    let t: String = if spaces { s.chars().filter(|c| !c.is_whitespace()).collect() } else { s.split_whitespace().collect::<Vec<_>>().join(" ") };
    if case {
        t
    } else {
        t.to_lowercase().replace('ё', "е")
    }
}

fn shape_norm(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

fn error_name(s: &str) -> String {
    let t = s.trim().trim_matches(|c| c == '\'' || c == '"').trim();
    let end = t.find(|c: char| c == ':' || c == '(' || c.is_whitespace()).unwrap_or(t.len());
    t[..end].to_string()
}

fn parse_num(s: &str) -> Option<f64> {
    let t: String = s.trim().chars().filter(|c| !c.is_whitespace()).map(|c| if c == ',' { '.' } else { c }).collect();
    t.parse::<f64>().ok().filter(|f| f.is_finite())
}

pub fn check(spec: &CheckSpec, expected: &[&str], input: &str) -> Verdict {
    let yes = |b: bool| Verdict { correct: b, note: None };
    match spec.mode {
        Mode::Python | Mode::Error => {
            let wants_error = expected.iter().any(|e| matches!(parse(e), Ok(Py::Name(_))));
            let got = match parse(input) {
                Ok(v) => v,
                Err(e) => {
                    if wants_error {
                        let n = error_name(input);
                        return yes(expected.iter().any(|e| error_name(e) == n));
                    }
                    return Verdict { correct: false, note: Some(format!("Не похоже на литерал Python: {e}.")) };
                }
            };
            let ok = expected.iter().any(|e| match parse(e) {
                Ok(Py::Name(n)) => matches!(&got, Py::Name(g) | Py::Str(g) if *g == n),
                Ok(want) => same(&want, &got, spec.strict_types),
                Err(_) => false,
            });
            yes(ok)
        }
        Mode::Shape => {
            let n = shape_norm(input);
            yes(expected.iter().any(|e| shape_norm(e) == n))
        }
        Mode::Number => match parse_num(input) {
            Some(x) => yes(expected.iter().filter_map(|e| parse_num(e)).any(|w| (w - x).abs() <= spec.tolerance.max(0.0) + f64::EPSILON * w.abs().max(1.0))),
            None => Verdict { correct: false, note: Some("Нужно число.".into()) },
        },
        Mode::Output => {
            let got = input.trim_end_matches(['\n', '\r']).trim_end();
            yes(expected.iter().any(|e| e.trim_end() == got))
        }
        Mode::Text | Mode::Choice | Mode::SelfCheck => {
            let n = text_norm(input, spec.case_sensitive, spec.ignore_spaces);
            yes(expected.iter().any(|e| text_norm(e, spec.case_sensitive, spec.ignore_spaces) == n))
        }
    }
}

pub fn valid_expected(spec: &CheckSpec, answer: &str) -> Result<(), String> {
    match spec.mode {
        Mode::Python => parse(answer).map(|_| ()).map_err(|e| format!("ответ «{answer}» не литерал Python: {e}")),
        Mode::Number => parse_num(answer).map(|_| ()).ok_or_else(|| format!("ответ «{answer}» не число")),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn py(spec_mode: Mode) -> CheckSpec {
        CheckSpec { mode: spec_mode, ..Default::default() }
    }

    fn ok(want: &str, got: &str) -> bool {
        check(&py(Mode::Python), &[want], got).correct
    }

    #[test]
    fn literals_parse() {
        assert_eq!(parse("3").unwrap(), Py::Int("3".into()));
        assert_eq!(parse("-0").unwrap(), Py::Int("0".into()));
        assert_eq!(parse("1_000").unwrap(), Py::Int("1000".into()));
        assert_eq!(parse("3.5").unwrap(), Py::Float(3.5));
        assert_eq!(parse("-2.5e-1").unwrap(), Py::Float(-0.25));
        assert_eq!(parse("'a\\nb'").unwrap(), Py::Str("a\nb".into()));
        assert_eq!(parse("\"it's\"").unwrap(), Py::Str("it's".into()));
        assert_eq!(parse("(1,)").unwrap(), Py::Tuple(vec![Py::Int("1".into())]));
        assert_eq!(parse("(1)").unwrap(), Py::Int("1".into()));
        assert_eq!(parse("()").unwrap(), Py::Tuple(vec![]));
        assert_eq!(parse("{}").unwrap(), Py::Dict(vec![]));
        assert_eq!(parse("set()").unwrap(), Py::Set(vec![]));
        assert_eq!(parse("1, 'a'").unwrap(), Py::Tuple(vec![Py::Int("1".into()), Py::Str("a".into())]));
        assert_eq!(parse("TypeError").unwrap(), Py::Name("TypeError".into()));
        assert!(parse("[1, 2").is_err());
        assert!(parse("'abc").is_err());
        assert!(parse("1 2").is_err());
    }

    #[test]
    fn types_matter() {
        assert!(ok("3", "3"));
        assert!(!ok("3", "3.0"));
        assert!(!ok("(1, 2)", "[1, 2]"));
        assert!(!ok("True", "1"));
        assert!(ok("3.0", "3."));
        assert!(ok("0.30000000000000004", "0.30000000000000004"));
        assert!(!ok("0.30000000000000004", "0.3"));
        let lenient = CheckSpec { mode: Mode::Python, strict_types: false, ..Default::default() };
        assert!(check(&lenient, &["3"], "3.0").correct);
        assert!(check(&lenient, &["(1, 2)"], "[1, 2]").correct);
    }

    #[test]
    fn order_and_quotes() {
        assert!(ok("{'a': 1, 'b': 2}", "{\"b\": 2, \"a\": 1}"));
        assert!(ok("{'x', 'y', 'z'}", "{'z','x','y'}"));
        assert!(!ok("{'x', 'y'}", "{'x', 'y', 'y'}"));
        assert!(ok("[('a', 1), ('b', 2)]", " [ ( 'a' ,1 ) , ('b',2) ] "));
        assert!(!ok("['a', 'b']", "['b', 'a']"));
        assert!(ok("{1: [2, 3]}", "{1:[2,3]}"));
        assert!(ok("set()", "set( )"));
        assert!(ok("{'h', 'e', 'l', 'o'}", "set('hello')"));
    }

    #[test]
    fn errors_by_name() {
        assert!(ok("TypeError", "TypeError"));
        assert!(ok("TypeError", "'TypeError'"));
        assert!(ok("TypeError", "TypeError: unsupported operand"));
        assert!(!ok("TypeError", "ValueError"));
        assert!(!ok("[1]", "IndexError"));
    }

    #[test]
    fn other_modes() {
        let shape = py(Mode::Shape);
        assert!(check(&shape, &["list[tuple[str, int]]"], "list [ tuple[str,int] ]").correct);
        assert!(!check(&shape, &["list[int]"], "List[int]").correct);
        let text = py(Mode::Text);
        assert!(check(&text, &["Ёлка  зелёная"], " елка ЗЕЛЕНАЯ ").correct);
        let exact = CheckSpec { mode: Mode::Text, case_sensitive: true, ..Default::default() };
        assert!(!check(&exact, &["Paris"], "paris").correct);
        let nospace = CheckSpec { mode: Mode::Text, ignore_spaces: true, ..Default::default() };
        assert!(check(&nospace, &["a b c"], "abc").correct);
        let n = CheckSpec { mode: Mode::Number, tolerance: 0.01, ..Default::default() };
        assert!(check(&n, &["3.14159"], "3,14").correct);
        assert!(!check(&n, &["3.14159"], "3.1").correct);
        let out = py(Mode::Output);
        assert!(check(&out, &["1 2 3"], "1 2 3\n").correct);
        assert!(!check(&out, &["1 2 3"], "'1 2 3'").correct);
    }
}
