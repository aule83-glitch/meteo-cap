# -*- coding: utf-8 -*-
"""Dane geograficzne Polski — GUGiK PRG, WGS84. Ładowane z plików JSON."""
import json, os

_HERE = os.path.dirname(__file__)

def _load(name):
    with open(os.path.join(_HERE, name), encoding='utf-8') as f:
        return json.load(f)

VOIVODESHIPS_GEOJSON = _load('voivodeships.json')
COUNTIES_GEOJSON     = _load('counties.json')
COUNTIES_DATA        = _load('counties_centroids.json')
