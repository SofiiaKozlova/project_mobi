"""
park_scoring.py — turn real OSM numbers into the 1-10 condition scores
──────────────────────────────────────────────────────────────────────
Used in one place (when serving /api/parks) so the front-end radar,
ranking and compare table all stay consistent with the raw facts.
"""

import math


def bench_score(count):
    """Bench count → 1-10. ~54+ benches reaches 10; 30 ≈ 6; 12 ≈ 3."""
    if count is None:
        return None
    return max(1, min(10, round(1 + count / 6)))


def size_score(area_ha):
    """
    Park area (hectares) → 1-10 on a log scale, so a 1 ha garden and a
    1000 ha forest both land on a sensible spread instead of everything
    large maxing out.
        1 ha ≈ 2 · 13.5 ha ≈ 5 · 48 ha ≈ 6 · 1000 ha ≈ 10
    """
    if not area_ha or area_ha <= 0:
        return None
    return max(1, min(10, round(1 + 3 * math.log10(area_ha + 1))))
