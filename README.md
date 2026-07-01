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

---

## Update — all four conditions from data, POI controls, email fix

**Overpass 406 fixed.** `fetch_osm_data.py` now sends a real `User-Agent`
(Overpass rejects the default `python-requests` agent with 406) and falls back
across mirrors. Optionally put your own email in the User-Agent string near the
top of `overpass()` — it's good OSM etiquette. Re-run:
```
python fetch_osm_data.py
```

**All four conditions now come from OpenStreetMap** (when the cache exists):
- **Shade** — canopy estimate from woodland coverage (`natural=wood` / `landuse=forest`)
  and mapped-tree density (`natural=tree`) inside the park polygon.
- **Quiet** — distance from the park centroid to the nearest busy road.
- **Benches** — `amenity=bench` count inside the polygon.
- **Park size** — polygon area in hectares.

These are baked into `data/park_geo.json` and merged at serve time, so the page
doesn't recompute anything live. Until you run the fetch, the app falls back to
the seed values (and Quiet is still computed client-side as before).

**Points of interest:**
- The Explore sidebar has a **distance slider** (200–2000 m). Changing it
  refetches and re-ranks nearby places.
- Your selected POI types **and** the radius are remembered and reused on each
  **park detail page** — it shows only the categories you picked on Explore.
- A park detail page **widens the radius automatically** (up to 3 km) until it
  finds at least one of your selected POIs, so the list is never empty.

**Daily emails.** The recommendation email is no longer empty when no park beats
your threshold — it falls back to "today's coolest parks", so a daily email
always has content. If you only got the `--test` mail, you still need to
*schedule* the real send:

- **Windows (Task Scheduler):** create a Basic Task → Daily → Start a program:
  - Program: `C:\...\project_mobi\venv\Scripts\python.exe`
  - Arguments: `send_daily_emails.py`
  - Start in: `C:\...\project_mobi`
- **Linux/Mac (cron):** `0 8 * * * cd /path/to/project_mobi && .venv/bin/python send_daily_emails.py`

Run it once by hand to confirm — it now prints a per-user status line:
```
python send_daily_emails.py
```
Make sure your profile has **"Send me a daily reminder"** ticked and at least one
reminder type enabled.

---

## Update — faster loading + fixed distance slider

**Why it was slow / why the slider broke at large radius.** POIs were fetched
*live* from Overpass on every page load as one giant query (all parks × all
categories). At 200 m that query is small and works; at 1000 m it got too big
and timed out, so nothing showed — which looked like "the slider hides POIs at
1000 m". The city-wide Quiet road query also ran live on every load.

**The fix — POIs are now cached.** `osm_pois.py` fetches each park's nearby
places once (server-side, generous 2 km radius, with a proper User-Agent so no
406) and the app stores them in `data/park_pois.json`, served at `/api/pois`.
The browser then **filters that cache by the slider distance and your selected
categories** — so the slider is instant and a larger radius reliably shows
*more* places, not fewer.

- The cache builds **automatically** on first page load (one-time, ~15 s while
  the POI badges say "loading"), then every load is instant for a week.
- To skip even that first wait, run `python fetch_osm_data.py` — it now also
  pre-builds the POI cache (and the geometry/conditions cache).
- If the server cache isn't ready yet, the browser falls back to fetching POIs
  itself for that one session.

**Biggest speed tip:** run `python fetch_osm_data.py` once. That populates
`park_geo.json` (coords, area, benches, shade, quiet) *and* `park_pois.json`, so
the app stops doing any live Overpass work on load. Your `park_geo.json` is
currently empty `{}`, which means nothing is cached yet — that's the main reason
it still feels slow.

---

## Update — accurate Shade (NDVI) + much better park matching

**Re-run `python fetch_osm_data.py`** to pick up these fixes — your previous
`park_geo.json`/`park_pois.json` were built before them and have been reset.

**Shade now comes from satellite NDVI, not OSM trees.** OpenStreetMap doesn't
map the individual trees inside most parks, so the old tree-count heuristic
scored the tree-filled Hain as 1/10. Shade now uses Sentinel-2 NDVI (peak summer,
leaf-on) via Copernicus — the "vegetation coverage (API)" approach. `ndvi_shade.py`
uses the Statistical API (clean JSON, no fragile GeoTIFF parsing). If Copernicus
is unreachable for a park, that park keeps its hand-set seed Shade rather than a
wrong value, and the script prints which it used.

**Polygon matching is much stricter, fixing the bad results you saw:**
- **No two parks share a polygon** — Domplatz no longer grabs the Rosengarten
  shape; it keeps its seed location instead.
- **Tiny/degenerate matches are rejected** — the 0.0–0.1 ha "matches" for
  Volkspark, Leinritt, Stephansberg and Am Kranen are dropped; those parks keep
  their seed coordinates and area.
- **Name matches win, and the largest one is chosen** — e.g. the Hain now prefers
  the larger Luitpoldhain polygon over the small Theresienhain.
- **Non-polygon parks still get real data** — even when a park has no trustworthy
  polygon (a promenade or towpath), Quiet (road distance) and Shade (NDVI) are
  still computed from its centre; only coordinates/area/benches stay as seeds.

After re-running, skim `data/park_geo.json`: a park with no `lat`/`osm_id` was
left on its seed values (expected for squares/promenades). If a real park you
care about was left unmatched, nudge its `lat`/`lon` in `data/parks.json` toward
the park centre and re-run just that one, e.g. `python fetch_osm_data.py volkspark`.

---

## Update — correct park locations (geocoding) + condition info bubble

**Re-run `python fetch_osm_data.py`** to fix the locations. The old caches held
the wrong matches and have been reset.

**Why locations were wrong, and the fix:**
- The Hain had matched **"Luisenhain"** — a *different* park 570 m away — because
  the name matcher treated the common German suffix "…hain" as a match and then
  preferred the largest one. Matching is now **containment-dominant**: a polygon
  that actually contains the park's point beats any far-away name match, so a
  wrong "…hain" can't win.
- Several parks were sitting on **hand-typed seed coordinates** that were off.
  The script now **geocodes each park by name via Nominatim** (OpenStreetMap's
  search) to get an authoritative location, disambiguating by the nearest result
  and rejecting anything more than 3 km away. That geocoded point is used both to
  search for the polygon and as the pin when a park has no clean polygon (a
  square, promenade or towpath).

So after re-running, pins land on the real parks. Nominatim is rate-limited to
~1 request/second, so the run is a little slower — that's expected.

**Condition info bubble.** The "Park conditions" heading (on Explore and on each
park page) now has an **ⓘ** button that explains what Shade, Quiet, Benches and
Park size mean and where each number comes from.

If a specific park still lands in the wrong spot after re-running, its Nominatim
result was probably ambiguous — set that park's `lat`/`lon` in `data/parks.json`
to the correct point and re-run just that id (`python fetch_osm_data.py hain`);
the seed is used to disambiguate the geocoder.

---

## Update — geocoding fix (403) + dark mode

**Nominatim 403 fixed.** Nominatim's public server blocked the automated
requests (403 Forbidden), so every park fell back to its seed. Geocoding now
uses **Photon** (Komoot's OpenStreetMap geocoder, much more permissive), with
Nominatim only as a fallback. Re-run `python fetch_osm_data.py` and the parks
that were "no polygon or geocode — keeping seed" (Hain, Rosengarten, Volkspark,
Domplatz, Jakobsberg, Altenburg, Stephansberg, Am Kranen…) should now resolve to
real locations and, where a polygon exists, snap to it.

Note: the parks that already matched a polygon last run (ERBA, Michelsberg,
Hauptsmoor, Seehof) were fine — the 403 only affected the seed-fallback parks.
Your `park_pois.json` is included so POIs work without waiting; it'll be rebuilt
with the corrected coordinates next time you run the fetch.

**Dark mode added.** There's a 🌙 / ☀️ toggle in the top-right. It flips a
`data-theme="dark"` attribute on the page, remembers your choice
(localStorage), and is applied before first paint so there's no flash. It was
easy because the design already used CSS variables — dark mode just overrides
them, plus a filter that darkens the map tiles so the map doesn't glare.
