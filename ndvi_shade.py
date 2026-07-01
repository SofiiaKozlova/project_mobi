"""
ndvi_shade.py — estimate canopy/shade from Sentinel-2 NDVI (Copernicus)
────────────────────────────────────────────────────────────────────────
This is the right data source for Shade: OpenStreetMap rarely maps the
individual trees inside an ornamental park (so the OSM tree-count heuristic
scored the tree-filled Hain as 1/10), whereas satellite NDVI measures actual
green canopy directly.

We use Sentinel Hub's **Statistical API**, which returns aggregated NDVI as
JSON — no fragile GeoTIFF byte-parsing. We look at peak summer (leaf-on) so
deciduous canopy counts.

compute_shade(lat, lon) → (score 1-10, ndvi_mean) or (None, None) on failure.
Requires COPERNICUS_CLIENT_ID / COPERNICUS_CLIENT_SECRET in the environment.
"""

import os
import time
from datetime import date

import requests

_token = None
_token_expires = 0

AUTH_URL = ("https://identity.dataspace.copernicus.eu/auth/realms/"
            "CDSE/protocol/openid-connect/token")
STATS_URL = "https://sh.dataspace.copernicus.eu/api/v1/statistics"

_EVALSCRIPT = """//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B04", "B08", "dataMask"] }],
    output: [
      { id: "ndvi", bands: 1, sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(s) {
  let ndvi = (s.B08 - s.B04) / (s.B08 + s.B04 + 0.0001);
  return { ndvi: [ndvi], dataMask: [s.dataMask] };
}
"""


def auth():
    """OAuth2 client-credentials token for the Copernicus Data Space."""
    global _token, _token_expires
    if _token and time.time() < _token_expires - 60:
        return _token
    cid = os.environ.get("COPERNICUS_CLIENT_ID")
    secret = os.environ.get("COPERNICUS_CLIENT_SECRET")
    if not cid or not secret:
        raise RuntimeError("COPERNICUS_CLIENT_ID and COPERNICUS_CLIENT_SECRET must be set.")
    resp = requests.post(AUTH_URL, data={
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": secret,
    }, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    _token = data["access_token"]
    _token_expires = time.time() + data.get("expires_in", 600)
    return _token


def _summer_range():
    """Most recent full leaf-on summer (previous year to be safe)."""
    y = date.today().year - 1
    return f"{y}-06-01T00:00:00Z", f"{y}-09-15T23:59:59Z"


def ndvi_to_score(ndvi_mean):
    if ndvi_mean is None:
        return None
    if ndvi_mean < 0.15:
        return 1
    if ndvi_mean < 0.25:
        return 3
    if ndvi_mean < 0.35:
        return 5
    if ndvi_mean < 0.45:
        return 7
    if ndvi_mean < 0.55:
        return 8
    return min(10, round(8 + (ndvi_mean - 0.55) * 10))


def compute_shade(lat, lon, box_deg=0.0015):
    """
    NDVI-based shade score for a ~150 m box around (lat, lon).
    Returns (score, ndvi_mean) or (None, None) on any failure.
    """
    try:
        token = auth()
    except Exception as e:
        print(f"    NDVI auth failed: {e}")
        return None, None

    frm, to = _summer_range()
    bbox = [lon - box_deg, lat - box_deg, lon + box_deg, lat + box_deg]
    payload = {
        "input": {
            "bounds": {"bbox": bbox, "properties": {"crs": "http://www.opengis.net/def/crs/EPSG/0/4326"}},
            "data": [{"type": "sentinel-2-l2a", "dataFilter": {"maxCloudCoverage": 30}}],
        },
        "aggregation": {
            "timeRange": {"from": frm, "to": to},
            "aggregationInterval": {"of": "P30D"},
            "resx": 10, "resy": 10,
            "evalscript": _EVALSCRIPT,
        },
    }
    try:
        resp = requests.post(STATS_URL, json=payload,
                             headers={"Authorization": f"Bearer {token}"}, timeout=40)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"    NDVI request failed: {e}")
        return None, None

    means = []
    for interval in data.get("data", []):
        try:
            stats = interval["outputs"]["ndvi"]["bands"]["B0"]["stats"]
            if stats.get("sampleCount", 0) - stats.get("noDataCount", 0) > 0:
                m = stats.get("mean")
                if m is not None and -1 <= m <= 1:
                    means.append(m)
        except (KeyError, TypeError):
            continue

    if not means:
        return None, None
    # Peak leaf-on canopy = the greenest cloud-free month in the window.
    ndvi_mean = max(means)
    return ndvi_to_score(ndvi_mean), round(ndvi_mean, 3)
