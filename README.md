# Setting Up a Flask Project in Visual Studio Code

If you're working on a Flask project in Visual Studio Code, `pip install -r requirements.txt` should be run in a **terminal**, not inside a Python file.

## 1. Open the Project Folder in VS Code

Make sure the folder containing your Flask project is open.

You should see files such as:

```text
project/
├── app.py
├── requirements.txt
├── static/
├── templates/
```

## 2. Open a Terminal in VS Code

In VS Code:

- Click **Terminal → New Terminal**
- Or press:
  - **Ctrl + `** (Windows/Linux)
  - **Cmd + `** (Mac)

A terminal should appear at the bottom.

## 3. Check You're in the Correct Folder

In the terminal, run:

### Mac/Linux

```bash
ls
```

### Windows

```cmd
dir
```

You should see `requirements.txt` listed.

If not, navigate to the project folder:

```bash
cd path/to/your/project
```

## 4. (Recommended) Create a Virtual Environment

Before installing dependencies:

### Windows

```cmd
python -m venv venv
venv\Scripts\activate
```

### Mac/Linux

```bash
python3 -m venv venv
source venv/bin/activate
```

After activation, you'll usually see `(venv)` at the start of the terminal prompt.

## 5. Install the Requirements

Run:

```bash
pip install -r requirements.txt
```

This reads the `requirements.txt` file and installs all required Python packages.

## 6. Run the Flask Application

After installation succeeds, look for one of these files:

- `app.py`
- `main.py`
- `run.py`

Common commands are:

```bash
python app.py
```

or

```bash
flask run
```

If using `flask run`, you may need:

### Windows (Command Prompt)

```cmd
set FLASK_APP=app.py
flask run
```

### Mac/Linux

```bash
export FLASK_APP=app.py
flask run
```

## 7. Open the Website

Flask will usually display something like:

```text
Running on http://127.0.0.1:5000
```

Open that address in your browser.

---

## Accounts + daily email reminders (SendGrid)

**New files:** `auth.py` (accounts), `emailer.py` (SendGrid), `notifications.py`
(daily reminder logic + optional scheduler), `send_daily_emails.py` (cron runner).

Users register at `/register`, set preferences at `/profile`, and can receive a
daily email listing parks that match their ideal temperature and/or that are
cooler than the city average. Accounts live in `data/users.db` (SQLite, gitignored).

### Set up SendGrid (Python)
1. In SendGrid, verify a sender (Settings → Sender Authentication → Single Sender),
   and create an API key (Settings → API Keys → Full Access or "Mail Send").
2. Copy `.env.example` to `.env` and fill in:
   ```
   SENDGRID_API_KEY=SG.xxxxx
   SENDGRID_FROM_EMAIL=your_verified_sender@domain.com
   APP_BASE_URL=https://your-deployed-url
   ```
3. Send yourself a test email:
   ```
   python send_daily_emails.py --test you@example.com
   ```

### Send the daily reminders
- **Production (recommended):** schedule the standalone runner once a day, e.g. cron:
  ```
  0 8 * * *  cd /path/to/project_mobi && /path/to/.venv/bin/python send_daily_emails.py
  ```
  On Windows use Task Scheduler to run the same command.
- **Or in-app scheduler:** set `ENABLE_SCHEDULER=1` and `SEND_HOUR=8` in `.env`
  and the running app sends daily at that hour (Europe/Berlin). Needs `APScheduler`
  (already in requirements.txt).

We call SendGrid's v3 Web API directly with `requests`, so no SDK is required.
To use SendGrid's official package instead, `pip install sendgrid` and swap the
body of `send_email()` in `emailer.py`.

---

## OSM data round — real coordinates, benches, park size (cached)

**New files:** `fetch_osm_data.py` (the fetcher), `park_data.py` (loads parks +
overlays the cache), `park_scoring.py` (raw numbers → 1-10 scores).

`fetch_osm_data.py` finds each park's polygon on OpenStreetMap and computes:

- **Calibrated coordinates** — the polygon centroid replaces the hand-typed
  lat/lon, so the map pin sits on the actual park.
- **Park size** — the polygon area in hectares (the "Park size" fact + score).
- **Benches** — count of `amenity=bench` inside the polygon (the "Benches" fact + score).

It writes `data/park_geo.json`. The app merges that file over `data/parks.json`
when serving `/api/parks` and `/park/<id>`, so pages load instantly from the
cache instead of querying OSM live. If the cache is missing, the seed values are
served unchanged (nothing breaks).

### Run it
```
python fetch_osm_data.py          # all parks  (~1-2 min, paced for Overpass)
python fetch_osm_data.py erba hain   # just specific parks
```
Park geometry barely changes, so running this weekly via cron is plenty.
Each park entry in `park_geo.json` records `osm_type`, `osm_id`, `matched_name`
and `fetched_at`, and `/api/parks` flags every field's `data_source`
("osm centroid" / "osm" vs "manual") so you can see what's real vs. seed.

> Tip: after running it, open `data/park_geo.json` and skim `matched_name` for
> each park — if a match looks wrong (e.g. a tiny adjacent garden instead of the
> main park), nudge that park's seed `lat`/`lon` in `parks.json` closer to the
> real centre and re-run just that id.
