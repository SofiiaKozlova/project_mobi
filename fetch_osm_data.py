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

PARKS_FILE = os.path.join("data", "parks.json")
CACHE_FILE = os.path.join("data", "park_geo.json")
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
SEARCH_RADIUS = 700        # metres around the seed point to look for the park polygon
REQUEST_PAUSE = 2.0        # seconds between Overpass calls (be polite)

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
    resp = requests.post(OVERPASS_URL, data={"data": query}, timeout=90)
    resp.raise_for_status()
    return resp.json()


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


def find_polygon(park):
    """Find the best OSM area feature for a park near its seed coordinate."""
    lat, lon = park["lat"], park["lon"]
    selectors = "".join(
        f'way{sel}(around:{SEARCH_RADIUS},{lat},{lon});'
        f'relation{sel}(around:{SEARCH_RADIUS},{lat},{lon});'
        for sel in AREA_SELECTORS
    )
    query = f"[out:json][timeout:60];({selectors});out geom;"
    data = overpass(query)

    candidates = []
    for el in data.get("elements", []):
        ring = ring_from_element(el)
        if len(ring) < 3:
            continue
        area = polygon_area_ha(ring)
        if area <= 0:
            continue
        centroid = polygon_centroid(ring)
        contains = point_in_ring(lat, lon, ring)
        name = (el.get("tags") or {}).get("name", "")
        name_match = bool(name) and any(
            w.lower() in name.lower() for w in park["name"].replace("-", " ").split() if len(w) > 3
        )
        candidates.append({
            "ring": ring, "area_ha": area, "centroid": centroid,
            "contains": contains, "name": name, "name_match": name_match,
            "dist": haversine(lat, lon, centroid["lat"], centroid["lon"]),
            "osm_type": el["type"], "osm_id": el["id"],
        })

    if not candidates:
        return None

    # Prefer: contains the seed point → name match → nearest centroid.
    candidates.sort(key=lambda c: (not c["contains"], not c["name_match"], c["dist"]))
    return candidates[0]


def count_benches(ring):
    """Count amenity=bench nodes inside the polygon."""
    poly = " ".join(f'{p["lat"]} {p["lon"]}' for p in ring)
    query = f'[out:json][timeout:60];node["amenity"="bench"](poly:"{poly}");out count;'
    try:
        data = overpass(query)
        # out count returns an element with tags.nodes / tags.total
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
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            cache = json.load(f)

    for park in parks:
        pid = park["id"]
        print(f"• {pid} ({park['name']})")
        try:
            best = find_polygon(park)
        except requests.RequestException as e:
            print(f"    Overpass error, skipping: {e}")
            time.sleep(REQUEST_PAUSE)
            continue

        if not best:
            print("    no matching polygon found — keeping seed values")
            time.sleep(REQUEST_PAUSE)
            continue

        time.sleep(REQUEST_PAUSE)
        benches = count_benches(best["ring"])

        cache[pid] = {
            "lat": round(best["centroid"]["lat"], 7),
            "lon": round(best["centroid"]["lon"], 7),
            "area_ha": round(best["area_ha"], 1),
            "bench_count": benches,
            "osm_type": best["osm_type"],
            "osm_id": best["osm_id"],
            "matched_name": best["name"],
            "fetched_at": time.strftime("%Y-%m-%d"),
        }
        print(f"    centroid ({cache[pid]['lat']}, {cache[pid]['lon']}) · "
              f"{cache[pid]['area_ha']} ha · {benches} benches · matched \"{best['name']}\"")
        time.sleep(REQUEST_PAUSE)

    os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)
    print(f"\nWrote {CACHE_FILE} ({len(cache)} parks).")


if __name__ == "__main__":
    main()
