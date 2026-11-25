import json
import re
from datetime import date, datetime
from pathlib import Path

import openpyxl
import pytest

from coach_agent.dispatch import Store, handle_inbound, load_config
from coach_agent.io_json import load_athlete_file
from coach_agent.report import render_athlete, render_overview
from coach_agent.season import compare_week, import_plan, plan_from_dict, plan_to_dict, read_season_excel
from coach_agent.week import analyze_week
from coach_agent.whatsapp import WhatsAppClient, parse_webhook

ROOT = Path(__file__).resolve().parents[1]
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⭕♥]")

HEADER = [None, None, None, "שבוע", "נפח שבועי", "LSD", "טמפו ", "תחרות/טסט ", "תוצאה", "עליות",
          "ריצות מתגברות", "אינטרוולים נרחב", "פרטלק", "הערות"]
ROWS = [  # phase, week, dates (old year, ignored), volume, lsd, tempo, race, result, hills, prog, intervals, fartlek, notes
    ("בסיס 1", 1, "9.10-15.10", 37, 16, None, None, None, "6*250", None, None, "  (12דק) √", None),
    (None, 2, "16.10-22.10", 39, 17, None, None, None, "7*250", "  (13דק) √", None, None, None),
    (None, 3, "23.10-29.10", 41, 18, None, None, None, "8*250", None, None, "  (14דק) √", None),
    (None, 4, "30.10-5.11", 35, 15, None, 'טסט 5 ק"מ', None, "5*250", None, None, None, None),
    ("בנייה", 5, "6.11-12.11", "80-85", "27*", "18-19", "חצי מרתון, B", None, None, None, "5*2000", None, "טמפו קצב מטרה"),
]


def make_xlsx(path):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "תקופתית"
    ws.append([])
    ws.append(HEADER)
    for r in ROWS:
        ws.append([None, *r])
    ws.merge_cells("B3:B6")
    wb.create_sheet("ריק").append(HEADER)  # an empty template sheet must be skipped
    wb.save(path)
    return path


@pytest.fixture
def xlsx(tmp_path):
    return make_xlsx(tmp_path / "season.xlsx")


def test_reads_the_table(xlsx):
    plan = read_season_excel(xlsx, date(2026, 10, 4))
    assert [w.week for w in plan.weeks] == [1, 2, 3, 4, 5]
    w1, w5 = plan.weeks[0], plan.weeks[4]
    assert w1.start == date(2026, 10, 4) and plan.weeks[1].start == date(2026, 10, 11)
    assert w1.phase == "בסיס 1" and plan.weeks[3].phase == "בסיס 1" and w5.phase == "בנייה"
    assert w1.volume_km == (37, 37) and w5.volume_km == (80, 85) and w5.tempo_km == (18, 19)
    assert w5.lsd_km == 27 and w5.lsd_in_race
    assert w1.sessions() == ["עליות 6*250", "פארטלק 12 דק׳"]
    assert plan_from_dict(json.loads(json.dumps(plan_to_dict(plan)))).weeks == plan.weeks


def _athlete_file(tmp_path, **profile):
    p = tmp_path / "a.json"
    p.write_text(json.dumps({"athlete": {"id": "a", "name": "נועה בר", "profile": profile}, "activities": []},
                            ensure_ascii=False), encoding="utf-8")
    return p


def test_import_with_start_and_goal(tmp_path, xlsx):
    f = _athlete_file(tmp_path)
    plan, warnings = import_plan(f, xlsx, date(2026, 10, 4), date(2026, 11, 7))
    assert warnings == []
    a, _, _ = load_athlete_file(f)
    assert a.profile.season_start == date(2026, 10, 4) and len(a.season_plan.weeks) == 5
    _, warnings = import_plan(f, xlsx, date(2026, 10, 4), date(2026, 11, 20))
    assert "נופלת" in warnings[0]


def test_import_with_only_a_goal_counts_back(tmp_path, xlsx):
    f = _athlete_file(tmp_path, week_start="sunday",
                      goal_races=[{"name": "x", "date": "2026-11-07", "distance_km": 21.1}])
    plan, warnings = import_plan(f, xlsx)
    assert plan.weeks[0].start == date(2026, 10, 4) and "חושב" in warnings[0]


def test_week_compared_to_plan(tmp_path, xlsx):
    from coach_agent.models import Activity, Athlete, Lap, RaceResult

    plan = read_season_excel(xlsx, date(2026, 10, 4))

    def run(day, km, laps=None):
        laps = laps or [Lap(km * 330, km * 1000)]
        return Activity(str(day), datetime.combine(day, datetime.min.time()), "run",
                        sum(l.duration_s for l in laps), sum(l.distance_m for l in laps), laps=laps)

    acts = [run(date(2026, 10, 5), 10), run(date(2026, 10, 7), 12), run(date(2026, 10, 10), 21)]
    athlete = Athlete("a", "A", races=[RaceResult(date(2026, 9, 1), 10000, 45 * 60)], season_plan=plan)
    s = analyze_week(athlete, acts, date(2026, 10, 4))
    assert s["plan"]["week"] == 1 and s["plan"]["phase"] == "בסיס 1"
    texts = [f["text"] for f in s["flags"] if f["text"].startswith("מול התכנון")]
    assert any("ריצה ארוכה 21" in t and "בתכנון 16" in t for t in texts)
    assert any("עליות" in t for t in texts) and any("פארטלק" in t for t in texts)
    assert any("נפח 43 ק\"מ, בתכנון 37" in t for t in texts)
    text = render_athlete(s)
    assert "תכנון: בסיס 1, שבוע 1 מתוך 5" in text and "בתכנון: עליות 6*250, פארטלק 12 דק׳" in text


def test_reports_have_no_emoji():
    summaries = []
    for n in ("dani", "michal"):
        a, acts, planned = load_athlete_file(ROOT / "examples" / "athletes" / f"{n}.json")
        summaries.append(analyze_week(a, acts, date(2026, 11, 15), planned))
    for text in [render_overview(summaries)] + [render_athlete(s) for s in summaries]:
        assert not EMOJI.search(text), EMOJI.findall(text)


class FakeClient(WhatsAppClient):
    def __init__(self, file_bytes):
        super().__init__(token="", phone_number_id="")
        self.file_bytes = file_bytes

    def download_media(self, media_id):
        return self.file_bytes


def test_plan_sent_over_whatsapp(tmp_path, xlsx):
    f = _athlete_file(tmp_path)
    cfg_path = tmp_path / "coaches.json"
    cfg_path.write_text(json.dumps({"coaches": [{"id": "c", "name": "c", "whatsapp": "972500000000",
                                                 "athletes": [{"file": str(f)}]}]}), encoding="utf-8")
    body = {"entry": [{"changes": [{"value": {"messages": [{
        "from": "972500000000", "id": "m", "type": "document",
        "document": {"id": "media1", "filename": "season.xlsx", "caption": "תכנון נועה 4.10.2026 7.11.2026"}}]}}]}]}
    msg = parse_webhook(body)[0]
    client = FakeClient(Path(xlsx).read_bytes())
    handle_inbound(load_config(cfg_path), Store(tmp_path / "s.json"), client, msg["from"], msg["text"],
                   document=msg["document"])
    reply = client.sent[-1]["text"]["body"]
    assert "התכנון העונתי של נועה בר נטען: 5 שבועות" in reply
    assert load_athlete_file(f)[0].season_plan is not None

    client.sent.clear()
    handle_inbound(load_config(cfg_path), Store(tmp_path / "s.json"), client, msg["from"], "תכנון",
                   document=msg["document"])
    assert "כתבו בכיתוב" in client.sent[-1]["text"]["body"]
