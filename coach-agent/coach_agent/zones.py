"""Training zones (Joe Friel): by pace from threshold pace, and by heart rate from LTHR.

Pace zones use the ratio  pace / threshold pace  (above 1 = slower than threshold).
Heart-rate zones use  avg HR / LTHR.
Each list goes from the hardest zone to the easiest; a value belongs to the
first zone whose bound it does not pass. Coaches can pass their own tables.
"""
from __future__ import annotations

from dataclasses import dataclass

from .models import Lap
from .threshold import Thresholds

ZONES = ["Z1", "Z2", "Z3", "Z4", "Z5a", "Z5b", "Z5c"]

# (zone, slowest pace ratio still in the zone). 10K race pace ~ 0.98 -> Z5a, 5K ~ 0.94 -> Z5b.
PACE_ZONES: list[tuple[str, float]] = [
    ("Z5c", 0.900),
    ("Z5b", 0.965),
    ("Z5a", 1.000),  # threshold pace itself is the bottom of Z5a
    ("Z4", 1.055),
    ("Z3", 1.135),
    ("Z2", 1.295),
    ("Z1", float("inf")),
]

# (zone, lowest HR ratio in the zone): Z5c 106%+, Z5b 102-105, Z5a 100-101, Z4 96-99,
# Z3 91-95, Z2 86-90, Z1 up to 85.
HR_ZONES: list[tuple[str, float]] = [
    ("Z5c", 1.055),
    ("Z5b", 1.015),
    ("Z5a", 0.995),
    ("Z4", 0.955),
    ("Z3", 0.905),
    ("Z2", 0.855),
    ("Z1", 0.0),
]

# How the weekly report groups the zones.
EASY, MODERATE, HARD, WALK = "easy", "moderate", "hard", "walk"
ZONE_CLASS = {"Z1": EASY, "Z2": EASY, "Z3": MODERATE, "Z4": HARD, "Z5a": HARD, "Z5b": HARD, "Z5c": HARD}
CLASS_HE = {EASY: "קל", MODERATE: "בינוני", HARD: "עצים", WALK: "הליכה"}
KIND_RANK = {WALK: 0, EASY: 1, MODERATE: 2, HARD: 3}

WALK_PACE_S = 600.0  # slower than 10:00 / km is walking (per athlete in the questionnaire)
WALK_CADENCE = 140.0  # fewer steps per minute than this is walking

# Slower than this is walking or standing, not a pace to judge.
MAX_RUN_PACE_S = 15 * 60


def zone_rank(zone: str) -> int:
    return ZONES.index(zone)


def pace_zone(pace_s_per_km: float, threshold_pace: float, table=PACE_ZONES) -> str:
    ratio = pace_s_per_km / threshold_pace
    for name, slowest in table:
        if ratio <= slowest:
            return name
    return "Z1"


def hr_zone(hr: float, lthr: float, table=HR_ZONES) -> str:
    ratio = hr / lthr
    for name, lowest in table:
        if ratio >= lowest:
            return name
    return "Z1"


def pace_position(pace_s_per_km: float, threshold_pace: float, zone: str, table=PACE_ZONES) -> str | None:
    """Low / mid / high inside the zone, e.g. 'Z4 low' vs 'Z4 high'. None for open zones."""
    bounds = [b for _, b in table]
    i = [n for n, _ in table].index(zone)
    if i == 0 or bounds[i] == float("inf"):
        return None
    fast, slow = bounds[i - 1], bounds[i]
    ratio = pace_s_per_km / threshold_pace
    frac = (slow - ratio) / (slow - fast)  # 0 = slow edge, 1 = fast edge
    return "low" if frac < 1 / 3 else "high" if frac > 2 / 3 else "mid"


@dataclass
class LapZone:
    lap: Lap
    zone: str | None  # the zone used for the report
    pace_zone: str | None
    hr_zone: str | None
    position: str | None  # low / mid / high inside the pace zone
    walking: bool = False

    @property
    def zone_class(self) -> str | None:
        if self.walking:
            return WALK
        return ZONE_CLASS[self.zone] if self.zone else None


def is_walking(lap: Lap, walk_pace_s: float = WALK_PACE_S) -> bool:
    """Cadence decides when the watch has it; otherwise pace. Standing still counts as walking."""
    if lap.cadence_spm:
        return lap.cadence_spm < WALK_CADENCE
    pace = lap.pace_s_per_km
    if pace is None:
        return lap.duration_s > 0 and lap.distance_m == 0
    return pace > walk_pace_s


def classify_lap(lap: Lap, th: Thresholds, prefer: str = "pace", walk_pace_s: float = WALK_PACE_S) -> LapZone:
    """Zone of one lap. Pace decides by default; heart rate is the fallback. Walking has no run zone."""
    if is_walking(lap, walk_pace_s):
        hz = hr_zone(lap.avg_hr, th.lthr) if lap.avg_hr and th.lthr else None
        return LapZone(lap, None, None, hz, None, walking=True)
    pz = hz = pos = None
    pace = lap.pace_s_per_km
    if pace and th.pace_s_per_km and pace <= MAX_RUN_PACE_S:
        pz = pace_zone(pace, th.pace_s_per_km)
        pos = pace_position(pace, th.pace_s_per_km, pz)
    if lap.avg_hr and th.lthr:
        hz = hr_zone(lap.avg_hr, th.lthr)
    if prefer == "hr":
        zone = hz or pz
    elif prefer == "max":  # the harder of the two
        zone = max([z for z in (pz, hz) if z], key=zone_rank, default=None)
    else:
        zone = pz or hz
    return LapZone(lap, zone, pz, hz, pos)
