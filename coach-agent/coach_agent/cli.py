"""Command line.

  python -m coach_agent zones --race 10 41:40 [--hr 172 --test]
  python -m coach_agent report examples/athletes/*.json --week 2026-11-16
  python -m coach_agent report athlete.json --fit-dir ~/Downloads/fits --week 2026-11-16
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date

from .io_json import load_athlete_file, parse_time
from .report import pace, render_athlete, render_overview
from .threshold import hour_distance_m, lthr_from_5k, threshold_pace_from_race
from .week import analyze_week
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
    summaries = []
    for path in args.files:
        athlete, activities, planned = load_athlete_file(path)
        if args.fit_dir:
            from .io_fit import read_fit_folder

            activities += read_fit_folder(args.fit_dir, athlete.timezone)
        summaries.append(analyze_week(
            athlete, activities, date.fromisoformat(args.week), planned,
            prefer=args.prefer, week_start_day=args.week_start,
        ))
    if args.json:
        json.dump(summaries, sys.stdout, ensure_ascii=False, indent=2)
        print()
        return 0
    messages = ([render_overview(summaries)] if len(summaries) > 1 else []) + [render_athlete(s) for s in summaries]
    print("\n\n──────────\n\n".join(messages))
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
    r.add_argument("--week", required=True, help="תאריך כלשהו בשבוע (YYYY-MM-DD)")
    r.add_argument("--fit-dir", help="תיקייה עם קבצי FIT (למתאמן אחד)")
    r.add_argument("--prefer", choices=["pace", "hr", "max"], default="pace", help="מה קובע את הזון")
    r.add_argument("--week-start", choices=["sunday", "monday"], default="sunday")
    r.add_argument("--json", action="store_true", help="פלט JSON במקום טקסט")
    r.set_defaults(func=cmd_report)

    args = p.parse_args(argv)
    return args.func(args)
