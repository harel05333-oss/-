import hashlib
import hmac
import json
from datetime import date, datetime
from pathlib import Path

import pytest

from coach_agent.alerts import check_workout, planned_for
from coach_agent.dispatch import Store, dispatch, handle_inbound, load_config
from coach_agent.io_json import load_athlete_file
from coach_agent.questionnaire import BY_ID, answers_to_athlete, athlete_to_answers, parse_answer, run_interactive
from coach_agent.server import valid_signature
from coach_agent.week import last_complete_week, week_bounds
from coach_agent.whatsapp import WhatsAppClient, parse_webhook, split_text, template_param

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module", autouse=True)
def demo():
    import subprocess, sys
    subprocess.run([sys.executable, str(ROOT / "examples" / "make_demo.py")], check=True, capture_output=True)


# ---- week start per athlete ---------------------------------------------------

@pytest.mark.parametrize("start_day, expected", [
    ("sunday", date(2026, 11, 15)), ("monday", date(2026, 11, 16)), ("saturday", date(2026, 11, 14)),
    ("wednesday", date(2026, 11, 18)), ("thursday", date(2026, 11, 12)),
])
def test_week_can_start_on_any_day(start_day, expected):
    start, end = week_bounds(date(2026, 11, 18), start_day)  # a Wednesday
    assert start == expected and (end - start).days == 6


def test_last_complete_week():
    assert last_complete_week(date(2026, 11, 22), "sunday") == (date(2026, 11, 15), date(2026, 11, 21))
    assert last_complete_week(date(2026, 11, 22), "saturday") == (date(2026, 11, 14), date(2026, 11, 20))


# ---- questionnaire ------------------------------------------------------------

def test_answers_are_parsed_in_hebrew():
    assert parse_answer(BY_ID["week_start"], "שבת") == "saturday"
    assert parse_answer(BY_ID["week_start"], "1") == "sunday"
    assert parse_answer(BY_ID["goal_date"], "27.2.2027") == "2027-02-27"
    assert parse_answer(BY_ID["weekly_km"], "60-80") == [60.0, 80.0]
    assert parse_answer(BY_ID["injuries"], "אכילס, שוק") == ["אכילס", "שוק"]
    assert parse_answer(BY_ID["zone_source"], "דופק") == "hr"
    assert parse_answer(BY_ID["birth_year"], "") is None
    with pytest.raises(ValueError):
        parse_answer(BY_ID["name"], "")
    with pytest.raises(ValueError):
        parse_answer(BY_ID["race_time"], "מהר")


def test_interactive_questionnaire_builds_a_profile_and_edits_it(tmp_path):
    answers = iter({
        "name": "יוסי", "goal_date": "1.3.2027", "goal_distance": "42.2", "goal_time": "3:15:00",
        "race_distance": "10", "race_time": "44:00", "race_date": "1.11.2026", "race_kind": "1",
        "week_start": "שבת", "zone_source": "1", "weekly_km": "50-65", "max_quality": "2",
        "max_increase": "10", "injuries": "ברך",
    }.get(q.id, "") for q in __import__("coach_agent.questionnaire", fromlist=["QUESTIONS"]).QUESTIONS)
    athlete = run_interactive(None, ask=lambda _: next(answers), say=lambda *_: None)
    p = athlete["profile"]
    assert athlete["name"] == "יוסי" and p["week_start"] == "saturday"
    assert p["weekly_km_min"] == 50 and p["max_weekly_increase"] == pytest.approx(0.10)
    assert p["injuries"] == ["ברך"] and athlete["races"][0]["time"] == "44:00"
    # editing: Enter everywhere keeps every answer
    again = run_interactive(athlete, ask=lambda _: "", say=lambda *_: None)
    assert again == athlete


# ---- alerts on single workouts ------------------------------------------------

def _michal():
    return load_athlete_file(ROOT / "examples" / "athletes" / "michal.json")


def test_easy_run_in_z3_and_rpe_over_plan_are_flagged():
    athlete, acts, planned = _michal()
    by_day = {a.day: a for a in acts if a.is_run}
    sunday = by_day[date(2026, 11, 15)]
    alerts = check_workout(athlete, sunday, planned_for(sunday, planned), acts)
    assert any("תוכנן עד Z2" in a["text"] and "Z3" in a["text"] for a in alerts)

    monday = by_day[date(2026, 11, 16)]
    alerts = check_workout(athlete, monday, planned_for(monday, planned), acts)
    assert alerts[0]["level"] == "alert" and "אזור פציעה מוכר" in alerts[0]["text"]
    assert any("RPE 9, תוכנן 7" in a["text"] for a in alerts)


def test_a_normal_week_raises_no_alerts():
    athlete, acts, planned = load_athlete_file(ROOT / "examples" / "athletes" / "dani.json")
    week = [a for a in acts if a.day >= date(2026, 11, 15)]
    assert all(not check_workout(athlete, a, planned_for(a, planned), acts) for a in week)


# ---- WhatsApp ---------------------------------------------------------------

def test_long_text_is_split_on_lines_and_template_params_are_flat():
    text = "\n".join(f"שורה {i} " + "x" * 50 for i in range(200))
    parts = split_text(text, 1000)
    assert all(len(p) <= 1000 for p in parts) and "\n".join(parts) == text
    assert template_param("א\nב\tג     ד") == "א ב ג ד"


def test_dispatch_then_reply_opens_the_window(tmp_path):
    config = load_config(ROOT / "examples" / "coaches.json")
    store = Store(tmp_path / "state.json")
    # pretend we already knew every workout up to Wednesday 18.11
    for entry in config["coaches"][0]["athletes"]:
        athlete, acts, _ = load_athlete_file(entry["file"])
        store.data["checked"][athlete.id] = [a.id for a in acts if a.day <= date(2026, 11, 18)]
    client = WhatsAppClient(token="", phone_number_id="")

    dispatch(config, store, client, now=datetime(2026, 11, 22, 9, 0))
    templates = [m["template"]["name"] for m in client.sent]
    assert templates == ["coach_workout_alert", "coach_weekly_summary"]  # window closed: templates only
    pending = store.coach("demo-coach")["pending"]
    assert len(pending) == 1 + 3  # Michal's long-run alert, overview + 2 summaries

    # the same hour again sends nothing new
    client.sent.clear()
    dispatch(config, store, client, now=datetime(2026, 11, 22, 10, 0))
    assert client.sent == []

    # the coach answers: everything waiting arrives as text
    handle_inbound(config, store, client, "972500000000", "הצג", now=datetime(2026, 11, 22, 10, 5))
    texts = [m["text"]["body"] for m in client.sent]
    assert len(texts) == 4 and "מיכל לוי" in texts[0]
    assert store.coach("demo-coach")["pending"] == []

    # inside the window, a new alert goes straight as text
    client.sent.clear()
    handle_inbound(config, store, client, "972500000000", "סיכום דני", now=datetime(2026, 11, 22, 10, 6))
    assert len(client.sent) == 1 and "דני כהן" in client.sent[0]["text"]["body"]


def test_unknown_numbers_are_ignored(tmp_path):
    config = load_config(ROOT / "examples" / "coaches.json")
    client = WhatsAppClient(token="", phone_number_id="")
    handle_inbound(config, Store(tmp_path / "s.json"), client, "972599999999", "סיכום")
    assert client.sent == []


def test_webhook_parsing_and_signature():
    body = {"entry": [{"changes": [{"value": {"messages": [
        {"from": "972500000000", "id": "m1", "type": "text", "text": {"body": "סיכום"}},
        {"from": "972500000000", "id": "m2", "type": "button", "button": {"text": "הצג"}},
    ]}}]}]}
    assert [m["text"] for m in parse_webhook(body)] == ["סיכום", "הצג"]
    raw = json.dumps(body).encode()
    sig = "sha256=" + hmac.new(b"secret", raw, hashlib.sha256).hexdigest()
    assert valid_signature("secret", raw, sig)
    assert not valid_signature("secret", raw + b" ", sig)
    assert not valid_signature("secret", raw, None)
