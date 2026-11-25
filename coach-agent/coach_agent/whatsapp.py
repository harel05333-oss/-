"""Sending WhatsApp messages through Meta's WhatsApp Business Cloud API.

Two rules of WhatsApp shape this module:
1. A business may send free text only within 24 hours of the coach's last
   message. Outside that window it must send a pre-approved *template*.
   So the agent sends a short template ("3 summaries are ready, reply to see
   them"); when the coach replies, the window opens and the full texts follow.
2. A text message is at most 4096 characters, so long texts are split.

Environment:
  WHATSAPP_TOKEN            access token of the WhatsApp Business app
  WHATSAPP_PHONE_NUMBER_ID  the id of the agent's phone number
  WHATSAPP_TEMPLATE_LANG    template language code (default "he")
Without a token the client runs dry: it prints and keeps the messages in `sent`.
"""
from __future__ import annotations

import json
import os
import urllib.request

API = "https://graph.facebook.com/v21.0"
MAX_TEXT = 4096


def split_text(text: str, limit: int = MAX_TEXT) -> list[str]:
    """Split on blank lines, then lines, so a message never breaks mid-line."""
    if len(text) <= limit:
        return [text]
    parts, cur = [], ""
    for block in text.split("\n"):
        add = block if not cur else "\n" + block
        if len(cur) + len(add) > limit:
            if cur:
                parts.append(cur)
            cur = block[:limit]
        else:
            cur += add
    if cur:
        parts.append(cur)
    return parts


def template_param(text: str, limit: int = 900) -> str:
    """Template parameters may not contain new lines, tabs or 4+ spaces in a row."""
    flat = " ".join(text.replace("\t", " ").split())
    return flat if len(flat) <= limit else flat[: limit - 1] + "…"


class WhatsAppClient:
    def __init__(self, token: str | None = None, phone_number_id: str | None = None, lang: str | None = None):
        self.token = token if token is not None else os.environ.get("WHATSAPP_TOKEN")
        self.phone_number_id = phone_number_id or os.environ.get("WHATSAPP_PHONE_NUMBER_ID")
        self.lang = lang or os.environ.get("WHATSAPP_TEMPLATE_LANG", "he")
        self.sent: list[dict] = []  # everything sent (also in dry run), handy for tests and logs

    @property
    def dry_run(self) -> bool:
        return not (self.token and self.phone_number_id)

    def _post(self, payload: dict) -> dict:
        self.sent.append(payload)
        if self.dry_run:
            body = payload.get("text", {}).get("body") or json.dumps(payload.get("template"), ensure_ascii=False)
            print(f"[WhatsApp dry run → {payload['to']}]\n{body}\n")
            return {"dry_run": True}
        req = urllib.request.Request(
            f"{API}/{self.phone_number_id}/messages",
            data=json.dumps(payload).encode(),
            headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())

    def send_text(self, to: str, text: str) -> None:
        for part in split_text(text):
            self._post({
                "messaging_product": "whatsapp", "to": to, "type": "text",
                "text": {"body": part, "preview_url": False},
            })

    def send_template(self, to: str, name: str, params: list[str]) -> None:
        self._post({
            "messaging_product": "whatsapp", "to": to, "type": "template",
            "template": {
                "name": name,
                "language": {"code": self.lang},
                "components": [{
                    "type": "body",
                    "parameters": [{"type": "text", "text": template_param(p)} for p in params],
                }],
            },
        })


def parse_webhook(body: dict) -> list[dict]:
    """Incoming messages from a webhook call: [{"from": "9725...", "text": "..."}]."""
    out = []
    for entry in body.get("entry", []):
        for change in entry.get("changes", []):
            for m in change.get("value", {}).get("messages", []):
                if m.get("type") == "text":
                    text = m["text"].get("body", "")
                elif m.get("type") == "button":
                    text = m["button"].get("text", "")
                elif m.get("type") == "interactive":
                    i = m["interactive"]
                    text = (i.get("button_reply") or i.get("list_reply") or {}).get("title", "")
                else:
                    text = ""
                out.append({"from": m.get("from"), "text": text, "id": m.get("id")})
    return out
