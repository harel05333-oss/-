from datetime import date, datetime, timedelta
from pathlib import Path

import pytest

from coach_agent.alerts import check_workout, planned_for
from coach_agent.cycles import analyze_cycle
from coach_agent.io_json import load_athlete_file
from coach_agent.models import Activity, Lap, Profile, Record
from coach_agent.report import render_athlete
from coach_agent.threshold import Thresholds
from coach_agent.week import analyze_week
from coach_agent.workouts import RepeatSet, analyze_run, laps_from_records
from coach_agent.zones import is_walking

ROOT = Path(__file__).resolve().parents[1]
TH = Thresholds(pace_s_per_km=460, lthr=175, pace_source="", lthr_source="")
TIME = Profile(volume_unit="time")


@pytest.fixture(scope="module", autouse=True)
def demo():
    import subprocess, sys
    subprocess.run([sys.executable, str(ROOT / "examples" / "make_demo.py")], check=True, capture_output=True)


def lap(sec, pace, hr=None, cadence=None):
    return Lap(duration_s=sec, distance_m=sec / pace * 1000, avg_hr=hr, cadence_spm=cadence)


def act(laps, day=date(2026, 11, 17)):
    return Activity(str(day), datetime.combine(day, datetime.min.time()), "run",
                    sum(l.duration_s for l in laps), sum(l.distance_m for l in laps), laps=laps)


def test_walking_is_told_by_cadence_first_then_pace():
    assert is_walking(lap(60, 690))  # 11:30 / km
    assert not is_walking(lap(60, 540))  # 9:00 / km
    assert not is_walking(lap(60, 690, cadence=160))  # slow, but running steps
    assert is_walking(lap(60, 540, cadence=120))
    assert is_walking(Lap(60, 0))  # standing still
    assert is_walking(lap(60, 560), 550)  # the athlete's own walking pace


def test_run_walk_session_folds_and_counts_time():
    laps = [lap(300, 690)] + [lap(120, 540, 148), lap(60, 690, 125)] * 8 + [lap(300, 690)]
    w = analyze_run(act(laps), TH, profile=TIME)
    assert w.workout_type == "ריצה-הליכה" and w.run_walk
    assert w.run_s == 16 * 60 and w.walk_s == 18 * 60 and w.longest_run_s == 120
    sets = [i for i in w.items if isinstance(i, RepeatSet)]
    assert len(sets) == 1 and len(sets[0].efforts) == 8 and sets[0].recoveries[0].kind == "walk"
    assert w.is_quality is False


def test_intervals_with_walking_recoveries_still_fold():
    th = Thresholds(pace_s_per_km=255, lthr=170, pace_source="", lthr_source="")
    laps = [lap(600, 330)] + [lap(240, 240), Lap(120, 0)] * 6 + [lap(600, 330)]
    w = analyze_run(act(laps), th)
    sets = [i for i in w.items if isinstance(i, RepeatSet)]
    assert len(sets[0].efforts) == 6 and w.workout_type == "אינטרוולים עצים"


def test_run_and_walk_parts_from_the_stream():
    records, t = [], 0
    for _ in range(4):
        for _ in range(120):
            records.append(Record(t, 1000 / 540, 150)); t += 1
        for _ in range(60):
            records.append(Record(t, 1000 / 700, 125)); t += 1
    for i in range(0, len(records), 37):  # GPS noise: a few odd samples
        records[i].speed_mps = 0.5
    laps = laps_from_records(records)
    kinds = ["walk" if is_walking(l) else "run" for l in laps]
    assert kinds == ["run", "walk"] * 4
    assert laps[0].duration_s == pytest.approx(120, abs=6)


def test_planned_run_walk_alert():
    athlete, acts, planned = load_athlete_file(ROOT / "examples" / "athletes" / "roni.json")
    tue = next(a for a in acts if a.day == date(2026, 11, 17))
    alerts = check_workout(athlete, tue, planned_for(tue, planned), acts)
    texts = " ".join(a["text"] for a in alerts)
    assert "ריצה רציפה של 6 דק׳, בתכנון 2 דק׳ ריצה / 1 דק׳ הליכה" in texts
    sun = next(a for a in acts if a.day == date(2026, 11, 15))
    assert check_workout(athlete, sun, planned_for(sun, planned), acts) == []


def test_weekly_summary_by_time():
    athlete, acts, planned = load_athlete_file(ROOT / "examples" / "athletes" / "roni.json")
    s = analyze_week(athlete, acts, date(2026, 11, 15), planned)
    v = s["volume"]
    assert s["unit"] == "time" and v["run_min"] == 112 and v["walk_min"] > 0 and v["continuous_run_min"] == 6
    assert any("ריצה רציפה של 6 דק׳" in g for g in s["highlights"])
    text = render_athlete(s)
    assert "זמן: *1:52*" in text and "*8×2 דק׳ ריצה*" in text and "הליכה 1 דק׳ בין החזרות" in text
    assert "*10×2:30 דק׳ ריצה*" in text


def test_cycle_rule_in_minutes():
    rows = [{"start": i, "run_km": 0, "longest_km": 0, "hard_min": 0, "run_min": m, "longest_min": l}
            for i, (m, l) in enumerate([(90, 30), (100, 35), (110, 40), (80, 25)])]
    c = analyze_cycle(rows, 3, "time")
    assert c["recovery_week"] and c["flags"] == []
    rows[-1]["run_min"] = 100
    rows[-1]["longest_min"] = 33
    c = analyze_cycle(rows, 3, "time")
    assert c["recovery_week"] and any("80" in t for _, t in c["flags"])
