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
