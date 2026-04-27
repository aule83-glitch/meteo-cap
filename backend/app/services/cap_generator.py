"""
CAP 1.2 generator — zgodny z formatem IMGW-PIB.

Różnice względem pierwszej wersji (na podstawie analizy przykładów):
- Dwa bloki <info>: pl-PL i en-GB
- Jeden alert = jeden powiat (pętla w wywołującym kodzie)
  LUB jeden alert = wiele powiatów (tryb zbiorczy) — zależy od trybu
- responseType = None (jak IMGW)
- awareness_level i awareness_type wg METEOALARM
- identifier w formacie OID: 2.49.0.0.616.0.PL.{timestamp}{id}
- description generowany z szablonu + parametrów zjawiska
- instruction z pliku konfiguracyjnego warning_texts.py
- EMMA_ID jako geocode (+ TERYT jako dodatkowy)
- polygon w <area> (zgodnie ze standardem CAP 1.2)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString

from app.data.warning_texts import (
    WARNING_CONFIG, AWARENESS_LEVEL_MAP,
    SEVERITY_MAP, URGENCY_MAP, COLOR_MAP, COLOR_PL, COLOR_EN
)

# OID prefix IMGW-PIB (zarejestrowany w WMO)
OID_PREFIX = "2.49.0.0.616.0.PL"


def _fmt_params(template: str, params: dict) -> str:
    """Interpoluj szablon tekstowy parametrami meteorologicznymi."""
    if not template:
        return ""
    safe = {k: (str(v) if v is not None else "—") for k, v in params.items()}

    # Pomocnicze stringi do interpolacji
    gust = params.get("gust_kmh", 0)
    avg  = params.get("avg_kmh", 0)
    wdir = params.get("wind_dir", "")
    hail = params.get("hail", False)

    safe["wind_dir_str"]    = f" z kierunku {wdir}" if wdir else ""
    safe["wind_dir_str_en"] = f" from {wdir}" if wdir else ""
    safe["hail_str"]        = " i gradem" if hail else ""
    safe["hail_str_en"]     = " and hail" if hail else ""

    try:
        return template.format(**safe)
    except (KeyError, ValueError):
        return template


def generate_cap_xml(warning: dict) -> str:
    """
    Generuj plik CAP 1.2 XML.

    Tryby:
    - per_county=True  → jeden alert per powiat (lista alertów)
    - per_county=False → jeden alert dla całego obszaru (zbiorczy)

    Zwraca: string XML (pojedynczy alert, zbiorczy lub dla pierwszego powiatu).
    Użyj generate_cap_xml_per_county() dla trybu indywidualnego.
    """
    return _build_cap_xml(warning, counties_override=None)


def generate_cap_xml_per_county(warning: dict) -> List[str]:
    """Generuj osobny CAP XML dla każdego powiatu — zgodnie z formatem IMGW."""
    counties = warning.get("counties", [])
    if not counties:
        return [_build_cap_xml(warning, counties_override=[])]
    return [
        _build_cap_xml(warning, counties_override=[county])
        for county in counties
    ]


def _build_cap_xml(warning: dict, counties_override=None) -> str:
    now      = datetime.now(timezone.utc)
    sent_str = now.strftime("%Y-%m-%dT%H:%M:%S+00:00")

    phenomenon = warning.get("phenomenon", "silny_wiatr")
    level      = warning.get("level", 1)
    params     = warning.get("params", {})
    counties   = counties_override if counties_override is not None else warning.get("counties", [])
    polygon    = warning.get("polygon", [])

    onset   = warning.get("onset", sent_str)
    expires = warning.get("expires",
        (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S+00:00"))

    # Dane z konfiguracji
    cfg         = WARNING_CONFIG.get(phenomenon, {})
    level_cfg   = cfg.get("levels", {}).get(level, {})
    atype       = cfg.get("awareness_type", "0; unknown")
    event_pl    = cfg.get("event_pl", phenomenon.replace("_", " "))
    event_en    = cfg.get("event_en", phenomenon.replace("_", " "))
    color_pl    = COLOR_PL.get(level, "Żółty")
    color_en    = COLOR_EN.get(level, "Yellow")

    # Opisy z szablonów
    desc_pl  = _fmt_params(level_cfg.get("description_pl", ""), params)
    desc_en  = _fmt_params(level_cfg.get("description_en", ""), params)
    instr_pl = _fmt_params(level_cfg.get("instruction_pl", ""), params)
    instr_en = _fmt_params(level_cfg.get("instruction_en", ""), params)

    # Fallback jeśli użytkownik podał własny opis
    if warning.get("description"):
        desc_pl = warning["description"]
    if warning.get("instruction"):
        instr_pl = warning["instruction"]

    # Identyfikator w formacie OID IMGW
    ts  = now.strftime("%Y%m%d%H%M%S")
    uid = warning.get("id", str(uuid.uuid4()))[:8].upper()
    emma_ids = [c.get("emma_id") or _teryt_to_emma(c.get("id", "")) for c in counties]
    area_suffix = emma_ids[0] if emma_ids else uid

    identifier = f"{OID_PREFIX}.{ts}{uid}.{area_suffix}"

    # Obszar — opis słowny
    if counties:
        voiv_groups: dict = {}
        for c in counties:
            v = c.get("voiv_name", "")
            voiv_groups.setdefault(v, []).append(c.get("name", ""))
        parts_pl, parts_en = [], []
        for v, names in sorted(voiv_groups.items()):
            parts_pl.append(f"województwo {v.lower()} " + ", ".join(f"powiat {n.lower()}" for n in sorted(names)))
            parts_en.append(f"{v} Province " + ", ".join(sorted(names)))
        area_desc_pl = "; ".join(parts_pl)
        area_desc_en = "; ".join(parts_en)
    else:
        area_desc_pl = "Polska"
        area_desc_en = "Poland"

    headline_pl = warning.get("headline") or \
        f"{color_pl} {event_pl} dla Polski - {area_desc_pl}"
    headline_en = f"{color_en} {event_en} for Poland - {area_desc_en}"

    severity = SEVERITY_MAP.get(level, "Minor")
    urgency  = URGENCY_MAP.get(level, "Expected")
    awareness_level = AWARENESS_LEVEL_MAP.get(level, "2; yellow; Moderate")

    # XML
    alert = Element("alert")
    alert.set("xmlns", "urn:oasis:names:tc:emergency:cap:1.2")

    _sub(alert, "identifier", identifier)
    _sub(alert, "sender", "https://www.imgw.pl")
    _sub(alert, "sent", sent_str)
    _sub(alert, "status", "Actual")
    _sub(alert, "msgType", "Alert")
    _sub(alert, "scope", "Public")

    # --- INFO pl-PL ---
    info_pl = SubElement(alert, "info")
    _sub(info_pl, "language", "pl-PL")
    _sub(info_pl, "category", "Met")
    _sub(info_pl, "event", f"{color_pl} {event_pl}")
    _sub(info_pl, "responseType", "None")
    _sub(info_pl, "urgency", urgency)
    _sub(info_pl, "severity", severity)
    _sub(info_pl, "certainty", "Likely")
    _sub(info_pl, "effective", sent_str)
    _sub(info_pl, "onset", onset)
    _sub(info_pl, "expires", expires)
    _sub(info_pl, "senderName",
         "IMGW-PIB Centralne Biuro Prognoz Meteorologicznych w Warszawie")
    _sub(info_pl, "headline", headline_pl)
    _sub(info_pl, "description", desc_pl)
    _sub(info_pl, "instruction", instr_pl)
    _sub(info_pl, "web", "https://meteo.imgw.pl/dyn/?osmet=true")
    _sub(info_pl, "contact", "synoptyk.kraju@imgw.pl")

    _param(info_pl, "awareness_level", awareness_level)
    _param(info_pl, "awareness_type", atype)

    _build_area(info_pl, area_desc_pl, counties, polygon, emma_ids)

    # --- INFO en-GB ---
    info_en = SubElement(alert, "info")
    _sub(info_en, "language", "en-GB")
    _sub(info_en, "category", "Met")
    _sub(info_en, "event", f"{color_en} {event_en}")
    _sub(info_en, "responseType", "None")
    _sub(info_en, "urgency", urgency)
    _sub(info_en, "severity", severity)
    _sub(info_en, "certainty", "Likely")
    _sub(info_en, "effective", sent_str)
    _sub(info_en, "onset", onset)
    _sub(info_en, "expires", expires)
    _sub(info_en, "senderName",
         "IMGW-PIB, Meteorological Forecast Centre, Warszawa")
    _sub(info_en, "headline", headline_en)
    _sub(info_en, "description", desc_en)
    _sub(info_en, "instruction", instr_en)
    _sub(info_en, "web", "https://meteo.imgw.pl/dyn/?osmet=true")
    _sub(info_en, "contact", "synoptyk.kraju@imgw.pl")

    _param(info_en, "awareness_level", awareness_level)
    _param(info_en, "awareness_type", atype)

    _build_area(info_en, area_desc_en, counties, polygon, emma_ids)

    raw = tostring(alert, encoding="unicode")
    return parseString(raw).toprettyxml(indent="  ", encoding=None)


def _build_area(info: Element, area_desc: str, counties: list,
                polygon: list, emma_ids: list) -> None:
    area = SubElement(info, "area")
    _sub(area, "areaDesc", area_desc)

    # Polygon (jeśli dostępny)
    if polygon and len(polygon) >= 3:
        poly_str = " ".join(f"{lat},{lon}" for lat, lon in polygon)
        _sub(area, "polygon", poly_str)

    # EMMA_ID (primary, jak IMGW)
    for eid in emma_ids:
        if eid:
            gc = SubElement(area, "geocode")
            _sub(gc, "valueName", "EMMA_ID")
            _sub(gc, "value", eid)

    # TERYT (secondary)
    for c in counties:
        teryt = c.get("id", "")
        if teryt:
            gc = SubElement(area, "geocode")
            _sub(gc, "valueName", "TERYT")
            _sub(gc, "value", teryt)


def _teryt_to_emma(teryt: str) -> str:
    """Konwertuj kod TERYT powiatu na EMMA_ID (format PL + 4 cyfry)."""
    if not teryt or len(teryt) < 4:
        return ""
    return f"PL{teryt[:4]}"


def _sub(parent: Element, tag: str, text: str) -> Element:
    el = SubElement(parent, tag)
    el.text = text or ""
    return el


def _param(parent: Element, name: str, value: str) -> None:
    p = SubElement(parent, "parameter")
    _sub(p, "valueName", name)
    _sub(p, "value", value)
