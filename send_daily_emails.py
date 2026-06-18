#!/usr/bin/env python3
"""
send_daily_emails.py — run the daily park reminders once, then exit.

Schedule this with cron (Linux/Mac) or Task Scheduler (Windows), e.g. cron:
    0 8 * * *  cd /path/to/project_mobi && /path/to/.venv/bin/python send_daily_emails.py

Usage:
    python send_daily_emails.py            # send to all opted-in users
    python send_daily_emails.py --test you@example.com   # send yourself one test email
"""
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from notifications import send_daily_reminders, load_parks, get_park_temps, build_user_email
from emailer import send_email, is_configured


def main():
    if not is_configured():
        print("SendGrid is not configured. Set SENDGRID_API_KEY and SENDGRID_FROM_EMAIL in .env.")
        sys.exit(1)

    if len(sys.argv) >= 3 and sys.argv[1] == "--test":
        to = sys.argv[2]
        parks = load_parks()
        temps, avg = get_park_temps(parks)
        fake_user = {
            "email": to, "notify_comfortable": 1, "ideal_temp": 25,
            "notify_recommendation": 1, "cooler_threshold": 0,
        }
        built = build_user_email(fake_user, parks, temps, avg)
        if built is None:
            print("No parks matched — sending a plain confirmation instead.")
            ok, info = send_email(to, "CoolPark test email", "<p>SendGrid is working ✅</p>")
        else:
            ok, info = send_email(to, built[0], built[1])
        print("OK" if ok else f"FAILED: {info}")
        sys.exit(0 if ok else 1)

    send_daily_reminders()


if __name__ == "__main__":
    main()
