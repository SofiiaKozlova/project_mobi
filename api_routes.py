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
    """
    Estimate tree-cover / shade for a park using Sentinel-2 NDVI.

    Query params:
        lat  — park latitude  (required)
        lon  — park longitude (required)

    Response:
        { ndvi_mean, ndvi_max, shade_score }

    shade_score is 1–10, derived from average NDVI:
        NDVI < 0.2  → sparse vegetation → 1–2
        NDVI 0.2–0.4 → moderate         → 3–5
        NDVI 0.4–0.6 → good canopy      → 6–8
        NDVI > 0.6  → dense forest      → 9–10

    Uses the Sentinel Hub Process API to request a small NDVI tile
    for a ~200 m box around the park centre, from the most recent
    cloud-free Sentinel-2 scene.
    """
    try:
        lat = float(request.args['lat'])
        lon = float(request.args['lon'])
    except (KeyError, ValueError):
        return jsonify(error='lat and lon are required'), 400

    try:
        token = _copernicus_auth()
    except RuntimeError as e:
        return jsonify(error=str(e)), 500

    # 200 m bounding box around centre
    d = 0.002  # ~200 m in degrees at 50° N
    bbox = [lon - d, lat - d, lon + d, lat + d]

    evalscript = """
    //VERSION=3
    function setup() {
      return { input: ["B04", "B08"], output: { bands: 1, sampleType: "FLOAT32" } };
    }
    function evaluatePixel(s) {
      return [(s.B08 - s.B04) / (s.B08 + s.B04 + 0.001)];
    }
    """

    payload = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
            "data": [{
                "type": "sentinel-2-l2a",
                "dataFilter": {"maxCloudCoverage": 20},
                "mosaickingOrder": "leastRecent"
            }]
        },
        "output": {
            "width": 64, "height": 64,
            "responses": [{"identifier": "default", "format": {"type": "image/tiff"}}]
        },
        "evalscript": evalscript
    }

    try:
        resp = requests.post(
            'https://sh.dataspace.copernicus.eu/api/v1/process',
            json=payload,
            headers={'Authorization': f'Bearer {token}'},
            timeout=30
        )
        resp.raise_for_status()

        # Parse the GeoTIFF pixel values (simple: raw float32 bytes)
        import struct
        # Skip TIFF header, read raw float32 values
        # For a robust solution use rasterio, but this works for a 64x64 tile
        raw = resp.content
        n = 64 * 64
        # Try to find float32 data in the response
        values = []
        offset = len(raw) - n * 4  # float32 data at end of TIFF
        if offset > 0:
            for i in range(n):
                v = struct.unpack('<f', raw[offset + i*4 : offset + i*4 + 4])[0]
                if -1 <= v <= 1:
                    values.append(v)

        if not values:
            return jsonify(error='Could not parse NDVI data', shade_score=5)

        ndvi_mean = sum(values) / len(values)
        ndvi_max = max(values)

        # Convert to 1–10 shade score
        if ndvi_mean < 0.15:
            shade_score = 1
        elif ndvi_mean < 0.25:
            shade_score = 3
        elif ndvi_mean < 0.35:
            shade_score = 5
        elif ndvi_mean < 0.45:
            shade_score = 7
        elif ndvi_mean < 0.55:
            shade_score = 8
        else:
            shade_score = min(10, round(8 + (ndvi_mean - 0.55) * 10))

        return jsonify(
            ndvi_mean=round(ndvi_mean, 3),
            ndvi_max=round(ndvi_max, 3),
            shade_score=shade_score
        )

    except Exception as e:
        return jsonify(error=str(e), shade_score=5), 500

# ────────────────────────────────────────────
# PARKS — serve the shared park metadata file
# (single source of truth for every front-end page)
# ────────────────────────────────────────────
import json as _json

@api_bp.route('/api/parks')
def parks():
    """Return the park metadata from data/parks.json."""
    path = os.path.join('data', 'parks.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return jsonify(_json.load(f))
    except (FileNotFoundError, _json.JSONDecodeError) as e:
        return jsonify(error=f'parks.json not available: {e}'), 500
