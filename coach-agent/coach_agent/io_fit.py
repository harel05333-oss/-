"""Read Garmin / Coros / Suunto .FIT files (Garmin Connect: "Export Original").

Uses Garmin's official FIT SDK (pip install garmin-fit-sdk).
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from .models import Activity, Lap, Record

SPORTS = {
    "running": "run", "trail_running": "run", "treadmill_running": "run",
    "cycling": "bike", "swimming": "swim", "training": "strength",
}


def _sport(session: dict) -> str:
    s = str(session.get("sport", "")).lower()
    sub = str(session.get("sub_sport", "")).lower()
    if sub in SPORTS:
        return SPORTS[sub]
    return SPORTS.get(s, "other")


def _speed(m: dict) -> float | None:
    return m.get("enhanced_avg_speed") or m.get("avg_speed") or m.get("enhanced_speed") or m.get("speed")


def _cadence(m: dict, run: bool = True) -> float | None:
    c = m.get("avg_running_cadence") or m.get("avg_cadence") or m.get("cadence")
    if c is None:
        return None
    frac = m.get("avg_fractional_cadence") or m.get("fractional_cadence") or 0
    return (float(c) + float(frac)) * 2 if run else float(c)


def _to_local(ts, tz: str) -> datetime:
    if not isinstance(ts, datetime):
        ts = datetime.fromtimestamp(float(ts), tz=timezone.utc)
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(ZoneInfo(tz)).replace(tzinfo=None)


def activity_from_messages(messages: dict, activity_id: str, tz: str = "Asia/Jerusalem") -> Activity:
    sessions = messages.get("session_mesgs") or [{}]
    s = sessions[0]
    laps = []
    for l in messages.get("lap_mesgs", []):
        dur = l.get("total_timer_time") or l.get("total_elapsed_time") or 0
        laps.append(Lap(
            duration_s=float(dur),
            distance_m=float(l.get("total_distance") or 0),
            avg_hr=l.get("avg_heart_rate"),
            elevation_gain_m=l.get("total_ascent"),
            intensity=str(l["intensity"]) if l.get("intensity") is not None else None,
            cadence_spm=_cadence(l),
        ))
    raw = messages.get("record_mesgs", [])
    records = []
    if raw and raw[0].get("timestamp") is not None:
        t0 = raw[0]["timestamp"]
        for r in raw:
            dt = (r["timestamp"] - t0).total_seconds() if isinstance(t0, datetime) else r["timestamp"] - t0
            records.append(Record(t=float(dt), speed_mps=_speed(r), hr=r.get("heart_rate"), cadence_spm=_cadence(r)))
    start = s.get("start_time") or (raw[0]["timestamp"] if raw else datetime.now(timezone.utc))
    duration = s.get("total_timer_time") or sum(l.duration_s for l in laps)
    return Activity(
        id=activity_id,
        start=_to_local(start, tz),
        sport=_sport(s),
        duration_s=float(duration),
        distance_m=float(s.get("total_distance") or sum(l.distance_m for l in laps)),
        avg_hr=s.get("avg_heart_rate"),
        elevation_gain_m=s.get("total_ascent"),
        laps=laps,
        records=records,
    )


def read_fit(path: str | Path, tz: str = "Asia/Jerusalem") -> Activity:
    from garmin_fit_sdk import Decoder, Stream

    stream = Stream.from_file(str(path))
    decoder = Decoder(stream)
    messages, errors = decoder.read(convert_datetimes_to_dates=True)
    if errors:
        raise ValueError(f"{path}: {errors}")
    return activity_from_messages(messages, Path(path).stem, tz)


def read_fit_folder(folder: str | Path, tz: str = "Asia/Jerusalem") -> list[Activity]:
    return [read_fit(p, tz) for p in sorted(Path(folder).glob("*.fit")) + sorted(Path(folder).glob("*.FIT"))]
