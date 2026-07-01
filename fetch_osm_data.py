#!/usr/bin/env python3
"""
fetch_osm_data.py — pull real park geometry from OpenStreetMap and cache it
────────────────────────────────────────────────────────────────────────────
For every park in data/parks.json this finds the matching OSM area feature
(leisure=park / garden / nature_reserve, landuse=forest / recreation_ground …)
near the seed coordinate, then computes:

  • lat, lon     — the polygon CENTROID (calibrates the map pin)
  • area_ha      — the polygon area in hectares (the "Park size" fact)
  • bench_count  — amenity=bench nodes inside the polygon (the "Benches" fact)

Results are written to data/park_geo.json. The app merges that file over
parks.json when serving /api/parks, so the page loads instantly from cache
instead of querying OSM live. Park geometry rarely changes, so running this
weekly (cron / Task Scheduler) is plenty.

Usage:
    python fetch_osm_data.py            # all parks
    python fetch_osm_data.py erba hain  # just these ids
"""

import json
import math
import os
import sys
import time

import requests

try:
    from dotenv import load_dotenv
    load_dotenv()          # so COPERNICUS_* (for NDVI shade) are available
except ImportError:
    pass

from ndvi_shade import compute_shade

PARKS_FILE = os.path.join("data", "parks.json")
CACHE_FILE = os.path.join("data", "park_geo.json")
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
SEARCH_RADIUS = 700        # metres around the anchor to look for the park polygon
REQUEST_PAUSE = 2.0        # seconds between Overpass calls (be polite)
USER_AGENT = "CoolParkBamberg/1.0 (urban-data student project; contact: your-email@example.com)"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
PHOTON_URL = "https://photon.komoot.io/api/"

# OSM tags that usually mark a park-like green area
AREA_SELECTORS = [
    '["leisure"="park"]',
    '["leisure"="garden"]',
    '["leisure"="nature_reserve"]',
    '["leisure"="recreation_ground"]',
    '["landuse"="forest"]',
    '["landuse"="recreation_ground"]',
    '["landuse"="meadow"]',
    '["landuse"="grass"]',
    '["boundary"="national_park"]',
]


# ──────────────────────────────────────────────
#  Geometry helpers (planar approximation in metres around a local origin)
# ──────────────────────────────────────────────
def _to_xy(ring, lat0):
    """Project (lat,lon) points to local metres using an equirectangular map."""
    mlat = 111_320.0
    mlon = 111_320.0 * math.cos(math.radians(lat0))
    return [((p["lon"]) * mlon, (p["lat"]) * mlat) for p in ring]


def polygon_area_ha(ring):
    """Area of a closed ring (list of {lat,lon}) in hectares."""
    if len(ring) < 3:
        return 0.0
    lat0 = sum(p["lat"] for p in ring) / len(ring)
    xy = _to_xy(ring, lat0)
    s = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        s += x1 * y2 - x2 * y1
    return abs(s) / 2.0 / 10_000.0  # m² → ha


def polygon_centroid(ring):
    """Area-weighted centroid of a closed ring → {lat, lon}."""
    if len(ring) < 3:
        lat = sum(p["lat"] for p in ring) / len(ring)
        lon = sum(p["lon"] for p in ring) / len(ring)
        return {"lat": lat, "lon": lon}
    lat0 = sum(p["lat"] for p in ring) / len(ring)
    xy = _to_xy(ring, lat0)
    a = cx = cy = 0.0
    for i in range(len(xy)):
        x1, y1 = xy[i]
        x2, y2 = xy[(i + 1) % len(xy)]
        cross = x1 * y2 - x2 * y1
        a += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    if a == 0:
        lat = sum(p["lat"] for p in ring) / len(ring)
        lon = sum(p["lon"] for p in ring) / len(ring)
        return {"lat": lat, "lon": lon}
    a *= 0.5
    cx /= (6 * a)
    cy /= (6 * a)
    mlat = 111_320.0
    mlon = 111_320.0 * math.cos(math.radians(lat0))
    return {"lat": cy / mlat, "lon": cx / mlon}


def point_in_ring(lat, lon, ring):
    """Ray-casting point-in-polygon test."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        yi, xi = ring[i]["lat"], ring[i]["lon"]
        yj, xj = ring[j]["lat"], ring[j]["lon"]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-15) + xi):
            inside = not inside
        j = i
    return inside


def haversine(lat1, lon1, lat2, lon2):
    R = 6371000.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


# ──────────────────────────────────────────────
#  Overpass
# ──────────────────────────────────────────────
def overpass(query):
    """
    POST a query to Overpass. We must send a real User-Agent — Overpass
    returns "406 Not Acceptable" for the default python-requests agent.
    Falls back across mirrors if one is busy/blocked.
    """
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "application/json",
    }
    last_err = None
    for url in OVERPASS_ENDPOINTS:
        try:
            resp = requests.post(url, data={"data": query}, headers=headers, timeout=90)
            if resp.status_code == 429:           # rate limited — wait and retry once
                time.sleep(5)
                resp = requests.post(url, data={"data": query}, headers=headers, timeout=90)
            resp.raise_for_status()
            return resp.json()
        except requests.RequestException as e:
            last_err = e
            continue
    raise last_err


def ring_from_element(el):
    """Return a list of {lat,lon} for a way, or the largest outer ring of a relation."""
    if el["type"] == "way" and el.get("geometry"):
        return [{"lat": g["lat"], "lon": g["lon"]} for g in el["geometry"]]
    if el["type"] == "relation":
        best = []
        for m in el.get("members", []):
            if m.get("role") == "outer" and m.get("geometry"):
                ring = [{"lat": g["lat"], "lon": g["lon"]} for g in m["geometry"]]
                if len(ring) > len(best):
                    best = ring
        return best
    return []


MIN_AREA_HA = 0.5            # ignore tiny polygons unless the name matches
NEARBY_BIG_HA = 2.0         # a large nearby park is acceptable without a name match


def clean_name(name):
    """Strip parentheticals and secondary parts for a cleaner geocoder query."""
    import re
    n = re.sub(r"\(.*?\)", "", name)      # drop "(Nordpark)"
    n = n.split("&")[0].split(",")[0]      # drop "& cathedral gardens"
    return n.strip()


def _pick_nearest(points, near_lat, near_lon, max_km=3.0):
    """From [(lat,lon), ...] choose the one nearest the seed within max_km."""
    best, best_d = None, float("inf")
    for la, lo in points:
        d = haversine(near_lat, near_lon, la, lo)
        if d < best_d:
            best_d, best = d, {"lat": round(la, 7), "lon": round(lo, 7)}
    return best if best and best_d <= max_km * 1000 else None


def _geocode_photon(query, near_lat, near_lon):
    """Photon (Komoot) — OpenStreetMap-based, permissive. Biased toward Bamberg."""
    resp = requests.get(
        PHOTON_URL,
        params={"q": query, "lat": near_lat, "lon": near_lon, "limit": 5, "lang": "de"},
        headers={"User-Agent": USER_AGENT},
        timeout=30,
    )
    resp.raise_for_status()
    pts = []
    for f in resp.json().get("features", []):
        coords = (f.get("geometry") or {}).get("coordinates")
        if coords and len(coords) >= 2:
            pts.append((coords[1], coords[0]))   # GeoJSON is [lon, lat]
    return _pick_nearest(pts, near_lat, near_lon)


def _geocode_nominatim(query, near_lat, near_lon):
    """Nominatim fallback (stricter usage policy; may 403)."""
    resp = requests.get(
        NOMINATIM_URL,
        params={"q": query + ", Germany", "format": "json", "limit": 5},
        headers={"User-Agent": USER_AGENT, "Referer": "https://coolpark.bamberg.local"},
        timeout=30,
    )
    resp.raise_for_status()
    pts = []
    for r in resp.json():
        try:
            pts.append((float(r["lat"]), float(r["lon"])))
        except (KeyError, ValueError):
            continue
    return _pick_nearest(pts, near_lat, near_lon)


def geocode(name, near_lat, near_lon):
    """
    Resolve a park to authoritative coordinates. Tries Photon first (permissive),
    then Nominatim. Disambiguates by the result nearest the seed and rejects
    anything more than 3 km away. Returns {lat, lon} or None.
    """
    query = f"{clean_name(name)} Bamberg"
    for provider in (_geocode_photon, _geocode_nominatim):
        try:
            res = provider(query, near_lat, near_lon)
            if res:
                return res
        except (requests.RequestException, ValueError) as e:
            print(f"    geocode via {provider.__name__} failed: {e}")
    return None


def find_candidates(park, anchor=None):
    """Return ALL plausible OSM area features near the anchor (or the seed)."""
    lat = anchor["lat"] if anchor else park["lat"]
    lon = anchor["lon"] if anchor else park["lon"]
    selectors = "".join(
        f'way{sel}(around:{SEARCH_RADIUS},{lat},{lon});'
        f'relation{sel}(around:{SEARCH_RADIUS},{lat},{lon});'
        for sel in AREA_SELECTORS
    )
    query = f"[out:json][timeout:60];({selectors});out geom;"
    data = overpass(query)

    park_words = [w.lower() for w in park["name"].replace("-", " ").split() if len(w) > 3]
    out = []
    for el in data.get("elements", []):
        ring = ring_from_element(el)
        if len(ring) < 3:
            continue
        area = polygon_area_ha(ring)
        if area <= 0:
            continue
        centroid = polygon_centroid(ring)
        name = (el.get("tags") or {}).get("name", "")
        name_match = bool(name) and any(w in name.lower() for w in park_words)
        out.append({
            "ring": ring, "area_ha": area, "centroid": centroid,
            "contains": point_in_ring(lat, lon, ring),
            "name": name, "name_match": name_match,
            "dist": haversine(lat, lon, centroid["lat"], centroid["lon"]),
            "osm_type": el["type"], "osm_id": el["id"],
        })
    return out


def score_candidate(c):
    """Higher = more likely the correct park. Containment dominates; a far-away
    name match (e.g. a different '…hain') can't outweigh the park that actually
    contains the point."""
    s = 0.0
    if c["contains"]:
        s += 100
    if c["name_match"]:
        s += 40
    s -= c["dist"] / 10.0          # 100 m away costs 10 points
    s += min(8.0, c["area_ha"])    # mild preference for the whole park over a sub-feature
    return s


def is_acceptable(c):
    """Whether a candidate is trustworthy enough to override the seed values."""
    if c["contains"] and c["area_ha"] >= 0.2:
        return True
    if c["name_match"] and c["dist"] < 150 and c["area_ha"] >= 0.2:
        return True
    if c["area_ha"] >= 3.0 and c["dist"] < 150:
        return True
    return False


def assign_polygons(parks, cand_by_pid):
    """Global greedy assignment by score, so the best (park, polygon) pairings
    win first and no two parks share the same OSM feature."""
    pairs = []
    for park in parks:
        for c in cand_by_pid.get(park["id"], []):
            if is_acceptable(c):
                pairs.append((score_candidate(c), park["id"], c))
    pairs.sort(key=lambda x: x[0], reverse=True)
    used, assigned = set(), {}
    for _score, pid, c in pairs:
        if pid in assigned or c["osm_id"] in used:
            continue
        assigned[pid] = c
        used.add(c["osm_id"])
    return assigned


def fetch_benches(ring):
    """Count amenity=bench nodes inside the polygon."""
    poly = " ".join(f'{p["lat"]} {p["lon"]}' for p in ring)
    query = f'[out:json][timeout:60];node["amenity"="bench"](poly:"{poly}");out count;'
    try:
        data = overpass(query)
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            if "total" in tags:
                return int(tags["total"])
            if "nodes" in tags:
                return int(tags["nodes"])
        return 0
    except Exception as e:
        print(f"    bench count failed: {e}")
        return None


def estimate_quiet(centroid):
    """
    Quiet score (1-10) from distance to the nearest busy road
    (motorway/trunk/primary/secondary). Farther = quieter.
    """
    lat, lon = centroid["lat"], centroid["lon"]
    query = (
        f'[out:json][timeout:60];'
        f'way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|secondary)$"]'
        f'(around:800,{lat},{lon});out geom;'
    )
    try:
        data = overpass(query)
    except Exception as e:
        print(f"    road query failed: {e}")
        return None

    min_dist = float("inf")
    for el in data.get("elements", []):
        for g in el.get("geometry", []):
            d = haversine(lat, lon, g["lat"], g["lon"])
            if d < min_dist:
                min_dist = d
    if min_dist == float("inf"):
        return 10  # no busy road within 800 m → very quiet

    if min_dist < 40:
        score = 1
    elif min_dist < 80:
        score = 2 + (min_dist - 40) / 40
    elif min_dist < 200:
        score = 4 + ((min_dist - 80) / 120) * 2
    elif min_dist < 400:
        score = 7 + ((min_dist - 200) / 200)
    else:
        score = 8 + (min_dist - 400) / 300
    return max(1, min(10, round(score)))


# ──────────────────────────────────────────────
#  Main
# ──────────────────────────────────────────────
def main():
    with open(PARKS_FILE, "r", encoding="utf-8") as f:
        parks = json.load(f)

    wanted = set(sys.argv[1:])
    if wanted:
        parks = [p for p in parks if p["id"] in wanted]

    cache = {}
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                cache = json.load(f)
        except json.JSONDecodeError:
            cache = {}

    # 1) Geocode each park by name (authoritative location), then fetch
    #    candidate polygons around that anchor.
    anchors, cand_by_pid = {}, {}
    for park in parks:
        pid = park["id"]
        anchor = geocode(park["name"], park["lat"], park["lon"])
        anchors[pid] = anchor
        if anchor:
            print(f"  geocoded {pid} → ({anchor['lat']}, {anchor['lon']})")
        time.sleep(1.1)   # Nominatim: max ~1 request/second
        try:
            cand_by_pid[pid] = find_candidates(park, anchor)
        except requests.RequestException as e:
            print(f"• {pid}: Overpass error finding polygon: {e}")
            cand_by_pid[pid] = []
        time.sleep(REQUEST_PAUSE)

    # 2) Assign polygons (score-based, containment dominates, no shared feature).
    assigned = assign_polygons(parks, cand_by_pid)

    # 3) Build cache entries. Confident polygon → use its coords/area/benches.
    #    Otherwise use the geocoded anchor for the location (falling back to the
    #    seed only if geocoding failed). Quiet and Shade are always computed from
    #    the centre point, so even non-polygon parks get real Quiet + Shade.
    for park in parks:
        pid = park["id"]
        print(f"• {pid} ({park['name']})")
        entry = {"fetched_at": time.strftime("%Y-%m-%d")}
        a = assigned.get(pid)

        if a:
            entry.update({
                "lat": round(a["centroid"]["lat"], 7),
                "lon": round(a["centroid"]["lon"], 7),
                "area_ha": round(a["area_ha"], 1),
                "osm_type": a["osm_type"], "osm_id": a["osm_id"],
                "matched_name": a["name"],
            })
            time.sleep(REQUEST_PAUSE)
            b = fetch_benches(a["ring"])
            if b is not None:
                entry["bench_count"] = b
            center = a["centroid"]
        elif anchors.get(pid):
            # No polygon, but Nominatim gave us an authoritative point.
            anchor = anchors[pid]
            entry["lat"], entry["lon"] = anchor["lat"], anchor["lon"]
            print("    no polygon — using geocoded location (area/benches stay seed)")
            center = anchor
        else:
            print("    no polygon or geocode — keeping seed coords/area/benches")
            center = {"lat": park["lat"], "lon": park["lon"]}

        time.sleep(REQUEST_PAUSE)
        q = estimate_quiet(center)
        if q is not None:
            entry["quiet_score"] = q

        time.sleep(REQUEST_PAUSE)
        shade, ndvi = compute_shade(center["lat"], center["lon"])
        if shade is not None:
            entry["shade_score"] = shade
            shade_txt = f"{shade}/10 (NDVI {ndvi})"
        else:
            shade_txt = "seed (NDVI unavailable)"

        cache[pid] = entry
        print(f"    ({entry.get('lat', 'seed')}, {entry.get('lon', 'seed')}) · "
              f"{entry.get('area_ha', 'seed')} ha · {entry.get('bench_count', 'seed')} benches · "
              f"shade {shade_txt} · quiet {entry.get('quiet_score', '?')}/10 · "
              f"matched \"{a['name'] if a else '—'}\"")

    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {CACHE_FILE} ({len(cache)} parks).")

    # Pre-build the POI cache too, so the first page load is instant.
    try:
        from osm_pois import build_all
        from park_data import load_parks as _load_merged
        print("\nFetching nearby points of interest (this warms the POI cache)…")
        pois = build_all(_load_merged(merged=True))
        pois_path = os.path.join("data", "park_pois.json")
        with open(pois_path, "w", encoding="utf-8") as f:
            json.dump(pois, f, ensure_ascii=False)
        print(f"Wrote {pois_path} ({len(pois)} parks).")
    except Exception as e:
        print(f"POI cache step skipped ({e}). The app will build it on first load instead.")


if __name__ == "__main__":
    main()
