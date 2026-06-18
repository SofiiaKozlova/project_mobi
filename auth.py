"""
auth.py — accounts + notification preferences for CoolPark Bamberg
──────────────────────────────────────────────────────────────────
- Users are stored in a small SQLite database (data/users.db).
- Passwords are hashed with werkzeug (never stored in plain text).
- Login state is kept in the Flask session.
- Each user can opt in to a daily email reminder and choose:
    • Comfortable reminder  — parks at/below an ideal temperature
    • Recommendation reminder — parks at least N° cooler than the city average
"""

import os
import sqlite3
from datetime import datetime
from functools import wraps

from flask import (
    Blueprint, render_template, request, redirect, url_for,
    session, flash, g, current_app
)
from werkzeug.security import generate_password_hash, check_password_hash

auth_bp = Blueprint("auth", __name__)

DB_PATH = os.path.join("data", "users.db")


# ──────────────────────────────────────────────
#  Database helpers
# ──────────────────────────────────────────────
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


def close_db(exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """Create the users table if it doesn't exist yet."""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    con = sqlite3.connect(DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id                    INTEGER PRIMARY KEY AUTOINCREMENT,
            email                 TEXT UNIQUE NOT NULL,
            password_hash         TEXT NOT NULL,
            created_at            TEXT NOT NULL,
            notify_enabled        INTEGER NOT NULL DEFAULT 0,
            notify_comfortable    INTEGER NOT NULL DEFAULT 0,
            ideal_temp            REAL,
            notify_recommendation INTEGER NOT NULL DEFAULT 1,
            cooler_threshold      REAL NOT NULL DEFAULT 2,
            last_sent             TEXT
        )
    """)
    con.commit()
    con.close()


# ──────────────────────────────────────────────
#  Current user / login-required
# ──────────────────────────────────────────────
def current_user():
    uid = session.get("user_id")
    if uid is None:
        return None
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return row


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if session.get("user_id") is None:
            flash("Please log in to view that page.", "error")
            return redirect(url_for("auth.login"))
        return view(*args, **kwargs)
    return wrapped


# ──────────────────────────────────────────────
#  Routes
# ──────────────────────────────────────────────
@auth_bp.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        notify = request.form.get("notify_enabled") == "on"

        error = None
        if "@" not in email or "." not in email:
            error = "Please enter a valid email address."
        elif len(password) < 6:
            error = "Password must be at least 6 characters."

        if error is None:
            db = get_db()
            try:
                db.execute(
                    "INSERT INTO users (email, password_hash, created_at, notify_enabled) VALUES (?, ?, ?, ?)",
                    (email, generate_password_hash(password), datetime.now().isoformat(timespec="seconds"), int(notify)),
                )
                db.commit()
            except sqlite3.IntegrityError:
                error = "That email is already registered."
            else:
                row = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
                session.clear()
                session["user_id"] = row["id"]
                flash("Account created. Set your reminder preferences below.", "success")
                return redirect(url_for("auth.profile"))

        flash(error, "error")

    return render_template("register.html", active="profile")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        row = get_db().execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()

        if row is None or not check_password_hash(row["password_hash"], password):
            flash("Wrong email or password.", "error")
        else:
            session.clear()
            session["user_id"] = row["id"]
            return redirect(url_for("auth.profile"))

    return render_template("login.html", active="profile")


@auth_bp.route("/logout")
def logout():
    session.clear()
    flash("You've been logged out.", "success")
    return redirect(url_for("explore"))


@auth_bp.route("/profile", methods=["GET", "POST"])
@login_required
def profile():
    user = current_user()

    if request.method == "POST":
        notify_enabled = request.form.get("notify_enabled") == "on"
        notify_comfortable = request.form.get("notify_comfortable") == "on"
        notify_recommendation = request.form.get("notify_recommendation") == "on"

        def num(name, fallback):
            try:
                return float(request.form.get(name, ""))
            except (TypeError, ValueError):
                return fallback

        ideal_temp = num("ideal_temp", user["ideal_temp"])
        cooler_threshold = num("cooler_threshold", user["cooler_threshold"]) or 2

        db = get_db()
        db.execute(
            """UPDATE users SET notify_enabled=?, notify_comfortable=?, ideal_temp=?,
                   notify_recommendation=?, cooler_threshold=? WHERE id=?""",
            (int(notify_enabled), int(notify_comfortable), ideal_temp,
             int(notify_recommendation), cooler_threshold, user["id"]),
        )
        db.commit()
        flash("Preferences saved.", "success")
        return redirect(url_for("auth.profile"))

    return render_template("profile.html", active="profile", user=user)
