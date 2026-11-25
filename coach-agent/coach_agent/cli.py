"""Command line.

  python -m coach_agent zones --race 10 41:40 [--hr 172 --test]
  python -m coach_agent report examples/athletes/*.json [--week 2026-11-16]
  python -m coach_agent check examples/athletes/michal.json --from 2026-11-15
  python -m coach_agent questionnaire                       # print the questions
  python -m coach_agent intake athletes/new.json            # fill / edit an athlete's questionnaire
  python -m coach_agent plan athletes/dani.json season.xlsx --start 2026-07-26 --goal 2027-04-11
  python -m coach_agent dispatch --config coaches.json --state state.json [--now 2026-11-22T09:00]
  python -m coach_agent serve --config coaches.json --state state.json --port 8080
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

from .io_json import load_athlete_file, parse_time
from .report import pace, render_athlete, render_overview
from .threshold import hour_distance_m, lthr_from_5k, threshold_pace_from_race
from .week import WEEKDAYS, analyze_week, last_complete_week
from .zones import HR_ZONES, PACE_ZONES


def cmd_zones(args) -> int:
    dist_m = float(args.race[0]) * 1000
    t = parse_time(args.race[1])
    tp = threshold_pace_from_race(dist_m, t)
    print(f"תוצאה: {args.race[0]} ק\"מ ב-{args.race[1]} (קצב {pace(t / (dist_m / 1000))})")
    print(f"מרחק צפוי בשעה: {hour_distance_m(dist_m, t) / 1000:.2f} ק\"מ")
    print(f"קצב סף: {pace(tp)}/ק\"מ\n")
    print("זונים לפי קצב:")
    prev = None
    for name, slowest in PACE_ZONES:
        fast = pace(prev * tp) if prev else "מהיר"
        slow = pace(slowest * tp) if slowest != float("inf") else "איטי"
        print(f"  {name:4} {fast:>6} – {slow}")
        prev = slowest
    if args.hr:
        lthr = lthr_from_5k(args.hr, not args.test) if 4.5 <= float(args.race[0]) <= 5.5 else args.hr
        print(f"\nדופק סף: {lthr:.0f}")
        top = None
        for name, lowest in HR_ZONES:
            lo = round(lowest * lthr)
            if name == "Z1":
                print(f"  {name:4}   עד {top - 1}")
            else:
                print(f"  {name:4} {lo:>4} – {top - 1 if top else 'מקס'}")
            top = lo
    return 0


def cmd_report(args) -> int:
    today = date.fromisoformat(args.today) if args.today else date.today()
    summaries = []
    for path in args.files:
        athlete, activities, planned = load_athlete_file(path)
        if args.fit_dir:
            from .io_fit import read_fit_folder

            activities += read_fit_folder(args.fit_dir, athlete.timezone)
        week_start_day = args.week_start or athlete.profile.week_start
        day = date.fromisoformat(args.week) if args.week else last_complete_week(today, week_start_day)[0]
        summaries.append(analyze_week(athlete, activities, day, planned,
                                      prefer=args.prefer, week_start_day=week_start_day))
    if args.json:
        json.dump(summaries, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 0
    messages = ([render_overview(summaries)] if len(summaries) > 1 else []) + [render_athlete(s) for s in summaries]
    print("\n\n──────────\n\n".join(messages))
    return 0


def cmd_check(args) -> int:
    from .alerts import check_workout, planned_for, render_alert

    athlete, activities, planned = load_athlete_file(args.file)
    since = date.fromisoformat(args.since) if args.since else date.min
    found_any = False
    for a in sorted(activities, key=lambda a: a.start):
        if a.day < since:
            continue
        p = planned_for(a, planned)
        alerts = check_workout(athlete, a, p, activities)
        if alerts:
            found_any = True
            print(render_alert(athlete, a, alerts, p) + "\n")
    if not found_any:
        print("אין אימונים חריגים")
    return 0


def cmd_questionnaire(args) -> int:
    from .questionnaire import render_questionnaire

    print(render_questionnaire())
    return 0


def cmd_intake(args) -> int:
    from .questionnaire import run_interactive

    path = Path(args.file)
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    data["athlete"] = run_interactive(data.get("athlete"))
    data.setdefault("activities", [])
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nנשמר: {path}")
    return 0


def cmd_plan(args) -> int:
    from .season import describe_plan, import_plan

    plan, warnings = import_plan(
        args.file, args.xlsx,
        date.fromisoformat(args.start) if args.start else None,
        date.fromisoformat(args.goal) if args.goal else None,
    )
    name = json.loads(Path(args.file).read_text(encoding="utf-8"))["athlete"]["name"]
    print(describe_plan(name, plan, warnings))
    return 0


def cmd_dispatch(args) -> int:
    from .dispatch import Store, dispatch, load_config
    from .whatsapp import WhatsAppClient

    now = datetime.fromisoformat(args.now) if args.now else None
    dispatch(load_config(args.config), Store(args.state), WhatsAppClient(), now)
    return 0


def cmd_serve(args) -> int:
    import os

    from .server import serve

    config, state = args.config, args.state
    data_dir = args.data_dir or os.environ.get("DATA_DIR")
    if data_dir:
        from .bootstrap import ensure_data_dir

        config, state = ensure_data_dir(data_dir)
    if not (config and state):
        raise SystemExit("serve needs --data-dir (or DATA_DIR), or both --config and --state")
    port = args.port or int(os.environ.get("PORT", "8080"))
    serve(str(config), str(state), port)
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser(prog="coach_agent")
    sub = p.add_subparsers(dest="cmd", required=True)

    z = sub.add_parser("zones", help="קצב סף וזונים מתוצאת מרוץ")
    z.add_argument("--race", nargs=2, metavar=("KM", "TIME"), required=True)
    z.add_argument("--hr", type=float, help="דופק ממוצע במרוץ (5 ק\"מ) לחישוב דופק סף")
    z.add_argument("--test", action="store_true", help="מבחן באימון ולא תחרות")
    z.set_defaults(func=cmd_zones)

    r = sub.add_parser("report", help="סיכום שבועי")
    r.add_argument("files", nargs="+", help="קובץ JSON לכל מתאמן")
    r.add_argument("--week", help="תאריך כלשהו בשבוע (YYYY-MM-DD). ברירת מחדל: השבוע האחרון שהסתיים")
    r.add_argument("--today", help="להרצה כאילו היום הוא תאריך אחר")
    r.add_argument("--fit-dir", help="תיקייה עם קבצי FIT (למתאמן אחד)")
    r.add_argument("--prefer", choices=["pace", "hr", "max"], help="מה קובע את הזון (ברירת מחדל: מהשאלון)")
    r.add_argument("--week-start", choices=WEEKDAYS, help="יום תחילת שבוע (ברירת מחדל: מהשאלון)")
    r.add_argument("--json", action="store_true", help="פלט JSON במקום טקסט")
    r.set_defaults(func=cmd_report)

    c = sub.add_parser("check", help="התראות על אימונים חריגים")
    c.add_argument("file")
    c.add_argument("--from", dest="since", help="רק אימונים מהתאריך הזה")
    c.set_defaults(func=cmd_check)

    q = sub.add_parser("questionnaire", help="הדפסת שאלון המתאמן")
    q.set_defaults(func=cmd_questionnaire)

    i = sub.add_parser("intake", help="מילוי או עדכון שאלון למתאמן")
    i.add_argument("file", help="קובץ ה-JSON של המתאמן (נוצר אם אינו קיים)")
    i.set_defaults(func=cmd_intake)

    pl = sub.add_parser("plan", help="טעינת תכנון עונתי מאקסל למתאמן")
    pl.add_argument("file", help="קובץ ה-JSON של המתאמן")
    pl.add_argument("xlsx", help="קובץ האקסל של התכנון")
    pl.add_argument("--start", help="תאריך תחילת העונה (YYYY-MM-DD). ברירת מחדל: מהשאלון")
    pl.add_argument("--goal", help="תאריך תחרות המטרה (YYYY-MM-DD). ברירת מחדל: מהשאלון")
    pl.set_defaults(func=cmd_plan)

    d = sub.add_parser("dispatch", help="סבב שליחה אחד לוואטסאפ")
    d.add_argument("--config", required=True)
    d.add_argument("--state", required=True)
    d.add_argument("--now", help="להרצה כאילו עכשיו הוא זמן אחר (YYYY-MM-DDTHH:MM)")
    d.set_defaults(func=cmd_dispatch)

    s = sub.add_parser("serve", help="שרת וואטסאפ (webhook + שליחה כל שעה)")
    s.add_argument("--data-dir", help="תיקיית נתונים (נוצרת בהפעלה הראשונה). אפשר גם DATA_DIR")
    s.add_argument("--config")
    s.add_argument("--state")
    s.add_argument("--port", type=int, help="ברירת מחדל: PORT או 8080")
    s.set_defaults(func=cmd_serve)

    args = p.parse_args(argv)
    return args.func(args)
