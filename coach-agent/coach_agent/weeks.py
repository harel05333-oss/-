"""Re-bucket workouts into each athlete's own week (TrainingPeaks always uses Monday-Sunday)."""
from __future__ import annotations

from collections import OrderedDict
from datetime import date, timedelta
from typing import Iterable

from .models import Workout


def week_start_for(day: date, week_start: int) -> date:
    """First day of the week containing `day`, where weeks begin on weekday `week_start`."""
    return day - timedelta(days=(day.weekday() - week_start) % 7)


def group_by_week(
    workouts: Iterable[Workout],
    week_start: int,
    start: date | None = None,
    end: date | None = None,
) -> "OrderedDict[date, list[Workout]]":
    """Group workouts by custom week. Empty weeks between start and end are kept."""
    items = sorted(workouts, key=lambda w: w.day)
    if start is None and items:
        start = items[0].day
    if end is None and items:
        end = items[-1].day
    weeks: OrderedDict[date, list[Workout]] = OrderedDict()
    if start is None or end is None:
        return weeks
    cur = week_start_for(start, week_start)
    while cur <= end:
        weeks[cur] = []
        cur += timedelta(days=7)
    for w in items:
        ws = week_start_for(w.day, week_start)
        if ws in weeks:
            weeks[ws].append(w)
    return weeks
