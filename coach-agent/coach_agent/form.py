"""Fitness, Fatigue and Form (TrainingPeaks' Performance Management Chart).

  Fitness = CTL, 42-day average of daily TSS
  Fatigue = ATL, 7-day average of daily TSS
  Form    = TSB = yesterday's Fitness - yesterday's Fatigue

What counts as unusual:
  * Form below -30: high risk zone.
  * Fatigue far above Fitness (ATL / CTL above 1.5): a sharp jump in load
    compared to what the athlete is used to (acute:chronic ratio).
  * Fitness rising more than 8 points in a week (ramp rate), or falling
    more than 5 outside a recovery week or a taper.
  * Fatigue jumping by a third in one week.
  * Form above +25 outside a taper: a long break, fitness is going down.
  * Race week (or the last taper week) with Form still below -10: not fresh for the race.
"""
from __future__ import annotations

from datetime import date, timedelta

# Form zones as TrainingPeaks shows them: (lowest TSB, key, Hebrew)
FORM_ZONES = [
    (25.0, "transition", "מנוחה ארוכה"),
    (5.0, "fresh", "רענן"),
    (-10.0, "grey", "אזור אפור"),
    (-30.0, "optimal", "אימון אופטימלי"),
    (float("-inf"), "high_risk", "סיכון גבוה"),
]
FORM_HIGH_RISK = -30.0
FORM_TRANSITION = 25.0
RACE_FORM_MIN = -10.0
ACWR_HIGH = 1.5
ACWR_ELEVATED = 1.3
RAMP_HIGH = 8.0
RAMP_DROP = -5.0
FATIGUE_JUMP = 0.33
FATIGUE_JUMP_MIN = 15.0
MIN_HISTORY_DAYS = 28
MIN_CTL_FOR_RATIO = 10.0


def form_zone(tsb: float) -> tuple[str, str]:
    for lowest, key, he in FORM_ZONES:
        if tsb >= lowest:
            return key, he
    return "high_risk", "סיכון גבוה"


def acwr(atl: float, ctl: float) -> float | None:
    return atl / ctl if ctl >= MIN_CTL_FOR_RATIO else None


def _at(chart: dict, d: date) -> dict:
    return chart.get(d, {"ctl": 0.0, "atl": 0.0})


def week_flags(chart: dict, start: date, end: date, phase: str | None, recovery_week: bool,
               days_to_race: int | None, history_days: int) -> tuple[list[tuple[str, str]], list[str]]:
    """Flags for a whole week. `phase`: training / taper / race_week / None."""
    flags: list[tuple[str, str]] = []
    good: list[str] = []
    if history_days < MIN_HISTORY_DAYS:
        return flags, good
    last, before = _at(chart, end), _at(chart, start - timedelta(days=1))
    ctl, atl = last["ctl"], last["atl"]
    form = ctl - atl
    ramp = ctl - before["ctl"]
    tapering = phase in ("taper", "race_week")

    zone, zone_he = form_zone(form)
    if form < FORM_HIGH_RISK:
        flags.append(("alert", f"Form {form:+.0f}: {zone_he} (מתחת ל-30-)"))
    elif form > FORM_TRANSITION and not tapering:
        flags.append(("info", f"Form {form:+.0f}: {zone_he}, הרבה זמן בלי עומס והכושר יורד"))

    ratio = acwr(atl, ctl)
    if ratio and ratio > ACWR_HIGH:
        flags.append(("warn", f"Fatigue גבוה פי {ratio:.1f} מה-Fitness: קפיצה חדה בעומס ביחס לבסיס"))
    elif ratio and ratio > ACWR_ELEVATED and not recovery_week:
        flags.append(("info", f"Fatigue גבוה פי {ratio:.1f} מה-Fitness"))

    if ramp > RAMP_HIGH:
        flags.append(("warn", f"Fitness עלה ב-{ramp:.1f} נקודות השבוע (מעל {RAMP_HIGH:g})"))
    elif ramp < RAMP_DROP and not tapering and not recovery_week:
        flags.append(("info", f"Fitness ירד ב-{-ramp:.1f} נקודות השבוע"))

    if before["atl"] >= 10 and atl - before["atl"] >= FATIGUE_JUMP_MIN and atl / before["atl"] - 1 > FATIGUE_JUMP:
        flags.append(("info", f"Fatigue קפץ השבוע מ-{before['atl']:.0f} ל-{atl:.0f}"))

    last_week_before_race = days_to_race is not None and days_to_race < 7
    if phase == "race_week" or (phase == "taper" and last_week_before_race):
        if form < RACE_FORM_MIN:
            flags.append(("warn", f"לקראת התחרות Form עדיין {form:+.0f}, רצוי בין 5+ ל-25+"))
        elif form >= 5:
            good.append(f"מגיע רענן לתחרות (Form {form:+.0f})")
    return flags, good


def day_crossings(chart: dict, day: date, history_days: int) -> list[tuple[str, str]]:
    """Right after a workout: did it push Form or the Fatigue/Fitness ratio over the line?"""
    if history_days < MIN_HISTORY_DAYS:
        return []
    now, prev = _at(chart, day), _at(chart, day - timedelta(days=1))
    out = []
    form_now, form_prev = now["ctl"] - now["atl"], prev["ctl"] - prev["atl"]
    if form_now < FORM_HIGH_RISK <= form_prev:
        out.append(("warn", f"אחרי האימון Form ירד ל-{form_now:+.0f}: סיכון גבוה"))
    r_now, r_prev = acwr(now["atl"], now["ctl"]), acwr(prev["atl"], prev["ctl"])
    if r_now and r_now > ACWR_HIGH and (r_prev is None or r_prev <= ACWR_HIGH):
        out.append(("warn", f"אחרי האימון Fatigue גבוה פי {r_now:.1f} מה-Fitness"))
    return out
