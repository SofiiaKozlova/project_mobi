"""
emailer.py — send email through SendGrid's v3 Web API
─────────────────────────────────────────────────────
We call the REST endpoint directly with `requests`, so there's no extra
SDK to install. (If you'd rather use SendGrid's official package, run
`pip install sendgrid` and swap send_email() for their helper — the env
vars below stay the same.)

Required environment variables (put them in .env):
    SENDGRID_API_KEY      — the API key from SendGrid → Settings → API Keys
    SENDGRID_FROM_EMAIL   — a *verified* sender address (Single Sender or domain)
    SENDGRID_FROM_NAME    — optional display name (defaults to "CoolPark Bamberg")
"""

import os
import requests

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"


def is_configured():
    return bool(os.environ.get("SENDGRID_API_KEY") and os.environ.get("SENDGRID_FROM_EMAIL"))


def send_email(to_email, subject, html, text=None):
    """
    Send one email. Returns (ok: bool, info: str).
    Never raises — callers can log the info string.
    """
    api_key = os.environ.get("SENDGRID_API_KEY")
    from_email = os.environ.get("SENDGRID_FROM_EMAIL")
    from_name = os.environ.get("SENDGRID_FROM_NAME", "CoolPark Bamberg")

    if not api_key or not from_email:
        return False, "SendGrid not configured (set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL)."

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": from_email, "name": from_name},
        "subject": subject,
        "content": [],
    }
    if text:
        payload["content"].append({"type": "text/plain", "value": text})
    payload["content"].append({"type": "text/html", "value": html})

    try:
        resp = requests.post(
            SENDGRID_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=20,
        )
        if resp.status_code in (200, 201, 202):
            return True, "sent"
        return False, f"SendGrid returned {resp.status_code}: {resp.text[:300]}"
    except requests.RequestException as e:
        return False, f"Request failed: {e}"
