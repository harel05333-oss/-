"""The coach's questionnaire about each athlete.

The questions are plain data, so the same list can drive a terminal session
today and the WhatsApp conversation (or a web form) later. Answers become the
athlete's JSON file: {"athlete": {..., "profile": {...}}}.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

from .io_json import parse_time

WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
WEEKDAYS_HE = ["שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת", "ראשון"]
ZONE_SOURCES = {"pace": "קצב", "hr": "דופק", "max": "הקשה מביניהם"}
SKIP = {"", "-", "דלג", "skip"}


@dataclass
class Question:
    id: str
    text: str
    kind: str = "text"  # text, int, number, date, time, choice, list, range
    section: str = ""
    options: list[tuple[str, str]] = field(default_factory=list)  # (value, Hebrew label)
    required: bool = False
    hint: str = ""


S1, S2, S3, S4, S5 = "פרטי המתאמן", "מטרה", "ספים ודופק", "תכנון השבוע", "בריאות ואורח חיים"

QUESTIONS: list[Question] = [
    Question("name", "שם המתאמן", section=S1, required=True),
    Question("birth_year", "שנת לידה", "int", S1),
    Question("years_running", "כמה שנים רץ/ה?", "number", S1),

    Question("goal_name", "תחרות המטרה הקרובה (שם)", section=S2, hint="למשל: מרתון תל אביב"),
    Question("goal_date", "תאריך תחרות המטרה", "date", S2, hint="למשל 27.2.2027"),
    Question("goal_distance", "מרחק תחרות המטרה בק\"מ", "number", S2, hint="5 / 10 / 21.1 / 42.2"),
    Question("goal_time", "זמן יעד", "time", S2, hint="למשל 3:30:00"),
    Question("goal_priority", "חשיבות התחרות", "choice", S2,
             [("A", "A, תחרות מטרה"), ("B", "B, חשובה"), ("C", "C, אימון/כיף")]),

    Question("race_distance", "תוצאה עדכנית לקביעת הסף: מרחק בק\"מ", "number", S3, hint="5 או 10"),
    Question("race_time", "הזמן בתוצאה הזו", "time", S3, hint="למשל 41:40"),
    Question("race_date", "התאריך של התוצאה", "date", S3),
    Question("race_avg_hr", "דופק ממוצע בתוצאה הזו (אם יש)", "int", S3),
    Question("race_kind", "זו הייתה תחרות או מבחן באימון?", "choice", S3,
             [("race", "תחרות"), ("test", "מבחן באימון")]),
    Question("threshold_pace", "קצב סף ידוע (לא חובה, ריק = חישוב אוטומטי)", "time", S3, hint="למשל 4:15"),
    Question("lthr", "דופק סף ידוע (לא חובה)", "int", S3),
    Question("max_hr", "דופק מקסימלי ידוע", "int", S3),
    Question("resting_hr", "דופק מנוחה", "int", S3),

    Question("week_start", "באיזה יום מתחיל השבוע של המתאמן?", "choice", S4,
             [(d, he) for d, he in zip(WEEKDAYS[-1:] + WEEKDAYS[:-1], WEEKDAYS_HE[-1:] + WEEKDAYS_HE[:-1])],
             required=True),
    Question("zone_source", "לפי מה לקבוע את הזונים?", "choice", S4, list(ZONE_SOURCES.items()),
             hint="בשטח והרים עדיף דופק"),
    Question("weekly_km", "טווח נפח שבועי מתוכנן בק\"מ", "range", S4, hint="למשל 60-80"),
    Question("max_quality", "כמה אימוני איכות לכל היותר בשבוע?", "int", S4),
    Question("max_increase", "עלייה מקסימלית בנפח משבוע לשבוע (%)", "number", S4, hint="ברירת מחדל 15"),
    Question("lsd_progress", "התקדמות בריצה הארוכה משבוע לשבוע, בק\"מ", "range", S4, hint="ברירת מחדל 0.5-2.5"),
    Question("hard_increase", "עלייה מקסימלית בק\"מ עצימים (Z4 ומעלה) משבוע לשבוע", "number", S4,
             hint="ריק = לא לבדוק"),

    Question("injuries", "פציעות עבר או נוכחיות: אזורים לשים עליהם עין", "list", S5,
             hint="מופרד בפסיקים, למשל: אכילס, שוק, ברך"),
    Question("medical", "מגבלות רפואיות או מידע רפואי חשוב", section=S5),
    Question("sleep_hours", "כמה שעות שינה בממוצע בלילה?", "number", S5),
    Question("life_load", "עומס בחיים (עבודה, משמרות, לחץ, ילדים)", section=S5),
    Question("other_sports", "ענפים נוספים", "list", S5, hint="למשל: כוח, אופניים, שחייה"),
    Question("coach_notes", "על מה לשים לב במיוחד אצל המתאמן הזה?", section=S5),
]

BY_ID = {q.id: q for q in QUESTIONS}


def _date(s: str) -> date:
    s = s.strip()
    m = re.fullmatch(r"(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})", s)
    if m:
        d, mo, y = (int(x) for x in m.groups())
        return date(y + 2000 if y < 100 else y, mo, d)
    return date.fromisoformat(s)


def parse_answer(q: Question, raw: str):
    """Turn a typed answer into a value. Raises ValueError with a Hebrew message."""
    s = (raw or "").strip()
    if s.lower() in SKIP:
        if q.required:
            raise ValueError("זו שאלת חובה")
        return None
    try:
        if q.kind == "int":
            return int(float(s))
        if q.kind == "number":
            return float(s.replace("%", "").replace(",", "."))
        if q.kind == "date":
            return _date(s).isoformat()
        if q.kind == "time":
            if parse_time(s) is None or parse_time(s) <= 0:
                raise ValueError
            return s
        if q.kind == "list":
            return [x.strip() for x in re.split(r"[,،\n]", s) if x.strip()]
        if q.kind == "range":
            nums = [float(x) for x in re.findall(r"\d+(?:\.\d+)?", s)]
            if len(nums) == 1:
                return [nums[0], nums[0]]
            if len(nums) != 2:
                raise ValueError
            return sorted(nums)
        if q.kind == "choice":
            if s.isdigit() and 1 <= int(s) <= len(q.options):
                return q.options[int(s) - 1][0]
            for value, label in q.options:
                if s.lower() == value.lower() or s == label or s in label.split(",")[0]:
                    return value
            raise ValueError
    except ValueError:
        pass
    else:
        return s
    if q.kind == "choice":
        raise ValueError("בחר/י מספר מהרשימה")
    raise ValueError({"int": "צריך מספר", "number": "צריך מספר", "date": "צריך תאריך, למשל 27.2.2027",
                      "time": "צריך זמן, למשל 41:40", "range": "צריך טווח, למשל 60-80"}.get(q.kind, "לא הבנתי"))


def question_text(q: Question, current=None) -> str:
    lines = [q.text + (" *" if q.required else "")]
    for i, (_, label) in enumerate(q.options, 1):
        lines.append(f"  {i}. {label}")
    if q.hint:
        lines.append(f"  ({q.hint})")
    if current not in (None, "", []):
        lines.append(f"  [כרגע: {current}] (Enter משאיר)")
    return "\n".join(lines)


def answers_to_athlete(answers: dict, athlete_id: str | None = None) -> dict:
    """Answers -> the "athlete" object of the athlete JSON file."""
    a = answers.get
    athlete = {"id": athlete_id or re.sub(r"\W+", "-", a("name")).strip("-").lower(), "name": a("name")}
    if a("race_distance") and a("race_time") and a("race_date"):
        race = {"date": a("race_date"), "distance_km": a("race_distance"), "time": a("race_time"),
                "is_race": a("race_kind", "race") != "test"}
        if a("race_avg_hr"):
            race["avg_hr"] = a("race_avg_hr")
        athlete["races"] = [race]
    if a("threshold_pace"):
        athlete["threshold_pace"] = a("threshold_pace")
    if a("lthr"):
        athlete["lthr"] = a("lthr")

    profile = {"week_start": a("week_start") or "sunday", "zone_source": a("zone_source") or "pace"}
    for key in ("birth_year", "years_running", "max_hr", "resting_hr", "sleep_hours"):
        if a(key) is not None:
            profile[key] = a(key)
    if a("goal_date") and a("goal_distance"):
        goal = {"name": a("goal_name") or "תחרות מטרה", "date": a("goal_date"),
                "distance_km": a("goal_distance"), "priority": a("goal_priority") or "A"}
        if a("goal_time"):
            goal["target_time"] = a("goal_time")
        profile["goal_races"] = [goal]
    if a("weekly_km"):
        profile["weekly_km_min"], profile["weekly_km_max"] = a("weekly_km")
    if a("max_quality") is not None:
        profile["max_quality_per_week"] = a("max_quality")
    if a("max_increase") is not None:
        profile["max_weekly_increase"] = a("max_increase") / 100
    if a("lsd_progress"):
        profile["lsd_increase_min_km"], profile["lsd_increase_max_km"] = a("lsd_progress")
    if a("hard_increase") is not None:
        profile["hard_km_increase_max"] = a("hard_increase")
    for key, src in (("injuries", "injuries"), ("other_sports", "other_sports")):
        if a(src):
            profile[key] = a(src)
    for key, src in (("medical_notes", "medical"), ("life_load", "life_load"), ("coach_notes", "coach_notes")):
        if a(src):
            profile[key] = a(src)
    athlete["profile"] = profile
    return athlete


def athlete_to_answers(athlete: dict) -> dict:
    """The other way, so an existing athlete can be edited question by question."""
    p = athlete.get("profile", {})
    ans = {"name": athlete.get("name"), "threshold_pace": athlete.get("threshold_pace"), "lthr": athlete.get("lthr")}
    if athlete.get("races"):
        r = max(athlete["races"], key=lambda r: r["date"])
        ans.update(race_distance=r["distance_km"], race_time=r["time"], race_date=r["date"],
                   race_avg_hr=r.get("avg_hr"), race_kind="race" if r.get("is_race", True) else "test")
    if p.get("goal_races"):
        g = p["goal_races"][0]
        ans.update(goal_name=g.get("name"), goal_date=g["date"], goal_distance=g["distance_km"],
                   goal_time=g.get("target_time"), goal_priority=g.get("priority"))
    for key in ("birth_year", "years_running", "max_hr", "resting_hr", "sleep_hours", "week_start",
                "zone_source", "injuries", "other_sports", "life_load", "coach_notes"):
        ans[key] = p.get(key)
    ans["medical"] = p.get("medical_notes")
    if p.get("weekly_km_min") is not None:
        ans["weekly_km"] = [p["weekly_km_min"], p["weekly_km_max"]]
    ans["max_quality"] = p.get("max_quality_per_week")
    if "max_weekly_increase" in p:
        ans["max_increase"] = round(p["max_weekly_increase"] * 100)
    if "lsd_increase_max_km" in p:
        ans["lsd_progress"] = [p.get("lsd_increase_min_km", 0.5), p["lsd_increase_max_km"]]
    ans["hard_increase"] = p.get("hard_km_increase_max")
    return {k: v for k, v in ans.items() if v not in (None, "", [])}


def run_interactive(existing: dict | None = None, ask=input, say=print) -> dict:
    """Ask every question in turn. `ask` / `say` are swappable (terminal now, WhatsApp later)."""
    current = athlete_to_answers(existing) if existing else {}
    answers = dict(current)
    section = None
    say("שאלון מתאמן. Enter לדלג על שאלה, * = חובה.")
    for q in QUESTIONS:
        if q.section != section:
            section = q.section
            say(f"\n— {section} —")
        while True:
            raw = ask(question_text(q, current.get(q.id)) + "\n> ")
            if raw.strip() == "" and q.id in current:
                break
            try:
                value = parse_answer(q, raw)
            except ValueError as e:
                say(f"  ⚠️ {e}")
                continue
            if value is None:
                answers.pop(q.id, None)
            else:
                answers[q.id] = value
            break
    return answers_to_athlete(answers, existing.get("id") if existing else None)


def render_questionnaire() -> str:
    """The questionnaire as one text, e.g. to send or print."""
    out, section = [], None
    for i, q in enumerate(QUESTIONS, 1):
        if q.section != section:
            section = q.section
            out.append(f"\n*{section}*")
        line = f"{i}. {q.text}" + (" *" if q.required else "")
        if q.options:
            line += ": " + " / ".join(label for _, label in q.options)
        elif q.hint:
            line += f" ({q.hint})"
        out.append(line)
    return "\n".join(out).strip()
