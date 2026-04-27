"""
CAP 1.2 (Common Alerting Protocol) XML generator.
Standard: https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.html
"""
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from xml.etree.ElementTree import Element, SubElement, tostring
from xml.dom.minidom import parseString


PHENOMENON_EVENT_MAP = {
    "burze": "Burza",
    "intensywne_opady_deszczu": "Intensywne opady deszczu",
    "intensywne_opady_sniegu": "Intensywne opady śniegu",
    "mgla_szadz": "Mgła osadzająca szadź",
    "oblodzenie": "Oblodzenie",
    "opady_marzniece": "Opady marznące",
    "opady_sniegu": "Opady śniegu",
    "przymrozki": "Przymrozki",
    "roztopy": "Roztopy",
    "silny_deszcz_z_burzami": "Silny deszcz z burzami",
    "gesta_mgla": "Gęsta mgła",
    "silny_mroz": "Silny mróz",
    "silny_wiatr": "Silny wiatr",
    "upal": "Upał",
    "zawieje_zamiecie": "Zawieje i zamiecie śnieżne",
}

PHENOMENON_CATEGORY_MAP = {
    "burze": "Met",
    "intensywne_opady_deszczu": "Met",
    "intensywne_opady_sniegu": "Met",
    "mgla_szadz": "Met",
    "oblodzenie": "Transport",
    "opady_marzniece": "Met",
    "opady_sniegu": "Met",
    "przymrozki": "Met",
    "roztopy": "Hydro",
    "silny_deszcz_z_burzami": "Met",
    "gesta_mgla": "Met",
    "silny_mroz": "Met",
    "silny_wiatr": "Met",
    "upal": "Met",
    "zawieje_zamiecie": "Met",
}

LEVEL_SEVERITY_MAP = {
    1: "Minor",
    2: "Moderate",
    3: "Extreme",
}

LEVEL_COLOR_MAP = {
    1: "yellow",
    2: "orange",
    3: "red",
}


def generate_cap_xml(warning: dict) -> str:
    """
    Generate CAP 1.2 compliant XML from warning data dict.

    Expected warning dict keys:
    - id: str (warning UUID)
    - phenomenon: str
    - level: int (1-3)
    - params: dict (meteorological parameters)
    - counties: list of dicts with {id, name, voiv_name}
    - polygon: list of [lat, lon] pairs (optional)
    - onset: datetime str ISO
    - expires: datetime str ISO
    - headline: str
    - description: str
    - instruction: str (optional)
    - sender: str
    - sender_name: str
    """
    now = datetime.now(timezone.utc)
    sent = now.strftime("%Y-%m-%dT%H:%M:%S+00:00")
    onset = warning.get("onset", sent)
    expires = warning.get("expires", (now + timedelta(hours=24)).strftime("%Y-%m-%dT%H:%M:%S+00:00"))

    phenomenon = warning.get("phenomenon", "silny_wiatr")
    level = warning.get("level", 1)
    event_name = PHENOMENON_EVENT_MAP.get(phenomenon, phenomenon)
    category = PHENOMENON_CATEGORY_MAP.get(phenomenon, "Met")
    severity = LEVEL_SEVERITY_MAP.get(level, "Minor")
    color = LEVEL_COLOR_MAP.get(level, "yellow")

    alert_id = warning.get("id", str(uuid.uuid4()))
    sender = warning.get("sender", "imgw-pib@meteo.pl")
    sender_name = warning.get("sender_name", "IMGW-PIB Centrum Modelowania Meteorologicznego")

    counties = warning.get("counties", [])
    polygon_coords = warning.get("polygon", [])

    # Build area description
    if counties:
        voiv_groups = {}
        for c in counties:
            v = c.get("voiv_name", "Nieznane")
            voiv_groups.setdefault(v, []).append(c.get("name", ""))
        area_parts = []
        for v, names in sorted(voiv_groups.items()):
            area_parts.append(f"{v}: {', '.join(sorted(names))}")
        area_desc = "; ".join(area_parts)
    else:
        area_desc = "Polska"

    headline = warning.get("headline") or \
        f"Ostrzeżenie meteorologiczne {level}° – {event_name}"
    description = warning.get("description") or \
        f"IMGW-PIB wydaje ostrzeżenie meteorologiczne stopnia {level} " \
        f"przed zjawiskiem: {event_name}. Obszar: {area_desc}."
    instruction = warning.get("instruction", "")

    # Build XML tree
    alert = Element("alert")
    alert.set("xmlns", "urn:oasis:names:tc:emergency:cap:1.2")

    _sub(alert, "identifier", f"PL-IMGW-{alert_id}")
    _sub(alert, "sender", sender)
    _sub(alert, "sent", sent)
    _sub(alert, "status", "Actual")
    _sub(alert, "msgType", "Alert")
    _sub(alert, "scope", "Public")
    _sub(alert, "code", f"IMGW-W{level}-{phenomenon.upper()}")

    info = SubElement(alert, "info")
    _sub(info, "language", "pl-PL")
    _sub(info, "category", category)
    _sub(info, "event", event_name)
    _sub(info, "responseType", "Prepare")
    _sub(info, "urgency", "Future" if level == 1 else "Expected")
    _sub(info, "severity", severity)
    _sub(info, "certainty", "Likely")
    _sub(info, "onset", onset)
    _sub(info, "expires", expires)
    _sub(info, "senderName", sender_name)
    _sub(info, "headline", headline)
    _sub(info, "description", description)
    if instruction:
        _sub(info, "instruction", instruction)
    _sub(info, "web", "https://meteo.imgw.pl/ostrzezenia")
    _sub(info, "contact", "ostrzezenia@imgw.pl")

    # Parameters
    _param(info, "phenomenon", phenomenon)
    _param(info, "warningLevel", str(level))
    _param(info, "warningColor", color)
    _param(info, "senderSystemVersion", "MeteoCAP-Editor-1.0")

    # Add meteorological parameters
    params = warning.get("params", {})
    for k, v in params.items():
        if v is not None and v != "" and v is not False:
            _param(info, f"meteo_{k}", str(v))

    # Area
    area = SubElement(info, "area")
    _sub(area, "areaDesc", area_desc)

    # Polygon
    if polygon_coords and len(polygon_coords) >= 3:
        poly_str = " ".join(f"{lat},{lon}" for lat, lon in polygon_coords)
        _sub(area, "polygon", poly_str)

    # Geocodes per county
    for county in counties:
        geocode = SubElement(area, "geocode")
        _sub(geocode, "valueName", "TERYT")
        _sub(geocode, "value", county.get("id", "0000"))

    # Altitude if provided
    alt_from = warning.get("altitude_from_m")
    alt_to = warning.get("altitude_to_m")
    if alt_from is not None:
        _sub(area, "altitude", str(int(alt_from * 3.28084)))  # CAP uses feet
    if alt_to is not None:
        _sub(area, "ceiling", str(int(alt_to * 3.28084)))

    raw_xml = tostring(alert, encoding="unicode")
    dom = parseString(raw_xml)
    return dom.toprettyxml(indent="  ", encoding=None)


def _sub(parent: Element, tag: str, text: str) -> Element:
    el = SubElement(parent, tag)
    el.text = text
    return el


def _param(parent: Element, name: str, value: str) -> None:
    p = SubElement(parent, "parameter")
    _sub(p, "valueName", name)
    _sub(p, "value", value)
