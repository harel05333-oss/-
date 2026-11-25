"""WhatsApp text for the coach, in Hebrew. *bold* and _italic_ are WhatsApp formatting."""
from __future__ import annotations

from datetime import date

from .week import _day_he

ICON = {"alert": "🔴", "warn": "🟠", "info": "🔵"}
SPORT_HE = {"bike": "אופניים", "swim": "שחייה", "strength": "כוח", "other": "אחר", "run": "ריצה"}


def pace(s: float | None) -> str:
    if not s:
        return "-"
    m, sec = divmod(round(s), 60)
    return f"{m}:{sec:02d}"


def hmm(s: float) -> str:
    m = round(s / 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}" if h else f"{m} דק׳"


def km(m: float) -> str:
    v = m / 1000
    return f"{v:.1f}".rstrip("0").rstrip(".") + " ק\"מ"


def dist(m: float | None, s: float | None) -> str:
    """400 מ׳ / 1.5 ק"מ, or a time when there is no distance."""
    if m and m >= 950:
        return km(m)
    if m:
        return f"{round(m / 50) * 50:g} מ׳"
    return hmm(s or 0)


def _hr(p: dict) -> str:
    if not p.get("avg_hr"):
        return ""
    z = p.get("hr_zone")
    return f" | ♥{p['avg_hr']}" + (f" ({z})" if z and z != p.get("zone", "").split(" ")[0] else "")


ROLE_HE = {"warmup": "חימום", "cooldown": "שחרור", "recovery": "קל", "main": ""}


def _part_line(p: dict) -> str:
    if p["type"] == "repeats":
        effort = dist(p["effort_distance_m"], p["effort_duration_s"])
        rec = dist(p["recovery_distance_m"], p["recovery_duration_s"]) if p["recovery_duration_s"] else None
        paces = ""
        if p["pace_avg"] and p["pace_fastest"] == p["pace_slowest"]:
            paces = f"@{pace(p['pace_avg'])}"
        elif p["pace_avg"]:
            paces = f"{pace(p['pace_fastest'])}–{pace(p['pace_slowest'])}, ממוצע {pace(p['pace_avg'])}"
        line = f"*{p['count']}×{effort}* {p['zone']}"
        if paces:
            line += f" | {paces}"
        if p.get("avg_hr"):
            line += f" | ♥{p['avg_hr']}"
        if rec:
            line += f"\n     התאוששות {rec} בין החזרות"
        return line
    label = ROLE_HE.get(p["role"], "")
    d = dist(p["distance_m"], p["duration_s"])
    if p["kind"] == "easy":
        return f"{label + ' ' if label else ''}{d} {p['zone']}" + (f" @{pace(p['pace_s_per_km'])}" if p["pace_s_per_km"] else "")
    return f"*{d} {p['zone']}*" + (f" @{pace(p['pace_s_per_km'])}" if p["pace_s_per_km"] else "") + _hr(p)


def _pct(part: float, whole: float) -> str:
    return f"{part / whole:.0%}" if whole else "-"


def render_athlete(s: dict) -> str:
    a, wk, th = s["athlete"], s["week"], s["thresholds"]
    v, it, ld = s["volume"], s["intensity"], s["load"]
    start, end = date.fromisoformat(wk["start"]), date.fromisoformat(wk["end"])
    out: list[str] = []

    out.append(f"*🏃 {a['name']}* | שבוע {start.day}.{start.month}–{end.day}.{end.month}")

    # headline
    alerts = [f for f in s["flags"] if f["level"] in ("alert", "warn")]
    if alerts:
        out.append(f"{ICON[alerts[0]['level']]} {alerts[0]['text']}")

    # volume
    out.append("")
    out.append("*📊 נפח*")
    if v["runs"]:
        out.append(f"ריצה: *{v['run_km']:g} ק\"מ* | {hmm(v['run_s'])} | {v['runs']} ריצות")
    else:
        out.append("לא נרשמו ריצות השבוע")
    if v["other_s_by_sport"]:
        parts = ", ".join(f"{SPORT_HE.get(k, k)} {hmm(t)}" for k, t in v["other_s_by_sport"].items())
        out.append(f"אימונים נוספים: {parts} | סה\"כ {hmm(v['total_s'])}")
    cmp = []
    if v["prev_week_run_km"]:
        diff = v["run_km"] / v["prev_week_run_km"] - 1
        cmp.append(f"שבוע שעבר {v['prev_week_run_km']:g} ({diff:+.0%})")
    if v["avg4_run_km"]:
        cmp.append(f"ממוצע 4 שבועות {v['avg4_run_km']:g}")
    if cmp:
        out.append(" | ".join(cmp))
    if v["longest_run_km"]:
        out.append(f"ריצה ארוכה: {v['longest_run_km']:g} ק\"מ")

    # intensity
    kc = it["km_by_class"]
    run_km_zoned = sum(kc.values())
    if run_km_zoned:
        out.append("")
        th_txt = f"סף {pace(th['pace_s_per_km'])}/ק\"מ" if th["pace_s_per_km"] else ""
        if th["lthr"]:
            th_txt += (" | " if th_txt else "") + f"דופק סף {th['lthr']}"
        out.append(f"*🎯 עצימות* _({th_txt})_" if th_txt else "*🎯 עצימות*")
        out.append(f"קל Z1–Z2: {kc['easy']:g} ק\"מ ({_pct(kc['easy'], run_km_zoned)})")
        if kc["moderate"]:
            out.append(f"בינוני Z3: {kc['moderate']:g} ק\"מ ({_pct(kc['moderate'], run_km_zoned)})")
        out.append(f"עצים Z4+: *{kc['hard']:g} ק\"מ* ({_pct(kc['hard'], run_km_zoned)})")
        hard_z = [f"{z} {it['km_by_zone'][z]:g}" for z in ("Z4", "Z5a", "Z5b", "Z5c") if it["km_by_zone"].get(z)]
        if hard_z:
            out.append("   " + " | ".join(hard_z))

    # key sessions
    key = [w for w in s["workouts"] if w.get("quality") or w.get("long")]
    if key:
        out.append("")
        out.append("*💥 אימוני מפתח*")
        for w in key:
            head = f"*{_day_he(w['date'])} – {w['type']}* | {km(w['distance_m'])} | TSS {w['tss']}"
            if w.get("rpe"):
                head += f" | RPE {w['rpe']:g}"
            out.append(head)
            for p in w["parts"]:
                if p["type"] == "segment" and p["kind"] == "easy" and p["role"] == "main" and len(w["parts"]) == 1:
                    out.append(f"  {dist(p['distance_m'], p['duration_s'])} {p['zone']} @{pace(p['pace_s_per_km'])}{_hr(p)}")
                    continue
                out.append("  " + _part_line(p))
            if w.get("comment"):
                out.append(f"  💬 _{w['comment']}_")

    # load
    out.append("")
    out.append("*🔋 עומס*")
    tss_cmp = f" (שבוע שעבר {ld['prev_week_tss']})" if ld["prev_week_tss"] else ""
    out.append(f"TSS שבועי: *{ld['week_tss']}*{tss_cmp}")
    if ld["history_days"] >= 28:
        out.append(f"כושר CTL {ld['ctl']:g} ({ld['ramp']:+g}) | עייפות ATL {ld['atl']:g} | רעננות TSB {ld['tsb']:+g}")
    else:
        out.append(f"_כושר/עייפות יהיו מדויקים אחרי 4+ שבועות נתונים (יש {ld['history_days']} ימים)_")

    # feelings from other sessions (key sessions already showed theirs)
    notes = [w for w in s["workouts"] if not (w.get("quality") or w.get("long")) and (w.get("comment") or w.get("rpe"))]
    if notes:
        out.append("")
        out.append("*💬 תחושות*")
        for w in notes:
            rpe = f"RPE {w['rpe']:g}" if w.get("rpe") else ""
            text = f"\"{w['comment']}\"" if w.get("comment") else ""
            out.append(f"{_day_he(w['date'])} {SPORT_HE.get(w['type'], w['type'])}: " + " – ".join(x for x in (rpe, text) if x))

    rest = s["flags"][1:] if alerts else s["flags"]
    if rest or s["highlights"]:
        out.append("")
        out.append("*📌 לתשומת לבך*")
        for f in rest:
            out.append(f"{ICON[f['level']]} {f['text']}")
        for g in s["highlights"]:
            out.append(f"🟢 {g}")

    return "\n".join(out)


def render_overview(summaries: list[dict]) -> str:
    """Short opening message: who needs attention this week."""
    if not summaries:
        return "אין מתאמנים לסיכום השבוע."
    start = date.fromisoformat(summaries[0]["week"]["start"])
    end = date.fromisoformat(summaries[0]["week"]["end"])
    out = [f"*סיכום שבועי {start.day}.{start.month}–{end.day}.{end.month}* | {len(summaries)} מתאמנים", ""]
    for s in sorted(summaries, key=lambda s: min([{"alert": 0, "warn": 1, "info": 2}[f["level"]] for f in s["flags"]] or [3])):
        levels = [f["level"] for f in s["flags"]]
        icon = ICON["alert"] if "alert" in levels else ICON["warn"] if "warn" in levels else "🟢"
        v = s["volume"]
        out.append(f"{icon} *{s['athlete']['name']}*: {v['run_km']:g} ק\"מ, {s['intensity']['km_by_class']['hard']:g} עצים, "
                   f"TSS {s['load']['week_tss']}")
    out.append("")
    out.append("_פירוט לכל מתאמן בהודעות הבאות_")
    return "\n".join(out)
