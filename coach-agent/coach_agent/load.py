"""Training load: TSS per workout and fitness / fatigue / form (CTL / ATL / TSB).

rTSS = hours * IF^2 * 100, where IF = normalized speed / threshold speed.
With a second-by-second stream we normalize speed like power (30 s rolling
average, 4th-power mean). With only laps, we sum the TSS of every lap, which
keeps the hard parts of an interval session from being averaged away.
Without pace we fall back to heart rate (IF = HR / LTHR), then to RPE.
"""
from __future__ import annotations

from datetime import date, timedelta

from .models import Activity
from .threshold import Thresholds

CTL_DAYS = 42
ATL_DAYS = 7
MAX_IF = 1.5  # GPS spikes should not explode the load
DEFAULT_IF_BY_SPORT = {"strength": 0.6, "other": 0.6, "bike": 0.65, "swim": 0.65, "run": 0.75}


def _tss(hours: float, intensity: float) -> float:
    intensity = min(max(intensity, 0.0), MAX_IF)
    return hours * intensity * intensity * 100.0


def normalized_speed(records, window_s: float = 30.0) -> float | None:
    pts = [(r.t, r.speed_mps) for r in records if r.speed_mps is not None]
    if len(pts) < 2:
        return None
    # resample to 1 Hz by holding the last value
    end = int(pts[-1][0])
    series, j = [], 0
    for t in range(int(pts[0][0]), end + 1):
        while j + 1 < len(pts) and pts[j + 1][0] <= t:
            j += 1
        series.append(pts[j][1])
    w = int(window_s)
    if len(series) < w:
        return sum(series) / len(series)
    run = sum(series[:w])
    rolled = [run / w]
    for i in range(w, len(series)):
        run += series[i] - series[i - w]
        rolled.append(run / w)
    return (sum(v ** 4 for v in rolled) / len(rolled)) ** 0.25


def activity_tss(a: Activity, th: Thresholds) -> tuple[float, str]:
    """TSS and how it was calculated (rTSS / rTSS-laps / hrTSS / RPE / estimate / source)."""
    if a.tss is not None:
        return a.tss, "source"
    hours = a.duration_s / 3600.0
    if a.is_run and th.speed_mps:
        ns = normalized_speed(a.records) if a.records else None
        if ns:
            return _tss(hours, ns / th.speed_mps), "rTSS"
        laps = [l for l in a.laps_or_whole() if l.distance_m > 0 and l.duration_s > 0]
        if laps:
            total = sum(_tss(l.duration_s / 3600, (l.distance_m / l.duration_s) / th.speed_mps) for l in laps)
            # time in laps without distance (standing rests) still counts, gently
            rest_s = a.duration_s - sum(l.duration_s for l in laps)
            total += _tss(max(rest_s, 0) / 3600, 0.5)
            return total, "rTSS"
    if a.avg_hr and th.lthr:
        return _tss(hours, a.avg_hr / th.lthr), "hrTSS"
    if a.rpe:
        # RPE 5 ~ IF 0.75, RPE 8 ~ IF 0.9, RPE 10 ~ IF 1.0
        return _tss(hours, 0.5 + 0.05 * a.rpe), "RPE"
    return _tss(hours, DEFAULT_IF_BY_SPORT.get(a.sport, 0.6)), "estimate"


def daily_tss(activities: list[Activity], th: Thresholds, history: dict[date, float] | None = None) -> dict[date, float]:
    days: dict[date, float] = dict(history or {})
    for a in activities:
        days[a.day] = days.get(a.day, 0.0) + activity_tss(a, th)[0]
    return days


SEED_DAYS = 28


def performance_chart(days: dict[date, float], until: date, seed: bool = True) -> dict[date, dict[str, float]]:
    """CTL (fitness), ATL (fatigue) and TSB (form) for every day up to `until`.

    TSB of a day is yesterday's CTL minus yesterday's ATL, as in TrainingPeaks.
    Our data has a beginning, the athlete's training does not: starting from 0
    would make Fitness look tiny for weeks. With `seed`, both start at the
    average daily TSS of the first 4 weeks, as if the athlete had trained like that before.
    """
    if not days:
        return {}
    d = min(days)
    ctl = atl = 0.0
    if seed:
        first = [days.get(d + timedelta(days=i), 0.0) for i in range(SEED_DAYS)]
        ctl = atl = sum(first) / SEED_DAYS
    out: dict[date, dict[str, float]] = {}
    while d <= until:
        tsb = ctl - atl
        t = days.get(d, 0.0)
        ctl += (t - ctl) / CTL_DAYS
        atl += (t - atl) / ATL_DAYS
        out[d] = {"tss": t, "ctl": ctl, "atl": atl, "tsb": tsb}
        d += timedelta(days=1)
    return out
