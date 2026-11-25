"""Read and write an athlete's data as JSON (one file per athlete).

Times may be seconds (number) or "mm:ss" / "h:mm:ss". Distances in km.
See examples/ for the full shape.
"""
from __future__ import annotations

import json
from datetime import date, datetime
from pathlib import Path

from .models import Activity, Athlete, Lap, PlannedWorkout, RaceResult, Record


def parse_time(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    parts = [float(p) for p in str(v).split(":")]
    s = 0.0
    for p in parts:
        s = s * 60 + p
    return s


def _km(v) -> float:
    return float(v or 0) * 1000.0


def athlete_from_dict(d: dict) -> Athlete:
    return Athlete(
        id=str(d["id"]),
        name=d["name"],
        races=[
            RaceResult(
                date=date.fromisoformat(r["date"]),
                distance_m=_km(r["distance_km"]),
                time_s=parse_time(r["time"]),
                avg_hr=r.get("avg_hr"),
                is_race=r.get("is_race", True),
            )
            for r in d.get("races", [])
        ],
        threshold_pace_s_per_km=parse_time(d.get("threshold_pace")),
        lthr=d.get("lthr"),
        tss_history={date.fromisoformat(k): float(v) for k, v in d.get("tss_history", {}).items()},
        timezone=d.get("timezone", "Asia/Jerusalem"),
    )


def activity_from_dict(d: dict) -> Activity:
    laps = [
        Lap(
            duration_s=parse_time(l["duration"]),
            distance_m=_km(l.get("distance_km")),
            avg_hr=l.get("avg_hr"),
            elevation_gain_m=l.get("elevation_gain_m"),
            intensity=l.get("intensity"),
        )
        for l in d.get("laps", [])
    ]
    duration = parse_time(d.get("duration")) or sum(l.duration_s for l in laps)
    distance = _km(d["distance_km"]) if d.get("distance_km") is not None else sum(l.distance_m for l in laps)
    avg_hr = d.get("avg_hr")
    if avg_hr is None and laps and all(l.avg_hr for l in laps):
        avg_hr = round(sum(l.avg_hr * l.duration_s for l in laps) / sum(l.duration_s for l in laps))
    return Activity(
        id=str(d.get("id") or d["start"]),
        start=datetime.fromisoformat(d["start"]),
        sport=d.get("sport", "run"),
        duration_s=duration,
        distance_m=distance,
        title=d.get("title", ""),
        avg_hr=avg_hr,
        elevation_gain_m=d.get("elevation_gain_m"),
        laps=laps,
        records=[Record(**r) for r in d.get("records", [])],
        rpe=d.get("rpe"),
        comment=d.get("comment", ""),
        tss=d.get("tss"),
    )


def planned_from_dict(d: dict) -> PlannedWorkout:
    return PlannedWorkout(
        date=date.fromisoformat(d["date"]),
        title=d.get("title", ""),
        distance_m=_km(d["distance_km"]) if d.get("distance_km") else None,
        duration_s=parse_time(d.get("duration")),
        sport=d.get("sport", "run"),
    )


def load_athlete_file(path: str | Path) -> tuple[Athlete, list[Activity], list[PlannedWorkout]]:
    d = json.loads(Path(path).read_text(encoding="utf-8"))
    return (
        athlete_from_dict(d["athlete"]),
        [activity_from_dict(a) for a in d.get("activities", [])],
        [planned_from_dict(p) for p in d.get("planned", [])],
    )
