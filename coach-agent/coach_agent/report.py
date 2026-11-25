"""WhatsApp text for the coach, in Hebrew. Plain text, no icons; *bold* and _italic_ are WhatsApp formatting."""
from __future__ import annotations

from datetime import date

from .week import _day_he

LEVEL_HE = {"alert": "חשוב", "warn": "לתשומת לב", "info": "לידיעה"}
SPORT_HE = {"bike": "אופניים", "swim": "שחייה", "strength": "כוח", "other": "אחר", "run": "ריצה"}


def pace(s: float | None) -> str:
    if not s:
        return "-"
    m, sec = divmod(round(s), 60)
    return f"{m}:{sec:02d}"


def hmm(s: float) -> str:
    """1:05 (hours) / 45 דק׳ / 2:30 דק׳ (short parts keep their seconds)"""
    if s < 600 and round(s) % 60:
        m, sec = divmod(round(s), 60)
        return f"{m}:{sec:02d} דק׳"
    m = round(s / 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}" if h else f"{m} דק׳"


def hmm_s(s: float) -> str:
    """3:30:00 / 41:40"""
    m, sec = divmod(round(s), 60)
    h, m = divmod(m, 60)
    return f"{h}:{m:02d}:{sec:02d}" if h else f"{m}:{sec:02d}"


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
    return f" | דופק {p['avg_hr']}" + (f" ({z})" if z and z != p.get("zone", "").split(" ")[0] else "")


ROLE_HE = {"warmup": "חימום", "cooldown": "שחרור", "recovery": "קל", "main": ""}


def _part_line(p: dict, by_time: bool = False) -> str:
    if p["type"] == "repeats":
        run_walk = p.get("recovery_kind") == "walk" and p.get("effort_kind") == "easy"
        if by_time or run_walk:
            effort = hmm(p["effort_duration_s"]) + (" ריצה" if run_walk else "")
            rec = hmm(p["recovery_duration_s"]) if p["recovery_duration_s"] else None
        else:
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
            line += f" | דופק {p['avg_hr']}"
        if rec:
            what = "הליכה" if p.get("recovery_kind") == "walk" else "התאוששות"
            line += f"\n     {what} {rec} בין החזרות"
        return line
    if p["kind"] == "walk":
        return f"הליכה {hmm(p['duration_s'])}"
    label = ROLE_HE.get(p["role"], "")
    d = hmm(p["duration_s"]) if by_time else dist(p["distance_m"], p["duration_s"])
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

    out.append(f"*{a['name']}* | שבוע {start.day}.{start.month}–{end.day}.{end.month}")
    g = s.get("goal")
    if g:
        gd = date.fromisoformat(g["date"])
        when = {"race_week": "השבוע!", "taper": f"טייפר, עוד {g['days_after_week']} ימים"}.get(
            g["phase"], f"עוד {g['weeks_to_race']} שבועות")
        target = f", יעד {hmm_s(g['target_time_s'])}" if g.get("target_time_s") else ""
        out.append(f"מטרה: {g['name']} ({g['priority']}) {gd.day}.{gd.month}{target} | {when}")
    pl = s.get("plan")
    if pl:
        line = f"תכנון: {pl['phase']}, שבוע {pl['week']} מתוך {pl['weeks']}" if pl["phase"] else f"תכנון: שבוע {pl['week']} מתוך {pl['weeks']}"
        bits = []
        if pl.get("volume_km"):
            lo, hi = pl["volume_km"]
            bits.append(f"נפח {lo:g}" + (f"-{hi:g}" if hi != lo else ""))
        if pl.get("lsd_km"):
            bits.append(f"ארוכה {pl['lsd_km']:g}")
        out.append(line + (" | " + ", ".join(bits) if bits else ""))
        if pl.get("sessions"):
            out.append("בתכנון: " + ", ".join(pl["sessions"]))
        if pl.get("race"):
            out.append(f"תחרות/טסט: {pl['race']}")

    # headline
    alerts = [f for f in s["flags"] if f["level"] in ("alert", "warn")]
    if alerts:
        out.append(f"{LEVEL_HE[alerts[0]['level']]}: {alerts[0]['text']}")

    # volume
    out.append("")
    out.append("*נפח*")
    by_time = s.get("unit") == "time"
    if v["runs"] and by_time:
        line = f"זמן: *{hmm(v['run_min'] * 60)}* | {v['runs']} אימונים"
        if v.get("walk_min"):
            share = v["jog_min"] / v["run_min"] if v["run_min"] else 0
            line += f" | ריצה {hmm(v['jog_min'] * 60)} ({share:.0%}) | הליכה {hmm(v['walk_min'] * 60)}"
        out.append(line)
    elif v["runs"]:
        out.append(f"ריצה: *{v['run_km']:g} ק\"מ* | {hmm(v['run_s'])} | {v['runs']} ריצות")
        if v.get("walk_min"):
            out.append(f"מתוכם הליכה: {hmm(v['walk_min'] * 60)}")
    else:
        out.append("לא נרשמו ריצות השבוע")
    if v["other_s_by_sport"]:
        parts = ", ".join(f"{SPORT_HE.get(k, k)} {hmm(t)}" for k, t in v["other_s_by_sport"].items())
        out.append(f"אימונים נוספים: {parts} | סה\"כ {hmm(v['total_s'])}")
    cmp = []
    cur, prev, avg = ((v["run_min"], v["prev_week_run_min"], v["avg4_run_min"]) if by_time
                      else (v["run_km"], v["prev_week_run_km"], v["avg4_run_km"]))
    u = " דק׳" if by_time else ""
    if prev:
        cmp.append(f"שבוע שעבר {prev:g}{u} ({cur / prev - 1:+.0%})")
    if avg:
        cmp.append(f"ממוצע 4 שבועות {avg:g}{u}")
    if cmp:
        out.append(" | ".join(cmp))
    if by_time and v["longest_min"]:
        out.append(f"אימון ארוך: {hmm(v['longest_min'] * 60)} | ריצה רציפה הכי ארוכה: {v['continuous_run_min']:g} דק׳")
    elif v["longest_run_km"]:
        out.append(f"ריצה ארוכה: {v['longest_run_km']:g} ק\"מ")
    c = s.get("cycle")
    t = s.get("taper")
    if t:
        down = f", נפח {t['down_from_peak']:.0%}- מהשיא ({t['peak_km']:g})" if t.get("down_from_peak") is not None else ""
        out.append(f"טייפר: שבוע {t['week']} מתוך {t['weeks']}{down}" if t["week"] <= t["weeks"] else "שבוע תחרות")
    elif c:
        if c["recovery_week"]:
            out.append(f"שבוע הורדה (אחרי {c['loading_weeks']} שבועות עומס)")
        elif c.get("load_weeks_planned") and c.get("known"):
            out.append(f"שבוע עומס {c['loading_weeks']} מתוך {c['load_weeks_planned']} במחזור")

    # intensity
    kc = {k: n for k, n in it["km_by_class"].items() if k != "walk"}
    run_km_zoned = sum(kc.values())
    tc = it["time_by_class"]
    run_s_zoned = sum(t for k, t in tc.items() if k != "walk")
    if by_time and run_s_zoned:
        out.append("")
        out.append("*עצימות* (זמן ריצה, בלי הליכה)")
        out.append(f"קל Z1–Z2: {hmm(tc['easy'])} ({_pct(tc['easy'], run_s_zoned)})")
        if tc["moderate"]:
            out.append(f"בינוני Z3: {hmm(tc['moderate'])} ({_pct(tc['moderate'], run_s_zoned)})")
        if tc["hard"]:
            out.append(f"עצים Z4+: *{hmm(tc['hard'])}* ({_pct(tc['hard'], run_s_zoned)})")
    elif run_km_zoned:
        out.append("")
        th_txt = f"סף {pace(th['pace_s_per_km'])}/ק\"מ" if th["pace_s_per_km"] else ""
        if th["lthr"]:
            th_txt += (" | " if th_txt else "") + f"דופק סף {th['lthr']}"
        out.append(f"*עצימות* _({th_txt})_" if th_txt else "*עצימות*")
        out.append(f"קל Z1–Z2: {kc['easy']:g} ק\"מ ({_pct(kc['easy'], run_km_zoned)})")
        if kc["moderate"]:
            out.append(f"בינוני Z3: {kc['moderate']:g} ק\"מ ({_pct(kc['moderate'], run_km_zoned)})")
        out.append(f"עצים Z4+: *{kc['hard']:g} ק\"מ* ({_pct(kc['hard'], run_km_zoned)})")
        hard_z = [f"{z} {it['km_by_zone'][z]:g}" for z in ("Z4", "Z5a", "Z5b", "Z5c") if it["km_by_zone"].get(z)]
        if hard_z:
            out.append("   " + " | ".join(hard_z))

    # key sessions
    key = [w for w in s["workouts"] if w.get("quality") or w.get("long") or w.get("run_walk")]
    if key:
        out.append("")
        out.append("*אימוני מפתח*")
        for w in key:
            size = hmm(w["duration_s"]) if by_time else km(w["distance_m"])
            head = f"*{_day_he(w['date'])} – {w['type']}* | {size} | TSS {w['tss']}"
            if w.get("rpe"):
                head += f" | RPE {w['rpe']:g}"
            out.append(head)
            for p in w["parts"]:
                if p["type"] == "segment" and p["kind"] == "easy" and p["role"] == "main" and len(w["parts"]) == 1:
                    out.append(f"  {dist(p['distance_m'], p['duration_s'])} {p['zone']} @{pace(p['pace_s_per_km'])}{_hr(p)}")
                    continue
                out.append("  " + _part_line(p, by_time))
            if w.get("comment"):
                out.append(f"  הערה: _{w['comment']}_")

    # load
    out.append("")
    out.append("*עומס*")
    tss_cmp = f" (שבוע שעבר {ld['prev_week_tss']})" if ld["prev_week_tss"] else ""
    out.append(f"TSS שבועי: *{ld['week_tss']}*{tss_cmp}")
    if ld["history_days"] >= 28:
        out.append(f"Fitness (CTL) {ld['ctl']:.0f} ({ld['ramp']:+.1f} השבוע)")
        out.append(f"Fatigue (ATL) {ld['atl']:.0f}" + (f" | פי {ld['fatigue_ratio']:.1f} מה-Fitness" if ld.get("fatigue_ratio") else ""))
        out.append(f"Form (TSB) {ld['tsb']:+.0f}: {ld['form_zone']}")
    else:
        out.append(f"_Fitness/Fatigue/Form יהיו מדויקים אחרי 4+ שבועות נתונים (יש {ld['history_days']} ימים)_")

    # feelings from other sessions (key sessions already showed theirs)
    notes = [w for w in s["workouts"] if not (w.get("quality") or w.get("long") or w.get("run_walk"))
             and (w.get("comment") or w.get("rpe"))]
    if notes:
        out.append("")
        out.append("*תחושות*")
        for w in notes:
            rpe = f"RPE {w['rpe']:g}" if w.get("rpe") else ""
            text = f"\"{w['comment']}\"" if w.get("comment") else ""
            out.append(f"{_day_he(w['date'])} {SPORT_HE.get(w['type'], w['type'])}: " + " – ".join(x for x in (rpe, text) if x))

    rest = s["flags"][1:] if alerts else s["flags"]
    for level in ("alert", "warn", "info"):
        items = [f["text"] for f in rest if f["level"] == level]
        if items:
            out.append("")
            out.append(f"*{LEVEL_HE[level]}*")
            out.extend(f"- {t}" for t in items)
    if s["highlights"]:
        out.append("")
        out.append("*מה טוב*")
        out.extend(f"- {g}" for g in s["highlights"])

    return "\n".join(out)


def render_overview(summaries: list[dict]) -> str:
    """Short opening message: who needs attention this week."""
    if not summaries:
        return "אין מתאמנים לסיכום השבוע."
    def rng(s):
        a, b = date.fromisoformat(s["week"]["start"]), date.fromisoformat(s["week"]["end"])
        return f"{a.day}.{a.month}–{b.day}.{b.month}"

    weeks = {rng(s) for s in summaries}
    title = f"*סיכום שבועי {weeks.pop()}*" if len(weeks) == 1 else "*סיכום שבועי*"
    out = [f"{title} | {len(summaries)} מתאמנים", ""]
    same_week = len({rng(s) for s in summaries}) == 1
    for s in sorted(summaries, key=lambda s: min([{"alert": 0, "warn": 1, "info": 2}[f["level"]] for f in s["flags"]] or [3])):
        levels = [f["level"] for f in s["flags"]]
        status = "חשוב" if "alert" in levels else "לתשומת לב" if "warn" in levels else "תקין"
        v = s["volume"]
        when = "" if same_week else f" ({rng(s)})"
        if s.get("unit") == "time":
            out.append(f"*{s['athlete']['name']}*{when} ({status}): {hmm(v['run_min'] * 60)}, "
                       f"ריצה רציפה עד {v['continuous_run_min']:g} דק׳, TSS {s['load']['week_tss']}")
        else:
            out.append(f"*{s['athlete']['name']}*{when} ({status}): {v['run_km']:g} ק\"מ, "
                       f"{s['intensity']['km_by_class']['hard']:g} עצים, TSS {s['load']['week_tss']}")
    out.append("")
    out.append("_פירוט לכל מתאמן בהודעות הבאות_")
    return "\n".join(out)
