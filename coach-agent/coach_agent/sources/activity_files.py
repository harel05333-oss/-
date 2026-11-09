"""Second-by-second run data from activity files (.fit, .fit.gz, .tcx, .tcx.gz).

TrainingPeaks: Settings → Export Data → Workout Files gives the original device files.
Only what the RPE analysis needs is read: timestamp and cumulative distance (speed as fallback).
"""
from __future__ import annotations

import gzip
import struct
import xml.etree.ElementTree as ET
from bisect import bisect_left, bisect_right
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

from ..models import Workout

FIT_EPOCH = datetime(1989, 12, 31, tzinfo=timezone.utc)
RECORD_MSG = 20

# A record: (UTC datetime, cumulative metres or None, speed m/s or None)
Record = tuple[datetime, "float | None", "float | None"]


def _open(path: Path) -> bytes:
    data = path.read_bytes()
    return gzip.decompress(data) if path.suffix == ".gz" else data


# ---------------------------------------------------------------- FIT
def read_fit(data: bytes) -> list[Record]:
    hsize = data[0]
    if data[8:12] != b".FIT":
        raise ValueError("not a FIT file")
    data_size = struct.unpack_from("<I", data, 4)[0]
    pos, end = hsize, hsize + data_size
    defs: dict[int, tuple[str, int, list[tuple[int, int]], int]] = {}
    last_ts = 0
    out: list[Record] = []
    while pos < end:
        h = data[pos]
        pos += 1
        if h & 0x80:  # compressed-timestamp data message
            local = (h >> 5) & 0x03
            offset = h & 0x1F
            ts = (last_ts & ~0x1F) + offset
            if offset < (last_ts & 0x1F):
                ts += 0x20
            last_ts = ts
            fields, pos = _read_fields(data, pos, defs[local])
            fields.setdefault(253, ts)
        elif h & 0x40:  # definition message
            local = h & 0x0F
            arch = data[pos + 1]
            endian = ">" if arch == 1 else "<"
            gnum = struct.unpack_from(endian + "H", data, pos + 2)[0]
            n = data[pos + 4]
            pos += 5
            fdefs = [(data[pos + 3 * i], data[pos + 3 * i + 1]) for i in range(n)]
            pos += 3 * n
            dev_size = 0
            if h & 0x20:
                nd = data[pos]
                pos += 1
                dev_size = sum(data[pos + 3 * i + 1] for i in range(nd))
                pos += 3 * nd
            defs[local] = (endian, gnum, fdefs, dev_size)
            continue
        else:
            fields, pos = _read_fields(data, pos, defs[h & 0x0F])
        gnum = defs[(h >> 5) & 0x03 if h & 0x80 else h & 0x0F][1]
        if 253 in fields and fields[253] is not None:
            last_ts = fields[253]
        if gnum == RECORD_MSG and fields.get(253) is not None:
            dist = fields.get(5)
            speed = fields.get(73) if fields.get(73) is not None else fields.get(6)
            out.append((
                FIT_EPOCH + timedelta(seconds=fields[253]),
                dist / 100 if dist is not None else None,
                speed / 1000 if speed is not None else None,
            ))
    return out


_INVALID = {1: 0xFF, 2: 0xFFFF, 4: 0xFFFFFFFF}
_FMT = {1: "B", 2: "H", 4: "I"}


def _read_fields(data, pos, definition):
    endian, _, fdefs, dev_size = definition
    fields = {}
    for num, size in fdefs:
        if size in _FMT:
            v = struct.unpack_from(endian + _FMT[size], data, pos)[0]
            fields[num] = None if v == _INVALID[size] else v
        pos += size
    return fields, pos + dev_size


def write_fit(path: Path, records: list[tuple[datetime, float]]) -> None:
    """Minimal FIT writer (record messages with timestamp + distance). For tests and sample data."""
    body = bytearray()
    body += bytes([0x40, 0, 0]) + struct.pack("<H", RECORD_MSG) + bytes([2, 253, 4, 0x86, 5, 4, 0x86])
    for t, metres in records:
        ts = int((t - FIT_EPOCH).total_seconds())
        body += bytes([0x00]) + struct.pack("<II", ts, int(round(metres * 100)))
    header = struct.pack("<BBHI4sH", 14, 0x20, 2132, len(body), b".FIT", 0)
    path.write_bytes(header + bytes(body) + b"\x00\x00")


# ---------------------------------------------------------------- TCX
def read_tcx(data: bytes) -> list[Record]:
    out: list[Record] = []
    for tp in ET.fromstring(data).iter():
        if not tp.tag.endswith("Trackpoint"):
            continue
        t = d = None
        for child in tp:
            if child.tag.endswith("Time") and child.text:
                t = datetime.fromisoformat(child.text.replace("Z", "+00:00"))
            elif child.tag.endswith("DistanceMeters") and child.text:
                d = float(child.text)
        if t is not None:
            out.append((t, d, None))
    return out


def read_activity(path: str | Path) -> list[Record]:
    path = Path(path)
    name = path.name.lower()
    data = _open(path)
    if ".fit" in name:
        return read_fit(data)
    if ".tcx" in name:
        return read_tcx(data)
    raise ValueError(f"unsupported activity file: {path.name}")


# ---------------------------------------------------------------- pace segments
def to_segments(records: list[Record], window_s: float = 30, max_gap_s: float = 20,
                min_speed: float = 1.0) -> list[tuple[float, float, float]]:
    """(seconds, metres, smoothed speed) per interval. Pauses and walking-still are dropped.

    Speed is smoothed over a centred window so a single GPS spike doesn't create fake intervals.
    """
    recs = sorted((r for r in records if r[1] is not None), key=lambda r: r[0])
    if len(recs) < 2:
        return _segments_from_speed(records, max_gap_s, min_speed)
    t = [(r[0] - recs[0][0]).total_seconds() for r in recs]
    d = [r[1] for r in recs]
    out = []
    for i in range(1, len(recs)):
        dt, dd = t[i] - t[i - 1], d[i] - d[i - 1]
        if dt <= 0 or dt > max_gap_s or dd < 0:
            continue
        mid = (t[i] + t[i - 1]) / 2
        a = bisect_left(t, mid - window_s / 2)
        b = min(bisect_right(t, mid + window_s / 2) - 1, len(t) - 1)
        span = t[b] - t[a]
        speed = (d[b] - d[a]) / span if span > 0 else dd / dt
        if speed >= min_speed:
            out.append((dt, dd, speed))
    return out


def _segments_from_speed(records, max_gap_s, min_speed):
    recs = sorted((r for r in records if r[2] is not None), key=lambda r: r[0])
    out = []
    for prev, cur in zip(recs, recs[1:]):
        dt = (cur[0] - prev[0]).total_seconds()
        if 0 < dt <= max_gap_s and cur[2] >= min_speed:
            out.append((dt, cur[2] * dt, cur[2]))
    return out


# ---------------------------------------------------------------- matching to workouts
def attach_activity_files(workouts: list[Workout], folder: str | Path, tz: str = "Asia/Jerusalem") -> list[str]:
    """Attach pace segments from every file in `folder` to the completed workout on the same
    local day (closest duration wins). Returns names of files that matched no workout."""
    zone = ZoneInfo(tz)
    unmatched = []
    files = sorted(p for p in Path(folder).iterdir()
                   if any(s in p.name.lower() for s in (".fit", ".tcx")))
    for path in files:
        try:
            recs = read_activity(path)
        except (ValueError, struct.error, ET.ParseError, KeyError, IndexError):
            unmatched.append(path.name)
            continue
        if not recs:
            unmatched.append(path.name)
            continue
        day = min(r[0] for r in recs).astimezone(zone).date()
        segs = to_segments(recs)
        moving_min = sum(s[0] for s in segs) / 60
        candidates = [w for w in workouts if w.day == day and w.is_completed and not w.segments]
        if not candidates or not segs:
            unmatched.append(path.name)
            continue
        best = min(candidates, key=lambda w: abs((w.duration_min or 0) - moving_min))
        best.segments = segs
    return unmatched
