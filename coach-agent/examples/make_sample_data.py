"""Generate example TrainingPeaks-style CSV exports (fake data) for the demo config."""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

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


if __name__ == "__main__":
    here = Path(__file__).parent / "data"
    here.mkdir(exist_ok=True)
    end = date(2026, 11, 8)
    make(here / "dana.csv", 1, end, 6, 0.5)
    make(here / "yossi.csv", 2, end, 6, 2.0)
    make(here / "noa.csv", 3, end, 6, 1.0)
