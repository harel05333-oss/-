"""Load / recovery cycles (3:1, 2:1 ...), the coach's way.

Inside a cycle every loading week grows by the same step. The recovery week
goes back below the first week of the cycle by that same step, for volume,
for the long run and for intensity:

    volume 8, 9, 10   -> step 1 -> recovery 8 - 1 = 7
    long run 16, 17, 18 -> recovery 15
    hills 6, 7, 8 reps  -> recovery 5

The next cycle starts one step above the last loading week (10 -> 11).

The engine finds the cycles in the data itself: a recovery week is a week
whose volume dropped compared to the week before.
"""
from __future__ import annotations

from datetime import date, timedelta

from .models import Activity, Athlete
from .threshold import resolve_thresholds
from .workouts import analyze_run
from .zones import HARD

LOOKBACK_WEEKS = 12

# (key, Hebrew name, unit, tolerance: absolute, relative)
METRICS = [
    ("run_km", "נפח", "ק\"מ", 1.0, 0.05),
    ("longest_km", "ריצה ארוכה", "ק\"מ", 0.5, 0.03),
    ("hard_min", "עצימות (זמן ב-Z4 ומעלה)", "דק׳", 2.0, 0.10),
]


def _tol(value: float, absolute: float, relative: float) -> float:
    return max(absolute, abs(value) * relative)


def weekly_series(athlete: Athlete, activities: list[Activity], week_start: date, prefer: str,
                  weeks: int = LOOKBACK_WEEKS) -> list[dict]:
    """One row per week, oldest first, the last row is the week starting at `week_start`."""
    rows = []
    for k in range(weeks - 1, -1, -1):
        s = week_start - timedelta(days=7 * k)
        e = s + timedelta(days=6)
        runs = [a for a in activities if a.is_run and s <= a.day <= e]
        th = resolve_thresholds(athlete, e)
        hard_s = sum(analyze_run(a, th, prefer).time_by_class.get(HARD, 0) for a in runs)
        rows.append({
            "start": s.isoformat(),
            "run_km": round(sum(a.distance_m for a in runs) / 1000, 1),
            "longest_km": round(max((a.distance_m for a in runs), default=0) / 1000, 1),
            "hard_min": round(hard_s / 60),
        })
    # drop empty weeks before the athlete's data begins
    while rows and rows[0]["run_km"] == 0:
        rows.pop(0)
    return rows


def _is_drop(rows: list[dict], i: int) -> bool:
    if i == 0:
        return False
    prev = rows[i - 1]["run_km"]
    return rows[i]["run_km"] < prev - _tol(prev, 0.5, 0.03)


def analyze_cycle(rows: list[dict], load_weeks: int | None = 3) -> dict | None:
    """Where the current (last) week sits in its cycle, and what was expected of it."""
    if len(rows) < 2:
        return None
    cur_i = len(rows) - 1
    recovery = _is_drop(rows, cur_i)

    # loading weeks of the current cycle: back from the week before (or this week) to the last drop
    end = cur_i - 1 if recovery else cur_i
    j = end
    while j > 0 and not _is_drop(rows, j):
        j -= 1
    saw_drop = _is_drop(rows, j)  # the cycle begins right after a drop we actually saw
    if saw_drop:
        j += 1  # the drop itself is the previous cycle's recovery week
    loading = rows[j:end + 1] if j <= end else []
    if not loading:
        return None

    out = {
        "known": saw_drop or recovery,  # we saw where the cycle starts
        "recovery_week": recovery,
        "loading_weeks": len(loading),
        "load_weeks_planned": load_weeks,
        "checks": [],
        "flags": [],
    }

    if recovery:
        if len(loading) < 2:
            return out
        first, second = loading[0], loading[1]
        for key, name, unit, ab, rel in METRICS:
            step = second[key] - first[key]
            if step <= 0:
                continue
            expected = round(first[key] - step, 1)
            actual = rows[cur_i][key]
            tol = _tol(expected, ab, rel)
            out["checks"].append({"metric": key, "expected": expected, "actual": actual, "step": step})
            if actual > expected + tol:
                out["flags"].append(("warn", f"שבוע הורדה, {name}: {actual:g} {unit}, לפי המחזור "
                                             f"{expected:g} ({first[key]:g} פחות {step:g})"))
            elif actual < expected - 2 * tol:
                out["flags"].append(("info", f"שבוע הורדה, {name}: {actual:g} {unit}, ירד יותר מהמחזור "
                                             f"({expected:g})"))
        return out

    k = len(loading)
    if load_weeks and k > load_weeks and saw_drop:
        out["flags"].append(("warn", f"{k} שבועות עומס ברצף, לפי מחזור {load_weeks}:1 היה צריך שבוע הורדה"))
    if k >= 3:
        for key, name, unit, ab, rel in METRICS:
            step = loading[1][key] - loading[0][key]
            if step <= 0:
                continue
            expected = round(loading[-2][key] + step, 1)
            actual = loading[-1][key]
            if actual > expected + _tol(expected, ab, rel):
                out["flags"].append(("info", f"{name} עלה מעבר לצעד של המחזור: {actual:g} {unit}, "
                                             f"לפי צעד של {step:g} {expected:g}"))
    return out
