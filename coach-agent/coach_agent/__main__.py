"""Command line: python -m coach_agent --config config.json [--source csv|api] [--from D] [--to D] [--ai]"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

from .analysis import analyze_athlete
from .models import Coach
from .report import write_athlete_folder, write_coach_overview


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="coach_agent", description="דוחות שבועיים למאמני ריצה")
    p.add_argument("--config", required=True, help="JSON with coaches and their athletes")
    p.add_argument("--out", default="output", help="output folder (default: output)")
    p.add_argument("--source", choices=["csv", "api"], default="csv")
    p.add_argument("--from", dest="start", type=date.fromisoformat, help="YYYY-MM-DD")
    p.add_argument("--to", dest="end", type=date.fromisoformat, help="YYYY-MM-DD")
    p.add_argument("--today", type=date.fromisoformat, default=date.today(),
                   help="reference date for 'missed' workouts (default: today)")
    p.add_argument("--zones", choices=["auto", "hr", "pace"], default="auto",
                   help="CSV only: which time-in-zone columns to use")
    p.add_argument("--ai", action="store_true", help="add Claude-written coaching notes (needs anthropic)")
    args = p.parse_args(argv)

    cfg_path = Path(args.config)
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    coaches = [Coach.from_dict(c) for c in cfg["coaches"]]
    out = Path(args.out)

    client = None
    if args.source == "api":
        from .sources.tp_api import TrainingPeaksClient
        client = TrainingPeaksClient()
    end = args.end or args.today
    start = args.start or (end - timedelta(weeks=8))

    for coach in coaches:
        results = {}
        for a in coach.athletes:
            if args.source == "api":
                if not a.tp_athlete_id:
                    print(f"skip {a.name}: no tp_athlete_id", file=sys.stderr)
                    continue
                workouts = client.workouts(a.tp_athlete_id, start - timedelta(days=6), end)
            else:
                if not a.csv:
                    print(f"skip {a.name}: no csv path", file=sys.stderr)
                    continue
                from .sources.tp_csv import load_csv
                workouts = load_csv((cfg_path.parent / a.csv), args.zones)
            weeks = analyze_athlete(workouts, a, args.today, start, end)
            notes = None
            if args.ai:
                from .insights import coach_notes
                notes = coach_notes(a, weeks)
            folder = write_athlete_folder(out, coach, a, weeks, notes)
            results[a.id] = weeks
            print(f"{coach.name} / {a.name}: {len(weeks)} weeks → {folder}")
        print(f"overview → {write_coach_overview(out, coach, results)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
