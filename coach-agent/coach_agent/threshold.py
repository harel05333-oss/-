"""Threshold pace and threshold heart rate (LTHR), Joe Friel style.

Threshold = the effort a runner can hold for about one hour. We rarely have a
one-hour race, so we take the most recent 5K or 10K and use Riegel's formula
(T2 = T1 * (D2 / D1) ** 1.06) to find the distance the runner would cover in
60 minutes. That distance gives the threshold pace.

With this, a 5K race lands in Z5b and a 10K race in Z5a, as in the method.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from .models import Athlete, RaceResult

RIEGEL_EXPONENT = 1.06
HOUR_S = 3600.0

# Races we trust for the threshold: from 5K up to a half marathon.
MIN_RACE_M = 4500.0
MAX_RACE_M = 21300.0
# A race older than this is too old to set the threshold.
MAX_RACE_AGE_DAYS = 180
# A 10K is closer to one hour than a 5K, so it wins if it is this fresh.
PREFER_10K_WITHIN_DAYS = 30

# LTHR from the average heart rate of an all-out 5K:
# divide by 1.01 for a solo test in training, by 1.05 for a race.
LTHR_DIVISOR_5K_TEST = 1.01
LTHR_DIVISOR_5K_RACE = 1.05


def riegel_time(time_s: float, distance_m: float, new_distance_m: float) -> float:
    return time_s * (new_distance_m / distance_m) ** RIEGEL_EXPONENT


def hour_distance_m(distance_m: float, time_s: float) -> float:
    """Distance the runner would cover in 60 minutes."""
    return distance_m * (HOUR_S / time_s) ** (1.0 / RIEGEL_EXPONENT)


def threshold_pace_from_race(distance_m: float, time_s: float) -> float:
    """Threshold pace in seconds per km."""
    return HOUR_S / (hour_distance_m(distance_m, time_s) / 1000.0)


def lthr_from_5k(avg_hr: float, is_race: bool) -> float:
    return avg_hr / (LTHR_DIVISOR_5K_RACE if is_race else LTHR_DIVISOR_5K_TEST)


@dataclass
class Thresholds:
    pace_s_per_km: float | None
    lthr: float | None
    pace_source: str  # Hebrew, shown to the coach
    lthr_source: str
    race_date: date | None = None

    @property
    def speed_mps(self) -> float | None:
        return 1000.0 / self.pace_s_per_km if self.pace_s_per_km else None


def _is_10k(r: RaceResult) -> bool:
    return 9500 <= r.distance_m <= 10500


def _is_5k(r: RaceResult) -> bool:
    return 4500 <= r.distance_m <= 5500


def _race_label(r: RaceResult) -> str:
    km = r.distance_m / 1000
    name = "10 ק\"מ" if _is_10k(r) else "5 ק\"מ" if _is_5k(r) else f"{km:g} ק\"מ"
    m, s = divmod(round(r.time_s), 60)
    h, m = divmod(m, 60)
    t = f"{h}:{m:02d}:{s:02d}" if h else f"{m}:{s:02d}"
    kind = "תחרות" if r.is_race else "מבחן"
    return f"{kind} {name} ב-{t} ({r.date.strftime('%d.%m.%y')})"


def pick_race(races: list[RaceResult], as_of: date) -> RaceResult | None:
    oldest = as_of - timedelta(days=MAX_RACE_AGE_DAYS)
    valid = [
        r for r in races
        if MIN_RACE_M <= r.distance_m <= MAX_RACE_M and r.time_s > 0 and oldest <= r.date <= as_of
    ]
    if not valid:
        return None
    latest = max(valid, key=lambda r: r.date)
    if not _is_10k(latest):
        tens = [r for r in valid if _is_10k(r) and (latest.date - r.date).days <= PREFER_10K_WITHIN_DAYS]
        if tens:
            return max(tens, key=lambda r: r.date)
    return latest


def resolve_thresholds(athlete: Athlete, as_of: date) -> Thresholds:
    race = pick_race(athlete.races, as_of)

    if athlete.threshold_pace_s_per_km:
        pace, pace_src = athlete.threshold_pace_s_per_km, "הוזן ידנית על ידי המאמן"
    elif race:
        pace, pace_src = threshold_pace_from_race(race.distance_m, race.time_s), _race_label(race)
    else:
        pace, pace_src = None, "אין תוצאה עדכנית של 5 או 10 ק\"מ"

    if athlete.lthr:
        lthr, lthr_src = athlete.lthr, "הוזן ידנית על ידי המאמן"
    else:
        fives = [
            r for r in athlete.races
            if _is_5k(r) and r.avg_hr and r.date <= as_of
            and r.date >= as_of - timedelta(days=MAX_RACE_AGE_DAYS)
        ]
        if fives:
            r = max(fives, key=lambda r: r.date)
            lthr, lthr_src = lthr_from_5k(r.avg_hr, r.is_race), f"דופק ממוצע ב{_race_label(r)}"
        else:
            lthr, lthr_src = None, "אין דופק סף (צריך 5 ק\"מ עם דופק או הזנה ידנית)"

    return Thresholds(pace, lthr, pace_src, lthr_src, race.date if race else None)
