"""Generate example TrainingPeaks-style exports (fake data) for the demo config.

dana, yossi: workout-summary CSV with heart-rate zones.
noa: CSV plus one .fit activity file per run, analysed by pace per RPE level.
Run from the coach-agent folder: python3 examples/make_sample_data.py
"""
import csv
import random
import sys
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from coach_agent.sources.activity_files import write_fit  # noqa: E402

COLS = ["Title", "WorkoutType", "WorkoutDescription", "PlannedDuration", "PlannedDistanceInMeters",
        "WorkoutDay", "CoachComments", "DistanceInMeters", "TimeTotalInHours", "HeartRateAverage",
        "TSS"] + [f"HRZone{i}Minutes" for i in range(1, 6)] + ["AthleteComments"]

# (weekday, title, planned minutes, km, zone profile in fractions Z1..Z5)
PLAN = [
    (6, "ריצה קלה", 45, 8, [.3, .65, .05, 0, 0]),
    (1, "אינטרוולים 6x800", 60, 11, [.25, .35, .1, .2, .1]),
    (2, "ריצה קלה", 40, 7, [.3, .65, .05, 0, 0]),
    (3, "טמפו 20 דק'", 55, 10, [.2, .35, .1, .35, 0]),
    (5, "ריצה ארוכה", 100, 18, [.15, .75, .1, 0, 0]),
]


def make(path: Path, seed: int, end: date, weeks: int, sloppiness: float):
    rnd = random.Random(seed)
    rows = []
    start = end - timedelta(weeks=weeks)
    d = start
    while d <= end:
        for wd, title, mins, km, prof in PLAN:
            if d.weekday() != wd:
                continue
            row = {c: "" for c in COLS}
            row.update(Title=title, WorkoutType="Run", WorkoutDay=d.isoformat(),
                       PlannedDuration=f"{mins/60:.3f}", PlannedDistanceInMeters=str(km * 1000))
            r = rnd.random()
            if r < 0.08 * sloppiness:      # missed
                rows.append(row); continue
            factor = rnd.uniform(0.85, 1.1) if r > 0.2 * sloppiness else rnd.uniform(0.55, 0.75)
            prof = list(prof)
            if "קלה" in title and rnd.random() < 0.3 * sloppiness:   # easy run too hard
                prof = [.1, .5, .3, .1, 0]
            done = mins * factor
            row.update(TimeTotalInHours=f"{done/60:.3f}", DistanceInMeters=f"{km*factor*1000:.0f}",
                       HeartRateAverage=str(rnd.randint(138, 158)), TSS=f"{done*0.9:.0f}")
            for i, f in enumerate(prof, 1):
                row[f"HRZone{i}Minutes"] = f"{done*f:.1f}"
            rows.append(row)
        d += timedelta(days=1)
    # one unplanned run
    extra = {c: "" for c in COLS}
    extra.update(Title="ריצה עם חברים", WorkoutType="Run", WorkoutDay=(end - timedelta(days=3)).isoformat(),
                 TimeTotalInHours="0.6", DistanceInMeters="6500", HRZone1Minutes="10", HRZone2Minutes="20",
                 HRZone3Minutes="6")
    rows.append(extra)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, COLS); w.writeheader(); w.writerows(rows)


# Noa's paces per RPE level (same as in config.json): 4=5:30 5=4:50 6=4:20 7=4:10 8=4:00 9=3:45
EASY, R6, R7, R8 = 335, 260, 250, 240
# (weekday, title, description, phases [(minutes, sec per km)])
RPE_PLAN = [
    (6, "ריצה קלה", "45 דק' בתחושת מאמץ 3-4", [(45, EASY)]),
    (1, "אינטרוולים", "חימום 15 דק', 6x3 דק' בתחושת מאמץ 8 עם 2 דק' התאוששות, שחרור 10 דק'",
     [(15, EASY)] + [(3, R8), (2, 390)] * 6 + [(10, EASY)]),
    (2, "ריצה קלה", "40 דק' בתחושת מאמץ 3-4", [(40, EASY)]),
    (3, "טמפו", "חימום 15 דק', 20 דק' בתחושת מאמץ 6-7, שחרור 10 דק'", [(15, EASY), (20, 255), (10, EASY)]),
    (5, "ריצה ארוכה", "85 דק' בתחושת מאמץ 4, 15 דק' אחרונות בתחושת מאמץ 6",
     [(85, EASY), (15, R6)]),
]


def make_rpe(csv_path: Path, files_dir: Path, seed: int, end: date, weeks: int):
    rnd = random.Random(seed)
    files_dir.mkdir(parents=True, exist_ok=True)
    for old in files_dir.glob("*.fit"):
        old.unlink()
    tz = ZoneInfo("Asia/Jerusalem")
    rows = []
    d = end - timedelta(weeks=weeks)
    while d <= end:
        for wd, title, desc, phases in RPE_PLAN:
            if d.weekday() != wd:
                continue
            planned_min = sum(m for m, _ in phases)
            planned_km = sum(m * 60 / p for m, p in phases)
            row = {c: "" for c in COLS}
            row.update(Title=title, WorkoutType="Run", WorkoutDay=d.isoformat(), WorkoutDescription=desc,
                       PlannedDuration=f"{planned_min/60:.3f}", PlannedDistanceInMeters=f"{planned_km*1000:.0f}")
            r = rnd.random()
            if r < 0.05:  # missed
                rows.append(row)
                continue
            actual = list(phases)
            if r < 0.25 and title == "טמפו":            # tempo run too fast (RPE 8 instead of 6-7)
                actual = [(15, EASY), (20, 238), (10, EASY)]
            elif r < 0.35 and title == "אינטרוולים":    # stopped after 3 reps
                actual = [(15, EASY)] + [(3, R8), (2, 390)] * 3 + [(10, EASY)]
            elif r < 0.45 and title == "ריצה קלה":      # easy run pushed to RPE 6
                actual = [(20, EASY), (20, 265)]
            t = datetime(d.year, d.month, d.day, 6, 0, tzinfo=tz)
            dist, recs = 0.0, [(t, 0.0)]
            for mins, pace in actual:
                for _ in range(int(mins * 60 / 5)):
                    t += timedelta(seconds=5)
                    dist += 5 * 1000 / (pace * rnd.uniform(0.97, 1.03))
                    recs.append((t, dist))
            write_fit(files_dir / f"{d.isoformat()}-{title.replace(' ', '_')}.fit", recs)
            total_min = sum(m for m, _ in actual)
            row.update(TimeTotalInHours=f"{total_min/60:.3f}", DistanceInMeters=f"{dist:.0f}",
                       TSS=f"{total_min*0.9:.0f}")
            rows.append(row)
        d += timedelta(days=1)
    with open(csv_path, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, COLS)
        w.writeheader()
        w.writerows(rows)


if __name__ == "__main__":
    here = Path(__file__).parent / "data"
    here.mkdir(exist_ok=True)
    end = date(2026, 11, 8)
    make(here / "dana.csv", 1, end, 6, 0.5)
    make(here / "yossi.csv", 2, end, 6, 2.0)
    make_rpe(here / "noa.csv", here / "noa_files", 3, end, 6)
