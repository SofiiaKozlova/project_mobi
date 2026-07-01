"""
api_routes.py — Flask blueprint for CoolPark Bamberg
─────────────────────────────────────────────────────
Provides two API proxy endpoints so client-side JS never touches secrets:

  /api/microclimate?lat=49.89&lon=10.89&radius=2000
      → Returns nearby Netatmo weather-station data (temperature, humidity)
        within a given radius around a park.

  /api/shade?lat=49.89&lon=10.89
      → Returns NDVI-based tree-cover estimate from Copernicus Sentinel-2
        for a ~200 m area around a park centre.
"""

import os
import time
import requests
from flask import Blueprint, jsonify, request

api_bp = Blueprint('api', __name__)

# ────────────────────────────────────────────
# NETATMO — public weather-station data
# Docs: https://dev.netatmo.com/apidocumentation
# ────────────────────────────────────────────

_netatmo_token = None
_netatmo_token_expires = 0


def _netatmo_auth():
    """Get or refresh an OAuth2 access token for the Netatmo API."""
    global _netatmo_token, _netatmo_token_expires

    if _netatmo_token and time.time() < _netatmo_token_expires - 60:
        return _netatmo_token

    client_id = os.environ.get('NETATMO_CLIENT_ID')
    client_secret = os.environ.get('NETATMO_CLIENT_SECRET')

    if not client_id or not client_secret:
        raise RuntimeError(
            'NETATMO_CLIENT_ID and NETATMO_CLIENT_SECRET must be set '
            'in environment variables (or in a .env file).'
        )

    resp = requests.post('https://api.netatmo.com/oauth2/token', data={
        'grant_type': 'client_credentials',
        'client_id': client_id,
        'client_secret': client_secret,
        'scope': 'read_station',
    })
    resp.raise_for_status()
    data = resp.json()

    _netatmo_token = data['access_token']
    _netatmo_token_expires = time.time() + data.get('expires_in', 10800)
    return _netatmo_token


@api_bp.route('/api/microclimate')
def microclimate():
    """
    Return nearby Netatmo public weather-station measurements.

    Query params:
        lat     — park latitude  (required)
        lon     — park longitude (required)
        radius  — search radius in metres (default 2000)

    Response:
        { stations: [ {lat, lon, temperature, humidity, distance_m}, ... ] }

    This is the Netatmo "getpublicdata" endpoint filtered to the area
    around a specific park. You can then assign a park to the nearest LCZ
    and use the average temperature from its stations.
    """
    try:
        lat = float(request.args['lat'])
        lon = float(request.args['lon'])
    except (KeyError, ValueError):
        return jsonify(error='lat and lon are required'), 400

    radius = int(request.args.get('radius', 2000))

    try:
        token = _netatmo_auth()
    except RuntimeError as e:
        return jsonify(error=str(e)), 500

    # Netatmo expects a bounding box in lat_ne, lon_ne, lat_sw, lon_sw
    # Approximate from centre + radius
    dlat = radius / 111_320
    dlon = radius / (111_320 * abs(__import__('math').cos(__import__('math').radians(lat))))

    resp = requests.get('https://api.netatmo.com/api/getpublicdata', params={
        'lat_ne': lat + dlat,
        'lon_ne': lon + dlon,
        'lat_sw': lat - dlat,
        'lon_sw': lon - dlon,
        'required_data': 'temperature',
        'filter': True,
    }, headers={'Authorization': f'Bearer {token}'})
    resp.raise_for_status()

    stations = []
    for device in resp.json().get('body', []):
        place = device.get('place', {}).get('location', [0, 0])
        measures = device.get('measures', {})
        # Walk through each module's latest data
        for _mod_id, mod in measures.items():
            res = mod.get('res', {})
            if not res:
                continue
            latest = list(res.values())[0]  # most recent reading
            types = mod.get('type', [])
            temp = latest[types.index('temperature')] if 'temperature' in types else None
            hum  = latest[types.index('humidity')]    if 'humidity' in types else None
            if temp is not None:
                from math import radians, cos, sin, asin, sqrt
                # Haversine
                R = 6371000
                la1, lo1, la2, lo2 = map(radians, [lat, lon, place[1], place[0]])
                a = sin((la2-la1)/2)**2 + cos(la1)*cos(la2)*sin((lo2-lo1)/2)**2
                d = R * 2 * asin(sqrt(a))
                stations.append({
                    'lat': place[1],
                    'lon': place[0],
                    'temperature': temp,
                    'humidity': hum,
                    'distance_m': round(d),
                })

    stations.sort(key=lambda s: s['distance_m'])
    return jsonify(stations=stations[:10])


# ────────────────────────────────────────────
# COPERNICUS / Sentinel-2 — tree-cover / NDVI
# Docs: https://documentation.dataspace.copernicus.eu/
# ────────────────────────────────────────────

_copernicus_token = None
_copernicus_token_expires = 0


def _copernicus_auth():
    """Get an OAuth2 token for the Copernicus Data Space."""
    global _copernicus_token, _copernicus_token_expires

    if _copernicus_token and time.time() < _copernicus_token_expires - 60:
        return _copernicus_token

    client_id = os.environ.get('COPERNICUS_CLIENT_ID')
    client_secret = os.environ.get('COPERNICUS_CLIENT_SECRET')

    if not client_id or not client_secret:
        raise RuntimeError(
            'COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET must be set.'
        )

    resp = requests.post(
        'https://identity.dataspace.copernicus.eu/auth/realms/'
        'CDSE/protocol/openid-connect/token',
        data={
            'grant_type': 'client_credentials',
            'client_id': client_id,
            'client_secret': client_secret,
        }
    )
    resp.raise_for_status()
    data = resp.json()

    _copernicus_token = data['access_token']
    _copernicus_token_expires = time.time() + data.get('expires_in', 600)
    return _copernicus_token


@api_bp.route('/api/shade')
def shade():
    """Estimate canopy/shade for a park from Sentinel-2 NDVI (Statistical API)."""
    try:
        lat = float(request.args['lat'])
        lon = float(request.args['lon'])
    except (KeyError, ValueError):
        return jsonify(error='lat and lon are required'), 400
    try:
        from ndvi_shade import compute_shade
        score, ndvi_mean = compute_shade(lat, lon)
        if score is None:
            return jsonify(error='NDVI unavailable', shade_score=None), 200
        return jsonify(ndvi_mean=ndvi_mean, shade_score=score)
    except Exception as e:
        return jsonify(error=str(e), shade_score=None), 500

# ────────────────────────────────────────────
# PARKS — serve the shared park metadata file
# (single source of truth for every front-end page)
# ────────────────────────────────────────────
@api_bp.route('/api/parks')
def parks():
    """Return the park metadata (data/parks.json) merged with the OSM cache."""
    try:
        from park_data import load_parks
        return jsonify(load_parks(merged=True))
    except Exception as e:
        return jsonify(error=f'could not load parks: {e}'), 500

# ────────────────────────────────────────────
# POIs — nearby points of interest, cached on disk
# Built once (server-side, with a proper User-Agent so no 406) and then
# served instantly. The browser filters by distance/category, so the
# distance slider is immediate and a larger radius reliably shows MORE.
# ────────────────────────────────────────────
import json as _json2
import os as _os
import threading
import time as _time

_POIS_CACHE_PATH = _os.path.join('data', 'park_pois.json')
_POIS_MAX_AGE = 7 * 24 * 3600          # rebuild if older than a week
_pois_lock = threading.Lock()
_pois_building = {'state': False}


def _pois_fresh():
    try:
        age = _time.time() - _os.path.getmtime(_POIS_CACHE_PATH)
        with open(_POIS_CACHE_PATH, 'r', encoding='utf-8') as f:
            data = _json2.load(f)
        if data and age < _POIS_MAX_AGE:
            return data
    except (FileNotFoundError, _json2.JSONDecodeError, OSError):
        pass
    return None


def _build_pois():
    from park_data import load_parks
    from osm_pois import build_all
    parks = load_parks(merged=True)
    data = build_all(parks)
    total = sum(len(v) for cats in data.values() for v in cats.values())
    if total == 0:
        # Build produced nothing (Overpass unreachable?) — don't cache an empty
        # result; let it retry on a later request.
        return data, False
    try:
        _os.makedirs('data', exist_ok=True)
        with open(_POIS_CACHE_PATH, 'w', encoding='utf-8') as f:
            _json2.dump(data, f, ensure_ascii=False)
    except OSError as e:
        print(f'[pois] could not write cache: {e}')
    return data, True


@api_bp.route('/api/pois')
def pois():
    """Serve cached POIs; build them on first request if missing/stale."""
    cached = _pois_fresh()
    if cached is not None:
        return jsonify(ready=True, pois=cached)

    # No fresh cache. Build once, guarded by a lock so concurrent page loads
    # don't all trigger a build. While a build runs, tell the client to fall
    # back to its own live fetch for this session.
    if _pois_lock.acquire(blocking=False):
        try:
            data, ok = _build_pois()
            return jsonify(ready=ok, pois=(data if ok else {}))
        except Exception as e:
            return jsonify(ready=False, error=str(e), pois={}), 200
        finally:
            _pois_lock.release()
    else:
        return jsonify(ready=False, building=True, pois={}), 200
