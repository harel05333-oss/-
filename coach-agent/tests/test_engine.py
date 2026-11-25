import subprocess
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from coach_agent.io_json import load_athlete_file
from coach_agent.load import activity_tss, performance_chart
from coach_agent.models import Activity, Athlete, Lap, RaceResult
from coach_agent.report import render_athlete
from coach_agent.threshold import Thresholds, resolve_thresholds, threshold_pace_from_race
from coach_agent.week import analyze_week, week_bounds
from coach_agent.workouts import RepeatSet, analyze_run
from coach_agent.zones import hr_zone, pace_zone

ROOT = Path(__file__).resolve().parents[1]
TH = Thresholds(pace_s_per_km=255, lthr=170, pace_source="", lthr_source="")


def lap(km, pace, hr=None):
    return Lap(duration_s=pace * km, distance_m=km * 1000, avg_hr=hr)


def run(laps, day=date(2026, 11, 17), hour=6, **kw):
    return Activity(
        id=f"{day}-{hour}", start=datetime.combine(day, datetime.min.time()) + timedelta(hours=hour),
        sport="run", duration_s=sum(l.duration_s for l in laps), distance_m=sum(l.distance_m for l in laps),
        laps=laps, **kw,
    )


# ---- threshold -------------------------------------------------------------

def test_5k_and_10k_give_the_same_threshold_and_the_right_zones():
    from_5k = threshold_pace_from_race(5000, 20 * 60)
    from_10k = threshold_pace_from_race(10000, 41 * 60 + 40)
    assert from_5k == pytest.approx(255.5, abs=1)
    assert from_10k == pytest.approx(from_5k, abs=1)
    assert pace_zone(240, from_5k) == "Z5b"  # 5K race pace
    assert pace_zone(250, from_10k) == "Z5a"  # 10K race pace


def test_half_and_marathon_pace_land_in_z4_and_z3():
    tp = threshold_pace_from_race(5000, 20 * 60)
    half_pace = 20 * 60 * (21097.5 / 5000) ** 1.06 / 21.0975
    marathon_pace = 20 * 60 * (42195 / 5000) ** 1.06 / 42.195
    assert pace_zone(half_pace, tp) == "Z4"
    assert pace_zone(marathon_pace, tp) == "Z3"


def test_10k_wins_over_a_slightly_newer_5k_and_overrides_win_over_all():
    a = Athlete("a", "A", races=[
        RaceResult(date(2026, 11, 1), 5000, 19 * 60, avg_hr=180),
        RaceResult(date(2026, 10, 20), 10000, 42 * 60),
    ])
    th = resolve_thresholds(a, date(2026, 11, 20))
    assert th.race_date == date(2026, 10, 20)
    assert th.lthr == pytest.approx(180 / 1.05)
    a.threshold_pace_s_per_km, a.lthr = 250, 168
    th = resolve_thresholds(a, date(2026, 11, 20))
    assert (th.pace_s_per_km, th.lthr) == (250, 168)


def test_old_race_is_ignored():
    a = Athlete("a", "A", races=[RaceResult(date(2025, 1, 1), 10000, 40 * 60)])
    assert resolve_thresholds(a, date(2026, 11, 20)).pace_s_per_km is None


def test_hr_zones_follow_the_course_table():
    assert hr_zone(170 * 0.85, 170) == "Z1"
    assert hr_zone(170 * 0.88, 170) == "Z2"
    assert hr_zone(170 * 0.97, 170) == "Z4"
    assert hr_zone(170, 170) == "Z5a"
    assert hr_zone(170 * 1.05, 170) == "Z5b"  # 5K race average
    assert hr_zone(170 * 1.07, 170) == "Z5c"


# ---- workouts --------------------------------------------------------------

def test_progressive_tempo_is_one_block_low_to_high():
    laps = [lap(3, 310)] + [lap(1, p) for p in (268, 266, 264, 262, 260, 258, 257, 256)] + [lap(2, 315)]
    w = analyze_run(run(laps), TH)
    assert w.workout_type == "טמפו"
    roles = [(s.role, s.kind) for s in w.segments]
    assert roles == [("warmup", "easy"), ("main", "hard"), ("cooldown", "easy")]
    assert w.segments[1].zone_label() == "Z4 נמוך→גבוה"
    assert w.recovery_hours == 36


def test_fartlek_keeps_every_part():
    laps = [lap(2, 310), lap(2, 249), lap(1, 320), lap(1, 245), lap(1, 320), lap(1, 240), lap(0.5, 330), lap(2, 315)]
    w = analyze_run(run(laps), TH)
    assert w.workout_type == "פארטלק"
    assert [s.kind for s in w.segments] == ["easy", "hard", "easy", "hard", "easy", "hard", "easy"]
    assert w.dist_by_class["hard"] == 4000


def test_equal_repeats_fold_into_one_line():
    laps = [lap(2, 310)] + [lap(1, 235), lap(0.4, 340)] * 6 + [lap(2, 320)]
    w = analyze_run(run(laps), TH)
    sets = [i for i in w.items if isinstance(i, RepeatSet)]
    assert len(sets) == 1 and len(sets[0].efforts) == 6
    assert w.workout_type == "אינטרוולים עצים"
    assert w.recovery_hours == 48


def test_strides_do_not_make_an_easy_run_a_quality_session():
    laps = [lap(8, 310)] + [Lap(20, 120)] * 4
    assert analyze_run(run(laps), TH).is_quality is False


# ---- load ------------------------------------------------------------------

def test_one_hour_at_threshold_is_100_tss():
    a = run([lap(3600 / 255, 255)])
    tss, how = activity_tss(a, TH)
    assert tss == pytest.approx(100, abs=0.5) and how == "rTSS"


def test_ctl_and_atl_rise_and_tsb_uses_yesterday():
    days = {date(2026, 1, 1) + timedelta(d): 100.0 for d in range(60)}
    chart = performance_chart(days, date(2026, 3, 1))
    last = chart[date(2026, 3, 1)]
    assert 70 < last["ctl"] < 100 and last["atl"] > last["ctl"]
    assert chart[date(2026, 1, 1)]["tsb"] == 0


def test_week_bounds_sunday_and_monday():
    assert week_bounds(date(2026, 11, 18), "sunday") == (date(2026, 11, 15), date(2026, 11, 21))
    assert week_bounds(date(2026, 11, 18), "monday") == (date(2026, 11, 16), date(2026, 11, 22))


# ---- whole week ------------------------------------------------------------

@pytest.fixture(scope="module")
def demo():
    subprocess.run([sys.executable, str(ROOT / "examples" / "make_demo.py")], check=True, capture_output=True)
    return {n: load_athlete_file(ROOT / "examples" / "athletes" / f"{n}.json") for n in ("dani", "michal")}


def test_dani_week(demo):
    athlete, acts, planned = demo["dani"]
    s = analyze_week(athlete, acts, date(2026, 11, 15), planned)
    assert s["volume"]["run_km"] == 80
    assert s["intensity"]["km_by_class"]["hard"] == 12
    types = [w["type"] for w in s["workouts"] if w["quality"]]
    assert types == ["טמפו", "פארטלק"]
    assert not [f for f in s["flags"] if f["level"] in ("alert", "warn")]
    text = render_athlete(s)
    assert "8 ק\"מ Z4 נמוך→גבוה" in text


def test_michal_week_raises_the_right_flags(demo):
    athlete, acts, planned = demo["michal"]
    s = analyze_week(athlete, acts, date(2026, 11, 15), planned)
    text = " ".join(f["text"] for f in s["flags"])
    assert s["flags"][0]["level"] == "alert" and "כאב" in s["flags"][0]["text"]
    assert "קפיצה בנפח" in text
    assert "שני אימוני איכות צמודים" in text
    assert "באזור האפור" in text
    assert "לא בוצע" in text


# ---- FIT -------------------------------------------------------------------

def test_fit_file_roundtrip(tmp_path):
    from garmin_fit_sdk import Encoder, Profile

    from coach_agent.io_fit import read_fit

    mn = Profile["mesg_num"]
    t0 = datetime(2026, 11, 17, 4, 0, tzinfo=timezone.utc)
    enc = Encoder()
    enc.on_mesg(mn["FILE_ID"], {"type": "activity", "manufacturer": "development", "product": 0,
                                "time_created": t0, "serial_number": 1})
    for i in range(0, 600, 1):
        enc.on_mesg(mn["RECORD"], {"timestamp": t0 + timedelta(seconds=i), "heart_rate": 150,
                                   "enhanced_speed": 1000 / 300, "distance": i * 1000 / 300})
    t = t0
    for dur, d, hr in ((300.0, 1000.0, 145), (300.0, 1000.0, 160)):
        enc.on_mesg(mn["LAP"], {"timestamp": t + timedelta(seconds=dur), "start_time": t,
                                "total_timer_time": dur, "total_elapsed_time": dur,
                                "total_distance": d, "avg_heart_rate": hr})
        t += timedelta(seconds=dur)
    enc.on_mesg(mn["SESSION"], {"timestamp": t, "start_time": t0, "sport": "running", "sub_sport": "generic",
                                "total_timer_time": 600.0, "total_elapsed_time": 600.0,
                                "total_distance": 2000.0, "avg_heart_rate": 152})
    path = tmp_path / "run.fit"
    path.write_bytes(enc.close())

    a = read_fit(path)
    assert a.sport == "run" and a.distance_m == 2000 and len(a.laps) == 2
    assert a.start == datetime(2026, 11, 17, 6, 0)  # Israel time
    assert a.laps[1].avg_hr == 160 and len(a.records) == 600
