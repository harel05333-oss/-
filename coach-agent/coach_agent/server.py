"""The always-on part: WhatsApp webhook + hourly dispatch.

  python -m coach_agent serve --config coaches.json --state state.json --port 8080

Meta calls  GET /webhook  once to verify (WHATSAPP_VERIFY_TOKEN) and then
POST /webhook  for every message a coach sends. Every POST is checked against
WHATSAPP_APP_SECRET (X-Hub-Signature-256) so nobody else can pretend to be Meta.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

from .dispatch import Store, dispatch, handle_inbound, load_config
from .whatsapp import WhatsAppClient, parse_webhook

LOCK = threading.Lock()  # dispatch and webhook share the state file


def valid_signature(secret: str, body: bytes, header: str | None) -> bool:
    if not header or not header.startswith("sha256="):
        return False
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, header[len("sha256="):])


def make_handler(config_path: str, state_path: str, client: WhatsAppClient):
    verify_token = os.environ.get("WHATSAPP_VERIFY_TOKEN", "")
    app_secret = os.environ.get("WHATSAPP_APP_SECRET", "")

    class Handler(BaseHTTPRequestHandler):
        def _reply(self, code: int, body: str = "") -> None:
            self.send_response(code)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(body.encode())

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/health":
                return self._reply(200, "ok")
            q = {k: v[0] for k, v in parse_qs(u.query).items()}
            if u.path == "/webhook" and verify_token and q.get("hub.mode") == "subscribe" \
                    and hmac.compare_digest(q.get("hub.verify_token", ""), verify_token):
                return self._reply(200, q.get("hub.challenge", ""))
            self._reply(403)

        def do_POST(self):
            if urlparse(self.path).path != "/webhook":
                return self._reply(404)
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if not app_secret or not valid_signature(app_secret, body, self.headers.get("X-Hub-Signature-256")):
                return self._reply(403)
            self._reply(200)  # answer Meta fast, then work
            try:
                messages = parse_webhook(json.loads(body))
            except ValueError:
                return
            with LOCK:
                config, store = load_config(config_path), Store(state_path)
                for m in messages:
                    handle_inbound(config, store, client, m["from"], m["text"])

        def log_message(self, fmt, *args):  # keep phone numbers out of the logs
            pass

    return Handler


def serve(config_path: str, state_path: str, port: int = 8080, every_s: int = 3600) -> None:
    client = WhatsAppClient()

    def loop():
        while True:
            try:
                with LOCK:
                    dispatch(load_config(config_path), Store(state_path), client)
            except Exception as e:  # keep the loop alive; the next hour tries again
                print(f"dispatch failed: {e!r}")
            time.sleep(every_s)

    threading.Thread(target=loop, daemon=True).start()
    print(f"listening on :{port} ({'dry run' if client.dry_run else 'live'})")
    ThreadingHTTPServer(("", port), make_handler(config_path, state_path, client)).serve_forever()
