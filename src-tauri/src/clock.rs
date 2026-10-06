use chrono::{Duration, Local, NaiveDate, NaiveDateTime, NaiveTime};
use std::sync::atomic::{AtomicI64, Ordering};

static SHIFT_MIN: AtomicI64 = AtomicI64::new(0);

pub fn init_from_env() {
    if let Ok(v) = std::env::var("NEXTDAY_TIME_SHIFT_MIN") {
        if let Ok(n) = v.trim().parse::<i64>() {
            SHIFT_MIN.store(n, Ordering::Relaxed);
        }
    }
}

pub fn shift(minutes: i64) {
    SHIFT_MIN.fetch_add(minutes, Ordering::Relaxed);
}

pub fn now() -> NaiveDateTime {
    Local::now().naive_local() + Duration::minutes(SHIFT_MIN.load(Ordering::Relaxed))
}

pub fn logical_date(now: NaiveDateTime, day_start_hour: u32) -> NaiveDate {
    (now - Duration::hours(day_start_hour as i64)).date()
}

pub fn day_start(date: NaiveDate, day_start_hour: u32) -> NaiveDateTime {
    date.and_time(NaiveTime::from_hms_opt(day_start_hour.min(23), 0, 0).unwrap())
}

pub fn parse_hm(s: &str) -> Option<(u32, u32)> {
    let (h, m) = s.trim().split_once(':')?;
    let h: u32 = h.trim().parse().ok()?;
    let m: u32 = m.trim().parse().ok()?;
    (h < 24 && m < 60).then_some((h, m))
}

pub fn moment_in(date: NaiveDate, hm: (u32, u32), day_start_hour: u32) -> NaiveDateTime {
    let d = if hm.0 < day_start_hour { next(date) } else { date };
    d.and_time(NaiveTime::from_hms_opt(hm.0, hm.1, 0).unwrap())
}

pub fn next(d: NaiveDate) -> NaiveDate {
    d.succ_opt().unwrap_or(d)
}

pub fn prev(d: NaiveDate) -> NaiveDate {
    d.pred_opt().unwrap_or(d)
}

pub fn fmt_date(d: NaiveDate) -> String {
    d.format("%Y-%m-%d").to_string()
}

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s.trim(), "%Y-%m-%d").ok()
}

pub fn fmt_dt(t: NaiveDateTime) -> String {
    t.format("%Y-%m-%dT%H:%M:%S").to_string()
}

pub fn parse_dt(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s.trim(), "%Y-%m-%dT%H:%M:%S").ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dt(s: &str) -> NaiveDateTime {
        parse_dt(s).unwrap()
    }

    #[test]
    fn night_belongs_to_previous_day() {
        let d = logical_date(dt("2026-10-08T01:30:00"), 4);
        assert_eq!(fmt_date(d), "2026-10-07");
        let d = logical_date(dt("2026-10-08T04:00:00"), 4);
        assert_eq!(fmt_date(d), "2026-10-08");
        let d = logical_date(dt("2026-10-08T00:10:00"), 0);
        assert_eq!(fmt_date(d), "2026-10-08");
    }

    #[test]
    fn moment_after_midnight() {
        let d = parse_date("2026-10-07").unwrap();
        assert_eq!(fmt_dt(moment_in(d, (21, 0), 4)), "2026-10-07T21:00:00");
        assert_eq!(fmt_dt(moment_in(d, (0, 30), 4)), "2026-10-08T00:30:00");
    }

    #[test]
    fn hm() {
        assert_eq!(parse_hm("21:05"), Some((21, 5)));
        assert_eq!(parse_hm("24:00"), None);
        assert_eq!(parse_hm("x"), None);
    }
}
