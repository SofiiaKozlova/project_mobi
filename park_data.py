"""
park_data.py — load parks and overlay the OSM cache in one place
─────────────────────────────────────────────────────────────────
Used by both /api/parks (front-end) and the /park/<id> page so they
always agree on coordinates, area, bench counts and derived scores.
"""

import json
import os

from park_scoring import bench_score, size_score

PARKS_FILE = os.path.join("data", "parks.json")
CACHE_FILE = os.path.join("data", "park_geo.json")


def _read(path):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def load_geo():
    return _read(CACHE_FILE) or {}


def merge_osm(park, geo):
    """Overlay one park's OSM cache entry (coords, area, benches + scores)."""
    g = geo.get(park["id"])
    if not g:
        return park
    park.setdefault("facts", {})
    park.setdefault("conditions", {})
    park.setdefault("data_source", {})

    if g.get("lat") is not None and g.get("lon") is not None:
        park["lat"], park["lon"] = g["lat"], g["lon"]
        park["data_source"]["lat_lon"] = "osm centroid"
    if g.get("area_ha") is not None:
        park["facts"]["area_ha"] = g["area_ha"]
        s = size_score(g["area_ha"])
        if s is not None:
            park["conditions"]["park_size"] = s
        park["data_source"]["area_ha"] = "osm"
    if g.get("bench_count") is not None:
        park["facts"]["bench_count"] = g["bench_count"]
        s = bench_score(g["bench_count"])
        if s is not None:
            park["conditions"]["benches"] = s
        park["data_source"]["bench_count"] = "osm"
    if g.get("shade_score") is not None:
        park["conditions"]["shade"] = g["shade_score"]
        park["data_source"]["shade"] = "osm"
    if g.get("quiet_score") is not None:
        park["conditions"]["quiet"] = g["quiet_score"]
        park["data_source"]["quiet"] = "osm"
    park["osm"] = {k: g.get(k) for k in ("osm_type", "osm_id", "matched_name", "fetched_at")}
    return park


def load_parks(merged=True):
    """Return the park list, optionally merged with the OSM cache."""
    parks = _read(PARKS_FILE) or []
    if merged:
        geo = load_geo()
        if geo:
            parks = [merge_osm(p, geo) for p in parks]
    return parks
