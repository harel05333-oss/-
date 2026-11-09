"""RPE (perceived effort) from pace.

The coach gives each athlete a pace for each effort level, e.g. {6: "4:20", 7: "4:10", 8: "4:00"}.
Every stretch of a run is assigned the level whose pace is nearest. Anything slower than the
slowest level's band counts as easy (RPE 1..easy_max_rpe). Planned blocks such as
"20 דק' בתחושת מאמץ 6-8" or "4x5 min RPE 8" are read from the workout description and compared
with the minutes the athlete actually ran at those levels.
"""
from __future__ import annotations

import re
from dataclasses import dataclass


def parse_pace(value: str | int | float) -> float:
    """'4:20' (min:sec per km) -> 260 seconds per km. Numbers are taken as seconds per km."""
    if isinstance(value, (int, float)):
        return float(value)
    m = re.fullmatch(r"\s*(\d+):(\d{1,2})\s*", value)
    if not m:
        raise ValueError(f"pace must look like 4:20, got {value!r}")
    return int(m.group(1)) * 60 + int(m.group(2))


def fmt_pace(sec_per_km: float) -> str:
    s = round(sec_per_km)
    return f"{s // 60}:{s % 60:02d}"


@dataclass
class RpeScale:
    anchors: dict[int, float]  # level -> seconds per km
    easy_max_rpe: int = 4

    @classmethod
    def from_config(cls, paces: dict, easy_max_rpe: int = 4) -> "RpeScale | None":
        if not paces:
            return None
        anchors = {int(k): parse_pace(v) for k, v in paces.items()}
        return cls(anchors, easy_max_rpe)

    def level_for_pace(self, sec_per_km: float) -> int:
        items = sorted(self.anchors.items(), key=lambda kv: -kv[1])  # slow -> fast
        slow_lvl, slow_pace = items[0]
        gap = (slow_pace - items[1][1]) if len(items) > 1 else 20.0
        if sec_per_km > slow_pace + gap / 2:
            return min(self.easy_max_rpe, slow_lvl)
        return min(items, key=lambda kv: (abs(kv[1] - sec_per_km), kv[0]))[0]

    def level_for_speed(self, m_per_s: float) -> int:
        return self.level_for_pace(1000.0 / m_per_s)

    def label(self, level: int) -> str:
        return f"1-{self.easy_max_rpe}" if level <= self.easy_max_rpe else str(level)

    def labels(self) -> list[str]:
        out = [f"1-{self.easy_max_rpe}"]
        out += [str(l) for l in sorted(self.anchors) if l > self.easy_max_rpe]
        return out

    def is_easy(self, level: int) -> bool:
        return level <= self.easy_max_rpe


def time_at_levels(segments, scale: RpeScale) -> dict[int, tuple[float, float]]:
    """segments: (seconds, meters, smoothed speed m/s). Returns level -> (minutes, km)."""
    out: dict[int, list[float]] = {}
    for sec, meters, speed in segments:
        lvl = scale.level_for_speed(speed)
        acc = out.setdefault(lvl, [0.0, 0.0])
        acc[0] += sec / 60
        acc[1] += meters / 1000
    return {k: (v[0], v[1]) for k, v in sorted(out.items())}


def by_label(levels: dict[int, tuple[float, float]], scale: RpeScale) -> dict[str, dict]:
    """Merge easy levels into one bucket; keep every bucket of the scale, even if empty."""
    out = {lab: {"min": 0.0, "km": 0.0} for lab in scale.labels()}
    for lvl, (mins, km) in levels.items():
        b = out.setdefault(scale.label(lvl), {"min": 0.0, "km": 0.0})
        b["min"] += mins
        b["km"] += km
    return {k: {"min": round(v["min"], 1), "km": round(v["km"], 2)} for k, v in out.items()}


# "4x5 דק' בתחושת מאמץ 8", "20' RPE 6-8", "20 min @ RPE 6–7", "15 דקות במאמץ 7"
_BLOCK = re.compile(
    r"(?:(?P<reps>\d+)\s*[xX×*]\s*)?"
    r"(?P<min>\d+(?:\.\d+)?)\s*(?:דקות|דק['׳]?|min(?:utes|s)?|['׳])"
    r"[^\d\n]{0,25}?"
    r"(?:RPE|rpe|תחושת\s+מאמץ|מאמץ|ת\"מ|ת״מ)\s*(?P<lo>\d+)(?:\s*[-–]\s*(?P<hi>\d+))?"
)


@dataclass
class PlannedBlock:
    minutes: float
    lo: int
    hi: int

    @property
    def label(self) -> str:
        return str(self.lo) if self.lo == self.hi else f"{self.lo}-{self.hi}"


def parse_planned_blocks(text: str) -> list[PlannedBlock]:
    blocks: dict[tuple[int, int], float] = {}
    for m in _BLOCK.finditer(text or ""):
        reps = int(m.group("reps") or 1)
        lo = int(m.group("lo"))
        hi = int(m.group("hi") or lo)
        lo, hi = min(lo, hi), max(lo, hi)
        blocks[(lo, hi)] = blocks.get((lo, hi), 0.0) + reps * float(m.group("min"))
    return [PlannedBlock(mins, lo, hi) for (lo, hi), mins in blocks.items()]


def minutes_in_range(levels: dict[int, tuple[float, float]], lo: int, hi: int) -> float:
    return sum(mins for lvl, (mins, _) in levels.items() if lo <= lvl <= hi)
