"""Data the engine works on.

Every data source (TrainingPeaks, Garmin, a folder of FIT files, JSON) is turned
into these few classes, so the analysis never depends on where data came from.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime


@dataclass
class Lap:
    """One lap or workout step. Structured Garmin workouts make one lap per step."""

    duration_s: float
    distance_m: float = 0.0
    avg_hr: float | None = None
    elevation_gain_m: float | None = None
    # warmup / active / rest / cooldown when the watch knows it (structured workouts)
    intensity: str | None = None

    @property
    def pace_s_per_km(self) -> float | None:
        if self.distance_m <= 0 or self.duration_s <= 0:
            return None
        return self.duration_s / (self.distance_m / 1000.0)


@dataclass
class Record:
    """One sample of the second-by-second stream (optional)."""

    t: float  # seconds since the activity started
    speed_mps: float | None = None
    hr: float | None = None


@dataclass
class Activity:
    id: str
    start: datetime  # local time of the athlete
    sport: str  # run | bike | swim | strength | other
    duration_s: float
    distance_m: float = 0.0
    title: str = ""
    avg_hr: float | None = None
    elevation_gain_m: float | None = None
    laps: list[Lap] = field(default_factory=list)
    records: list[Record] = field(default_factory=list)
    rpe: float | None = None  # 1-10, what the athlete reported
    comment: str = ""  # what the athlete wrote after the workout
    tss: float | None = None  # when the source already calculated it

    @property
    def day(self) -> date:
        return self.start.date()

    @property
    def is_run(self) -> bool:
        return self.sport == "run"

    def laps_or_whole(self) -> list[Lap]:
        """Laps if the watch recorded them, otherwise the whole activity as one lap."""
        if self.laps:
            return self.laps
        return [Lap(self.duration_s, self.distance_m, self.avg_hr, self.elevation_gain_m)]


@dataclass
class RaceResult:
    """A recent 5K / 10K (or half marathon) used to set the threshold."""

    date: date
    distance_m: float
    time_s: float
    avg_hr: float | None = None
    is_race: bool = True  # False = an all-out solo test in training


@dataclass
class PlannedWorkout:
    """A workout the coach planned (TrainingPeaks calendar).

    The target zones / paces / RPE are optional. Without them, the intent is
    guessed from the title ("קלה" -> Z1-Z2, "טמפו" -> Z4-Z5a ...).
    """

    date: date
    title: str
    distance_m: float | None = None
    duration_s: float | None = None
    sport: str = "run"
    zone_min: str | None = None  # e.g. "Z1"
    zone_max: str | None = None  # e.g. "Z2"
    pace_fast_s: float | None = None  # fastest planned pace, s/km
    pace_slow_s: float | None = None
    rpe: float | None = None


@dataclass
class GoalRace:
    name: str
    date: date
    distance_m: float
    target_time_s: float | None = None
    priority: str = "A"  # A / B / C


@dataclass
class Profile:
    """What the coach told us about the athlete in the questionnaire."""

    week_start: str = "sunday"  # any day: sunday, monday, ... saturday
    zone_source: str = "pace"  # pace / hr / max (the harder of the two)
    birth_year: int | None = None
    years_running: float | None = None
    goal_races: list[GoalRace] = field(default_factory=list)
    weekly_km_min: float | None = None
    weekly_km_max: float | None = None
    max_quality_per_week: int | None = None
    max_weekly_increase: float = 0.15  # 0.10 = 10%
    # Long run (LSD) progression vs the longest run of the last 3 weeks, in km.
    lsd_increase_min_km: float = 0.5
    lsd_increase_max_km: float = 2.5
    # Intensity progression: hard km (Z4+) per week vs the last 3 weeks. None = not checked.
    hard_km_increase_max: float | None = None
    injuries: list[str] = field(default_factory=list)  # body areas to watch, e.g. "אכילס", "שוק"
    medical_notes: str = ""
    max_hr: int | None = None
    resting_hr: int | None = None
    sleep_hours: float | None = None
    life_load: str = ""  # work, stress, kids, shifts
    other_sports: list[str] = field(default_factory=list)
    coach_notes: str = ""  # what to pay attention to with this athlete


@dataclass
class Athlete:
    id: str
    name: str
    profile: Profile = field(default_factory=Profile)
    races: list[RaceResult] = field(default_factory=list)
    # Manual overrides by the coach. They win over anything calculated.
    threshold_pace_s_per_km: float | None = None
    lthr: float | None = None
    # Daily TSS before the data we have (e.g. from TrainingPeaks) so fitness starts right.
    tss_history: dict[date, float] = field(default_factory=dict)
    timezone: str = "Asia/Jerusalem"
