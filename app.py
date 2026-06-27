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

# ── Accounts + email reminders ──
from auth import auth_bp, init_db, close_db, current_user

app.register_blueprint(auth_bp)
app.teardown_appcontext(close_db)

with app.app_context():
    init_db()

# Make the logged-in user available to every template (for the nav bar)
@app.context_processor
def inject_user():
    return {"current_user": current_user()}

# Optional in-app daily scheduler (set ENABLE_SCHEDULER=1 to use it)
try:
    from notifications import init_scheduler
    init_scheduler(app)
except Exception as e:
    print(f"Note: scheduler not started ({e}).")

FEEDBACK_DIR = os.path.join("data", "feedback")
os.makedirs(FEEDBACK_DIR, exist_ok=True)

# ── Park metadata, merged with the OSM cache (see park_data.py) ──
# Used by server-rendered pages (e.g. /park/<id>) so coordinates match /api/parks.
def load_parks():
    try:
        from park_data import load_parks as _load
        return _load(merged=True)
    except Exception:
        return []

# ─────────────────────────────────────────────
#  PAGES  (the old single page is now split up)
# ─────────────────────────────────────────────

@app.route("/")
def explore():
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

    feedback_file = os.path.join(FEEDBACK_DIR, f"{park_id}.json")

    if os.path.exists(feedback_file):
        with open(feedback_file, "r", encoding="utf-8") as f:
            try:
                feedbacks = json.load(f)
            except json.JSONDecodeError:
                feedbacks = []
    else:
        feedbacks = []

    return render_template(
        "park_detail.html",
        park=park,
        feedbacks=feedbacks,
        active="explore"
    )

# ── Profile / auth (/register, /login, /logout, /profile) live in auth.py ──

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