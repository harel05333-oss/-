"""One athlete's week: volume, intensity, quality sessions, load, feelings, and flags.

The result is a plain dict (JSON-ready). The WhatsApp report and, later, the
Claude-written coach note are both built from it.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta

from .cycles import analyze_cycle, weekly_series
from .form import acwr, form_zone, week_flags
from .load import activity_tss, daily_tss, performance_chart
from .models import Activity, Athlete, PlannedWorkout
from .threshold import Thresholds, resolve_thresholds
from .workouts import RepeatSet, Segment, WorkoutAnalysis, analyze_run
from .zones import EASY, HARD, MODERATE, ZONES

# ---- flag thresholds (one place to tune) -----------------------------------
HARD_SHARE_HIGH = 0.30  # of run time
GREY_ZONE_SHARE = 0.15  # Z3 of run distance
EASY_RUN_RPE_HIGH = 7
HR_DRIFT_MIN_S = 10 * 60
DECOUPLING_HIGH = 0.05
EF_CHANGE = 0.03
THRESHOLD_STALE_DAYS = 90

# Words in the athlete's comment that the coach must see (Hebrew and English).
PAIN_WORDS = [  # pain, injury, illness -> red
    "כאב", "כואב", "התכווצ", "פציע", "נקע", "דלקת", "שבר", "נפיחות", "נפוח", "תפוס", "מתיחה בשריר",
    "חולה", "מחלה", "צינון", "שפעת", "חום גבוה", "סחרחור", "בחילה", "הקאה",
    "pain", "cramp", "injur", "sore", "sick", "fever", "dizzy", "niggle",
]
FATIGUE_WORDS = [  # tiredness -> orange
    "מותש", "גמור", "עייף", "לא ישנתי", "שינה גרועה", "כבדות", "כבדה", "כבדים", "אין כוח",
    "exhausted", "tired", "heavy legs", "flat",
]

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]

# Taper length before a goal race, by distance.
TAPER_DAYS = [(30000, 21), (15000, 17), (0, 12)]


def week_bounds(day: date, week_start: str = "sunday") -> tuple[date, date]:
    """The 7 days containing `day`, for a week that starts on any weekday."""
    first = WEEKDAYS.index(week_start)
    start = day - timedelta(days=(day.weekday() - first) % 7)
    return start, start + timedelta(days=6)


def last_complete_week(today: date, week_start: str = "sunday") -> tuple[date, date]:
    """The latest week that has fully ended before `today`."""
    start, _ = week_bounds(today, week_start)
    return start - timedelta(days=7), start - timedelta(days=1)


REFERENCE_WEEKS = 3  # progression is measured against the best of the last 3 weeks (3:1 / 2:1 cycles)
RECOVERY_WEEK = 0.85  # a week under 85% of the reference volume is a recovery week


def previous_weeks(athlete: Athlete, activities: list[Activity], start: date, prefer: str,
                   weeks: int = REFERENCE_WEEKS) -> dict:
    """Longest run, run km and hard km of each of the weeks before `start`, and the best of them.

    Taking the best of the last weeks means a recovery week does not reset progression:
    after 3 loading weeks and 1 easy week, the next long run is compared to the last loading week.
    """
    rows = []
    for k in range(1, weeks + 1):
        s, e = start - timedelta(days=7 * k), start - timedelta(days=7 * k - 6)
        runs = [a for a in activities if a.is_run and _in(a, s, e)]
        if not runs:
            continue
        th = resolve_thresholds(athlete, e)
        hard = sum(analyze_run(a, th, prefer).dist_by_class.get(HARD, 0) for a in runs)
        rows.append({
            "start": s.isoformat(),
            "longest_km": max(a.distance_m for a in runs) / 1000,
            "run_km": sum(a.distance_m for a in runs) / 1000,
            "hard_km": hard / 1000,
        })
    best = lambda k: round(max(r[k] for r in rows), 1) if rows else None
    return {"weeks": rows, "longest_km": best("longest_km"), "run_km": best("run_km"), "hard_km": best("hard_km")}


def _taper_context(goal: dict | None, rows: list[dict]) -> dict | None:
    """Week n of N of the taper, and how far volume came down from the peak before it."""
    if not goal or goal["phase"] not in ("taper", "race_week"):
        return None
    taper_days = next(t for d, t in TAPER_DAYS if goal["distance_m"] >= d)
    n_weeks = -(-taper_days // 7)
    left = goal["days_after_week"] // 7 if goal["phase"] == "taper" else -1
    before = rows[:-1][-(n_weeks + 3):]
    peak = max((r["run_km"] for r in before), default=0)
    cur = rows[-1]["run_km"] if rows else 0
    prev = rows[-2] if len(rows) >= 2 else None
    return {
        "week": n_weeks - left if goal["phase"] == "taper" else n_weeks + 1,
        "weeks": n_weeks,
        "peak_km": peak,
        "down_from_peak": round(1 - cur / peak, 2) if peak else None,
        "prev_run_km": prev["run_km"] if prev else None,
        "prev_longest_km": prev["longest_km"] if prev else None,
    }


def _goal_context(athlete: Athlete, start: date, end: date) -> dict | None:
    upcoming = sorted((g for g in athlete.profile.goal_races if g.date >= start), key=lambda g: g.date)
    if not upcoming:
        return None
    g = upcoming[0]
    days = (g.date - end).days
    taper = next(t for d, t in TAPER_DAYS if g.distance_m >= d)
    phase = "race_week" if g.date <= end else "taper" if days <= taper else "training"
    return {
        "name": g.name, "date": g.date.isoformat(), "distance_m": g.distance_m,
        "target_time_s": g.target_time_s, "priority": g.priority,
        "days_after_week": days, "weeks_to_race": max(days, 0) // 7, "phase": phase,
    }


def _in(a: Activity, start: date, end: date) -> bool:
    return start <= a.day <= end


def _found(words: list[str], text: str) -> list[str]:
    t = text.lower()
    return [w for w in words if re.search(re.escape(w), t)]


def _ef(analyses: list[WorkoutAnalysis]) -> float | None:
    """Efficiency factor of easy running: meters per minute per heartbeat."""
    num = den = 0.0
    for w in analyses:
        for z in w.lap_zones:
            l = z.lap
            if z.zone_class == EASY and l.avg_hr and l.distance_m > 0 and l.duration_s >= 180:
                num += (l.distance_m / (l.duration_s / 60)) / l.avg_hr * l.duration_s
                den += l.duration_s
    return num / den if den else None


def _decoupling(w: WorkoutAnalysis) -> float | None:
    """Pace-to-HR drift between the 1st and 2nd half of a long easy run (Friel's Pa:HR)."""
    laps = [z.lap for z in w.lap_zones if z.lap.avg_hr and z.lap.distance_m > 0]
    total = sum(l.duration_s for l in laps)
    if total < 60 * 60 or len(laps) < 4:
        return None
    halves, acc = ([], []), 0.0
    for l in laps:
        halves[0 if acc + l.duration_s / 2 <= total / 2 else 1].append(l)
        acc += l.duration_s

    def ef(ls):
        t = sum(l.duration_s for l in ls)
        d = sum(l.distance_m for l in ls)
        hr = sum(l.avg_hr * l.duration_s for l in ls) / t
        return (d / t) / hr

    if not halves[0] or not halves[1]:
        return None
    first, second = ef(halves[0]), ef(halves[1])
    return (first - second) / first


def _segment_dict(s: Segment) -> dict:
    return {
        "role": s.role,
        "kind": s.kind,
        "distance_m": round(s.distance_m),
        "duration_s": round(s.duration_s),
        "pace_s_per_km": round(s.pace_s_per_km) if s.pace_s_per_km else None,
        "avg_hr": round(s.avg_hr) if s.avg_hr else None,
        "zone": s.zone_label(),
        "hr_zone": s.hr_zone_label(),
    }


def _item_dict(i) -> dict:
    if isinstance(i, RepeatSet):
        paces = [e.pace_s_per_km for e in i.efforts if e.pace_s_per_km]
        hrs = [e.avg_hr for e in i.efforts if e.avg_hr]
        rec = i.recoveries[0] if i.recoveries else None
        zones = sorted({e.zone_label() for e in i.efforts})
        return {
            "type": "repeats",
            "count": len(i.efforts),
            "effort_distance_m": round(sum(e.distance_m for e in i.efforts) / len(i.efforts)),
            "effort_duration_s": round(sum(e.duration_s for e in i.efforts) / len(i.efforts)),
            "zone": zones[0] if len(zones) == 1 else " / ".join(zones),
            "pace_fastest": round(min(paces)) if paces else None,
            "pace_slowest": round(max(paces)) if paces else None,
            "pace_avg": round(sum(paces) / len(paces)) if paces else None,
            "avg_hr": round(sum(hrs) / len(hrs)) if hrs else None,
            "recovery_distance_m": round(rec.distance_m) if rec else None,
            "recovery_duration_s": round(rec.duration_s) if rec else None,
        }
    return {"type": "segment", **_segment_dict(i)}


def analyze_week(
    athlete: Athlete,
    activities: list[Activity],
    week_start: date,
    planned: list[PlannedWorkout] | None = None,
    prefer: str | None = None,
    week_start_day: str | None = None,
) -> dict:
    """`prefer` and `week_start_day` default to what the coach set in the athlete's questionnaire."""
    prefer = prefer or athlete.profile.zone_source
    start, end = week_bounds(week_start, week_start_day or athlete.profile.week_start)
    th = resolve_thresholds(athlete, end)

    week = sorted([a for a in activities if _in(a, start, end)], key=lambda a: a.start)
    runs = [a for a in week if a.is_run]
    analyses = [analyze_run(a, th, prefer) for a in runs]

    # ---- volume ------------------------------------------------------------
    run_km = sum(a.distance_m for a in runs) / 1000
    run_s = sum(a.duration_s for a in runs)
    other = [a for a in week if not a.is_run]
    by_sport: dict[str, float] = {}
    for a in other:
        by_sport[a.sport] = by_sport.get(a.sport, 0) + a.duration_s

    prev_weeks = []
    for k in range(1, 5):
        s, e = start - timedelta(days=7 * k), end - timedelta(days=7 * k)
        wr = [a for a in activities if a.is_run and _in(a, s, e)]
        prev_weeks.append({"start": s.isoformat(), "run_km": sum(a.distance_m for a in wr) / 1000})
    have_prev = [w for w in prev_weeks if w["run_km"] > 0]
    avg4 = sum(w["run_km"] for w in have_prev) / len(have_prev) if have_prev else None

    # ---- intensity ---------------------------------------------------------
    time_by_class = {c: 0.0 for c in (EASY, MODERATE, HARD)}
    dist_by_class = {c: 0.0 for c in (EASY, MODERATE, HARD)}
    time_by_zone = {z: 0.0 for z in ZONES}
    dist_by_zone = {z: 0.0 for z in ZONES}
    for w in analyses:
        for c, v in w.time_by_class.items():
            time_by_class[c] += v
        for c, v in w.dist_by_class.items():
            dist_by_class[c] += v
        for z, v in w.time_by_zone.items():
            time_by_zone[z] += v
        for z, v in w.dist_by_zone.items():
            dist_by_zone[z] += v

    # ---- load --------------------------------------------------------------
    days = daily_tss(activities, th, athlete.tss_history)
    chart = performance_chart(days, end)
    week_tss = sum(chart.get(start + timedelta(days=i), {}).get("tss", 0) for i in range(7))
    prev_week_tss = sum(chart.get(start - timedelta(days=7 - i), {}).get("tss", 0) for i in range(7))
    last = chart.get(end, {"ctl": 0, "atl": 0})
    before = chart.get(start - timedelta(days=1), {"ctl": 0, "atl": 0})
    ctl, atl = last["ctl"], last["atl"]
    tsb_next = ctl - atl  # form for the coming day
    ramp = ctl - before["ctl"]
    history_days = (end - min(days)).days + 1 if days else 0

    # ---- workouts ----------------------------------------------------------
    workouts = []
    for w in analyses:
        a = w.activity
        tss, how = activity_tss(a, th)
        workouts.append({
            "id": a.id,
            "date": a.day.isoformat(),
            "start": a.start.isoformat(),
            "title": a.title,
            "type": w.workout_type,
            "quality": w.is_quality,
            "long": w.is_long,
            "distance_m": round(a.distance_m),
            "duration_s": round(a.duration_s),
            "pace_s_per_km": round(a.duration_s / (a.distance_m / 1000)) if a.distance_m else None,
            "avg_hr": a.avg_hr,
            "tss": round(tss),
            "tss_method": how,
            "rpe": a.rpe,
            "comment": a.comment,
            "hard_m": round(w.dist_by_class.get(HARD, 0)),
            "dominant_hard_zone": w.dominant_hard_zone,
            "recovery_hours": w.recovery_hours,
            "parts": [_item_dict(i) for i in w.items] if w.is_quality or w.is_long else [],
            "decoupling": round(_decoupling(w), 3) if w.is_long and _decoupling(w) is not None else None,
        })
    for a in other:
        tss, how = activity_tss(a, th)
        workouts.append({
            "id": a.id, "date": a.day.isoformat(), "start": a.start.isoformat(), "title": a.title,
            "sport": a.sport, "type": a.sport, "quality": False, "long": False,
            "distance_m": round(a.distance_m), "duration_s": round(a.duration_s),
            "tss": round(tss), "tss_method": how, "rpe": a.rpe, "comment": a.comment, "parts": [],
        })
    workouts.sort(key=lambda w: w["start"])

    # ---- efficiency (aerobic improvement) ------------------------------------
    ef_now = _ef(analyses)
    prev_runs = [a for a in activities if a.is_run and start - timedelta(days=28) <= a.day < start]
    prev_th = resolve_thresholds(athlete, start - timedelta(days=1))
    ef_prev = _ef([analyze_run(a, prev_th, prefer) for a in prev_runs])
    ef_change = (ef_now - ef_prev) / ef_prev if ef_now and ef_prev else None

    # ---- planned vs done -------------------------------------------------------
    missed = []
    for p in planned or []:
        if start <= p.date <= end and not any(a.day == p.date and a.sport == p.sport for a in week):
            missed.append({"date": p.date.isoformat(), "title": p.title})

    summary = {
        "athlete": {"id": athlete.id, "name": athlete.name},
        "week": {"start": start.isoformat(), "end": end.isoformat()},
        "thresholds": {
            "pace_s_per_km": round(th.pace_s_per_km) if th.pace_s_per_km else None,
            "pace_source": th.pace_source,
            "lthr": round(th.lthr) if th.lthr else None,
            "lthr_source": th.lthr_source,
            "race_date": th.race_date.isoformat() if th.race_date else None,
        },
        "volume": {
            "run_km": round(run_km, 1),
            "run_s": round(run_s),
            "runs": len(runs),
            "total_s": round(sum(a.duration_s for a in week)),
            "other_s_by_sport": {k: round(v) for k, v in by_sport.items()},
            "prev_week_run_km": round(prev_weeks[0]["run_km"], 1),
            "avg4_run_km": round(avg4, 1) if avg4 is not None else None,
            "longest_run_km": round(max((a.distance_m for a in runs), default=0) / 1000, 1),
        },
        "intensity": {
            "time_by_class": {k: round(v) for k, v in time_by_class.items()},
            "km_by_class": {k: round(v / 1000, 1) for k, v in dist_by_class.items()},
            "time_by_zone": {k: round(v) for k, v in time_by_zone.items() if v},
            "km_by_zone": {k: round(v / 1000, 1) for k, v in dist_by_zone.items() if v},
        },
        "load": {
            "week_tss": round(week_tss),
            "prev_week_tss": round(prev_week_tss),
            "ctl": round(ctl, 1),
            "atl": round(atl, 1),
            "tsb": round(tsb_next, 1),
            "ramp": round(ramp, 1),
            "history_days": history_days,
            "form_zone": form_zone(tsb_next)[1],
            "fatigue_ratio": round(acwr(atl, ctl), 2) if acwr(atl, ctl) else None,
        },
        "efficiency": {
            "ef": round(ef_now, 4) if ef_now else None,
            "ef_prev4w": round(ef_prev, 4) if ef_prev else None,
            "change": round(ef_change, 3) if ef_change is not None else None,
        },
        "workouts": workouts,
        "missed": missed,
    }
    summary["goal"] = _goal_context(athlete, start, end)
    summary["progression"] = previous_weeks(athlete, activities, start, prefer)
    rows = weekly_series(athlete, activities, start, prefer)
    summary["cycle"] = analyze_cycle(rows, athlete.profile.cycle_load_weeks)
    summary["taper"] = _taper_context(summary["goal"], rows)
    recovery = bool(summary["cycle"] and summary["cycle"]["recovery_week"])
    g = summary["goal"]
    summary["_form"] = week_flags(chart, start, end, g["phase"] if g else None, recovery,
                                  g["days_after_week"] if g else None, history_days)
    summary["flags"], summary["highlights"] = _flags(summary, th, end, athlete)
    return summary


def _flags(s: dict, th: Thresholds, end: date, athlete: Athlete) -> tuple[list[dict], list[str]]:
    prof = athlete.profile
    flags: list[dict] = []
    good: list[str] = []

    def flag(level: str, text: str):
        flags.append({"level": level, "text": text})

    v, it, ld = s["volume"], s["intensity"], s["load"]

    goal = s.get("goal")
    in_taper = goal and goal["phase"] in ("taper", "race_week")
    if not in_taper and v["avg4_run_km"] and v["run_km"] > v["avg4_run_km"] * (1 + prof.max_weekly_increase):
        up = v["run_km"] / v["avg4_run_km"] - 1
        flag("warn", f"קפיצה בנפח: {v['run_km']:g} ק\"מ, {up:.0%} מעל ממוצע 4 השבועות ({v['avg4_run_km']:g})")

    ref = s.get("progression") or {}
    cyc = s.get("cycle")
    taper = s.get("taper")
    if taper and goal["phase"] == "taper":
        # After the build the load comes down on purpose: the cycle rule does not apply.
        if cyc:
            cyc.pop("flags")
        recovery_week = True
        if taper["prev_run_km"] and v["run_km"] >= taper["prev_run_km"]:
            flag("warn", f"טייפר: הנפח לא ירד לעומת השבוע הקודם ({v['run_km']:g} מול {taper['prev_run_km']:g})")
        if taper["prev_longest_km"] and v["longest_run_km"] >= taper["prev_longest_km"]:
            flag("info", f"טייפר: הארוכה לא התקצרה ({v['longest_run_km']:g} מול {taper['prev_longest_km']:g})")
    elif cyc and in_taper:  # race week
        cyc.pop("flags")
        recovery_week = True
    elif cyc:
        recovery_week = cyc["recovery_week"]
        for level, text in cyc.pop("flags"):
            flag(level, text)
    else:
        recovery_week = bool(ref.get("run_km")) and v["run_km"] < ref["run_km"] * RECOVERY_WEEK
    if ref.get("longest_km") and v["longest_run_km"]:
        up = round(v["longest_run_km"] - ref["longest_km"], 1)
        if up > prof.lsd_increase_max_km:
            flag("warn", f"הריצה הארוכה עלתה ב-{up:g} ק\"מ ({ref['longest_km']:g} ← {v['longest_run_km']:g}), "
                         f"מעל {prof.lsd_increase_max_km:g} ק\"מ")
        elif up < prof.lsd_increase_min_km and not recovery_week and not in_taper:
            flag("info", f"הריצה הארוכה לא התקדמה: {v['longest_run_km']:g} ק\"מ, לעומת {ref['longest_km']:g} "
                         f"(התקדמות מתוכננת {prof.lsd_increase_min_km:g}–{prof.lsd_increase_max_km:g})")
    if prof.hard_km_increase_max is not None and ref.get("hard_km") is not None:
        up = round(it["km_by_class"]["hard"] - ref["hard_km"], 1)
        if up > prof.hard_km_increase_max:
            flag("warn", f"הנפח העצים עלה ב-{up:g} ק\"מ ({ref['hard_km']:g} ← {it['km_by_class']['hard']:g}), "
                         f"מעל {prof.hard_km_increase_max:g} ק\"מ")
    if prof.weekly_km_max and v["run_km"] > prof.weekly_km_max:
        flag("warn", f"מעל הנפח המתוכנן: {v['run_km']:g} ק\"מ (תכנון עד {prof.weekly_km_max:g})")
    elif prof.weekly_km_min and v["run_km"] < prof.weekly_km_min and not in_taper:
        flag("info", f"מתחת לנפח המתוכנן: {v['run_km']:g} ק\"מ (תכנון {prof.weekly_km_min:g}–{prof.weekly_km_max or prof.weekly_km_min:g})")
    n_quality = sum(1 for w in s["workouts"] if w.get("quality"))
    if prof.max_quality_per_week is not None and n_quality > prof.max_quality_per_week:
        flag("warn", f"{n_quality} אימוני איכות (מתוכנן עד {prof.max_quality_per_week})")

    form_flags, form_good = s.pop("_form")
    for level, text in form_flags:
        flag(level, text)
    good.extend(form_good)

    run_s = sum(it["time_by_class"].values())
    if run_s:
        hard_share = it["time_by_class"]["hard"] / run_s
        if hard_share > HARD_SHARE_HIGH:
            flag("warn", f"הרבה עצימות: {hard_share:.0%} מזמן הריצה ב-Z4 ומעלה")
    run_m = sum(it["km_by_class"].values())
    if run_m and it["km_by_class"]["moderate"] / run_m > GREY_ZONE_SHARE:
        flag("info", f"{it['km_by_class']['moderate']:g} ק\"מ באזור האפור (Z3): ריצות קלות שיצאו מהירות מדי?")

    quality = [w for w in s["workouts"] if w.get("quality")]
    for a, b in zip(quality, quality[1:]):
        gap_h = (datetime.fromisoformat(b["start"]) - datetime.fromisoformat(a["start"])).total_seconds() / 3600
        if gap_h < a["recovery_hours"]:
            flag("warn", f"שני אימוני איכות צמודים: {a['type']} ואחריו {b['type']} אחרי {gap_h:.0f} שעות "
                         f"(צריך לפחות {a['recovery_hours']})")

    for w in s["workouts"]:
        day = _day_he(w["date"])
        comment = w.get("comment") or ""
        areas = [x for x in prof.injuries if x and x in comment]
        if areas:
            flag("alert", f"{day}: הערה על {', '.join(areas)} (אזור פציעה מוכר): 💬 \"{comment}\"")
        elif _found(PAIN_WORDS, comment):
            flag("alert", f"{day}: 💬 \"{comment}\"")
        elif _found(FATIGUE_WORDS, comment):
            flag("warn", f"{day}: 💬 \"{comment}\"")
        if w.get("type") in ("ריצה קלה", "ריצת התאוששות", "ריצה ארוכה") and (w.get("rpe") or 0) >= EASY_RUN_RPE_HIGH:
            flag("warn", f"{day}: {w['type']} שהרגישה קשה (RPE {w['rpe']:g}), סימן לעייפות")
        if w.get("decoupling") is not None and w["decoupling"] > DECOUPLING_HIGH:
            flag("info", f"{day}: בריצה הארוכה הדופק טיפס ביחס לקצב ({w['decoupling']:.0%} דה-קאפלינג), "
                         "הבסיס האירובי עוד לא שם (או חום/שתייה)")
        elif w.get("decoupling") is not None and w["decoupling"] <= 0.03:
            good.append(f"{day}: ריצה ארוכה יציבה, דופק וקצב צמודים ({w['decoupling']:.0%})")

    ef = s["efficiency"]["change"]
    if ef is not None and ef >= EF_CHANGE:
        good.append(f"יעילות אירובית השתפרה ב-{ef:.0%}: אותו קצב בדופק נמוך יותר בריצות הקלות")
    elif ef is not None and ef <= -EF_CHANGE:
        flag("info", f"יעילות אירובית ירדה ב-{-ef:.0%} בריצות הקלות (עייפות, חום או מחלה?)")

    for m in s["missed"]:
        flag("info", f"{_day_he(m['date'])}: אימון מתוכנן לא בוצע: {m['title']}")

    if not th.pace_s_per_km:
        flag("info", "אין תוצאה עדכנית של 5/10 ק\"מ, הזונים לפי דופק בלבד. כדאי לקבוע מבחן")
    elif th.race_date and (end - th.race_date).days > THRESHOLD_STALE_DAYS:
        flag("info", f"הסף מבוסס על תוצאה מלפני {(end - th.race_date).days} ימים. כדאי לעדכן במבחן או תחרות")

    order = {"alert": 0, "warn": 1, "info": 2}
    flags.sort(key=lambda f: order[f["level"]])
    return flags, good


DAYS_HE = ["ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳", "א׳"]


def _day_he(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{DAYS_HE[d.weekday()]} {d.day}.{d.month}"
