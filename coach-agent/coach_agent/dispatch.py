"""What to send to each coach, and when.

Run `dispatch()` every hour (the server does this by itself). For every athlete it:
  * checks each new workout and, if it stands out, sends the coach an alert;
  * when the athlete's own week has ended (each athlete can start the week on a
    different day), sends the weekly summary the next morning.

Config (coaches.json):
  {"coaches": [{"id": "harel", "name": "הראל", "whatsapp": "972501234567",
                "send_hour": 8,
                "athletes": [{"file": "athletes/dani.json", "fit_dir": "fits/dani"}]}]}

State (state.json) remembers what was already sent, so nothing is sent twice.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from .alerts import check_workout, planned_for, render_alert
from .io_json import load_athlete_file
from .questionnaire import render_questionnaire
from .report import render_athlete, render_overview
from .week import analyze_week, last_complete_week
from .whatsapp import WhatsAppClient

TZ = ZoneInfo("Asia/Jerusalem")
WINDOW = timedelta(hours=23, minutes=30)  # WhatsApp allows free text 24h after the coach's last message
ALERT_MAX_AGE = timedelta(days=3)  # do not alert on old workouts that arrive late
TEMPLATE_WEEKLY = "coach_weekly_summary"  # "הסיכום השבועי מוכן: {{1}}. השב/י כדי לקבל אותו."
TEMPLATE_ALERT = "coach_workout_alert"  # "⚡ אימון חריג: {{1}}. השב/י לפירוט."


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.data = json.loads(self.path.read_text(encoding="utf-8")) if self.path.exists() else {}
        self.data.setdefault("coaches", {})
        self.data.setdefault("checked", {})
        self.data.setdefault("sent_weeks", {})

    def coach(self, coach_id: str) -> dict:
        return self.data["coaches"].setdefault(coach_id, {"last_inbound": None, "pending": []})

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self.data, ensure_ascii=False, indent=1), encoding="utf-8")


def load_config(path: str | Path) -> dict:
    path = Path(path)
    cfg = json.loads(path.read_text(encoding="utf-8"))
    for c in cfg["coaches"]:
        for a in c["athletes"]:
            a["file"] = str((path.parent / a["file"]).resolve())
            if a.get("fit_dir"):
                a["fit_dir"] = str((path.parent / a["fit_dir"]).resolve())
    return cfg


def _load(entry: dict):
    athlete, acts, planned = load_athlete_file(entry["file"])
    if entry.get("fit_dir") and Path(entry["fit_dir"]).is_dir():
        from .io_fit import read_fit_folder

        known = {a.id for a in acts}
        acts += [a for a in read_fit_folder(entry["fit_dir"], athlete.timezone) if a.id not in known]
    return athlete, acts, planned


def _in_window(coach_state: dict, now: datetime) -> bool:
    last = coach_state.get("last_inbound")
    return bool(last) and now - datetime.fromisoformat(last) < WINDOW


def deliver(client: WhatsAppClient, coach: dict, cstate: dict, messages: list[str], template: tuple[str, list[str]], now):
    """Send now if the 24h window is open, otherwise send the template and keep the texts for the reply."""
    if not messages:
        return
    if _in_window(cstate, now):
        for m in messages:
            client.send_text(coach["whatsapp"], m)
    else:
        cstate["pending"].extend(messages)
        client.send_template(coach["whatsapp"], *template)


def dispatch(config: dict, store: Store, client: WhatsAppClient, now: datetime | None = None) -> None:
    now = now or datetime.now(TZ).replace(tzinfo=None)
    for coach in config["coaches"]:
        cstate = store.coach(coach["id"])
        alerts, summaries = [], []
        for entry in coach["athletes"]:
            athlete, acts, planned = _load(entry)

            # ---- alerts on new workouts ----------------------------------
            checked = store.data["checked"].get(athlete.id)
            if checked is None:  # first time we see this athlete: no alerts on the past
                store.data["checked"][athlete.id] = [a.id for a in acts]
            else:
                seen = set(checked)
                for a in sorted(acts, key=lambda a: a.start):
                    if a.id in seen:
                        continue
                    checked.append(a.id)
                    if now - a.start > ALERT_MAX_AGE:
                        continue
                    p = planned_for(a, planned)
                    found = check_workout(athlete, a, p, acts)
                    if found:
                        alerts.append((athlete, render_alert(athlete, a, found, p), found[0]["text"]))

            # ---- weekly summary ---------------------------------------------
            week_start, _ = last_complete_week(now.date(), athlete.profile.week_start)
            sent = store.data["sent_weeks"].setdefault(athlete.id, [])
            if week_start.isoformat() not in sent and now.hour >= coach.get("send_hour", 8):
                sent.append(week_start.isoformat())
                summaries.append(analyze_week(athlete, acts, week_start, planned))

        if alerts:
            first = alerts[0]
            more = f" (+{len(alerts) - 1} נוספות)" if len(alerts) > 1 else ""
            deliver(client, coach, cstate, [a[1] for a in alerts],
                    (TEMPLATE_ALERT, [f"{first[0].name}: {first[2]}{more}"]), now)
        if summaries:
            texts = ([render_overview(summaries)] if len(summaries) > 1 else []) + [render_athlete(s) for s in summaries]
            attention = sum(1 for s in summaries if any(f["level"] in ("alert", "warn") for f in s["flags"]))
            names = ", ".join(s["athlete"]["name"] for s in summaries)
            deliver(client, coach, cstate, texts,
                    (TEMPLATE_WEEKLY, [f"{names} ({attention} מתוך {len(summaries)} דורשים תשומת לב)"]), now)
    store.save()


HELP = (
    "אני הסוכן של המתאמנים שלך 🏃\n"
    "• *סיכום*: הסיכום של השבוע האחרון לכל המתאמנים\n"
    "• *סיכום* ושם: רק למתאמן אחד, למשל: סיכום דני\n"
    "• *שאלון*: השאלון למתאמן חדש\n"
    "התראות על אימונים חריגים ישלחו אליך אוטומטית, והסיכום השבועי בסוף כל שבוע של מתאמן."
)


def handle_inbound(config: dict, store: Store, client: WhatsAppClient, sender: str, text: str,
                   now: datetime | None = None) -> None:
    """A message from a coach: open the window, send what is waiting, answer simple commands."""
    now = now or datetime.now(TZ).replace(tzinfo=None)
    coach = next((c for c in config["coaches"] if c["whatsapp"] == sender), None)
    if coach is None:
        return  # not one of our coaches: ignore
    cstate = store.coach(coach["id"])
    cstate["last_inbound"] = now.isoformat()

    pending, cstate["pending"] = cstate["pending"], []
    for m in pending:
        client.send_text(sender, m)

    t = (text or "").strip()
    if t.startswith("סיכום"):
        name = t[len("סיכום"):].strip()
        summaries = []
        for entry in coach["athletes"]:
            athlete, acts, planned = _load(entry)
            if name and name not in athlete.name:
                continue
            week_start, _ = last_complete_week(now.date(), athlete.profile.week_start)
            summaries.append(analyze_week(athlete, acts, week_start, planned))
        if not summaries:
            client.send_text(sender, f"לא מצאתי מתאמן בשם \"{name}\"")
        for s in ([render_overview(summaries)] if len(summaries) > 1 else []) + [render_athlete(s) for s in summaries]:
            client.send_text(sender, s)
    elif t.startswith("שאלון"):
        client.send_text(sender, "*שאלון מתאמן חדש*\nאפשר לענות כאן בהודעה אחת לפי המספרים.\n\n" + render_questionnaire())
    elif not pending:
        client.send_text(sender, HELP)
    store.save()
