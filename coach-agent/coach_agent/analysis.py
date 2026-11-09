"""Per-workout checks (did the athlete do what was asked?) and weekly volume/intensity totals."""
from __future__ import annotations

import re
from dataclasses import asdict, dataclass, field
from datetime import date, timedelta

from .models import Athlete, Workout
from .weeks import group_by_week, week_start_for

QUALITY_WORDS = re.compile(
    r"interval|tempo|threshold|fartlek|vo2|repeats?|hills?|race|progression|"
    r"אינטרוול|טמפו|סף|פארטלק|עליות|תחרות|מרוץ|הדרגתי|חזרות|איכות",
    re.IGNORECASE,
)
EASY_WORDS = re.compile(r"easy|recovery|long run|קל|שחרור|התאוששות|ארוכה", re.IGNORECASE)


@dataclass
class WorkoutReport:
    day: date
    title: str
    kind: str  # "easy" | "quality"
    status: str  # ok | partial | over | missed | unplanned | off | planned
    planned_min: float | None
    planned_km: float | None
    done_min: float
    done_km: float
    easy_min: float
    hard_min: float
    easy_km: float
    hard_km: float
    compliance_pct: float | None
    flags: list[str] = field(default_factory=list)


@dataclass
class WeekReport:
    week_start: date
    week_end: date
    runs: int
    easy_runs: int
    quality_runs: int
    km: float
    minutes: float
    easy_km: float
    hard_km: float
    easy_min: float
    hard_min: float
    easy_pct: float | None  # share of running time in easy zones
    planned_km: float
    planned_min: float
    completion_pct: float | None
    planned_sessions: int
    missed: int
    unplanned: int
    km_vs_target_pct: float | None
    zone_data_missing: int
    in_progress: bool = False  # the week has not ended yet
    notes: list[str] = field(default_factory=list)
    workouts: list[WorkoutReport] = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        d["week_start"] = self.week_start.isoformat()
        d["week_end"] = self.week_end.isoformat()
        for w in d["workouts"]:
            w["day"] = w["day"].isoformat()
        return d


def _planned_kind(w: Workout) -> str | None:
    text = f"{w.title} {w.description}"
    if QUALITY_WORDS.search(text):
        return "quality"
    if EASY_WORDS.search(text):
        return "easy"
    return None


def split_zones(w: Workout, easy_max_zone: int) -> tuple[float, float]:
    easy = sum(w.zone_minutes[:easy_max_zone])
    hard = sum(w.zone_minutes[easy_max_zone:])
    return easy, hard


def analyze_workout(w: Workout, a: Athlete, today: date) -> WorkoutReport:
    flags: list[str] = []
    done_min = w.duration_min or 0.0
    done_km = w.distance_km or 0.0
    planned_kind = _planned_kind(w)

    # Easy vs. hard minutes. Without zone data fall back to the workout's label.
    if w.has_zone_data:
        easy_min, hard_min = split_zones(w, a.easy_max_zone)
        zone_total = easy_min + hard_min
        # Scale to the recorded duration (zones may not cover pauses exactly).
        if done_min and zone_total:
            easy_min, hard_min = done_min * easy_min / zone_total, done_min * hard_min / zone_total
        kind = "quality" if hard_min >= a.quality_min_minutes else "easy"
    else:
        kind = planned_kind or "easy"
        easy_min, hard_min = (0.0, done_min) if kind == "quality" else (done_min, 0.0)
        if w.is_completed:
            flags.append("אין נתוני אזורים – הסיווג לפי כותרת האימון")

    total_min = easy_min + hard_min
    if total_min and done_km:
        easy_km, hard_km = done_km * easy_min / total_min, done_km * hard_min / total_min
    else:
        easy_km, hard_km = (done_km, 0.0) if kind == "easy" else (0.0, done_km)

    # Compliance against the plan.
    compliance = None
    if w.is_planned and not w.is_completed:
        status = "missed" if w.day < today else "planned"
    elif w.is_completed and not w.is_planned:
        status = "unplanned"
    elif not w.is_planned and not w.is_completed:
        status = "planned"
    else:
        if w.planned_duration_min and done_min:
            compliance = 100 * done_min / w.planned_duration_min
        elif w.planned_distance_km and done_km:
            compliance = 100 * done_km / w.planned_distance_km
        if compliance is None:
            status = "ok"
        elif 80 <= compliance <= 120:
            status = "ok"
        elif 50 <= compliance < 80:
            status = "partial"
        elif 120 < compliance <= 150:
            status = "over"
        else:
            status = "off"

    # Intensity adherence: was the session run in the zones the coach intended?
    if w.is_completed and w.has_zone_data:
        tolerance = max(a.easy_tolerance_min, 0.10 * done_min)
        if planned_kind == "easy" and hard_min > tolerance:
            flags.append(f"ריצה קלה שנעשתה חזק מדי: {hard_min:.0f} דק' מעל אזור {a.easy_max_zone}")
        if planned_kind == "quality" and hard_min < a.quality_min_minutes:
            flags.append(f"אימון איכות בלי מספיק עצימות: רק {hard_min:.0f} דק' מעל אזור {a.easy_max_zone}")
    if status == "missed":
        flags.append("אימון מתוכנן שלא בוצע")
    elif status == "partial":
        flags.append(f"בוצע חלקית ({compliance:.0f}% מהמתוכנן)")
    elif status == "over":
        flags.append(f"בוצע יותר מהמתוכנן ({compliance:.0f}%)")
    elif status == "off":
        flags.append(f"רחוק מהמתוכנן ({compliance:.0f}%)")

    return WorkoutReport(
        day=w.day, title=w.title or "(ללא כותרת)", kind=kind, status=status,
        planned_min=w.planned_duration_min, planned_km=w.planned_distance_km,
        done_min=round(done_min, 1), done_km=round(done_km, 2),
        easy_min=round(easy_min, 1), hard_min=round(hard_min, 1),
        easy_km=round(easy_km, 2), hard_km=round(hard_km, 2),
        compliance_pct=None if compliance is None else round(compliance, 1), flags=flags,
    )


def analyze_week(ws: date, workouts: list[Workout], a: Athlete, today: date) -> WeekReport:
    reports = [analyze_workout(w, a, today) for w in sorted(workouts, key=lambda w: w.day)]
    done = [r for r in reports if r.done_min or r.done_km]
    km = sum(r.done_km for r in done)
    minutes = sum(r.done_min for r in done)
    easy_min = sum(r.easy_min for r in done)
    hard_min = sum(r.hard_min for r in done)
    planned = [w for w in workouts if w.is_planned]
    planned_km = sum(w.planned_distance_km or 0 for w in planned)
    planned_min = sum(w.planned_duration_min or 0 for w in planned)
    if planned_min:
        completion = 100 * sum(r.done_min for r in reports if r.planned_min) / planned_min
    elif planned_km:
        completion = 100 * sum(r.done_km for r in reports if r.planned_km) / planned_km
    else:
        completion = None
    easy_pct = 100 * easy_min / (easy_min + hard_min) if (easy_min + hard_min) else None

    wk = WeekReport(
        week_start=ws, week_end=ws + timedelta(days=6),
        runs=len(done),
        easy_runs=sum(1 for r in done if r.kind == "easy"),
        quality_runs=sum(1 for r in done if r.kind == "quality"),
        km=round(km, 2), minutes=round(minutes, 1),
        easy_km=round(sum(r.easy_km for r in done), 2), hard_km=round(sum(r.hard_km for r in done), 2),
        easy_min=round(easy_min, 1), hard_min=round(hard_min, 1),
        easy_pct=None if easy_pct is None else round(easy_pct, 1),
        planned_km=round(planned_km, 2), planned_min=round(planned_min, 1),
        completion_pct=None if completion is None else round(completion, 1),
        planned_sessions=len(planned),
        missed=sum(1 for r in reports if r.status == "missed"),
        unplanned=sum(1 for r in reports if r.status == "unplanned"),
        km_vs_target_pct=(round(100 * km / a.weekly_km_target, 1) if a.weekly_km_target else None),
        zone_data_missing=sum(1 for w in workouts if w.is_completed and not w.has_zone_data),
        in_progress=ws + timedelta(days=6) >= today,
        workouts=reports,
    )
    wk.notes = week_notes(wk, a)
    return wk


def week_notes(wk: WeekReport, a: Athlete) -> list[str]:
    """Short 'what went well / what to improve' notes for the coach."""
    notes: list[str] = []
    if wk.in_progress:
        notes.append("⏳ שבוע בתהליך – הנתונים חלקיים")
    if wk.runs == 0:
        return notes + ["לא נרשמו ריצות בשבוע הזה"]
    if wk.easy_pct is not None:
        diff = wk.easy_pct - a.target_easy_pct
        if diff < -5:
            notes.append(f"⚠️ רק {wk.easy_pct:.0f}% מהזמן היה קל (יעד {a.target_easy_pct:.0f}%) – יותר מדי עצימות")
        elif diff > 15 and wk.quality_runs == 0:
            notes.append(f"ℹ️ {wk.easy_pct:.0f}% קל ואף אימון איכות – אפשר להוסיף גירוי")
        else:
            notes.append(f"✅ חלוקת עצימות טובה: {wk.easy_pct:.0f}% קל / {100 - wk.easy_pct:.0f}% עצים")
    if wk.completion_pct is not None and not wk.in_progress:
        if wk.completion_pct >= 90:
            notes.append(f"✅ ביצוע התוכנית: {wk.completion_pct:.0f}%")
        else:
            notes.append(f"⚠️ ביצוע התוכנית: {wk.completion_pct:.0f}% בלבד")
    if wk.missed:
        notes.append(f"⚠️ {wk.missed} אימונים מתוכננים לא בוצעו")
    if wk.km_vs_target_pct is not None and not wk.in_progress:
        if wk.km_vs_target_pct < 85:
            notes.append(f"⚠️ נפח {wk.km:.1f} ק\"מ – {wk.km_vs_target_pct:.0f}% מהיעד השבועי")
        elif wk.km_vs_target_pct > 115:
            notes.append(f"⚠️ נפח {wk.km:.1f} ק\"מ – {wk.km_vs_target_pct:.0f}% מהיעד, לשים לב לעומס")
        else:
            notes.append(f"✅ נפח {wk.km:.1f} ק\"מ – בטווח היעד")
    hard_easy = sum(1 for w in wk.workouts if any("חזק מדי" in f for f in w.flags))
    if hard_easy:
        notes.append(f"⚠️ {hard_easy} ריצות קלות נעשו חזק מדי")
    if wk.zone_data_missing:
        notes.append(f"ℹ️ ל-{wk.zone_data_missing} ריצות אין נתוני דופק/אזורים")
    return notes


def analyze_athlete(
    workouts: list[Workout], a: Athlete, today: date,
    start: date | None = None, end: date | None = None,
) -> list[WeekReport]:
    runs = [w for w in workouts if w.is_run]
    if start:
        start = week_start_for(start, a.week_start)  # always report whole weeks
        runs = [w for w in runs if w.day >= start]
    if end:
        runs = [w for w in runs if w.day <= end]
    weeks = group_by_week(runs, a.week_start, start, end)
    reports = [analyze_week(ws, ws_workouts, a, today) for ws, ws_workouts in weeks.items()]
    # Drop leading weeks with nothing planned or done (e.g. before the athlete joined).
    while reports and not reports[0].workouts:
        reports.pop(0)
    return reports
