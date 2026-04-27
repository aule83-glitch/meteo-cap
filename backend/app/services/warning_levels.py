"""
Logic for determining meteorological warning levels based on IMGW-PIB criteria.
"""
from typing import Optional


def determine_warning_level(phenomenon: str, params: dict) -> Optional[int]:
    """
    Returns warning level (1, 2, 3) or None if criteria not met.
    """
    fn = LEVEL_FUNCTIONS.get(phenomenon)
    if fn:
        return fn(params)
    return None


def level_burze(p: dict) -> Optional[int]:
    rain = p.get("rain_mm", 0)
    gust = p.get("gust_kmh", 0)
    hail = p.get("hail", False)

    if rain > 55 or gust >= 115:
        return 3
    if (35 < rain <= 55) or (85 < gust < 115):
        return 2
    if (20 <= rain <= 35) or (70 <= gust <= 85) or hail:
        return 1
    return None


def level_intensywne_opady_deszczu(p: dict) -> Optional[int]:
    rain = p.get("rain_mm", 0)
    hours = p.get("hours", 24)

    if hours <= 24 and rain >= 90:
        return 3
    if hours <= 24 and 60 <= rain < 90:
        return 2
    if (hours <= 12 and 30 <= rain < 40) or (hours <= 24 and 40 <= rain < 60):
        return 1
    return None


def level_intensywne_opady_sniegu(p: dict) -> Optional[int]:
    snow = p.get("snow_cm", 0)
    hours = p.get("hours", 24)
    altitude = p.get("altitude_m", 0)
    high = altitude >= 600

    if hours <= 24:
        if high and snow > 50:
            return 3
        if not high and snow > 30:
            return 3
        if high and 20 < snow <= 50:
            return 2
        if not high and 20 < snow <= 30:
            return 2
    if (hours <= 12 and 10 <= snow < 15) or (hours <= 24 and 15 <= snow <= 20):
        return 1
    return None


def level_mgla_szadz(p: dict) -> Optional[int]:
    vis = p.get("visibility_m", 9999)
    hours = p.get("hours", 0)
    if vis <= 200 and hours >= 8:
        return 1
    return None


def level_oblodzenie(p: dict) -> Optional[int]:
    if p.get("icing", False):
        return 1
    return None


def level_opady_marzniece(p: dict) -> Optional[int]:
    intensity = p.get("intensity", "slabe")  # slabe / umiarkowane_silne
    hours = p.get("hours", 0)

    if intensity == "umiarkowane_silne" and hours > 12:
        return 3
    if (intensity == "umiarkowane_silne" and hours <= 12) or \
       (intensity == "slabe" and hours > 12):
        return 2
    if intensity == "slabe" and hours <= 12:
        return 1
    return None


def level_opady_sniegu(p: dict) -> Optional[int]:
    snow = p.get("snow_cm", 0)
    hours = p.get("hours", 24)

    if (hours <= 12 and 5 <= snow < 10) or (hours <= 24 and 10 <= snow < 15):
        return 1
    return None


def level_przymrozki(p: dict) -> Optional[int]:
    tmin = p.get("tmin", 0)
    ts = p.get("ts", 0)
    if tmin < 0 and ts > 0:
        return 1
    return None


def level_roztopy(p: dict) -> Optional[int]:
    ts = p.get("ts", 0)
    rain = p.get("rain_mm", 0)
    snow_depth = p.get("snow_depth_cm", 0)

    if snow_depth < 10:
        return None
    if ts > 1.5 and rain > 20:
        return 3
    if ts > 1.5 and 10 < rain <= 20:
        return 2
    if (ts >= 5 and rain == 0) or (ts >= 1.5 and rain <= 10):
        return 1
    return None


def level_silny_deszcz_z_burzami(p: dict) -> Optional[int]:
    rain = p.get("rain_mm", 0)
    hours = p.get("hours", 24)

    if hours <= 24 and rain >= 90:
        return 3
    if hours <= 24 and 60 <= rain < 90:
        return 2
    if (hours <= 12 and 30 <= rain < 40) or (hours <= 24 and 40 <= rain < 60):
        return 1
    return None


def level_gesta_mgla(p: dict) -> Optional[int]:
    vis = p.get("visibility_m", 9999)
    hours = p.get("hours", 0)
    if vis <= 200 and hours >= 8:
        return 1
    return None


def level_silny_mroz(p: dict) -> Optional[int]:
    tmin = p.get("tmin", 0)
    if tmin <= -30:
        return 3
    if -30 < tmin < -25:
        return 2
    if -25 <= tmin <= -15:
        return 1
    return None


def level_silny_wiatr(p: dict) -> Optional[int]:
    gust = p.get("gust_kmh", 0)
    avg = p.get("avg_kmh", 0)

    if gust >= 115 or avg > 85:
        return 3
    if (85 < gust < 115) or (70 < avg <= 85):
        return 2
    if (70 <= gust <= 85) or (55 <= avg <= 70):
        return 1
    return None


def level_upal(p: dict) -> Optional[int]:
    tmax = p.get("tmax", 0)
    tmin = p.get("tmin_night", 0)
    days = p.get("days", 1)

    if tmax > 34 and days >= 2:
        return 3
    if 30 <= tmax <= 34 and tmin >= 18 and days >= 2:
        return 2
    if tmax >= 30:
        return 1
    return None


def level_zawieje(p: dict) -> Optional[int]:
    avg = p.get("avg_kmh", 0)
    gust = p.get("gust_kmh", 0)

    if avg > 40 or gust > 70:
        return 2
    if (29 <= avg <= 40) or (55 <= gust <= 70):
        return 1
    return None


LEVEL_FUNCTIONS = {
    "burze": level_burze,
    "intensywne_opady_deszczu": level_intensywne_opady_deszczu,
    "intensywne_opady_sniegu": level_intensywne_opady_sniegu,
    "mgla_szadz": level_mgla_szadz,
    "oblodzenie": level_oblodzenie,
    "opady_marzniece": level_opady_marzniece,
    "opady_sniegu": level_opady_sniegu,
    "przymrozki": level_przymrozki,
    "roztopy": level_roztopy,
    "silny_deszcz_z_burzami": level_silny_deszcz_z_burzami,
    "gesta_mgla": level_gesta_mgla,
    "silny_mroz": level_silny_mroz,
    "silny_wiatr": level_silny_wiatr,
    "upal": level_upal,
    "zawieje_zamiecie": level_zawieje,
}

PHENOMENON_LABELS = {
    "burze": "Burze",
    "intensywne_opady_deszczu": "Intensywne opady deszczu",
    "intensywne_opady_sniegu": "Intensywne opady śniegu",
    "mgla_szadz": "Mgła intensywnie osadzająca szadź",
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
    "zawieje_zamiecie": "Zawieje / zamiecie śnieżne",
}

MAX_LEVELS = {
    "burze": 3,
    "intensywne_opady_deszczu": 3,
    "intensywne_opady_sniegu": 3,
    "mgla_szadz": 1,
    "oblodzenie": 1,
    "opady_marzniece": 3,
    "opady_sniegu": 1,
    "przymrozki": 1,
    "roztopy": 3,
    "silny_deszcz_z_burzami": 3,
    "gesta_mgla": 1,
    "silny_mroz": 3,
    "silny_wiatr": 3,
    "upal": 3,
    "zawieje_zamiecie": 2,
}
