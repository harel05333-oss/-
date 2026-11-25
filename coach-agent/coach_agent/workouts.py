"""Break one run into its parts and name the workout.

Consecutive laps of the same kind (easy / moderate / hard) are merged into one
segment, so a tempo recorded as eight 1 km auto-laps becomes
"8 km Z4 low -> high", and a fartlek keeps every fast and easy part apart.
Equal repeats (6 x 1000 m) are folded into one line.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .models import Activity
from .threshold import Thresholds
from .zones import EASY, HARD, MODERATE, LapZone, classify_lap, zone_rank

POS_RANK = {"low": 0, "mid": 1, "high": 2, None: 1}
POS_HE = {"low": "נמוך", "mid": "אמצע", "high": "גבוה"}

# Hours of recovery a quality session needs before the next one.
RECOVERY_HOURS = {"Z4": 36, "Z5a": 36, "Z5b": 48, "Z5c": 72}
QUALITY_MIN_HARD_S = 4 * 60  # less than this (e.g. strides) is not a quality session
LONG_RUN_S = 90 * 60
LONG_RUN_M = 18000
HILL_M_PER_KM = 25.0
REPEAT_TOLERANCE = 0.15


@dataclass
class Segment:
    laps: list[LapZone]
    role: str = "main"  # warmup / main / recovery / cooldown

    @property
    def kind(self) -> str:
        return _lap_class(self.laps[0])

    @property
    def duration_s(self) -> float:
        return sum(z.lap.duration_s for z in self.laps)

    @property
    def distance_m(self) -> float:
        return sum(z.lap.distance_m for z in self.laps)

    @property
    def pace_s_per_km(self) -> float | None:
        d = self.distance_m
        return self.duration_s / (d / 1000) if d > 0 else None

    @property
    def avg_hr(self) -> float | None:
        w = [(z.lap.avg_hr, z.lap.duration_s) for z in self.laps if z.lap.avg_hr]
        t = sum(s for _, s in w)
        return sum(h * s for h, s in w) / t if t else None

    @property
    def elevation_gain_m(self) -> float:
        return sum(z.lap.elevation_gain_m or 0 for z in self.laps)

    def zone_range(self) -> tuple[tuple[str, str | None], tuple[str, str | None]] | None:
        zs = [(z.zone, z.position) for z in self.laps if z.zone]
        if not zs:
            return None
        key = lambda p: (zone_rank(p[0]), POS_RANK[p[1]])
        return min(zs, key=key), max(zs, key=key)

    def zone_label(self) -> str:
        rng = self.zone_range()
        if not rng:
            return "?"
        (z1, p1), (z2, p2) = rng
        if z1 == z2:
            if p1 and p2 and p1 != p2 and len(self.laps) > 1:
                return f"{z1} {POS_HE[p1]}→{POS_HE[p2]}"
            return f"{z1} {POS_HE[p1]}" if p1 and self.kind != EASY else z1
        return f"{z1}→{z2}"

    def hr_zone_label(self) -> str | None:
        zs = [z.hr_zone for z in self.laps if z.hr_zone]
        if not zs:
            return None
        lo, hi = min(zs, key=zone_rank), max(zs, key=zone_rank)
        return lo if lo == hi else f"{lo}→{hi}"


@dataclass
class RepeatSet:
    """n x the same hard effort with recoveries in between."""

    efforts: list[Segment]
    recoveries: list[Segment]


@dataclass
class WorkoutAnalysis:
    activity: Activity
    lap_zones: list[LapZone]
    segments: list[Segment]
    items: list = field(default_factory=list)  # Segment | RepeatSet, for display
    workout_type: str = ""
    is_quality: bool = False
    is_long: bool = False
    dominant_hard_zone: str | None = None
    recovery_hours: int = 0
    time_by_class: dict[str, float] = field(default_factory=dict)
    dist_by_class: dict[str, float] = field(default_factory=dict)
    time_by_zone: dict[str, float] = field(default_factory=dict)
    dist_by_zone: dict[str, float] = field(default_factory=dict)


def _lap_class(z: LapZone) -> str:
    # No pace and no HR (e.g. a standing rest) counts as easy.
    return z.zone_class or EASY


def _similar(a: float, b: float) -> bool:
    return a > 0 and b > 0 and abs(a - b) / max(a, b) <= REPEAT_TOLERANCE


def _same_effort(a: Segment, b: Segment) -> bool:
    if a.distance_m and b.distance_m and _similar(a.distance_m, b.distance_m):
        return True
    return _similar(a.duration_s, b.duration_s)


def _fold_repeats(segments: list[Segment]) -> list:
    """Turn H R H R H ... into one RepeatSet when 3+ efforts look the same."""
    out: list = []
    i = 0
    while i < len(segments):
        s = segments[i]
        if s.kind != EASY:
            efforts, recs, j = [s], [], i
            while (
                j + 2 < len(segments)
                and segments[j + 1].kind == EASY
                and segments[j + 2].kind != EASY
                and _same_effort(s, segments[j + 2])
            ):
                recs.append(segments[j + 1])
                efforts.append(segments[j + 2])
                j += 2
            if len(efforts) >= 3:
                out.append(RepeatSet(efforts, recs))
                i = j + 1
                continue
        out.append(s)
        i += 1
    return out


def analyze_run(a: Activity, th: Thresholds, prefer: str = "pace") -> WorkoutAnalysis:
    lap_zones = [classify_lap(l, th, prefer) for l in a.laps_or_whole()]

    segments: list[Segment] = []
    for z in lap_zones:
        if segments and _lap_class(segments[-1].laps[-1]) == _lap_class(z):
            segments[-1].laps.append(z)
        else:
            segments.append(Segment([z]))

    res = WorkoutAnalysis(a, lap_zones, segments)
    for z in lap_zones:
        c, sec, m = _lap_class(z), z.lap.duration_s, z.lap.distance_m
        res.time_by_class[c] = res.time_by_class.get(c, 0) + sec
        res.dist_by_class[c] = res.dist_by_class.get(c, 0) + m
        if z.zone:
            res.time_by_zone[z.zone] = res.time_by_zone.get(z.zone, 0) + sec
            res.dist_by_zone[z.zone] = res.dist_by_zone.get(z.zone, 0) + m

    hard_s = res.time_by_class.get(HARD, 0)
    res.is_quality = hard_s >= QUALITY_MIN_HARD_S
    res.is_long = a.duration_s >= LONG_RUN_S or a.distance_m >= LONG_RUN_M

    # roles: easy parts before / between / after the hard work
    work = [i for i, s in enumerate(segments) if s.kind != EASY]
    if work:
        for i, s in enumerate(segments):
            if s.kind == EASY:
                s.role = "warmup" if i < work[0] else "cooldown" if i > work[-1] else "recovery"

    res.items = _fold_repeats(segments)

    hard_zones = {z: t for z, t in res.time_by_zone.items() if z in RECOVERY_HOURS}
    if hard_zones:
        res.dominant_hard_zone = max(hard_zones, key=hard_zones.get)
    if res.is_quality:
        # Recovery follows the harder of pace and heart rate: a slow day still costs.
        felt: dict[str, float] = {}
        for z in lap_zones:
            harder = max([x for x in (z.zone, z.pace_zone, z.hr_zone) if x], key=zone_rank, default=None)
            if harder in RECOVERY_HOURS:
                felt[harder] = felt.get(harder, 0) + z.lap.duration_s
        res.recovery_hours = max((RECOVERY_HOURS[z] for z, t in felt.items() if t >= 3 * 60), default=36)

    res.workout_type = _name_workout(res)
    return res


def _name_workout(res: WorkoutAnalysis) -> str:
    a, segs = res.activity, res.segments
    if not res.is_quality:
        if res.time_by_class.get(MODERATE, 0) >= 20 * 60:
            base = "ריצה בינונית (Z3)"
        elif set(res.time_by_zone) <= {"Z1"} and a.duration_s < 50 * 60:
            return "ריצת התאוששות"
        else:
            base = "ריצה קלה"
        return "ריצה ארוכה" if res.is_long and base == "ריצה קלה" else base

    hard_segs = [s for s in segs if s.kind != EASY]
    hard_km = sum(s.distance_m for s in hard_segs) / 1000
    climb = sum(s.elevation_gain_m for s in hard_segs)
    sets = [i for i in res.items if isinstance(i, RepeatSet)]
    dz = res.dominant_hard_zone

    if hard_km > 0 and climb / hard_km >= HILL_M_PER_KM and len(hard_segs) >= 3:
        name = "עליות"
    elif len(hard_segs) == 1 and hard_segs[0].duration_s >= 12 * 60:
        name = "טמפו"
    elif sets and sum(len(s.efforts) for s in sets) >= len(hard_segs) - 1:
        name = {
            "Z5c": "חזרות",
            "Z5b": "אינטרוולים עצים",
            "Z5a": "אינטרוולים נרחב",
            "Z4": "טמפו מפוצל",
        }.get(dz, "אינטרוולים")
    else:
        name = "פארטלק"
    return f"ריצה ארוכה עם {name}" if res.is_long else name
