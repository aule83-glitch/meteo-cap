"""
Integracja z MeteoAlarm — pobieranie ostrzeżeń krajów ościennych.
Obsługuje format Atom Feed (legacy) z feeds.meteoalarm.org.
Cache 10 minut — nie zamula backendu przy każdym requestcie.

FIX: Geokody MeteoAlarm (EMMA_ID) z pełnymi poligonami (385 PL + sąsiedzi).
"""

import urllib.request
import xml.etree.ElementTree as ET
import json
import time
import os
import threading
from datetime import datetime, timezone
from typing import Optional

# ---- Lookup geokodów PL (backend) -----------------------------------------------
# Używany do dołączania geometrii gdy feed MeteoAlarm nie zawiera poligonu
_GEOCODES_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "meteoalarm_geocodes_pl.json")
_GEOCODES_PL: dict = {}

def _load_geocodes():
    global _GEOCODES_PL
    try:
        with open(_GEOCODES_PATH, encoding="utf-8") as f:
            _GEOCODES_PL = json.load(f)
    except Exception as e:
        _GEOCODES_PL = {}

_load_geocodes()

# Dostępne kraje (feeds.meteoalarm.org)
METEOALARM_FEEDS = {
    "DE": {
        "name": "Niemcy (DWD)",
        "flag": "🇩🇪",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-germany",
    },
    "CZ": {
        "name": "Czechy (CHMI)",
        "flag": "🇨🇿",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-czech-republic",
    },
    "SK": {
        "name": "Słowacja (SHMU)",
        "flag": "🇸🇰",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia",
    },
    "UA": {
        "name": "Ukraina",
        "flag": "🇺🇦",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-ukraine",
    },
    "LT": {
        "name": "Litwa (LHMT)",
        "flag": "🇱🇹",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania",
    },
    "BY": {
        "name": "Białoruś",
        "flag": "🇧🇾",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-belarus",
    },
}

# Mapowanie awareness_type MeteoAlarm → nasze zjawisko
AWARENESS_TYPE_MAP = {
    "wind":          "silny_wiatr",
    "snow-ice":      "intensywne_opady_sniegu",
    "thunderstorm":  "burze",
    "fog":           "gesta_mgla",
    "high-temperature": "upal",
    "low-temperature":  "silny_mroz",
    "coastal-event": "silny_wiatr",
    "forest-fire":   "upal",
    "avalanche":     "intensywne_opady_sniegu",
    "rain":          "intensywne_opady_deszczu",
    "flooding":      "roztopy",
    "rain-flooding": "intensywne_opady_deszczu",
}

SEVERITY_LEVEL_MAP = {
    "Minor":    1,
    "Moderate": 2,
    "Severe":   2,
    "Extreme":  3,
}

# ---- Cache ----
_cache: dict = {}         # country_code → {data, timestamp}
_cache_lock = threading.Lock()
CACHE_TTL = 600           # 10 minut


def _parse_atom_feed(xml_bytes: bytes, country_code: str) -> list:
    """
    Parsuje Atom Feed MeteoAlarm. Zwraca listę ujednoliconych ostrzeżeń.
    Obsługuje zarówno surowy CAP jak i MeteoAlarm Atom wrapper.
    """
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    ns = {
        'atom': 'http://www.w3.org/2005/Atom',
        'cap':  'urn:oasis:names:tc:emergency:cap:1.2',
        'ha':   'http://www.alerting.net/namespace/index_1.0',
    }

    warnings = []
    country_info = METEOALARM_FEEDS.get(country_code, {})

    # Sprawdź czy to Atom feed czy bezpośredni CAP
    entries = root.findall('atom:entry', ns) or root.findall('entry')
    if not entries:
        # Może to bezpośredni CAP (jak CHMI)
        entries = root.findall('{urn:oasis:names:tc:emergency:cap:1.2}info') or []

    for entry in entries:
        try:
            w = _parse_entry(entry, ns, country_code, country_info)
            if w:
                warnings.append(w)
        except Exception:
            continue

    return warnings


def _parse_entry(entry, ns: dict, country_code: str, country_info: dict) -> Optional[dict]:
    """Parsuje jeden wpis Atom/CAP i zwraca ujednolicony dict."""

    def find_text(el, *tags):
        for tag in tags:
            for ns_prefix in ['cap:', '']:
                found = el.find(f'{ns_prefix}{tag}', ns)
                if found is None:
                    found = el.find(f'{{urn:oasis:names:tc:emergency:cap:1.2}}{tag}')
                if found is not None and found.text:
                    return found.text.strip()
        return None

    # Podstawowe pola CAP/Atom
    identifier = find_text(entry, 'identifier', 'id')
    event      = find_text(entry, 'event')
    onset      = find_text(entry, 'onset', 'effective')
    expires    = find_text(entry, 'expires')
    severity   = find_text(entry, 'severity')
    urgency    = find_text(entry, 'urgency')
    certainty  = find_text(entry, 'certainty')
    headline   = find_text(entry, 'headline', 'title')
    area_desc  = find_text(entry, 'areaDesc')

    # awareness_type i awareness_level z parameters
    awareness_type  = None
    awareness_level = None
    for param in entry.findall('cap:parameter', ns) or \
                 entry.findall('{urn:oasis:names:tc:emergency:cap:1.2}parameter'):
        vn = find_text(param, 'valueName')
        vv = find_text(param, 'value')
        if vn == 'awareness_type':
            awareness_type = vv
        elif vn == 'awareness_level':
            awareness_level = vv

    # Polygon z area + geocodes EMMA_ID
    polygon = None
    emma_codes = []
    area = entry.find('cap:area', ns) or \
           entry.find('{urn:oasis:names:tc:emergency:cap:1.2}area')
    if area is not None:
        poly_el = area.find('cap:polygon', ns) or \
                  area.find('{urn:oasis:names:tc:emergency:cap:1.2}polygon')
        if poly_el is not None and poly_el.text:
            try:
                coords = []
                for pair in poly_el.text.strip().split():
                    parts = pair.split(',')
                    if len(parts) >= 2:
                        coords.append([float(parts[1]), float(parts[0])])  # lon, lat
                if len(coords) >= 3:
                    polygon = coords
            except ValueError:
                pass

        # Wyciągnij kody EMMA_ID z <geocode>
        for geocode_el in (
            area.findall('cap:geocode', ns) or
            area.findall('{urn:oasis:names:tc:emergency:cap:1.2}geocode')
        ):
            vn = find_text(geocode_el, 'valueName')
            vv = find_text(geocode_el, 'value')
            if vn == 'EMMA_ID' and vv:
                emma_codes.append(vv)

    # Dołącz geometrię z lookupowego pliku dla wszystkich krajów (PL, DE, CZ, SK, LT)
    # Działa gdy feed nie zawiera poligonu, ale ma kody EMMA_ID w <geocode>
    geocode_geometries = []
    if emma_codes:
        for code in emma_codes:
            entry_data = _GEOCODES_PL.get(code)  # lookup zawiera już wszystkie kraje
            if entry_data and entry_data.get('g'):
                geocode_geometries.append({
                    'code': code,
                    'name': entry_data.get('n', code),
                    'geometry': entry_data['g'],
                })

    # Odfiltruj "null alerts" (CHMI wysyła potwierdzenia braku zagrożeń)
    if severity and severity.lower() in ('unknown', 'minor') and \
       certainty and certainty.lower() in ('unlikely', 'unknown'):
        return None

    # Wyznacz level
    level = 1
    if awareness_level:
        # Format: "3; orange; Severe" lub "4; red; Extreme"
        parts = awareness_level.split(';')
        if parts:
            try:
                lvl_num = int(parts[0].strip())
                level = max(1, lvl_num - 1)  # MeteoAlarm: 2=żółty, 3=pomarańczowy, 4=czerwony
            except ValueError:
                pass
    elif severity:
        level = SEVERITY_LEVEL_MAP.get(severity, 1)

    # Wyznacz phenomenon
    phenomenon = "silny_wiatr"  # domyślny
    if awareness_type:
        for key, val in AWARENESS_TYPE_MAP.items():
            if key in awareness_type.lower():
                phenomenon = val
                break
    elif event:
        ev_lower = event.lower()
        for key, val in AWARENESS_TYPE_MAP.items():
            if key.replace('-', ' ') in ev_lower or key in ev_lower:
                phenomenon = val
                break

    # Sprawdź czas — pomiń wygasłe
    now = datetime.now(timezone.utc)
    try:
        if expires:
            exp_dt = datetime.fromisoformat(expires.replace('Z', '+00:00'))
            if exp_dt < now:
                return None
    except ValueError:
        pass

    return {
        "id":          f"MA-{country_code}-{identifier or 'unknown'}"[:64],
        "country":     country_code,
        "country_name": country_info.get("name", country_code),
        "country_flag": country_info.get("flag", ""),
        "phenomenon":  phenomenon,
        "level":       level,
        "status":      "active",
        "source":      "MeteoAlarm",
        "event":       event or "",
        "headline":    headline or "",
        "area_desc":   area_desc or "",
        "onset":       onset or "",
        "expires":     expires or "",
        "severity":    severity or "",
        "polygon":     polygon,
        "emma_codes":  emma_codes,                  # kody EMMA_ID z <geocode>
        "geocode_geometries": geocode_geometries,   # geometrie z pliku lookup (PL)
        "counties":    [],  # MeteoAlarm nie ma TERYT
    }


def fetch_country_warnings(country_code: str, timeout: int = 8) -> list:
    """
    Pobiera ostrzeżenia dla jednego kraju.
    Używa cache (10 min). Nie rzuca wyjątków — zwraca [] przy błędzie.
    """
    with _cache_lock:
        cached = _cache.get(country_code)
        if cached and (time.time() - cached['ts']) < CACHE_TTL:
            return cached['data']

    feed_info = METEOALARM_FEEDS.get(country_code)
    if not feed_info:
        return []

    try:
        req = urllib.request.Request(
            feed_info['url'],
            headers={'User-Agent': 'MeteoCAP-Editor/1.0 (IMGW-PIB; contact: imgw.pl)'}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            xml_bytes = resp.read()

        warnings = _parse_atom_feed(xml_bytes, country_code)

        with _cache_lock:
            _cache[country_code] = {'data': warnings, 'ts': time.time()}

        return warnings

    except Exception as e:
        # Zwróć stary cache jeśli jest, nawet przeterminowany
        with _cache_lock:
            cached = _cache.get(country_code)
            if cached:
                return cached['data']
        return []


def fetch_all_neighbors(countries: list = None, timeout: int = 8) -> dict:
    """
    Pobiera ostrzeżenia dla wielu krajów równolegle.
    Zwraca {country_code: [warnings]}.
    """
    if countries is None:
        countries = list(METEOALARM_FEEDS.keys())

    import concurrent.futures
    results = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        futures = {
            executor.submit(fetch_country_warnings, cc, timeout): cc
            for cc in countries
        }
        for future in concurrent.futures.as_completed(futures, timeout=timeout + 2):
            cc = futures[future]
            try:
                results[cc] = future.result()
            except Exception:
                results[cc] = []

    return results


def get_cache_status() -> dict:
    """Zwraca status cache dla wszystkich krajów."""
    now = time.time()
    with _cache_lock:
        return {
            cc: {
                "cached": cc in _cache,
                "age_s": int(now - _cache[cc]['ts']) if cc in _cache else None,
                "count": len(_cache[cc]['data']) if cc in _cache else 0,
                "fresh": (now - _cache[cc]['ts']) < CACHE_TTL if cc in _cache else False,
            }
            for cc in METEOALARM_FEEDS
        }


def invalidate_cache(country_code: str = None):
    """Czyści cache. Bez argumentu czyści wszystko."""
    with _cache_lock:
        if country_code:
            _cache.pop(country_code, None)
        else:
            _cache.clear()
