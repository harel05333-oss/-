"""Check one workout right after it is uploaded, and tell the coach if it stands out.

Examples: an easy run that went into Z3, a planned Z5a session run in Z5b,
RPE far above what the session should feel like, pain in the comment,
a heart rate far above what the pace explains, or a second hard session too soon.
"""
from __future__ import annotations

from .models import Activity, Athlete, PlannedWorkout
from .report import hmm, km, pace
from .threshold import resolve_thresholds
from .week import FATIGUE_WORDS, PAIN_WORDS, _day_he, _found, previous_weeks, week_bounds
from .workouts import analyze_run
from .zones import HARD, zone_rank

ABOVE_TARGET_MIN_S = 10 * 60  # at least this much time above the planned zone ...
ABOVE_TARGET_SHARE = 0.20  # ... or this share of the run
EASY_RPE_HIGH = 7
ANY_RPE_HIGH = 9
RPE_OVER_PLAN = 2
FASTER_THAN_PLAN = 0.03  # 3% faster than the fastest planned pace
HR_GAP_ZONES = 2  # heart-rate zone this many zones above the pace zone
HR_GAP_MIN_S = 10 * 60

# Intent from the planned title when the coach gave no zones.
TITLE_INTENT = [
    (("התאוששות", "recovery"), ("Z1", "Z1")),
    (("קלה", "קל", "easy", "aerobic", "אירובי", "ארוכה", "long", "lsd"), ("Z1", "Z2")),
    (("טמפו", "tempo", "סף", "threshold"), ("Z4", "Z5a")),
    (("אינטרוול", "interval", "חזרות", "reps", "פארטלק", "fartlek", "עליות", "hill"), ("Z4", "Z5c")),
]


def planned_intent(p: PlannedWorkout | None) -> tuple[str, str] | None:
    if p is None:
        return None
    if p.zone_max:
        return p.zone_min or "Z1", p.zone_max
    t = p.title.lower()
    for words, zones in TITLE_INTENT:
        if any(w in t for w in words):
            return zones
    return None


def check_workout(
    athlete: Athlete,
    activity: Activity,
    planned: PlannedWorkout | None = None,
    history: list[Activity] | None = None,
) -> list[dict]:
    """Alerts for one workout. `history` = the athlete's other activities (for the week context)."""
    alerts: list[dict] = []

    def add(level, text):
        alerts.append({"level": level, "text": text})

    prof = athlete.profile
    comment = activity.comment or ""
    areas = [x for x in prof.injuries if x and x in comment]
    if areas:
        add("alert", f"הערה על {', '.join(areas)} (אזור פציעה מוכר): \"{comment}\"")
    elif _found(PAIN_WORDS, comment):
        add("alert", f"הערה: \"{comment}\"")
    elif _found(FATIGUE_WORDS, comment):
        add("warn", f"הערה: \"{comment}\"")

    if not activity.is_run:
        if activity.rpe and activity.rpe >= ANY_RPE_HIGH:
            add("warn", f"RPE {activity.rpe:g}")
        return alerts

    th = resolve_thresholds(athlete, activity.day)
    w = analyze_run(activity, th, prof.zone_source)
    intent = planned_intent(planned)
    meant_easy = intent[1] in ("Z1", "Z2") if intent else not w.is_quality
    rpe = activity.rpe

    # ---- effort above the plan -------------------------------------------------
    if intent or meant_easy:
        top = intent[1] if intent else "Z2"
        above = {z: t for z, t in w.time_by_zone.items() if zone_rank(z) > zone_rank(top)}
        above_s = sum(above.values())
        if above_s >= ABOVE_TARGET_MIN_S or (activity.duration_s and above_s / activity.duration_s >= ABOVE_TARGET_SHARE):
            ordered = sorted(above.items(), key=lambda x: zone_rank(x[0]))
            zones = ordered[0][0] if len(ordered) == 1 else ", ".join(f"{z} {hmm(t)}" for z, t in ordered)
            plan = f"תוכנן עד {top}" if intent else "ריצה רציפה (בלי מבנה של אימון איכות)"
            add("warn", f"{plan}, בפועל {hmm(above_s)} ב-{zones}")

    if planned and planned.pace_fast_s:
        hard = [s for s in w.segments if s.kind == HARD and s.pace_s_per_km]
        fastest = min((s.pace_s_per_km for s in hard), default=None)
        if fastest and fastest < planned.pace_fast_s * (1 - FASTER_THAN_PLAN):
            add("warn", f"מהר מהקצבים: {pace(fastest)} מול תכנון {pace(planned.pace_fast_s)}–{pace(planned.pace_slow_s)}")

    # ---- how it felt -----------------------------------------------------------
    if rpe:
        if planned and planned.rpe and rpe >= planned.rpe + RPE_OVER_PLAN:
            add("warn", f"RPE {rpe:g}, תוכנן {planned.rpe:g}")
        elif meant_easy and rpe >= EASY_RPE_HIGH:
            add("warn", f"ריצה קלה עם RPE {rpe:g}, סימן לעייפות")
        elif rpe >= ANY_RPE_HIGH:
            add("info", f"RPE {rpe:g}")

    # ---- heart rate that the pace does not explain -------------------------------
    gap_s = sum(
        z.lap.duration_s for z in w.lap_zones
        if z.pace_zone and z.hr_zone and zone_rank(z.hr_zone) - zone_rank(z.pace_zone) >= HR_GAP_ZONES
    )
    if gap_s >= HR_GAP_MIN_S:
        add("info", f"דופק גבוה ביחס לקצב ב-{hmm(gap_s)} (חום, עליות, עייפות או תחילת מחלה)")

    # ---- long run progression --------------------------------------------------------
    if history and w.is_long:
        start, end = week_bounds(activity.day, prof.week_start)
        same_week = [a for a in history if a.is_run and a.id != activity.id and start <= a.day <= end]
        if all(a.distance_m < activity.distance_m for a in same_week):
            ref = previous_weeks(athlete, history, start, prof.zone_source)["longest_km"]
            up = round(activity.distance_m / 1000 - ref, 1) if ref else None
            if up is not None and up > prof.lsd_increase_max_km:
                add("warn", f"הארוכה גדלה ב-{up:g} ק\"מ לעומת השבועות האחרונים ({ref:g} ק\"מ), "
                            f"מותר עד {prof.lsd_increase_max_km:g}")

    # ---- quality sessions in the week ----------------------------------------------
    if w.is_quality and history:
        start, end = week_bounds(activity.day, prof.week_start)
        earlier = [
            (a, analyze_run(a, th, prof.zone_source)) for a in history
            if a.is_run and a.id != activity.id and a.start < activity.start
            and (activity.start - a.start).total_seconds() < 4 * 86400
        ]
        for a, wa in earlier:
            gap_h = (activity.start - a.start).total_seconds() / 3600
            if wa.is_quality and gap_h < wa.recovery_hours:
                add("warn", f"אימון איכות {gap_h:.0f} שעות אחרי {wa.workout_type} ({_day_he(a.day.isoformat())}), "
                            f"צריך לפחות {wa.recovery_hours}")
        if prof.max_quality_per_week is not None:
            n = 1 + sum(
                1 for a in history
                if a.is_run and a.id != activity.id and start <= a.day <= end and a.start < activity.start
                and analyze_run(a, th, prof.zone_source).is_quality
            )
            if n > prof.max_quality_per_week:
                add("warn", f"אימון האיכות ה-{n} השבוע (מתוכנן עד {prof.max_quality_per_week})")

    order = {"alert": 0, "warn": 1, "info": 2}
    alerts.sort(key=lambda a: order[a["level"]])
    return alerts


def render_alert(athlete: Athlete, activity: Activity, alerts: list[dict], planned: PlannedWorkout | None = None) -> str:
    """Short plain message, e.g.

    מיכל לוי, א׳ 15.11, ריצה בינונית (Z3)
    תוכנן: ריצה קלה 10 ק"מ
    10 ק"מ, 5:20 לק"מ, 53 דק׳, דופק 164, RPE 6
    תוכנן עד Z2, בפועל 53 דק׳ ב-Z3
    """
    th = resolve_thresholds(athlete, activity.day)
    w = analyze_run(activity, th, athlete.profile.zone_source) if activity.is_run else None
    what = w.workout_type if w else activity.title or activity.sport
    lines = [f"*{athlete.name}*, {_day_he(activity.day.isoformat())}, {what}"]
    if planned:
        lines.append(f"תוכנן: {planned.title}")
    facts = []
    if activity.distance_m:
        facts.append(km(activity.distance_m))
        if activity.is_run:
            facts.append(f"{pace(activity.duration_s / (activity.distance_m / 1000))} לק\"מ")
    facts.append(hmm(activity.duration_s))
    if activity.avg_hr:
        facts.append(f"דופק {activity.avg_hr:g}")
    if activity.rpe:
        facts.append(f"RPE {activity.rpe:g}")
    lines.append(", ".join(facts))
    for a in alerts:
        lines.append(("חשוב: " if a["level"] == "alert" else "") + a["text"])
    return "\n".join(lines)


def planned_for(activity: Activity, planned: list[PlannedWorkout]) -> PlannedWorkout | None:
    same_day = [p for p in planned if p.date == activity.day and p.sport == activity.sport]
    return same_day[0] if same_day else None
