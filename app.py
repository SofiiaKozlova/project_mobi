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


@app.route("/")
def home():
    return render_template("index.html")


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