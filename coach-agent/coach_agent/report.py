"""Write each athlete's folder: weekly table, workout log, Hebrew report, JSON for other tools."""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

from .analysis import WeekReport
from .models import WEEKDAY_HE, Athlete, Coach
from .rpe import fmt_pace

STATUS_HE = {
    "ok": "✅ בוצע", "partial": "🟡 חלקי", "over": "🟠 מעל המתוכנן", "off": "🔴 רחוק מהתוכנית",
    "missed": "❌ לא בוצע", "unplanned": "➕ לא מתוכנן", "planned": "📅 מתוכנן",
}
KIND_HE = {"easy": "קל", "quality": "איכות"}


def slug(text: str) -> str:
    s = re.sub(r"[^\w\-]+", "-", text.strip(), flags=re.UNICODE).strip("-")
    return s or "athlete"


def _d(d) -> str:
    return d.strftime("%d/%m/%Y")


def _n(v, digits=1, suffix="") -> str:
    return "—" if v is None else f"{v:.{digits}f}{suffix}"


WEEK_COLUMNS = [
    "week_start", "week_end", "runs", "easy_runs", "quality_runs", "km", "minutes",
    "easy_km", "hard_km", "easy_min", "hard_min", "easy_pct", "planned_km", "planned_min",
    "completion_pct", "planned_sessions", "missed", "unplanned", "km_vs_target_pct", "in_progress",
]


def write_athlete_folder(out_dir: Path, coach: Coach, a: Athlete, weeks: list[WeekReport],
                         coach_notes: str | None = None) -> Path:
    folder = out_dir / slug(coach.id) / slug(a.id)
    folder.mkdir(parents=True, exist_ok=True)

    with open(folder / "weekly_summary.csv", "w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.writer(fh)
        labels = a.rpe.labels() if a.rpe else []
        wr.writerow(WEEK_COLUMNS + [f"rpe_{l}_{u}" for l in labels for u in ("min", "km")])
        for wk in weeks:
            d = wk.to_dict()
            wr.writerow([d[c] for c in WEEK_COLUMNS] + _rpe_cells(wk.rpe, labels))

    with open(folder / "workouts.csv", "w", newline="", encoding="utf-8-sig") as fh:
        wr = csv.writer(fh)
        wr.writerow(["week_start", "day", "title", "kind", "status", "planned_min", "planned_km",
                     "done_min", "done_km", "easy_min", "hard_min", "compliance_pct", "measured_by",
                     "rpe_blocks", "flags"] + [f"rpe_{l}_{u}" for l in labels for u in ("min", "km")])
        for wk in weeks:
            for w in wk.workouts:
                wr.writerow([wk.week_start.isoformat(), w.day.isoformat(), w.title, w.kind, w.status,
                             w.planned_min, w.planned_km, w.done_min, w.done_km, w.easy_min,
                             w.hard_min, w.compliance_pct, w.method, _blocks_text(w.rpe_blocks),
                             " | ".join(w.flags)] + _rpe_cells(w.rpe, labels))

    (folder / "summary.json").write_text(json.dumps({
        "coach": coach.name, "athlete": a.name, "week_starts_on": WEEKDAY_HE[a.week_start],
        "target_easy_pct": a.target_easy_pct, "weekly_km_target": a.weekly_km_target,
        "weeks": [wk.to_dict() for wk in weeks],
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    (folder / "report.md").write_text(render_markdown(coach, a, weeks, coach_notes), encoding="utf-8")
    if coach_notes:
        (folder / "coach_notes.md").write_text(coach_notes, encoding="utf-8")
    return folder


def _rpe_cells(rpe: dict | None, labels: list[str]) -> list:
    if not rpe:
        return ["" for _ in labels for _u in (0, 1)]
    return [rpe.get(l, {}).get(u, 0) for l in labels for u in ("min", "km")]


def _blocks_text(blocks: list[dict]) -> str:
    return "; ".join(f"מאמץ {b['rpe']}: {b['actual_min']:.0f}/{b['planned_min']:.0f} דק'" for b in blocks)


def _rpe_text(rpe: dict | None) -> str:
    if not rpe:
        return "—"
    return " · ".join(f"{k}: {v['min']:.0f}'" for k, v in rpe.items() if v["min"] >= 0.5)


def render_markdown(coach: Coach, a: Athlete, weeks: list[WeekReport], coach_notes: str | None) -> str:
    L = [f"# {a.name} – דוח אימונים",
         "",
         f"מאמן: {coach.name} · השבוע של המתאמן מתחיל ביום **{WEEKDAY_HE[a.week_start]}** · "
         f"יעד קל: {a.target_easy_pct:.0f}%"
         + (f" · קל = אזורים 1–{a.easy_max_zone} או תחושת מאמץ 1–{a.easy_max_rpe}" if a.rpe else f" · קל = אזורים 1–{a.easy_max_zone}") + (f" · יעד נפח: {a.weekly_km_target} ק\"מ" if a.weekly_km_target else ""),
         ""]
    if a.rpe:
        L += ["**קצבים לפי תחושת מאמץ:** " + " · ".join(
            f"{lvl} = {fmt_pace(p)}" for lvl, p in sorted(a.rpe.anchors.items())), ""]
    if coach_notes:
        L += ["## הערות לסוכן המאמן", "", coach_notes.strip(), ""]

    L += ["## סיכום שבועי", "",
          "| שבוע | ריצות | קלות | איכות | ק\"מ | ק\"מ קל | ק\"מ עצים | % זמן קל | ביצוע תוכנית | פספוסים |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for wk in weeks:
        L.append(f"| {_d(wk.week_start)}–{_d(wk.week_end)} | {wk.runs} | {wk.easy_runs} | {wk.quality_runs} | "
                 f"{wk.km:.1f} | {wk.easy_km:.1f} | {wk.hard_km:.1f} | {_n(wk.easy_pct, 0, '%')} | "
                 f"{_n(wk.completion_pct, 0, '%')} | {wk.missed} |")
    L.append("")

    if a.rpe and any(wk.rpe for wk in weeks):
        labels = a.rpe.labels()
        L += ["## דקות לפי תחושת מאמץ", "",
              "| שבוע | " + " | ".join(f"מאמץ {l}" for l in labels) + " |",
              "|---|" + "---|" * len(labels)]
        for wk in weeks:
            cells = [(f"{wk.rpe[l]['min']:.0f}' ({wk.rpe[l]['km']:.1f} ק\"מ)" if wk.rpe and l in wk.rpe else "—")
                     for l in labels]
            L.append(f"| {_d(wk.week_start)}–{_d(wk.week_end)} | " + " | ".join(cells) + " |")
        L.append("")

    for wk in reversed(weeks):
        L += [f"## שבוע {_d(wk.week_start)} – {_d(wk.week_end)}" + (" (בתהליך)" if wk.in_progress else ""), ""]
        L += [f"- {n}" for n in wk.notes]
        L += ["", f"**נפח:** {wk.km:.1f} ק\"מ ב-{wk.minutes:.0f} דק' · "
                  f"**קל:** {wk.easy_km:.1f} ק\"מ ({wk.easy_min:.0f} דק') · "
                  f"**עצים:** {wk.hard_km:.1f} ק\"מ ({wk.hard_min:.0f} דק')", ""]
        if wk.workouts:
            L += ["| תאריך | אימון | סוג | סטטוס | מתוכנן | בוצע | קל/עצים (דק') | לפי מאמץ | קטעים: בוצע/תוכנן | הערות |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
            for w in wk.workouts:
                planned = " / ".join(x for x in [
                    f"{w.planned_min:.0f} דק'" if w.planned_min else "",
                    f"{w.planned_km:.1f} ק\"מ" if w.planned_km else ""] if x) or "—"
                done = (f"{w.done_min:.0f} דק' / {w.done_km:.1f} ק\"מ") if (w.done_min or w.done_km) else "—"
                L.append(f"| {WEEKDAY_HE[w.day.weekday()]} {_d(w.day)} | {w.title} | {KIND_HE[w.kind]} | "
                         f"{STATUS_HE[w.status]} | {planned} | {done} | {w.easy_min:.0f}/{w.hard_min:.0f} | "
                         f"{_rpe_text(w.rpe)} | {_blocks_text(w.rpe_blocks) or '—'} | {'; '.join(w.flags)} |")
            L.append("")
    return "\n".join(L) + "\n"


def write_coach_overview(out_dir: Path, coach: Coach, results: dict[str, list[WeekReport]]) -> Path:
    """One table per coach: every athlete's most recent week."""
    folder = out_dir / slug(coach.id)
    folder.mkdir(parents=True, exist_ok=True)
    L = [f"# {coach.name} – מבט על כל המתאמנים", "",
         "השבוע האחרון שהסתיים לכל מתאמן, לפי ימי השבוע שלו.", "",
         "| מתאמן | שבוע | ריצות (קל/איכות) | ק\"מ | % זמן קל | ביצוע תוכנית | פספוסים | נקודה לשים לב |",
         "|---|---|---|---|---|---|---|---|"]
    for a in coach.athletes:
        weeks = results.get(a.id) or []
        if not weeks:
            L.append(f"| {a.name} | — | — | — | — | — | — | אין נתונים |")
            continue
        done = [w for w in weeks if not w.in_progress]
        wk = done[-1] if done else weeks[-1]
        warn = next((n for n in wk.notes if n.startswith("⚠️")), "הכל תקין")
        L.append(f"| [{a.name}]({slug(a.id)}/report.md) | {_d(wk.week_start)}–{_d(wk.week_end)} | "
                 f"{wk.runs} ({wk.easy_runs}/{wk.quality_runs}) | {wk.km:.1f} | {_n(wk.easy_pct, 0, '%')} | "
                 f"{_n(wk.completion_pct, 0, '%')} | {wk.missed} | {warn} |")
    path = folder / "overview.md"
    path.write_text("\n".join(L) + "\n", encoding="utf-8")
    return path
