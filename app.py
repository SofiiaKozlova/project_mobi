from flask import Flask, render_template, request, redirect, url_for, flash
import os
import json
from datetime import datetime

# Load .env file (for Netatmo/Copernicus keys)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed — keys must be in environment

app = Flask(__name__)
app.secret_key = "coolpark_feedback_secret"

# Register API routes for Netatmo/Copernicus (optional — works without keys too)
try:
    from api_routes import api_bp
    app.register_blueprint(api_bp)
except Exception as e:
    print(f"Note: API routes not loaded ({e}). Netatmo/Copernicus endpoints won't work.")


FEEDBACK_DIR = os.path.join("data", "feedback")
os.makedirs(FEEDBACK_DIR, exist_ok=True)

# ── Static park metadata (single source of truth shared with the front-end) ──
# Loaded so server-rendered pages (e.g. /park/<id>) know park names/ids.
PARKS_FILE = os.path.join("data", "parks.json")


def load_parks():
    try:
        with open(PARKS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


# ─────────────────────────────────────────────
#  PAGES  (the old single page is now split up)
# ─────────────────────────────────────────────

@app.route("/")
def home():
    return render_template("explore.html", active="explore")

@app.route("/compare")
def compare():
    return render_template("compare.html", active="compare")


@app.route("/planner")
def planner():
    return render_template("planner.html", active="planner")


@app.route("/reminders")
def reminders():
    return render_template("reminders.html", active="reminders")


@app.route("/park/<park_id>")
def park_detail(park_id):
    parks = load_parks()
    park = next((p for p in parks if p["id"] == park_id), None)
    if not park:
        return render_template("park_not_found.html", park_id=park_id), 404
    return render_template("park_detail.html", park=park, active="explore")


# ── Profile / auth (UI scaffold — login + email storage is the next round) ──
@app.route("/profile")
def profile():
    return render_template("profile.html", active="profile")


@app.route("/login")
def login():
    return render_template("login.html", active="profile")


@app.route("/register")
def register():
    return render_template("register.html", active="profile")


# ─────────────────────────────────────────────
#  FEEDBACK  (unchanged behaviour)
# ─────────────────────────────────────────────

@app.route("/feedback")
def feedback():
    park = request.args.get("park", "")
    return render_template("feedback.html", park=park)


@app.route("/submit-feedback", methods=["POST"])
def submit_feedback():
    name = request.form.get("name", "").strip()
    park = request.form.get("park", "").strip()
    rating = request.form.get("rating", "").strip()
    feedback_text = request.form.get("feedback", "").strip()

    if not park:
        park = "general"

    file_path = os.path.join(FEEDBACK_DIR, f"{park}.json")

    new_entry = {
        "name": name,
        "rating": rating,
        "feedback": feedback_text,
        "timestamp": datetime.now().isoformat(timespec="seconds")
    }

    if os.path.exists(file_path):
        with open(file_path, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
            except json.JSONDecodeError:
                data = []
    else:
        data = []

    data.append(new_entry)

    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    flash(
    "Thank you! Your feedback has been submitted successfully.",
    "success"
    )

    return redirect(url_for("feedback", park=park))


if __name__ == "__main__":
    app.run(debug=True)