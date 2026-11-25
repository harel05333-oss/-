"""First start on a server: create the data folder from environment variables.

  DATA_DIR        where coaches.json, state.json and the athletes' files live (a persistent disk)
  COACH_WHATSAPP  the coach's WhatsApp number, e.g. 972501234567 (or 050-123-4567)
  COACH_NAME      the coach's name
  DEMO_ATHLETES   "1" (default) copies the two demo athletes, so the bot has something to show

Nothing is overwritten once the folder exists: the coach's real data stays.
"""
from __future__ import annotations

import json
import os
import re
import shutil
from pathlib import Path

EXAMPLES = Path(__file__).resolve().parents[1] / "examples" / "athletes"


def normalize_phone(raw: str) -> str:
    """'+972 50-123-4567' / '050-1234567' -> '972501234567' (what WhatsApp sends as 'from')."""
    digits = re.sub(r"\D", "", raw or "")
    if digits.startswith("0"):
        digits = "972" + digits[1:]
    return digits


def ensure_data_dir(data_dir: str | Path) -> tuple[Path, Path]:
    data = Path(data_dir)
    config, state = data / "coaches.json", data / "state.json"
    if config.exists():
        return config, state
    phone = normalize_phone(os.environ.get("COACH_WHATSAPP", ""))
    if not phone:
        raise SystemExit("COACH_WHATSAPP is not set: the coach's WhatsApp number is needed on first start")
    (data / "athletes").mkdir(parents=True, exist_ok=True)
    athletes = []
    if os.environ.get("DEMO_ATHLETES", "1") == "1":
        for f in sorted(EXAMPLES.glob("*.json")):
            shutil.copy(f, data / "athletes" / f.name)
            athletes.append({"file": f"athletes/{f.name}"})
    config.write_text(json.dumps({"coaches": [{
        "id": "coach-1",
        "name": os.environ.get("COACH_NAME", "מאמן"),
        "whatsapp": phone,
        "send_hour": int(os.environ.get("SEND_HOUR", "8")),
        "athletes": athletes,
    }]}, ensure_ascii=False, indent=1), encoding="utf-8")
    return config, state
