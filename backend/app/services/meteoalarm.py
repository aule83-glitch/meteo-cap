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
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-czechia",
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
        "name": "Litwa (LHMS)",
        "flag": "🇱🇹",
        "url": "https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-lithuania",
    },
    # Poniższe feedy nie są częścią MeteoAlarm/EUMETNET.
    # Dane z serwisów rosyjskich i białoruskich — traktujemy poglądowo,
    # bez gwarancji kompletności i aktualności. Wyświetlane z oznaczeniem ⚠.
    "RU_KGD": {
        "name": "Rosja — obw. kaliningradzki (Roshydromet)",
        "flag": "🇷🇺",
        "url": "https://meteoinfo.ru/hmc-output/cap/cap-feed/en/atom.xml",
        "area_filter": ["Kaliningrad"],
        "political_caution": True,   # oznacz w UI jako dane nieweryfikowane
        "feed_format": "summary_text",  # parser z summary zamiast CAP embedded
    },
    "BY": {
        "name": "Białoruś (Belgidromet)",
        "flag": "🇧🇾",
        "url": "https://meteoalert.meteoinfo.ru/belarus/cap-feed/en/atom.xml",
        "political_caution": True,
        "feed_format": "by_atom_with_cap",  # atom z linkami do pełnych CAP-ów BY
    },
}

# Mapowanie awareness_type MeteoAlarm → nasze zjawisko
# Priorytet: event (nowy format MeteoAlarm 2026) przed awareness_type (stary)
# Default: "inne_zagrożenie" (był "silny_wiatr" — zmieniono w v2.4.4)
AWARENESS_TYPE_MAP = {
    "wind":             "silny_wiatr",
    "gale":             "silny_wiatr",
    "storm":            "silny_wiatr",
    "snow-ice":         "intensywne_opady_sniegu",
    "snow":             "intensywne_opady_sniegu",
    "ice":              "oblodzenie",
    "icing":            "oblodzenie",
    "thunderstorm":     "burze",
    "thunderstorms":    "burze",
    "fog":              "gesta_mgla",
    "visibility":       "gesta_mgla",
    "high-temperature": "upal",
    "heat":             "upal",
    "low-temperature":  "silny_mroz",
    "frost":            "przymrozki",
    "coastal-event":    "silny_wiatr",
    "forest-fire":      "pozar_lasu",
    "fire":             "pozar_lasu",
    "avalanche":        "intensywne_opady_sniegu",
    "rain":             "intensywne_opady_deszczu",
    "flooding":         "roztopy",
    "rain-flooding":    "intensywne_opady_deszczu",
    "hail":             "grad",
}

SEVERITY_LEVEL_MAP = {
    "Minor":    1,
    "Moderate": 1,  # MeteoAlarm żółty = nasz stopień 1
    "Severe":   2,  # MeteoAlarm pomarańczowy = nasz stopień 2
    "Extreme":  3,  # MeteoAlarm czerwony = nasz stopień 3
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

    # Feedy BY i RU mają format summary_text (nie embedded CAP)
    # Format summary: "Affected areas: Region\nPhenomenon (level X of 3)"
    if country_info.get("feed_format") == "summary_text":
        return _parse_summary_text_feed(root, ns, country_code, country_info)

    # WMO GMAS RSS feed — <cap:event>, <cap:severity>, <cap:areaDesc> w każdym <item>
    if country_info.get("feed_format") == "wmo_rss":
        return _parse_wmo_rss_feed(root, country_code, country_info)

    # BY atom z meteoalert.meteoinfo.ru — pobiera pełne CAP-y po linku
    if country_info.get("feed_format") == "by_atom_with_cap":
        return _parse_by_atom_with_cap_fetch(root, ns, country_code, country_info)

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


def _parse_by_atom_with_cap_fetch(root, ns: dict, country_code: str, country_info: dict) -> list:
    """
    Parsuje atom feed BY (meteoalert.meteoinfo.ru/belarus/cap-feed) i dla każdej notatki
    pobiera pełny CAP XML po linku, wyciąga <polygon>.
    
    Każde entry ma:
      <link rel="related" type="application/cap+xml" href="..."/>  — link do pełnego CAP
      <title> — nazwa zjawiska
      <summary> — "Affected areas: Region\\nPhenomenon (level X of 3)"
    """
    import re
    from concurrent.futures import ThreadPoolExecutor
    import xml.etree.ElementTree as ET
    import urllib.request
    import sys
    
    # Mapowanie tytułów → nasze zjawisko
    BY_EVENT_MAP = {
        "thunderstorms":         "burze",
        "wind":                  "silny_wiatr",
        "rain":                  "intensywne_opady_deszczu",
        "high temperature":      "upal",
        "fog":                   "gesta_mgla",
        "flood":                 "wezbranie_z_opadow",
        "freezing rain, icing":  "oblodzenie",
        "snow":                  "intensywne_opady_sniegu",
        "low temperature":       "silny_mroz",
        "snowstorm":             "zawieje_zamiecie",
    }
    
    cap_ns = "urn:oasis:names:tc:emergency:cap:1.2"
    
    # 1) Wyciągnij entries z atom
    entries = root.findall('atom:entry', ns) or root.findall('entry')
    if not entries:
        return []
    
    # 2) Zbierz dane podstawowe + linki do CAP-ów
    items = []
    for entry in entries:
        try:
            # ElementTree element bez dzieci jest "falsy" — nie używamy `or` tylko jawne sprawdzenie
            title_el = entry.find('atom:title', ns)
            if title_el is None: title_el = entry.find('title')
            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            
            summary_el = entry.find('atom:summary', ns)
            if summary_el is None: summary_el = entry.find('summary')
            summary = summary_el.text.strip() if summary_el is not None and summary_el.text else ""
            
            # Link do pełnego CAP (rel="related" type="application/cap+xml")
            cap_url = None
            link_els = entry.findall('atom:link', ns)
            if not link_els: link_els = entry.findall('link')
            for link_el in link_els:
                rel = link_el.get('rel', '')
                typ = link_el.get('type', '')
                if rel == 'related' and 'cap' in typ:
                    cap_url = link_el.get('href')
                    break
                if rel == 'alternate' and not cap_url:
                    cap_url = link_el.get('href')
            
            id_el = entry.find('atom:id', ns)
            if id_el is None: id_el = entry.find('id')
            entry_id = id_el.text.strip() if id_el is not None and id_el.text else ""
            
            updated_el = entry.find('atom:updated', ns)
            if updated_el is None: updated_el = entry.find('updated')
            updated = updated_el.text.strip() if updated_el is not None and updated_el.text else ""
            
            # Wyciągnij area_desc i level z summary
            area_desc = ""
            level = 1
            m_area = re.search(r"Affected areas:\s*(.+?)(?:\n|$)", summary)
            if m_area:
                area_desc = m_area.group(1).strip()
            m_level = re.search(r"level\s+(\d+)", summary, re.IGNORECASE)
            if m_level:
                level = int(m_level.group(1))
            
            items.append({
                'title': title, 'summary': summary, 'cap_url': cap_url,
                'id': entry_id, 'updated': updated,
                'area_desc': area_desc, 'level': level,
            })
        except Exception:
            continue
    
    # 3) Pobierz CAP-y równolegle (max 8 wątków, timeout 5s każdy)
    def fetch_cap(url):
        if not url:
            return None
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'MeteoCAP/2.4'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                return resp.read()
        except Exception as e:
            print(f"[MA-BY] CAP fetch failed for {url}: {e}", file=sys.stderr)
            return None
    
    with ThreadPoolExecutor(max_workers=8) as ex:
        cap_bytes_list = list(ex.map(fetch_cap, [it['cap_url'] for it in items]))
    
    # 4) Dla każdego CAP wyciąg poligon
    results = []
    for it, cap_bytes in zip(items, cap_bytes_list):
        polygon = None
        if cap_bytes:
            try:
                cap_root = ET.fromstring(cap_bytes)
                # <area><polygon>lat,lon lat,lon ...</polygon></area>
                poly_el = cap_root.find(f'.//{{{cap_ns}}}polygon')
                if poly_el is None: poly_el = cap_root.find('.//polygon')
                if poly_el is not None and poly_el.text:
                    coords = []
                    for pair in poly_el.text.strip().split():
                        parts = pair.split(',')
                        if len(parts) >= 2:
                            try:
                                lat = float(parts[0]); lon = float(parts[1])
                                coords.append([lon, lat])
                            except ValueError:
                                pass
                    if len(coords) >= 3:
                        polygon = coords
            except Exception as e:
                print(f"[MA-BY] CAP parse failed: {e}", file=sys.stderr)
        
        phenomenon = BY_EVENT_MAP.get(it['title'].lower(), "inne_zagrożenie")
        
        results.append({
            "id":                 f"BY-{it['id'][-50:]}" if it['id'] else f"BY-{it['title']}-{it['area_desc']}",
            "country":            country_code,
            "country_name":       country_info.get("name", country_code),
            "country_flag":       country_info.get("flag", ""),
            "phenomenon":         phenomenon,
            "event":              it['title'],
            "headline":           f"{it['title']} — {it['area_desc']}",
            "area_desc":          it['area_desc'],
            "onset":              it['updated'],
            "expires":            "",
            "level":              it['level'],
            "status":             "active",
            "polygon":            polygon,         # ← KLUCZOWE: poligon z pełnego CAP
            "geocode_geometries": [],
            "political_caution":  country_info.get("political_caution", False),
            "source_note":        f"Dane: Belgidromet (CAP via meteoinfo.ru)",
        })
    
    n_with_poly = sum(1 for r in results if r['polygon'])
    import sys
    print(f"[MA-BY] {len(results)} ostrzeżeń, {n_with_poly} z poligonem", file=sys.stderr)
    
    return results


def _parse_wmo_rss_feed(root, country_code: str, country_info: dict) -> list:
    """
    Parsuje RSS z WMO GMAS (severeweather.wmo.int).
    Każdy <item> ma:
      <title>          — nazwa zjawiska (EN)
      <cap:event>      — nazwa zjawiska CAP
      <cap:severity>   — Moderate / Severe / Extreme
      <cap:areaDesc>   — nazwa regionu
      <cap:expires>    — data wygaśnięcia
      <pubDate>        — data wydania
      <guid>           — identyfikator
      <link>           — URL do pełnego CAP XML
    """
    # Mapowanie WMO event → nasze zjawisko
    WMO_EVENT_MAP = {
        "wind":                "silny_wiatr",
        "thunderstorms":       "burze",
        "rain":                "intensywne_opady_deszczu",
        "high temperature":    "upal",
        "fog":                 "gesta_mgla",
        "flood":               "wezbranie_z_opadow",
        "freezing rain, icing":"oblodzenie",
        "other dangers":       "inne_zagrożenie",
        "snow":                "intensywne_opady_sniegu",
        "low temperature":     "silny_mroz",
    }

    SEVERITY_MAP = {
        "minor":    1,
        "moderate": 2,
        "severe":   3,
        "extreme":  3,
    }

    ns_cap = "urn:oasis:names:tc:emergency:cap:1.1"
    results = []

    items = root.findall('.//item')
    if not items:
        return []

    now = datetime.now(timezone.utc)

    for item in items:
        try:
            # <cap:event> — nazwa zjawiska
            event_el = item.find(f'{{{ns_cap}}}event')
            event = event_el.text.strip() if event_el is not None and event_el.text else ""

            # <cap:severity>
            sev_el = item.find(f'{{{ns_cap}}}severity')
            severity_str = sev_el.text.strip().lower() if sev_el is not None and sev_el.text else "moderate"

            # <cap:areaDesc>
            area_el = item.find(f'{{{ns_cap}}}areaDesc')
            area_desc = area_el.text.strip() if area_el is not None and area_el.text else ""

            # <cap:expires>
            exp_el = item.find(f'{{{ns_cap}}}expires')
            expires_str = exp_el.text.strip() if exp_el is not None and exp_el.text else ""

            # Filtruj wygasłe
            if expires_str:
                try:
                    from email.utils import parsedate_to_datetime
                    exp_dt = parsedate_to_datetime(expires_str)
                    if exp_dt < now:
                        continue
                except Exception:
                    pass

            # <pubDate>
            pub_el = item.find('pubDate')
            pub_date = pub_el.text.strip() if pub_el is not None and pub_el.text else ""

            # <guid>
            guid_el = item.find('guid')
            guid = guid_el.text.strip() if guid_el is not None and guid_el.text else ""

            # <link> do pełnego CAP
            link_el = item.find('link')
            cap_link = link_el.text.strip() if link_el is not None and link_el.text else ""

            # Mapuj zjawisko
            phenomenon = WMO_EVENT_MAP.get(event.lower(), "inne_zagrożenie")
            level = SEVERITY_MAP.get(severity_str, 2)

            results.append({
                "id":                 f"WMO-BY-{guid[:48]}" if guid else f"WMO-BY-{event}-{area_desc}",
                "country":            country_code,
                "country_name":       country_info.get("name", country_code),
                "country_flag":       country_info.get("flag", ""),
                "phenomenon":         phenomenon,
                "event":              event,
                "headline":           f"{event} — {area_desc}",
                "area_desc":          area_desc,
                "onset":              pub_date,
                "expires":            expires_str,
                "level":              level,
                "status":             "active",
                "polygon":            None,
                "geocode_geometries": [],
                "political_caution":  country_info.get("political_caution", False),
                "source_note":       f"Dane: Belgidromet via WMO GMAS (CAP 1.1)",
                "cap_link":          cap_link,
            })
        except Exception:
            continue

    return results


def _parse_summary_text_feed(root, ns: dict, country_code: str, country_info: dict) -> list:
    """
    Parser dla feedów BY/RU — wyciąga dane z summary text zamiast embedded CAP.
    Format summary: "Affected areas: Region Name\\nPhenomenon (level X of 3)"
    Zwraca markery bez geometrii (obszar = tekst).
    """
    import re as _re

    entries = root.findall('atom:entry', ns) or root.findall('entry')
    results = []

    PHENOMENON_EN_MAP = {
        "thunderstorms": "burze", "wind": "silny_wiatr", "rain": "intensywne_opady_deszczu",
        "high temperature": "upal", "heat": "upal", "snow": "intensywne_opady_sniegu",
        "ice": "oblodzenie", "freezing rain": "opady_marzniece", "fog": "gesta_mgla",
        "flood": "intensywne_opady_deszczu", "blizzard": "zawieje_zamiecie",
        "frost": "przymrozki", "cold": "silny_mroz",
    }

    for entry in entries:
        def ft(tag):
            el = entry.find(f'atom:{tag}', ns)
            if el is None: el = entry.find(tag)
            return el.text.strip() if el is not None and el.text else ""

        title = ft('title')
        summary = ft('summary')
        entry_id = ft('id')
        updated = ft('updated')

        # Pomiń Cancel
        if title.lower() == 'cancel' or 'cancel reference' in summary.lower():
            continue

        # Parsuj summary: "Affected areas: Brest Region\nThunderstorms (level 2 of 3)"
        area_desc = ""
        phenomenon_en = title.lower()
        level = 1

        if summary:
            area_match = _re.search(r'(?:Affected areas?:\s*)(.+?)(?:\n|$)', summary, _re.IGNORECASE)
            if area_match:
                area_desc = area_match.group(1).strip()
            level_match = _re.search(r'level\s+(\d)', summary, _re.IGNORECASE)
            if level_match:
                level = int(level_match.group(1))

        if not area_desc:
            area_desc = title

        phenomenon = PHENOMENON_EN_MAP.get(phenomenon_en, "silny_wiatr")

        results.append({
            "id":                 entry_id or f"{country_code}_{updated}_{area_desc}",
            "country":            country_code,
            "country_name":       country_info.get("name", country_code),
            "country_flag":       country_info.get("flag", ""),
            "phenomenon":         phenomenon,
            "headline":           f"{title} — {area_desc}",
            "area_desc":          area_desc,
            "onset":              updated,
            "expires":            "",
            "level":              level,
            "status":             "active",
            "polygon":            None,
            "geocode_geometries": [],
            "political_caution":  country_info.get("political_caution", False),
            "source_note":        f"Dane: {country_info.get('name', country_code)} (poza MeteoAlarm/EUMETNET)",
        })

    return results


def _parse_entry(entry, ns: dict, country_code: str, country_info: dict) -> Optional[dict]:
    """Parsuje jeden wpis Atom/CAP i zwraca ujednolicony dict.

    Obsługuje dwa formaty MeteoAlarm:
      Stary: <entry> → <cap:area> → <cap:geocode>
      Nowy (2026, CZ/DE/LT): <cap:geocode> bezpośrednio w <entry> bez <cap:area>

    find_text sprawdza też atom namespace — wymagane od MeteoAlarm 2026, gdzie
    dzieci <cap:geocode> dziedziczą default xmlns Atom feedu.
    """

    def find_text(el, *tags):
        """Szuka tekstu z fallbackiem na cap:, atom: i pełne namespaces."""
        for tag in tags:
            for ns_prefix in ['cap:', 'atom:', '']:
                found = el.find(f'{ns_prefix}{tag}', ns)
                if found is not None and found.text:
                    return found.text.strip()
            for full_ns in [
                '{urn:oasis:names:tc:emergency:cap:1.2}',
                '{http://www.w3.org/2005/Atom}',
            ]:
                found = el.find(f'{full_ns}{tag}')
                if found is not None and found.text:
                    return found.text.strip()
        return None

    # Podstawowe pola CAP/Atom
    identifier = find_text(entry, 'identifier', 'id')
    event      = find_text(entry, 'event')
    onset      = find_text(entry, 'onset', 'effective')
    expires    = find_text(entry, 'expires')
    severity   = find_text(entry, 'severity')
    sent       = find_text(entry, 'sent', 'published', 'updated')   # do rozstrzygania wersji
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

    # --- Polygon + EMMA_ID geocodes ---
    # Obsługujemy oba formaty:
    #   stary: <cap:area> zawiera <cap:polygon> i <cap:geocode>
    #   nowy (CZ/DE/LT 2026): <cap:geocode> bezpośrednio w <entry>, brak <cap:area>
    # UA: brak geocode w ogóle — <cap:polygon> bezpośrednio w <entry>
    polygon = None
    emma_codes = []

    # Budujemy listę korzeni do przeszukania geocode (stary + nowy format)
    geocode_search_roots = []
    area = entry.find('cap:area', ns)
    if area is None:
        area = entry.find('{urn:oasis:names:tc:emergency:cap:1.2}area')

    if area is not None:
        geocode_search_roots.append(area)
        # Polygon ze starego formatu (w <cap:area>)
        poly_el = area.find('cap:polygon', ns)
        if poly_el is None:
            poly_el = area.find('{urn:oasis:names:tc:emergency:cap:1.2}polygon')
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

    # Nowy format 2026: geocodes bezpośrednio w entry (CZ, DE, LT)
    geocode_search_roots.append(entry)

    # UA (i inne): polygon bezpośrednio w entry (brak geocode w UA)
    if polygon is None:
        poly_el = entry.find('cap:polygon', ns)
        if poly_el is None:
            poly_el = entry.find('{urn:oasis:names:tc:emergency:cap:1.2}polygon')
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

    # Zbierz kody EMMA_ID ze wszystkich korzeni (dedup po id() elementu)
    seen_geocodes: set = set()
    for search_root in geocode_search_roots:
        for geocode_el in search_root.findall('cap:geocode', ns):
            if id(geocode_el) in seen_geocodes:
                continue
            seen_geocodes.add(id(geocode_el))
            vn = find_text(geocode_el, 'valueName')
            vv = find_text(geocode_el, 'value')
            if vn == 'EMMA_ID' and vv and vv not in emma_codes:
                emma_codes.append(vv)

    # Dołącz geometrię z lookupowego pliku dla wszystkich krajów (PL, DE, CZ, SK, LT)
    # Działa gdy feed nie zawiera poligonu, ale ma kody EMMA_ID w <geocode>
    geocode_geometries = []
    unresolved_codes = []
    if emma_codes:
        for code in emma_codes:
            entry_data = _GEOCODES_PL.get(code)  # exact match
            if not entry_data:
                # Prefix match fallback: feed mogą wysłać skrócony kod (CZ010)
                # a lookup ma dłuższy (CZ01001..CZ01099)
                # Szukamy: lookup_key.startswith(feed_code)
                matches = [k for k in _GEOCODES_PL if k.startswith(code)]
                if matches:
                    for m in matches:
                        md = _GEOCODES_PL[m]
                        if md and md.get('g'):
                            geocode_geometries.append({
                                'code': m,
                                'name': md.get('n', m),
                                'geometry': md['g'],
                            })
                else:
                    unresolved_codes.append(code)
                continue
            if entry_data and entry_data.get('g'):
                geocode_geometries.append({
                    'code': code,
                    'name': entry_data.get('n', code),
                    'geometry': entry_data['g'],
                })
            else:
                unresolved_codes.append(code)
    
    # Diagnostyka — pomaga debugować brak konturów
    import sys
    if emma_codes:
        n_resolved = len(geocode_geometries)
        n_total = len(emma_codes)
        if n_resolved < n_total or country_code in ['DE','CZ','SK','LT','UA','BY','RU_KGD']:
            print(f"[MA] {country_code} entry: {n_total} EMMA codes → {n_resolved} resolved, "
                  f"unresolved: {unresolved_codes[:5]}{'...' if len(unresolved_codes)>5 else ''}",
                  file=sys.stderr)

    # Odfiltruj "null alerts" (CHMI wysyła potwierdzenia braku zagrożeń)
    if severity and severity.lower() in ('unknown', 'minor') and \
       certainty and certainty.lower() in ('unlikely', 'unknown'):
        return None

    # Wyznacz level
    # MeteoAlarm awareness_level: "2; yellow; Moderate" → 1, "3; orange; Severe" → 2, "4; red; Extreme" → 3
    level = 1
    if awareness_level:
        parts = awareness_level.split(';')
        if parts:
            try:
                lvl_num = int(parts[0].strip())
                # MA skala: 1=brak, 2=żółty, 3=pomarańczowy, 4=czerwony → nasze 1/2/3
                level = max(1, min(3, lvl_num - 1))
            except ValueError:
                pass
    elif severity:
        level = SEVERITY_LEVEL_MAP.get(severity, 1)

    # Wyznacz phenomenon
    # Priorytet: event (nowy format MeteoAlarm 2026) → awareness_type (stary) → default
    phenomenon = "inne_zagrożenie"  # domyślny (zmieniono z "silny_wiatr" w v2.4.4)
    matched = False
    if event:
        ev_lower = event.lower()
        for key, val in AWARENESS_TYPE_MAP.items():
            if key.replace('-', ' ') in ev_lower or key in ev_lower:
                phenomenon = val
                matched = True
                break
    if not matched and awareness_type:
        for key, val in AWARENESS_TYPE_MAP.items():
            if key in awareness_type.lower():
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
        "sent":        sent or "",
        "polygon":     polygon,
        "emma_codes":  emma_codes,                  # kody EMMA_ID z <geocode>
        "geocode_geometries": geocode_geometries,   # geometrie z pliku lookup (PL)
        "counties":    [],  # MeteoAlarm nie ma TERYT
    }


def _parse_dt(v):
    """Czas z feedu → datetime UTC (albo None)."""
    if not v:
        return None
    try:
        dt = datetime.fromisoformat(str(v).replace("Z", "+00:00"))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _dedupe_versions(warnings: list) -> list:
    """MeteoAlarm publikuje kolejne WERSJE ostrzeżenia jako osobne wpisy.
    Serwisy aktualizujące często (DWD) przy każdej wersji PRZESUWAJĄ okno,
    więc porównanie okien na równość nie wystarcza — do niedawna dla jednego
    powiatu wisiało obok siebie kilka wariantów tego samego ostrzeżenia
    (np. burze St.2 14:00–20:00 i burze St.2 18:00–23:00).

    Zasada: w obrębie (kraj, region, zjawisko) wpis jest odrzucany, jeśli jego
    okno NACHODZI na okno wcześniej przyjętego, nowszego wpisu.
    Okna rozłączne zostają — to sekwencja, nie duplikat.
    """
    def sent_key(w):
        dt = _parse_dt(w.get("sent"))
        return dt.timestamp() if dt else 0.0

    # najświeższe najpierw — one mają pierwszeństwo
    ordered = sorted(warnings, key=lambda w: (sent_key(w), w.get("level", 0)), reverse=True)
    accepted = []
    for w in ordered:
        regions = tuple(sorted(w.get("emma_codes") or [])) or (w.get("area_desc", ""),)
        key = (w.get("country"), regions, w.get("phenomenon"))
        wo, we = _parse_dt(w.get("onset")), _parse_dt(w.get("expires"))
        clash = False
        for a in accepted:
            a_regions = tuple(sorted(a.get("emma_codes") or [])) or (a.get("area_desc", ""),)
            if (a.get("country"), a_regions, a.get("phenomenon")) != key:
                continue
            ao, ae = _parse_dt(a.get("onset")), _parse_dt(a.get("expires"))
            # brak dat po którejkolwiek stronie → traktuj jak ten sam byt
            if wo is None or we is None or ao is None or ae is None:
                clash = True
                break
            if wo < ae and ao < we:      # nachodzą w czasie
                clash = True
                break
        if not clash:
            accepted.append(w)

    # przywróć porządek chronologiczny (czytelniejszy w liście)
    accepted.sort(key=lambda w: (str(w.get("onset") or ""), -(w.get("level") or 0)))
    return accepted


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

        # Filtruj po area_filter jeśli zdefiniowany (np. Rosja → tylko Kaliningrad)
        area_filter = feed_info.get("area_filter")
        if area_filter:
            warnings = [
                w for w in warnings
                if any(f.lower() in (w.get("area_desc") or "").lower() for f in area_filter)
            ]

        warnings = _dedupe_versions(warnings)

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
