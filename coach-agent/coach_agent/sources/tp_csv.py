"""Read the TrainingPeaks "Export workout summary" CSV (workouts.csv).

In TrainingPeaks: Settings → Export Data → Workout Summary (per athlete, choose a date range).
Columns used (TrainingPeaks units): WorkoutDay, WorkoutType, Title, WorkoutDescription,
PlannedDuration (hours), PlannedDistanceInMeters, TimeTotalInHours, DistanceInMeters,
HeartRateAverage, TSS, HRZone1Minutes..HRZone10Minutes, PWRZone*/PaceZone*Minutes,
CoachComments, AthleteComments. Missing columns are tolerated.
"""
from __future__ import annotations

import csv
from datetime import date, datetime
from pathlib import Path

from ..models import Workout


def _f(row: dict, key: str) -> float | None:
    v = (row.get(key) or "").strip()
    if not v:
        return None
    try:
        return float(v.replace(",", ""))
    except ValueError:
        return None


def _parse_day(v: str) -> date:
    v = v.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(v[:19] if "T" in v else v, fmt).date()
        except ValueError:
            continue
    raise ValueError(f"unrecognised date: {v!r}")


def _zones(row: dict, prefix: str) -> list[float]:
    out = []
    for i in range(1, 11):
        out.append(_f(row, f"{prefix}{i}Minutes") or 0.0)
    while out and out[-1] == 0:
        out.pop()
    return out


def row_to_workout(row: dict, zone_source: str = "auto") -> Workout:
    hr, pace = _zones(row, "HRZone"), _zones(row, "PaceZone")
    if zone_source == "hr":
        zones = hr
    elif zone_source == "pace":
        zones = pace
    else:
        zones = hr if sum(hr) > 0 else pace
    pdur, dur = _f(row, "PlannedDuration"), _f(row, "TimeTotalInHours")
    pdist, dist = _f(row, "PlannedDistanceInMeters"), _f(row, "DistanceInMeters")
    return Workout(
        day=_parse_day(row["WorkoutDay"]),
        sport=(row.get("WorkoutType") or "Run").strip(),
        title=(row.get("Title") or "").strip(),
        description=(row.get("WorkoutDescription") or "").strip(),
        planned_duration_min=pdur * 60 if pdur else None,
        planned_distance_km=pdist / 1000 if pdist else None,
        duration_min=dur * 60 if dur else None,
        distance_km=dist / 1000 if dist else None,
        zone_minutes=zones,
        avg_hr=_f(row, "HeartRateAverage"),
        tss=_f(row, "TSS"),
        coach_comments=(row.get("CoachComments") or "").strip(),
        athlete_comments=(row.get("AthleteComments") or "").strip(),
    )


def load_csv(path: str | Path, zone_source: str = "auto") -> list[Workout]:
    with open(path, newline="", encoding="utf-8-sig") as fh:
        return [row_to_workout(r, zone_source) for r in csv.DictReader(fh) if r.get("WorkoutDay")]
