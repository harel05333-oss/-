import unittest
from datetime import date
from pathlib import Path

from coach_agent.analysis import analyze_athlete, analyze_workout
from coach_agent.models import Athlete, Workout, parse_weekday
from coach_agent.sources.tp_api import workout_from_api
from coach_agent.sources.tp_csv import load_csv
from coach_agent.weeks import group_by_week, week_start_for

TODAY = date(2026, 11, 20)


def run(day, title="ריצה קלה", pmin=None, dmin=None, km=None, zones=()):
    return Workout(day=day, title=title, planned_duration_min=pmin, duration_min=dmin,
                   distance_km=km, zone_minutes=list(zones))


class Weeks(unittest.TestCase):
    def test_parse_weekday_he_en(self):
        self.assertEqual(parse_weekday("ראשון"), 6)
        self.assertEqual(parse_weekday("יום שבת"), 5)
        self.assertEqual(parse_weekday("Tuesday"), 1)

    def test_week_start(self):
        thu = date(2026, 11, 5)
        self.assertEqual(week_start_for(thu, 0), date(2026, 11, 2))   # Monday (TrainingPeaks)
        self.assertEqual(week_start_for(thu, 6), date(2026, 11, 1))   # Sunday
        self.assertEqual(week_start_for(thu, 5), date(2026, 10, 31))  # Saturday
        self.assertEqual(week_start_for(thu, 1), date(2026, 11, 3))   # Tuesday

    def test_sunday_and_monday_weeks_split_differently(self):
        sun, mon = date(2026, 11, 1), date(2026, 11, 2)
        ws = [run(sun, dmin=30, km=5), run(mon, dmin=30, km=5)]
        self.assertEqual([len(v) for v in group_by_week(ws, 0).values()], [1, 1])
        self.assertEqual([len(v) for v in group_by_week(ws, 6).values()], [2])


class Analysis(unittest.TestCase):
    a = Athlete(id="x", name="x", week_start=6)

    def test_statuses(self):
        self.assertEqual(analyze_workout(run(date(2026, 11, 1), pmin=40), self.a, TODAY).status, "missed")
        self.assertEqual(analyze_workout(run(date(2026, 11, 1), pmin=40, dmin=41), self.a, TODAY).status, "ok")
        self.assertEqual(analyze_workout(run(date(2026, 11, 1), pmin=40, dmin=25), self.a, TODAY).status, "partial")
        self.assertEqual(analyze_workout(run(date(2026, 11, 1), dmin=30), self.a, TODAY).status, "unplanned")
        self.assertEqual(analyze_workout(run(date(2026, 11, 30), pmin=40), self.a, TODAY).status, "planned")

    def test_easy_run_too_hard_is_flagged_and_counted_as_quality(self):
        r = analyze_workout(run(date(2026, 11, 1), pmin=40, dmin=40, km=8, zones=[5, 15, 15, 5]), self.a, TODAY)
        self.assertEqual(r.kind, "quality")
        self.assertEqual((r.easy_min, r.hard_min), (20, 20))
        self.assertEqual((r.easy_km, r.hard_km), (4, 4))
        self.assertTrue(any("חזק מדי" in f for f in r.flags))

    def test_weekly_totals(self):
        ws = [
            run(date(2026, 11, 1), pmin=40, dmin=40, km=8, zones=[10, 30]),
            run(date(2026, 11, 3), "אינטרוולים", pmin=60, dmin=60, km=12, zones=[10, 20, 10, 20]),
            run(date(2026, 11, 5), pmin=40),  # missed
        ]
        (wk,) = analyze_athlete(ws, self.a, TODAY)
        self.assertEqual(wk.week_start, date(2026, 11, 1))
        self.assertEqual((wk.runs, wk.easy_runs, wk.quality_runs, wk.missed), (2, 1, 1, 1))
        self.assertEqual(wk.km, 20)
        self.assertEqual(wk.easy_pct, 70.0)  # 70 of 100 minutes in Z1-Z2
        self.assertEqual(wk.completion_pct, round(100 * 100 / 140, 1))


class Sources(unittest.TestCase):
    def test_csv(self):
        path = Path(__file__).parent.parent / "examples" / "data" / "dana.csv"
        ws = load_csv(path)
        self.assertTrue(ws)
        done = next(w for w in ws if w.is_completed and w.is_planned)
        self.assertTrue(done.has_zone_data and done.distance_km > 0)

    def test_api_mapping(self):
        w = workout_from_api({"WorkoutDay": "2026-11-03T00:00:00", "WorkoutType": 3, "Title": "Tempo",
                              "TotalTime": 1.0, "TotalTimePlanned": 1.0, "Distance": 12000})
        self.assertTrue(w.is_run)
        self.assertEqual((w.day, w.duration_min, w.distance_km), (date(2026, 11, 3), 60, 12))


if __name__ == "__main__":
    unittest.main()


class Rpe(unittest.TestCase):
    from coach_agent.rpe import RpeScale
    scale = RpeScale.from_config({"6": "4:20", "7": "4:10", "8": "4:00"}, easy_max_rpe=4)

    def test_pace_to_level(self):
        from coach_agent.rpe import parse_pace
        lvl = lambda p: self.scale.level_for_pace(parse_pace(p))
        self.assertEqual([lvl("4:20"), lvl("4:10"), lvl("4:00")], [6, 7, 8])
        self.assertEqual(lvl("4:12"), 7)
        self.assertEqual(lvl("3:40"), 8)          # faster than the fastest level
        self.assertEqual(lvl("5:30"), 4)          # well slower than RPE 6 -> easy
        self.assertEqual(self.scale.label(4), "1-4")

    def test_planned_blocks(self):
        from coach_agent.rpe import parse_planned_blocks
        bs = parse_planned_blocks("חימום 15 דק', 20 דק' בתחושת מאמץ 6-8, שחרור 10 דק'")
        self.assertEqual([(b.minutes, b.lo, b.hi) for b in bs], [(20, 6, 8)])
        bs = parse_planned_blocks("WU 15', 4x5 min @ RPE 8, 2x3' RPE 9")
        self.assertEqual(sorted((b.minutes, b.lo, b.hi) for b in bs), [(6, 9, 9), (20, 8, 8)])

    def test_fit_roundtrip_and_minutes_per_level(self):
        import tempfile
        from datetime import datetime, timedelta, timezone
        from coach_agent.sources.activity_files import attach_activity_files, read_activity, write_fit
        # 10' easy (5:30), 5' at 4:20 (RPE 6), 5' at 4:10 (RPE 7), 5' at 4:00 (RPE 8), 10' easy
        phases = [(10, 330), (5, 260), (5, 250), (5, 240), (10, 330)]
        t, dist = datetime(2026, 11, 3, 4, 0, tzinfo=timezone.utc), 0.0
        recs = [(t, 0.0)]
        for mins, pace in phases:
            for _ in range(mins * 60):
                t += timedelta(seconds=1)
                dist += 1000 / pace
                recs.append((t, dist))
        with tempfile.TemporaryDirectory() as tmp:
            write_fit(Path(tmp) / "run.fit", recs)
            back = read_activity(Path(tmp) / "run.fit")
            self.assertEqual(len(back), len(recs))
            self.assertAlmostEqual(back[-1][1], dist, places=1)
            w = Workout(day=date(2026, 11, 3), title="טמפו", description="15 דק' במאמץ 6-8",
                        planned_duration_min=35, duration_min=35, distance_km=dist / 1000)
            self.assertEqual(attach_activity_files([w], tmp), [])
        a = Athlete(id="x", name="x", rpe=self.scale)
        r = analyze_workout(w, a, TODAY)
        self.assertEqual(r.method, "rpe")
        for label, expected in [("1-4", 20), ("6", 5), ("7", 5), ("8", 5)]:
            self.assertAlmostEqual(r.rpe[label]["min"], expected, delta=0.6)
        self.assertEqual(r.rpe_blocks[0]["rpe"], "6-8")
        self.assertAlmostEqual(r.rpe_blocks[0]["actual_min"], 15, delta=0.6)
        self.assertEqual(r.kind, "quality")
