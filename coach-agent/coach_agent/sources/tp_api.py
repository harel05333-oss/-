"""TrainingPeaks API client (coach account).

The TrainingPeaks API is available only to approved partners: you register an app with
TrainingPeaks, the coach authorises it with OAuth, and you receive an access token with the
`coach:athletes` and `workouts:read` scopes. Put the token in TP_ACCESS_TOKEN.

Endpoints and field names follow the public partner documentation at the time of writing;
check them against the docs TrainingPeaks gives you when your app is approved and adjust
`workout_from_api` if a field name differs. Until then, use the CSV export (tp_csv.py).
"""
from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from datetime import date, timedelta

from ..models import Workout
from .tp_csv import _parse_day

API_BASE = os.environ.get("TP_API_BASE", "https://api.trainingpeaks.com")


class TrainingPeaksClient:
    def __init__(self, access_token: str | None = None, base_url: str = API_BASE, timeout: float = 30):
        self.token = access_token or os.environ.get("TP_ACCESS_TOKEN")
        if not self.token:
            raise RuntimeError("TP_ACCESS_TOKEN is not set (TrainingPeaks partner OAuth access token)")
        self.base = base_url.rstrip("/")
        self.timeout = timeout

    def _get(self, path: str, params: dict | None = None):
        url = f"{self.base}{path}"
        if params:
            url += "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self.token}", "Accept": "application/json",
        })
        with urllib.request.urlopen(req, timeout=self.timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def coach_athletes(self) -> list[dict]:
        """Athletes linked to the authorised coach account."""
        return self._get("/v1/coach/athletes")

    def workouts(self, athlete_id: str, start: date, end: date) -> list[Workout]:
        """Planned and completed workouts in [start, end]. Requests are split into 45-day windows."""
        out: list[Workout] = []
        cur = start
        while cur <= end:
            chunk_end = min(end, cur + timedelta(days=44))
            data = self._get(f"/v2/workouts/{athlete_id}/{cur.isoformat()}/{chunk_end.isoformat()}")
            out.extend(workout_from_api(w) for w in data)
            cur = chunk_end + timedelta(days=1)
        return out


_TYPE_NAMES = {3: "Run"}  # TrainingPeaks numeric workout type ids; 3 = run


def _num(d: dict, *keys: str) -> float | None:
    for k in keys:
        v = d.get(k)
        if isinstance(v, (int, float)) and v:
            return float(v)
    return None


def workout_from_api(d: dict) -> Workout:
    wtype = d.get("WorkoutType")
    sport = _TYPE_NAMES.get(wtype, str(wtype)) if isinstance(wtype, int) else (wtype or "Run")
    hours_planned = _num(d, "TotalTimePlanned", "PlannedDuration")
    hours = _num(d, "TotalTime", "TimeTotalInHours")
    m_planned = _num(d, "DistancePlanned", "PlannedDistanceInMeters")
    m = _num(d, "Distance", "DistanceInMeters")
    zones: list[float] = []
    for key in ("HeartRateZones", "TimeInHeartRateZones", "PaceZones"):
        z = d.get(key)
        if isinstance(z, list) and z:
            # Either a list of minutes or a list of {"Minutes"/"Seconds": ...} objects.
            for item in z:
                if isinstance(item, dict):
                    zones.append(float(item.get("Minutes") or (item.get("Seconds") or 0) / 60))
                else:
                    zones.append(float(item or 0))
            break
    return Workout(
        day=_parse_day(str(d.get("WorkoutDay", ""))),
        sport=sport,
        title=d.get("Title") or "",
        description=d.get("Description") or d.get("WorkoutDescription") or "",
        planned_duration_min=hours_planned * 60 if hours_planned else None,
        planned_distance_km=m_planned / 1000 if m_planned else None,
        duration_min=hours * 60 if hours else None,
        distance_km=m / 1000 if m else None,
        zone_minutes=zones,
        avg_hr=_num(d, "HeartRateAverage"),
        tss=_num(d, "TssActual", "TSS"),
        coach_comments=d.get("CoachComments") or "",
        athlete_comments=d.get("AthleteComments") or "",
    )
