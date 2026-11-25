"""The coach's season plan (the periodization table in Excel) and how the week compares to it.

The table has one row per week: phase, week number, dates, weekly volume, long
run, tempo, race/test, hills, progressive runs, extensive intervals, fartlek,
notes. Every athlete's season starts on a different day, so the coach gives the
season start date: week 1 starts on it and week n starts 7*(n-1) days later.
The dates written in the table are ignored (they have no year, and a table is
often reused from an earlier season).
"""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date, time, timedelta
from pathlib import Path

# Header names in the table -> our field names (matched by "contains")
COLUMNS = [
    ("נפח", "volume"),
    ("LSD", "lsd"),
    ("טמפו", "tempo"),
    ("תחרות", "race"),
    ("תוצאה", "result"),
    ("עליות", "hills"),
    ("מתגברות", "progressive"),
    ("אינטרוולים", "intervals"),
    ("פרטלק", "fartlek"),
    ("פארטלק", "fartlek"),
    ("הערות", "notes"),
]

VOLUME_TOL = (2.0, 0.05)  # km, share
LSD_TOL = 1.0
TEMPO_TOL = 1.0


@dataclass
class PlannedWeek:
    week: int
    start: date
    phase: str = ""
    volume_km: tuple[float, float] | None = None  # (min, max); one number -> (x, x)
    lsd_km: float | None = None
    lsd_in_race: bool = False  # "27*": the long run is part of a race that week
    tempo_km: tuple[float, float] | None = None
    race: str = ""
    hills: str = ""
    progressive: str = ""
    intervals: str = ""
    fartlek: str = ""
    notes: str = ""

    @property
    def end(self) -> date:
        return self.start + timedelta(days=6)

    def sessions(self) -> list[str]:
        """Planned quality work in words, e.g. ['עליות 6*300', 'פארטלק 15 דק׳']."""
        out = []
        if self.tempo_km:
            lo, hi = self.tempo_km
            out.append(f"טמפו {lo:g}" + (f"-{hi:g}" if hi != lo else "") + " ק\"מ")
        for label, value in (("עליות", self.hills), ("ריצה מתגברת", self.progressive),
                             ("אינטרוולים", self.intervals), ("פארטלק", self.fartlek)):
            if value:
                out.append(f"{label} {_clean(value)}".strip())
        return out


@dataclass
class SeasonPlan:
    start: date
    goal_date: date | None = None
    weeks: list[PlannedWeek] = field(default_factory=list)

    def week_for(self, day: date) -> PlannedWeek | None:
        return next((w for w in self.weeks if w.start <= day <= w.end), None)


# ---- parsing cells ------------------------------------------------------------

def _clean(v) -> str:
    """'  (15דק) √' -> '15 דק׳' ; '6*300' stays."""
    s = str(v or "").replace("√", "").strip()
    m = re.fullmatch(r"\(?\s*(\d+(?:\.\d+)?)\s*דק'?\s*\)?", s)
    if m:
        return f"{m.group(1)} דק׳"
    return s


def _number(v) -> float | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v)
    m = re.search(r"\d+(?:\.\d+)?", str(v))
    return float(m.group()) if m else None


def _range(v) -> tuple[float, float] | None:
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return float(v), float(v)
    nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", str(v))]
    if not nums:
        return None
    return min(nums[:2]), max(nums[:2])


def _text(v) -> str:
    if v is None:
        return ""
    if isinstance(v, time):
        return v.strftime("%H:%M:%S").lstrip("0").lstrip(":")
    return str(v).strip()


def read_season_excel(path: str | Path, season_start: date, goal_date: date | None = None) -> SeasonPlan:
    import openpyxl

    wb = openpyxl.load_workbook(path, data_only=True)
    best: list[PlannedWeek] = []
    for ws in wb.worksheets:
        weeks = _read_sheet(ws, season_start)
        if sum(1 for w in weeks if w.volume_km) > sum(1 for w in best if w.volume_km):
            best = weeks
    if not best:
        raise ValueError("לא מצאתי בקובץ טבלה עם עמודות 'שבוע' ו'נפח שבועי'")
    plan = SeasonPlan(season_start, goal_date, best)
    return plan


def _read_sheet(ws, season_start: date) -> list[PlannedWeek]:
    rows = list(ws.iter_rows(values_only=True))
    header_i = next((i for i, r in enumerate(rows)
                     if any(str(c or "").strip() == "שבוע" for c in r) and any("נפח" in str(c or "") for c in r)), None)
    if header_i is None:
        return []
    header = [str(c or "").strip() for c in rows[header_i]]
    dates_col = header.index("שבוע")
    cols: dict[str, int] = {}
    for i, h in enumerate(header):
        for key, name in COLUMNS:
            if key in h and name not in cols:
                cols[name] = i
    weeks: list[PlannedWeek] = []
    phase = ""
    for r in rows[header_i + 1:]:
        # the week number sits just left of the dates; the phase (merged cell) left of it
        num = r[dates_col - 1] if dates_col >= 1 else None
        if not isinstance(num, (int, float)):
            continue
        if dates_col >= 2 and r[dates_col - 2]:
            phase = str(r[dates_col - 2]).strip()
        n = int(num)
        start = season_start + timedelta(days=7 * (n - 1))
        get = lambda name: r[cols[name]] if name in cols and cols[name] < len(r) else None
        race = _text(get("race"))
        if get("result"):
            race = f"{race} ({_text(get('result'))})" if race else _text(get("result"))
        weeks.append(PlannedWeek(
            week=n, start=start, phase=phase,
            volume_km=_range(get("volume")), lsd_km=_number(get("lsd")), tempo_km=_range(get("tempo")),
            lsd_in_race="*" in str(get("lsd") or ""),
            race=race, hills=_text(get("hills")), progressive=_text(get("progressive")),
            intervals=_text(get("intervals")), fartlek=_text(get("fartlek")), notes=_text(get("notes")),
        ))
    return weeks


# ---- JSON ---------------------------------------------------------------------

def plan_to_dict(p: SeasonPlan) -> dict:
    def wk(w: PlannedWeek) -> dict:
        d = {k: v for k, v in asdict(w).items() if v not in (None, "", [])}
        d["start"] = w.start.isoformat()
        return d
    out = {"start": p.start.isoformat(), "weeks": [wk(w) for w in p.weeks]}
    if p.goal_date:
        out["goal_date"] = p.goal_date.isoformat()
    return out


def plan_from_dict(d: dict) -> SeasonPlan:
    weeks = []
    for w in d.get("weeks", []):
        w = dict(w)
        w["start"] = date.fromisoformat(w["start"])
        for k in ("volume_km", "tempo_km"):
            if w.get(k) is not None:
                w[k] = tuple(w[k])
        weeks.append(PlannedWeek(**w))
    return SeasonPlan(date.fromisoformat(d["start"]),
                      date.fromisoformat(d["goal_date"]) if d.get("goal_date") else None, weeks)


# ---- comparing a week to the plan ---------------------------------------------------

TYPE_MATCH = {  # planned session -> workout types that count as done
    "עליות": ("עליות",),
    "אינטרוולים": ("אינטרוולים", "חזרות", "טמפו מפוצל"),
    "פארטלק": ("פארטלק",),
    "טמפו": ("טמפו",),
}


def compare_week(plan: SeasonPlan, summary: dict) -> dict | None:
    """Planned vs done for the summary's week. Adds flags to the returned dict."""
    start = date.fromisoformat(summary["week"]["start"])
    pw = plan.week_for(start) or plan.week_for(start + timedelta(days=3))
    if pw is None:
        return None
    v = summary["volume"]
    flags: list[tuple[str, str]] = []
    # For athletes who work by time, the table's volume and long run are minutes.
    by_time = summary.get("unit") == "time"
    unit = "דק׳" if by_time else "ק\"מ"
    vol = v["run_min"] if by_time else v["run_km"]
    longest = v["longest_min"] if by_time else v["longest_run_km"]
    lsd_tol = 5 if by_time else LSD_TOL

    if pw.volume_km:
        lo, hi = pw.volume_km
        tol = max(10 if by_time else VOLUME_TOL[0], hi * VOLUME_TOL[1])
        planned = f"{lo:g}" + (f"-{hi:g}" if hi != lo else "")
        if vol > hi + tol:
            flags.append(("warn", f"נפח {vol:g} {unit}, בתכנון {planned}"))
        elif vol < lo - tol:
            flags.append(("info", f"נפח {vol:g} {unit}, בתכנון {planned}"))
    if pw.lsd_km and not pw.lsd_in_race:
        diff = longest - pw.lsd_km
        if diff > lsd_tol:
            flags.append(("warn", f"ריצה ארוכה {longest:g} {unit}, בתכנון {pw.lsd_km:g}"))
        elif diff < -lsd_tol:
            flags.append(("info", f"ריצה ארוכה {longest:g} {unit}, בתכנון {pw.lsd_km:g}"))

    types = [w.get("type", "") for w in summary["workouts"] if w.get("quality")]
    if pw.tempo_km:
        tempo = _longest_hard_block_km(summary)
        lo, hi = pw.tempo_km
        if tempo is not None and tempo > hi + TEMPO_TOL:
            flags.append(("warn", f"טמפו {tempo:g} ק\"מ, בתכנון {lo:g}" + (f"-{hi:g}" if hi != lo else "")))
    for planned_name, value in (("עליות", pw.hills), ("אינטרוולים", pw.intervals), ("פארטלק", pw.fartlek),
                                ("טמפו", pw.tempo_km)):
        if value and not any(any(t.startswith(m) or m in t for m in TYPE_MATCH[planned_name]) for t in types):
            flags.append(("info", f"בתכנון היה {planned_name} ולא זוהה אימון כזה"))

    return {
        "week": pw.week,
        "weeks": len(plan.weeks),
        "phase": pw.phase,
        "volume_km": pw.volume_km,
        "lsd_km": pw.lsd_km,
        "sessions": pw.sessions(),
        "race": pw.race,
        "notes": pw.notes,
        "flags": flags,
    }


def _longest_hard_block_km(summary: dict) -> float | None:
    best = None
    for w in summary["workouts"]:
        for p in w.get("parts", []):
            if p["type"] == "segment" and p["kind"] == "hard":
                km = p["distance_m"] / 1000
                best = km if best is None or km > best else best
    return round(best, 1) if best is not None else None


# ---- attaching a plan to an athlete -------------------------------------------------

def import_plan(athlete_file: str | Path, xlsx: str | Path, start: date | None = None,
                goal: date | None = None) -> tuple[SeasonPlan, list[str]]:
    """Read the Excel into the athlete's JSON file. Returns the plan and warnings (Hebrew).

    `start` / `goal` default to what the coach wrote in the questionnaire. With only
    a goal date, the season start is counted back so the last week holds the race.
    """
    import json

    from .week import week_bounds

    path = Path(athlete_file)
    data = json.loads(path.read_text(encoding="utf-8"))
    a = data["athlete"]
    prof = a.setdefault("profile", {})
    if start is None and prof.get("season_start"):
        start = date.fromisoformat(prof["season_start"])
    if goal is None and prof.get("goal_races"):
        goal = date.fromisoformat(sorted(g["date"] for g in prof["goal_races"])[0])
    warnings: list[str] = []
    if start is None:
        if goal is None:
            raise ValueError("צריך תאריך תחילת עונה או תאריך תחרות מטרה")
        n = len(read_season_excel(xlsx, goal).weeks)
        race_week_start, _ = week_bounds(goal, prof.get("week_start", "sunday"))
        start = race_week_start - timedelta(days=7 * (n - 1))
        warnings.append(f"תאריך תחילת העונה חושב לפי תאריך התחרות: {start.day}.{start.month}.{start.year}")
    plan = read_season_excel(xlsx, start, goal)
    if goal and not plan.weeks[-1].start <= goal <= plan.weeks[-1].end:
        wk = plan.week_for(goal)
        last = plan.weeks[-1]
        where = f"שבוע {wk.week} בתכנון" if wk else "מחוץ לתכנון"
        warnings.append(f"תחרות המטרה ({goal.day}.{goal.month}) נופלת ב{where}, "
                        f"והשבוע האחרון בתכנון הוא {last.start.day}.{last.start.month}–{last.end.day}.{last.end.month}")
    prof["season_start"] = start.isoformat()
    a["season_plan"] = plan_to_dict(plan)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    return plan, warnings


def describe_plan(name: str, plan: SeasonPlan, warnings: list[str]) -> str:
    first, last = plan.weeks[0], plan.weeks[-1]
    phases = []
    for w in plan.weeks:
        if w.phase and (not phases or phases[-1] != w.phase):
            phases.append(w.phase)
    lines = [
        f"התכנון העונתי של {name} נטען: {len(plan.weeks)} שבועות, "
        f"{first.start.day}.{first.start.month}.{first.start.year}–{last.end.day}.{last.end.month}.{last.end.year}",
        "תקופות: " + ", ".join(phases),
    ]
    races = [f"שבוע {w.week}: {w.race}" for w in plan.weeks if w.race]
    if races:
        lines.append("תחרויות וטסטים: " + " | ".join(races))
    lines += warnings
    return "\n".join(lines)
