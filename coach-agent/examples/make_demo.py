"""Build demo data: two made-up athletes, 8 weeks each, ending on the week of 15.11.2026.

  python examples/make_demo.py   ->  examples/athletes/*.json

Dani: a solid 80 km week with a progressive tempo and a fartlek, improving.
Michal: volume jump, quality sessions back to back, easy runs too fast, a pain note.
"""
from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta
from pathlib import Path

OUT = Path(__file__).parent / "athletes"
TARGET_SUNDAY = date(2026, 11, 15)
WEEKS = 8


def mmss(s: float) -> str:
    m, s = divmod(round(s), 60)
    return f"{m}:{s:02d}"


def laps(*parts):
    """parts: (km, pace 'm:ss', hr) -> laps, splitting long parts into 1 km laps."""
    out = []
    for km_, p, hr in parts:
        m, s = p.split(":")
        pace_s = int(m) * 60 + int(s)
        left = km_
        while left > 1e-6:
            d = 1.0 if left > 1.0 + 1e-6 else left
            out.append({"distance_km": round(d, 3), "duration": mmss(pace_s * d), "avg_hr": hr})
            left -= d
    return out


def run(day: date, title: str, lap_list, rpe=None, comment="", hour=6):
    return {
        "id": f"{day.isoformat()}-{title}",
        "start": datetime.combine(day, time(hour, 0)).isoformat(),
        "sport": "run",
        "title": title,
        "laps": lap_list,
        **({"rpe": rpe} if rpe else {}),
        **({"comment": comment} if comment else {}),
    }


def easy(day, km_, pace="5:10", hr=145, **kw):
    return run(day, "קלה", laps((km_, pace, hr)), **kw)


def dani():
    acts = []
    for w in range(WEEKS - 1, 0, -1):  # history weeks, easy HR a bit higher early on
        sun = TARGET_SUNDAY - timedelta(days=7 * w)
        hr_easy = 146 + w  # aerobic efficiency improves week to week
        acts += [
            easy(sun, 10, hr=hr_easy),
            easy(sun + timedelta(1), 8, hr=hr_easy),
            run(sun + timedelta(2), "טמפו", laps((3, "5:10", hr_easy), (6, "4:24", 165), (2, "5:15", 150)), rpe=7),
            easy(sun + timedelta(3), 10, hr=hr_easy),
            run(sun + timedelta(4), "אינטרוולים", laps(
                (2, "5:10", hr_easy), *[(1, "4:10", 171), (0.4, "5:40", 150)] * 5, (2, "5:20", 148)), rpe=8),
            easy(sun + timedelta(5), 6, pace="5:40", hr=135),
            # long run grows 1.5 km a week, with an easier week every 4th week (3:1)
            easy(sun + timedelta(6), 14 if w == 4 else 22 - 1.5 * w, pace="5:05", hr=hr_easy + 2),
        ]
    s = TARGET_SUNDAY
    acts += [
        easy(s, 10, hr=146, rpe=3),
        easy(s + timedelta(1), 8, hr=144, rpe=3),
        run(s + timedelta(2), "טמפו פרוגרסיבי", laps(
            (3, "5:10", 145),
            (1, "4:28", 160), (1, "4:27", 162), (1, "4:25", 164), (1, "4:23", 165),
            (1, "4:21", 166), (1, "4:19", 167), (1, "4:17", 168), (1, "4:16", 169),
            (2, "5:15", 150)), rpe=7, comment="הרגשתי חזק, סיימתי עם כוח"),
        easy(s + timedelta(3), 10, hr=145, rpe=3),
        run(s + timedelta(4), "פארטלק", laps(
            (2, "5:10", 145), (2, "4:09", 171), (1, "5:20", 152), (1, "4:05", 173),
            (1, "5:20", 153), (1, "4:00", 175), (0.5, "5:30", 155), (2, "5:15", 150)), rpe=8),
        easy(s + timedelta(5), 6.5, pace="5:45", hr=133, rpe=2),
        run(s + timedelta(6), "ארוכה", laps(*[(1, "5:00", 144 + i // 5) for i in range(22)]), rpe=5, hour=7),
    ]
    return {
        "athlete": {
            "id": "dani", "name": "דני כהן",
            "profile": {
                "week_start": "sunday", "zone_source": "pace", "birth_year": 1988, "years_running": 6,
                "goal_races": [{"name": "מרתון תל אביב", "date": "2027-02-27", "distance_km": 42.195,
                                "target_time": "2:59:00", "priority": "A"}],
                "weekly_km_min": 70, "weekly_km_max": 85, "max_quality_per_week": 2,
                "coach_notes": "נוטה לרוץ את הקלות מהר מדי",
            },
            "races": [
                {"date": "2026-10-09", "distance_km": 10, "time": "41:40", "is_race": True},
                {"date": "2026-09-18", "distance_km": 5, "time": "20:05", "avg_hr": 178, "is_race": True},
            ],
        },
        "activities": acts,
    }


def michal():
    acts = []
    for w in range(WEEKS - 1, 0, -1):
        sun = TARGET_SUNDAY - timedelta(days=7 * w)
        acts += [
            easy(sun, 8, pace="5:55", hr=148),
            run(sun + timedelta(2), "טמפו", laps((2, "5:55", 148), (4, "5:02", 170), (2, "6:00", 150)), rpe=7),
            easy(sun + timedelta(4), 8, pace="5:55", hr=148),
            easy(sun + timedelta(6), 14, pace="5:50", hr=150),
        ]
    s = TARGET_SUNDAY
    acts += [
        easy(s, 10, pace="5:20", hr=164, rpe=6),  # "easy" run in Z3
        run(s + timedelta(1), "אינטרוולים", laps(
            (2, "5:50", 150), *[(1, "4:38", 182), (0.4, "6:20", 160)] * 6, (2, "6:00", 155)), rpe=9,
            comment="היה קשה מאוד, כאב בשוק ימין בחזרות האחרונות"),
        run(s + timedelta(2), "טמפו", laps((2, "5:50", 152), (6, "4:58", 176), (2, "6:00", 158)), rpe=8, hour=18),
        easy(s + timedelta(3), 9, pace="5:25", hr=165, rpe=8, comment="רגליים כבדות"),
        {"id": "strength-1", "start": datetime.combine(s + timedelta(4), time(19)).isoformat(),
         "sport": "strength", "title": "כוח", "duration": "45:00", "rpe": 6},
        easy(s + timedelta(6), 18, pace="5:35", hr=160, rpe=7),
    ]
    return {
        "athlete": {
            "id": "michal", "name": "מיכל לוי",
            "profile": {
                "week_start": "sunday", "zone_source": "pace", "birth_year": 1979, "years_running": 3,
                "goal_races": [{"name": "חצי מרתון ירושלים", "date": "2027-03-19", "distance_km": 21.1,
                                "target_time": "1:45:00", "priority": "A"}],
                "weekly_km_min": 35, "weekly_km_max": 45, "max_quality_per_week": 2,
                "max_weekly_increase": 0.10, "injuries": ["שוק", "אכילס"],
                "life_load": "עבודה במשמרות",
            },
            "races": [{"date": "2026-10-23", "distance_km": 5, "time": "22:30", "avg_hr": 186, "is_race": True}],
        },
        "activities": acts,
        "planned": [
            {"date": s.isoformat(), "title": "ריצה קלה 10 ק\"מ", "distance_km": 10, "zone_min": "Z1", "zone_max": "Z2"},
            {"date": (s + timedelta(1)).isoformat(), "title": "אינטרוולים 6×1000", "zone_min": "Z5a", "zone_max": "Z5a",
             "pace_fast": "4:40", "pace_slow": "4:45", "rpe": 7},
            {"date": (s + timedelta(5)).isoformat(), "title": "ריצת התאוששות 6 ק\"מ", "distance_km": 6},
        ],
    }


if __name__ == "__main__":
    OUT.mkdir(exist_ok=True)
    for name, data in (("dani", dani()), ("michal", michal())):
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
        print(OUT / f"{name}.json")
