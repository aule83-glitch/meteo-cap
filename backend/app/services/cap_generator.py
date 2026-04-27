"""
CAP 1.2 generator — zgodny z formatem IMGW-PIB.
Obsługuje msgType: Alert, Update, Cancel.
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

OID_PREFIX = "2.49.0.0.616.0.PL"


def _fmt_params(template: str, params: dict) -> str:
    if not template:
        return ""
    safe = {k: (str(v) if v is not None else "—") for k, v in params.items()}
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
    return _build_cap_xml(warning, counties_override=None)


def generate_cap_xml_per_county(warning: dict) -> List[str]:
    counties = warning.get("counties", [])
    if not counties:
        return [_build_cap_xml(warning, counties_override=[])]
    return [
        _build_cap_xml(warning, counties_override=[c])
        for c in counties
    ]


def _build_cap_xml(warning: dict, counties_override=None) -> str:
    now      = datetime.now(timezone.utc)
    sent_str = now.strftime("%Y-%m-%dT%H:%M:%S+00:00")

    phenomenon  = warning.get("phenomenon", "silny_wiatr")
    level       = warning.get("level", 1)
    params      = warning.get("params", {})
    counties    = counties_override if counties_override is not None else warning.get("counties", [])
    polygon     = warning.get("polygon", [])
    msg_type    = warning.get("msg_type", "Alert")   # Alert | Update | Cancel
    ref_id      = warning.get("references_id")        # ID ostrzeżenia źródłowego

    onset   = warning.get("onset", sent_str)
    expires = warning.get("expires",
        (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S+00:00"))

    cfg        = WARNING_CONFIG.get(phenomenon, {})
    level_cfg  = cfg.get("levels", {}).get(level, {})
    atype      = cfg.get("awareness_type", "0; unknown")
    event_pl   = cfg.get("event_pl", phenomenon.replace("_", " "))
    event_en   = cfg.get("event_en", phenomenon.replace("_", " "))
    color_pl   = COLOR_PL.get(level, "Żółty")
    color_en   = COLOR_EN.get(level, "Yellow")

    desc_pl  = _fmt_params(level_cfg.get("description_pl", ""), params)
    desc_en  = _fmt_params(level_cfg.get("description_en", ""), params)
    instr_pl = _fmt_params(level_cfg.get("instruction_pl", ""), params)
    instr_en = _fmt_params(level_cfg.get("instruction_en", ""), params)

    if warning.get("description"):
        desc_pl = warning["description"]
    if warning.get("instruction"):
        instr_pl = warning["instruction"]

    # Dla Update/Cancel — opisy mogą być puste
    if msg_type == "Cancel":
        desc_pl  = "Ostrzeżenie meteorologiczne zostało anulowane."
        desc_en  = "The meteorological warning has been cancelled."
        instr_pl = ""
        instr_en = ""

    ts  = now.strftime("%Y%m%d%H%M%S")
    uid = warning.get("id", str(uuid.uuid4()))[:8].upper()
    emma_ids = [_teryt_to_emma(c.get("id", "")) for c in counties]
    area_suffix = emma_ids[0] if emma_ids else uid
    identifier = f"{OID_PREFIX}.{ts}{uid}.{area_suffix}"

    # Obszar — opis
    if counties:
        voiv_groups: dict = {}
        for c in counties:
            v = c.get("voiv_name", "")
            voiv_groups.setdefault(v, []).append(c.get("name", ""))
        parts_pl = []
        parts_en = []
        for v, names in sorted(voiv_groups.items()):
            parts_pl.append(f"woj. {v.lower()}: " + ", ".join(sorted(names)))
            parts_en.append(f"{v} Province: " + ", ".join(sorted(names)))
        area_desc_pl = "; ".join(parts_pl)
        area_desc_en = "; ".join(parts_en)
    else:
        area_desc_pl = "Polska"
        area_desc_en = "Poland"

    if msg_type == "Cancel":
        headline_pl = f"Anulowanie — {color_pl} {event_pl}"
        headline_en = f"Cancellation — {color_en} {event_en}"
    elif msg_type == "Update":
        headline_pl = f"Aktualizacja — {color_pl} {event_pl} dla {area_desc_pl}"
        headline_en = f"Update — {color_en} {event_en} for {area_desc_en}"
    else:
        headline_pl = warning.get("headline") or f"{color_pl} {event_pl} dla {area_desc_pl}"
        headline_en = f"{color_en} {event_en} for {area_desc_en}"

    severity = SEVERITY_MAP.get(level, "Minor")
    urgency  = URGENCY_MAP.get(level, "Expected")
    awareness_level = AWARENESS_LEVEL_MAP.get(level, "2; yellow; Moderate")

    # Buduj references string jeśli to Update/Cancel
    references_str = ""
    if msg_type in ("Update", "Cancel") and ref_id:
        ref_uid = ref_id[:8].upper()
        ref_ts  = now.strftime("%Y%m%d%H%M%S")
        ref_identifier = f"{OID_PREFIX}.{ref_ts}{ref_uid}.{area_suffix}"
        references_str = f"https://www.imgw.pl,{ref_identifier},{sent_str}"

    # XML
    alert = Element("alert")
    alert.set("xmlns", "urn:oasis:names:tc:emergency:cap:1.2")

    _sub(alert, "identifier", identifier)
    _sub(alert, "sender", "https://www.imgw.pl")
    _sub(alert, "sent", sent_str)
    _sub(alert, "status", "Actual")
    _sub(alert, "msgType", msg_type)
    _sub(alert, "scope", "Public")
    if references_str:
        _sub(alert, "references", references_str)

    def build_info(lang: str, event: str, desc: str, instr: str,
                   sender_name: str, headline: str, area_desc: str) -> None:
        info = SubElement(alert, "info")
        _sub(info, "language", lang)
        _sub(info, "category", "Met")
        _sub(info, "event", event)
        _sub(info, "responseType", "None")
        _sub(info, "urgency", urgency)
        _sub(info, "severity", severity)
        _sub(info, "certainty", "Likely")
        _sub(info, "effective", sent_str)
        _sub(info, "onset", onset)
        _sub(info, "expires", expires)
        _sub(info, "senderName", sender_name)
        _sub(info, "headline", headline)
        _sub(info, "description", desc)
        _sub(info, "instruction", instr)
        _sub(info, "web", "https://meteo.imgw.pl/dyn/?osmet=true")
        _sub(info, "contact", "synoptyk.kraju@imgw.pl")
        _param(info, "awareness_level", awareness_level)
        _param(info, "awareness_type", atype)
        _build_area(info, area_desc, counties, polygon, emma_ids)

    build_info(
        "pl-PL",
        f"{color_pl} {event_pl}",
        desc_pl, instr_pl,
        "IMGW-PIB Centralne Biuro Prognoz Meteorologicznych w Warszawie",
        headline_pl, area_desc_pl
    )
    build_info(
        "en-GB",
        f"{color_en} {event_en}",
        desc_en, instr_en,
        "IMGW-PIB, Meteorological Forecast Centre, Warszawa",
        headline_en, area_desc_en
    )

    raw = tostring(alert, encoding="unicode")
    return parseString(raw).toprettyxml(indent="  ", encoding=None)


def _build_area(info, area_desc, counties, polygon, emma_ids):
    """
    Buduje bloki <area> zgodnie ze standardem CAP 1.2.
    Jeden <area> per województwo z listą powiatów.
    """
    if not counties:
        # Brak powiatów — jeden ogólny area
        area = SubElement(info, "area")
        _sub(area, "areaDesc", area_desc)
        if polygon and len(polygon) >= 3:
            poly_str = " ".join(f"{lat},{lon}" for lat, lon in polygon)
            _sub(area, "polygon", poly_str)
        return

    # Grupuj powiaty per województwo
    voiv_groups: dict = {}
    for c in counties:
        vid = c.get("voiv_id", "00")
        vname = c.get("voiv_name", "")
        voiv_groups.setdefault(vid, {"name": vname, "counties": []})
        voiv_groups[vid]["counties"].append(c)

    for vid, vdata in sorted(voiv_groups.items()):
        area = SubElement(info, "area")
        county_names = ", ".join(
            c.get("name", "") for c in sorted(vdata["counties"], key=lambda x: x.get("name",""))
        )
        _sub(area, "areaDesc", f"województwo {vdata['name'].lower()}: {county_names}")

        # Polygon dla całego ostrzeżenia (tylko w pierwszym area)
        if polygon and len(polygon) >= 3 and vid == sorted(voiv_groups.keys())[0]:
            poly_str = " ".join(f"{lat},{lon}" for lat, lon in polygon)
            _sub(area, "polygon", poly_str)

        # EMMA_ID + TERYT per powiat
        for c in vdata["counties"]:
            teryt = c.get("id", "")
            eid = _teryt_to_emma(teryt)
            if eid:
                gc = SubElement(area, "geocode")
                _sub(gc, "valueName", "EMMA_ID")
                _sub(gc, "value", eid)
            if teryt:
                gc = SubElement(area, "geocode")
                _sub(gc, "valueName", "TERYT")
                _sub(gc, "value", teryt)


def _teryt_to_emma(teryt: str) -> str:
    if not teryt or len(teryt) < 4:
        return ""
    return f"PL{teryt[:4]}"


def _sub(parent, tag, text):
    el = SubElement(parent, tag)
    el.text = text or ""
    return el


def _param(parent, name, value):
    p = SubElement(parent, "parameter")
    _sub(p, "valueName", name)
    _sub(p, "value", value)
