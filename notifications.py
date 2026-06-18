"""
notifications.py — build and send the daily park-reminder emails
─────────────────────────────────────────────────────────────────
Two ways to run it:

1. In-app scheduler (APScheduler): set ENABLE_SCHEDULER=1 in your .env and
   the app sends reminders once a day at SEND_HOUR (default 08:00 Berlin time).

2. Cron / Task Scheduler (recommended for production): run
       python send_daily_emails.py
   once a day. This avoids tying the job to the Flask dev server.
"""

import os
import json
import sqlite3
from datetime import datetime, date

import requests

from emailer import send_email

PARKS_FILE = os.path.join("data", "parks.json")
DB_PATH = os.path.join("data", "users.db")


# ──────────────────────────────────────────────
#  Server-side park temperatures (Open-Meteo, no key)
# ──────────────────────────────────────────────
def load_parks():
    with open(PARKS_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def get_park_temps(parks):
    """Return {park_id: temp_celsius} and the city average."""
    lats = ",".join(str(p["lat"]) for p in parks)
    lons = ",".join(str(p["lon"]) for p in parks)
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={lats}&longitude={lons}&current_weather=true&timezone=Europe/Berlin"
    )
    temps = {}
    try:
        data = requests.get(url, timeout=30).json()
        results = data if isinstance(data, list) else [data]
        for i, d in enumerate(results):
            if i < len(parks):
                temps[parks[i]["id"]] = d.get("current_weather", {}).get("temperature")
    except requests.RequestException as e:
        print(f"[notifications] temp fetch failed: {e}")

    valid = [t for t in temps.values() if t is not None]
    avg = sum(valid) / len(valid) if valid else None
    return temps, avg


# ──────────────────────────────────────────────
#  Build one user's email
# ──────────────────────────────────────────────
def build_user_email(user, parks, temps, avg):
    """Return (subject, html) or None if the user has no matching parks."""
    by_id = {p["id"]: p for p in parks}
    sections = []

    # Comfortable reminder — parks at/below the user's ideal temperature
    if user["notify_comfortable"] and user["ideal_temp"] is not None:
        ideal = user["ideal_temp"]
        matches = sorted(
            [(pid, t) for pid, t in temps.items() if t is not None and t <= ideal],
            key=lambda x: x[1],
        )
        if matches:
            rows = "".join(
                f"<li><strong>{by_id[pid]['name']}</strong> — {t:.1f}°C</li>"
                for pid, t in matches
            )
            sections.append(
                f"<h3>Parks at or below {ideal:.0f}°C right now</h3><ul>{rows}</ul>"
            )

    # Recommendation reminder — parks cooler than the city average
    if user["notify_recommendation"] and avg is not None:
        threshold = user["cooler_threshold"]
        cooler = sorted(
            [(pid, t, avg - t) for pid, t in temps.items() if t is not None and (avg - t) >= threshold],
            key=lambda x: x[2], reverse=True,
        )
        if cooler:
            rows = "".join(
                f"<li><strong>{by_id[pid]['name']}</strong> is {diff:.1f}° cooler "
                f"({t:.1f}°C vs {avg:.1f}°C city average)</li>"
                for pid, t, diff in cooler
            )
            sections.append(
                f"<h3>Parks at least {threshold:.0f}° cooler than Bamberg</h3><ul>{rows}</ul>"
            )

    if not sections:
        return None

    base = os.environ.get("APP_BASE_URL", "http://127.0.0.1:5000")
    html = f"""
    <div style="font-family:Arial,sans-serif;color:#1e2d1a;max-width:560px">
      <h2 style="color:#2d4a1e">🌿 Your CoolPark Bamberg reminder</h2>
      <p>Here are the parks matching your preferences today
         ({date.today().strftime('%d %b %Y')}):</p>
      {''.join(sections)}
      <p style="margin-top:24px">
        <a href="{base}/" style="color:#4a7c2f">Open CoolPark Bamberg →</a><br>
        <span style="font-size:12px;color:#888">
          Manage or turn off these emails in your <a href="{base}/profile">profile</a>.
        </span>
      </p>
    </div>"""
    subject = "Your cool parks in Bamberg today 🌳"
    return subject, html


# ──────────────────────────────────────────────
#  Send to everyone who opted in
# ──────────────────────────────────────────────
def send_daily_reminders():
    parks = load_parks()
    temps, avg = get_park_temps(parks)

    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    users = con.execute("SELECT * FROM users WHERE notify_enabled = 1").fetchall()

    sent, skipped = 0, 0
    today = date.today().isoformat()
    for user in users:
        built = build_user_email(user, parks, temps, avg)
        if built is None:
            skipped += 1
            continue
        subject, html = built
        ok, info = send_email(user["email"], subject, html)
        if ok:
            con.execute("UPDATE users SET last_sent = ? WHERE id = ?", (today, user["id"]))
            con.commit()
            sent += 1
        else:
            print(f"[notifications] {user['email']}: {info}")
    con.close()

    print(f"[notifications] {datetime.now().isoformat(timespec='seconds')} — sent {sent}, skipped {skipped} (no matches).")
    return sent, skipped


# ──────────────────────────────────────────────
#  Optional in-app scheduler
# ──────────────────────────────────────────────
def init_scheduler(app):
    """Start a daily job if ENABLE_SCHEDULER=1. Safe under the Flask reloader."""
    if os.environ.get("ENABLE_SCHEDULER") != "1":
        return
    # Avoid double-start under the dev reloader's parent process
    if app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true":
        return
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
    except ImportError:
        print("[notifications] APScheduler not installed — run `pip install APScheduler` or use cron.")
        return

    hour = int(os.environ.get("SEND_HOUR", "8"))
    scheduler = BackgroundScheduler(timezone="Europe/Berlin")
    scheduler.add_job(send_daily_reminders, "cron", hour=hour, minute=0, id="daily_reminders")
    scheduler.start()
    print(f"[notifications] scheduler started — daily at {hour:02d}:00 Europe/Berlin")
