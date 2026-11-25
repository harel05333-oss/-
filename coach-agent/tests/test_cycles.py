from datetime import date, datetime, timedelta

import pytest

from coach_agent.cycles import analyze_cycle
from coach_agent.models import Activity, Athlete, Lap, Profile, RaceResult
from coach_agent.week import analyze_week


def rows(volumes, longs=None, hard=None):
    n = len(volumes)
    longs = longs or [round(v * 0.4, 1) for v in volumes]
    hard = hard or [0] * n
    return [{"start": f"w{i}", "run_km": v, "longest_km": l, "hard_min": h}
            for i, (v, l, h) in enumerate(zip(volumes, longs, hard))]


def levels(c):
    return [lvl for lvl, _ in c["flags"]]


def test_recovery_week_is_first_week_minus_the_step():
    c = analyze_cycle(rows([8, 9, 10, 7], [8, 9, 10, 7]))
    assert c["recovery_week"] and c["flags"] == []
    assert {x["metric"]: x["expected"] for x in c["checks"]}["run_km"] == 7


def test_recovery_week_that_did_not_drop_enough():
    c = analyze_cycle(rows([8, 9, 10, 9], [8, 9, 10, 9]))
    assert c["recovery_week"] and levels(c) == ["warn", "warn"]
    assert "8 פחות 1" in c["flags"][0][1]


def test_intensity_follows_the_same_rule():
    # hills 6, 7, 8 reps ~ 12, 14, 16 minutes -> recovery 10 minutes
    ok = analyze_cycle(rows([37, 39, 41, 35], [16, 17, 18, 15], [12, 14, 16, 10]))
    assert ok["flags"] == []
    too_much = analyze_cycle(rows([37, 39, 41, 35], [16, 17, 18, 15], [12, 14, 16, 16]))
    assert [t for _, t in too_much["flags"]] and "עצימות" in too_much["flags"][0][1]


def test_the_coach_season_plan_passes():
    # weeks 11-18 of the season table: base 1 and base 2, 3:1
    vol = [37, 39, 41, 35, 43, 45, 47, 41]
    lsd = [16, 17, 18, 15, 19, 20, 21, 18]
    for i in range(2, len(vol) + 1):
        c = analyze_cycle(rows(vol[:i], lsd[:i]))
        assert c["flags"] == [], (i, c["flags"])
    assert analyze_cycle(rows(vol[:5], lsd[:5]))["loading_weeks"] == 1  # first week of the new cycle


def test_missing_recovery_week():
    c = analyze_cycle(rows([41, 35, 37, 39, 41, 43]), load_weeks=3)
    assert c["loading_weeks"] == 4 and "שבוע הורדה" in c["flags"][0][1]
    assert analyze_cycle(rows([41, 35, 37, 39, 41, 43]), load_weeks=4)["flags"] == []


def test_cycle_inside_the_weekly_summary():
    """Real activities: 3 loading weeks (8/9/10 km long runs), then the week under test."""
    def week_acts(first_day, easy_km, long_km):
        out = []
        for day, d in ((first_day + timedelta(2), easy_km), (first_day + timedelta(6), long_km)):
            lap = Lap(d * 330, d * 1000)
            out.append(Activity(str(day), datetime.combine(day, datetime.min.time()), "run",
                                lap.duration_s, lap.distance_m, laps=[lap]))
        return out

    start = date(2026, 11, 15)
    athlete = Athlete("x", "X", profile=Profile(), races=[RaceResult(date(2026, 10, 1), 10000, 45 * 60)])

    def summary(last_long):
        acts = []
        for k, long_km in zip((3, 2, 1, 0), (8, 9, 10, last_long)):
            acts += week_acts(start - timedelta(days=7 * k), 10, long_km)
        return analyze_week(athlete, acts, start)

    good = summary(7)
    assert good["cycle"]["recovery_week"]
    assert not [f for f in good["flags"] if "שבוע הורדה" in f["text"]]
    bad = summary(9)
    assert [f for f in bad["flags"] if "שבוע הורדה" in f["text"]]
