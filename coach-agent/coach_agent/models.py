"""Core data structures: a workout and an athlete's coaching settings."""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date

# Day names a coach may use for the start of an athlete's week (English or Hebrew).
WEEKDAYS = {
    "monday": 0, "mon": 0, "שני": 0,
    "tuesday": 1, "tue": 1, "שלישי": 1,
    "wednesday": 2, "wed": 2, "רביעי": 2,
    "thursday": 3, "thu": 3, "חמישי": 3,
    "friday": 4, "fri": 4, "שישי": 4,
    "saturday": 5, "sat": 5, "שבת": 5,
    "sunday": 6, "sun": 6, "ראשון": 6,
}
WEEKDAY_HE = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]


def parse_weekday(value: str | int) -> int:
    if isinstance(value, int):
        if 0 <= value <= 6:
            return value
        raise ValueError(f"weekday must be 0-6, got {value}")
    key = value.strip().lower()
    if key.startswith("יום "):
        key = key[4:]
    if key not in WEEKDAYS:
        raise ValueError(f"unknown weekday: {value!r}")
    return WEEKDAYS[key]


@dataclass
class Workout:
    day: date
    sport: str = "Run"
    title: str = ""
    description: str = ""
    planned_duration_min: float | None = None
    planned_distance_km: float | None = None
    duration_min: float | None = None
    distance_km: float | None = None
    # Minutes in each zone, index 0 = zone 1.
    zone_minutes: list[float] = field(default_factory=list)
    avg_hr: float | None = None
    tss: float | None = None
    coach_comments: str = ""
    athlete_comments: str = ""

    @property
    def is_run(self) -> bool:
        return self.sport.strip().lower() in {"run", "running", "ריצה", "trail run", "treadmill"}

    @property
    def is_planned(self) -> bool:
        return bool(self.planned_duration_min) or bool(self.planned_distance_km)

    @property
    def is_completed(self) -> bool:
        return bool(self.duration_min) or bool(self.distance_km)

    @property
    def has_zone_data(self) -> bool:
        return sum(self.zone_minutes) > 0


@dataclass
class Athlete:
    id: str
    name: str
    week_start: int = 0  # 0 = Monday (TrainingPeaks default), 6 = Sunday
    easy_max_zone: int = 2  # zones 1..easy_max_zone count as easy
    target_easy_pct: float = 80.0
    weekly_km_target: float | None = None
    quality_min_minutes: float = 10.0  # minutes above easy that make a run a "quality" session
    easy_tolerance_min: float = 5.0  # minutes above easy allowed in a planned easy run
    tp_athlete_id: str | None = None
    csv: str | None = None

    @classmethod
    def from_dict(cls, d: dict) -> "Athlete":
        return cls(
            id=str(d["id"]),
            name=d.get("name", d["id"]),
            week_start=parse_weekday(d.get("week_start", "monday")),
            easy_max_zone=int(d.get("easy_max_zone", 2)),
            target_easy_pct=float(d.get("target_easy_pct", 80)),
            weekly_km_target=d.get("weekly_km_target"),
            quality_min_minutes=float(d.get("quality_min_minutes", 10)),
            easy_tolerance_min=float(d.get("easy_tolerance_min", 5)),
            tp_athlete_id=(str(d["tp_athlete_id"]) if d.get("tp_athlete_id") else None),
            csv=d.get("csv"),
        )


@dataclass
class Coach:
    id: str
    name: str
    athletes: list[Athlete]

    @classmethod
    def from_dict(cls, d: dict) -> "Coach":
        return cls(
            id=str(d["id"]),
            name=d.get("name", d["id"]),
            athletes=[Athlete.from_dict(a) for a in d.get("athletes", [])],
        )
