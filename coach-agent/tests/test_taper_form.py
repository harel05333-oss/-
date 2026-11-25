from datetime import date, datetime, timedelta

import pytest

from coach_agent.form import day_crossings, form_zone, week_flags
from coach_agent.models import Activity, Athlete, GoalRace, Lap, Profile, RaceResult
from coach_agent.week import analyze_week

RACE = date(2027, 4, 11)  # a Sunday: race week 11.4-17.4


def season(volumes, longs, last_sunday):
    """One long run + the rest of the volume as 3 easy runs, per week, ending with `last_sunday`."""
    acts = []
    for k, (vol, long_km) in enumerate(zip(reversed(volumes), reversed(longs))):
        sun = last_sunday - timedelta(days=7 * k)
        rest = (vol - long_km) / 3
        for day, d in ((sun, rest), (sun + timedelta(2), rest), (sun + timedelta(4), rest), (sun + timedelta(6), long_km)):
            lap = Lap(d * 330, d * 1000)
            acts.append(Activity(str(day), datetime.combine(day, datetime.min.time()), "run",
                                 lap.duration_s, lap.distance_m, laps=[lap]))
    return acts


def athlete():
    return Athlete("x", "X", races=[RaceResult(date(2027, 1, 20), 21097.5, 116 * 60)],
                   profile=Profile(goal_races=[GoalRace("מרתון פריז", RACE, 42195)]))


# end of the coach's season plan: build 2 (77, 80, 83), then taper 70, 50, 30
VOL = [68, 71, 74, 65, 77, 80, 83, 70, 50, 30]
LSD = [29, 31, 33, 27, 34, 35, 36, 30, 20, 10]


@pytest.mark.parametrize("weeks_back, taper_week", [(2, 1), (1, 2), (0, 3)])
def test_taper_weeks_are_not_judged_as_recovery_weeks(weeks_back, taper_week):
    last_sunday = date(2027, 4, 4) - timedelta(days=7 * weeks_back)
    n = len(VOL) - weeks_back
    s = analyze_week(athlete(), season(VOL[:n], LSD[:n], last_sunday), last_sunday)
    assert s["goal"]["phase"] == "taper"
    assert s["taper"]["week"] == taper_week and s["taper"]["weeks"] == 3
    assert not [f for f in s["flags"] if "שבוע הורדה" in f["text"] or "טייפר" in f["text"]]


def test_the_week_before_taper_is_still_a_build_week():
    last_sunday = date(2027, 3, 14)
    s = analyze_week(athlete(), season(VOL[:7], LSD[:7], last_sunday), last_sunday)
    assert s["goal"]["phase"] == "training" and s["taper"] is None


def test_taper_that_does_not_come_down_is_flagged():
    vol, lsd = VOL[:8] + [72], LSD[:8] + [30]
    last_sunday = date(2027, 3, 28)
    s = analyze_week(athlete(), season(vol, lsd, last_sunday), last_sunday)
    texts = " ".join(f["text"] for f in s["flags"])
    assert "טייפר: הנפח לא ירד" in texts and "הארוכה לא התקצרה" in texts


# ---- Fitness / Fatigue / Form ------------------------------------------------------

def chart_from(ctl_atl: dict):
    return {d: {"ctl": c, "atl": a} for d, (c, a) in ctl_atl.items()}


START, END = date(2026, 11, 15), date(2026, 11, 21)


def flags_for(before, end, phase=None, recovery=False, days_to_race=None):
    chart = chart_from({START - timedelta(days=1): before, END: end})
    return week_flags(chart, START, END, phase, recovery, days_to_race, 60)


def test_form_zones():
    assert form_zone(30)[0] == "transition"
    assert form_zone(10)[0] == "fresh"
    assert form_zone(0)[0] == "grey"
    assert form_zone(-20)[0] == "optimal"
    assert form_zone(-31)[0] == "high_risk"


def test_high_risk_form_and_sharp_fatigue():
    flags, _ = flags_for((50, 55), (52, 90))
    levels = {t.split(" ")[0]: l for l, t in flags}
    assert ("alert", "Form -38: סיכון גבוה (מתחת ל-30-)") in flags
    assert any("Fatigue גבוה פי 1.7" in t for _, t in flags)
    assert any("Fatigue קפץ" in t for _, t in flags)


def test_ramp_and_fitness_drop():
    assert any("Fitness עלה ב-9.0" in t for _, t in flags_for((50, 55), (59, 65))[0])
    assert any("Fitness ירד" in t for _, t in flags_for((50, 45), (44, 30))[0])
    assert not any("Fitness ירד" in t for _, t in flags_for((50, 45), (44, 30), phase="taper")[0])
    assert not any("Fitness ירד" in t for _, t in flags_for((50, 45), (44, 30), recovery=True)[0])


def test_long_break_and_race_freshness():
    assert any("מנוחה ארוכה" in t for _, t in flags_for((50, 30), (45, 15))[0])
    assert not flags_for((50, 30), (45, 15), phase="taper")[0]
    flags, good = flags_for((60, 70), (58, 72), phase="taper", days_to_race=3)
    assert any("לקראת התחרות Form" in t for _, t in flags)
    flags, good = flags_for((60, 50), (58, 45), phase="race_week")
    assert good and not flags


def test_crossing_after_a_single_workout():
    d = date(2026, 11, 18)
    chart = chart_from({d - timedelta(days=1): (50, 75), d: (51, 85)})
    out = day_crossings(chart, d, 60)
    assert [l for l, _ in out] == ["warn", "warn"]
    # already in high risk yesterday: no new alert
    chart = chart_from({d - timedelta(days=1): (50, 85), d: (51, 90)})
    assert day_crossings(chart, d, 60) == []
