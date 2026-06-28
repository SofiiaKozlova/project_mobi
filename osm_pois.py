"""
osm_pois.py — fetch nearby points of interest for each park (server-side)
──────────────────────────────────────────────────────────────────────────
Runs the Overpass queries on the server (with a proper User-Agent, so no 406),
combines bus platforms that share a name, and returns a structure the front-end
can filter by distance and category instantly:

    { park_id: { "transit": [ {name, lat, lon, dist_m, lines, platforms, rawName}, ... ],
                 "food": [...], "icecream": [...], "sightseeing": [...], "playground": [...] } }

We fetch a generous radius once (CACHE_RADIUS) and let the browser's slider
filter down — that's why the slider is instant and a bigger radius shows MORE.
"""

import time

from fetch_osm_data import overpass, haversine  # reuse the UA-aware Overpass call

CACHE_RADIUS = 2000          # metres fetched per park (slider max)
PER_CATEGORY_CAP = 20        # keep the nearest N per category
REQUEST_PAUSE = 0.5

POI_SELECTORS = {
    "transit":     ['["highway"="bus_stop"]', '["public_transport"="platform"]'],
    "food":        ['["amenity"~"restaurant|cafe|biergarten"]'],
    "icecream":    ['["amenity"="ice_cream"]', '["shop"="ice_cream"]'],
    "sightseeing": ['["tourism"~"attraction|museum|viewpoint"]', '["historic"]'],
    "playground":  ['["leisure"="playground"]'],
}
CATEGORIES = list(POI_SELECTORS.keys())


def classify(tags):
    if tags.get("highway") == "bus_stop" or tags.get("public_transport") in ("platform", "stop_position"):
        return "transit"
    if tags.get("amenity") in ("restaurant", "cafe", "biergarten"):
        return "food"
    if tags.get("amenity") == "ice_cream" or tags.get("shop") == "ice_cream":
        return "icecream"
    if tags.get("leisure") == "playground":
        return "playground"
    if tags.get("tourism") or tags.get("historic"):
        return "sightseeing"
    return None


def cap(s):
    return s[:1].upper() + s[1:].replace("_", " ") if s else s


def node_name(tags):
    for k in ("name", "name:de", "name:en"):
        if tags.get(k):
            return tags[k]
    for k in ("historic", "tourism", "shop", "amenity"):
        v = tags.get(k)
        if v and v != "yes":
            return f"{cap(v)} (unnamed)"
    if tags.get("leisure") == "playground":
        return "Playground (unnamed)"
    if tags.get("highway") == "bus_stop":
        return "Bus stop (unnamed)"
    return "Unnamed place"


def bus_lines(tags):
    ref = tags.get("route_ref", "")
    return [s.strip() for s in ref.replace(";", ",").split(",") if s.strip()] if ref else []


def combine_transit(stops):
    """Merge platforms sharing a name into one stop (keep nearest, union lines)."""
    groups = {}
    for s in stops:
        key = (s.get("rawName") or s["name"]).strip().lower() or f'__{s["lat"]},{s["lon"]}'
        g = groups.get(key)
        if not g:
            groups[key] = {**s, "lines": list(s.get("lines", [])), "platforms": 1}
        else:
            g["platforms"] += 1
            for l in s.get("lines", []):
                if l not in g["lines"]:
                    g["lines"].append(l)
            if s["dist_m"] < g["dist_m"]:
                g.update({"dist_m": s["dist_m"], "lat": s["lat"], "lon": s["lon"]})

    def line_key(l):
        try:
            return (0, int(l))
        except ValueError:
            return (1, l)

    out = list(groups.values())
    for g in out:
        g["lines"].sort(key=line_key)
    out.sort(key=lambda x: x["dist_m"])
    return out


def fetch_park_pois(park, radius=CACHE_RADIUS):
    lat, lon = park["lat"], park["lon"]
    selectors = "".join(
        f'node{sel}(around:{radius},{lat},{lon});'
        for sels in POI_SELECTORS.values() for sel in sels
    )
    query = f"[out:json][timeout:60];({selectors});out body;"
    data = overpass(query)

    cats = {c: [] for c in CATEGORIES}
    for el in data.get("elements", []):
        tags = el.get("tags", {})
        cat = classify(tags)
        if not cat:
            continue
        d = haversine(lat, lon, el["lat"], el["lon"])
        if d > radius:
            continue
        item = {"name": node_name(tags), "lat": el["lat"], "lon": el["lon"], "dist_m": round(d)}
        if cat == "transit":
            item["lines"] = bus_lines(tags)
            item["rawName"] = tags.get("name", "")
        cats[cat].append(item)

    for c in CATEGORIES:
        cats[c].sort(key=lambda x: x["dist_m"])
        if c == "transit":
            cats[c] = combine_transit(cats[c])
        cats[c] = cats[c][:PER_CATEGORY_CAP]
    return cats


def build_all(parks):
    """Fetch POIs for every park. Returns the cache dict."""
    result = {}
    for park in parks:
        try:
            result[park["id"]] = fetch_park_pois(park)
            n = sum(len(v) for v in result[park["id"]].values())
            print(f"  POIs · {park['id']}: {n} places")
        except Exception as e:
            print(f"  POIs · {park['id']}: failed ({e})")
            result[park["id"]] = {c: [] for c in CATEGORIES}
        time.sleep(REQUEST_PAUSE)
    return result
