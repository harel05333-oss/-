"""Optional: ask Claude to turn the computed numbers into short coaching notes in Hebrew.

Needs `pip install anthropic` and an Anthropic credential (ANTHROPIC_API_KEY or `ant auth login`).
All numbers come from analysis.py; the model only interprets them.
"""
from __future__ import annotations

import json

from .analysis import WeekReport
from .models import WEEKDAY_HE, Athlete

MODEL = "claude-opus-5-5"

SYSTEM = (
    "אתה עוזר למאמן ריצה. מקבלים נתוני אימון שבועיים של מתאמן אחד, כבר מחושבים לפי השבוע "
    "האישי שלו (נפח, חלוקה בין ריצה קלה לעצימה לפי אזורי דופק, ועמידה בתוכנית). "
    "כתוב למאמן בעברית, קצר ומעשי: (1) מה עבד טוב, (2) מה לשפר, (3) המלצה אחת או שתיים לשבוע הבא. "
    "הסתמך רק על המספרים שקיבלת, ואל תמציא נתונים. אל תיתן אבחנות רפואיות."
)


def coach_notes(a: Athlete, weeks: list[WeekReport], last_n: int = 4) -> str | None:
    try:
        import anthropic
    except ImportError:
        raise RuntimeError("--ai requires the anthropic package: pip install anthropic")

    payload = {
        "athlete": a.name,
        "week_starts_on": WEEKDAY_HE[a.week_start],
        "target_easy_pct": a.target_easy_pct,
        "weekly_km_target": a.weekly_km_target,
        "weeks": [wk.to_dict() for wk in weeks[-last_n:]],
    }
    client = anthropic.Anthropic()
    response = client.beta.messages.create(
        model=MODEL,
        max_tokens=4000,
        system=SYSTEM,
        thinking={"type": "adaptive"},
        output_config={"effort": "medium"},
        betas=["server-side-fallback-2026-07-01"],
        fallbacks="default",
        messages=[{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
    )
    if response.stop_reason == "refusal":
        return None
    text = "".join(b.text for b in response.content if b.type == "text").strip()
    return text or None
