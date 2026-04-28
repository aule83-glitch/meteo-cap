"""
Generator map SVG do eksportu PNG i PDF.
Rysuje: obrys Polski, siatka województw, ostrzeżenia z labelami, legenda.
Nie wymaga Leaflet ani przeglądarki — działa po stronie backendu.
"""

import json
import os
import math
from typing import List, Optional
from datetime import datetime, timezone

# Granice geograficzne Polski (WGS84)
PL_LON_MIN, PL_LON_MAX = 14.07, 24.15
PL_LAT_MIN, PL_LAT_MAX = 49.00, 54.85

# Kolory stopni ostrzeżeń (IMGW-PIB)
LEVEL_COLORS = {
    1: ("#facc15", "#78600a"),   # żółty: fill, stroke
    2: ("#f97316", "#7c3910"),   # pomarańczowy
    3: ("#ef4444", "#7f1d1d"),   # czerwony
}
LEVEL_LABELS = {1: "Stopień 1 (Żółty)", 2: "Stopień 2 (Pomarańczowy)", 3: "Stopień 3 (Czerwony)"}

PHENOMENON_ICONS = {
    "burze": "⛈", "intensywne_opady_deszczu": "🌧",
    "intensywne_opady_sniegu": "❄", "silny_wiatr": "💨",
    "silny_mroz": "🥶", "upal": "🌡", "opady_marzniece": "🌨",
    "roztopy": "💧", "silny_deszcz_z_burzami": "⛈",
    "zawieje_zamiecie": "🌪", "mgla_szadz": "🌫",
    "gesta_mgla": "🌫", "oblodzenie": "🧊",
    "opady_sniegu": "🌨", "przymrozki": "🌡",
}

PHENOMENON_LABELS = {
    "burze": "Burze", "intensywne_opady_deszczu": "Int. opady deszczu",
    "intensywne_opady_sniegu": "Int. opady śniegu", "silny_wiatr": "Silny wiatr",
    "silny_mroz": "Silny mróz", "upal": "Upał", "opady_marzniece": "Opady marznące",
    "roztopy": "Roztopy", "silny_deszcz_z_burzami": "Deszcz z burzami",
    "zawieje_zamiecie": "Zawieje śnieżne", "mgla_szadz": "Mgła+szadź",
    "gesta_mgla": "Gęsta mgła", "oblodzenie": "Oblodzenie",
    "opady_sniegu": "Opady śniegu", "przymrozki": "Przymrozki",
}


class MapProjection:
    """Prosta rzutnia prostokątna lat/lon → piksele SVG."""

    def __init__(self, width: int, height: int, margin: int = 40):
        self.W = width
        self.H = height
        self.M = margin
        self.map_w = width - 2 * margin
        self.map_h = height - 2 * margin
        # Zachowaj proporcje
        lon_span = PL_LON_MAX - PL_LON_MIN
        lat_span = PL_LAT_MAX - PL_LAT_MIN
        scale_x = self.map_w / lon_span
        scale_y = self.map_h / lat_span
        self.scale = min(scale_x, scale_y)
        # Wyśrodkuj
        self.ox = margin + (self.map_w - lon_span * self.scale) / 2
        self.oy = margin + (self.map_h - lat_span * self.scale) / 2

    def project(self, lon: float, lat: float) -> tuple:
        x = self.ox + (lon - PL_LON_MIN) * self.scale
        y = self.oy + (PL_LAT_MAX - lat) * self.scale  # Y odwrócone
        return round(x, 2), round(y, 2)

    def ring_to_path(self, coords: list) -> str:
        if not coords:
            return ""
        parts = []
        for i, pt in enumerate(coords):
            if len(pt) >= 2:
                x, y = self.project(pt[0], pt[1])
                parts.append(f"{'M' if i == 0 else 'L'}{x},{y}")
        parts.append("Z")
        return " ".join(parts)

    def geom_to_path(self, geometry: dict) -> str:
        if geometry["type"] == "Polygon":
            return " ".join(self.ring_to_path(r) for r in geometry["coordinates"])
        elif geometry["type"] == "MultiPolygon":
            paths = []
            for poly in geometry["coordinates"]:
                for ring in poly:
                    paths.append(self.ring_to_path(ring))
            return " ".join(paths)
        return ""


def _load_json(name: str) -> dict:
    here = os.path.join(os.path.dirname(__file__), "..", "data")
    with open(os.path.join(here, name), encoding="utf-8") as f:
        return json.load(f)


def generate_warning_svg(
    warnings: list,
    width: int = 1200,
    height: int = 900,
    show_grid: bool = True,
    title: str = "Mapa ostrzeżeń meteorologicznych — IMGW-PIB",
    generated_at: Optional[str] = None,
) -> str:
    """
    Generuje SVG z mapą ostrzeżeń.
    
    warnings: lista dict z polami phenomenon, level, counties, onset, expires, status
    Zwraca: string SVG
    """
    proj = MapProjection(width, height, margin=50)
    now_str = generated_at or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    # Wczytaj dane geograficzne
    try:
        voiv_data = _load_json("voivodeships.json")
        counties_data = _load_json("counties.json")
    except Exception:
        voiv_data = {"features": []}
        counties_data = {"features": []}

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" '
                 f'width="{width}" height="{height + 160}" '
                 f'viewBox="0 0 {width} {height + 160}">')

    # Definicje
    lines.append('<defs>')
    lines.append('  <filter id="shadow"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.3"/></filter>')
    for lvl, (fill, stroke) in LEVEL_COLORS.items():
        lines.append(f'  <filter id="glow{lvl}"><feGaussianBlur stdDeviation="4" result="blur"/>'
                     f'<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')
    lines.append('</defs>')

    # Tło
    lines.append(f'<rect width="{width}" height="{height + 160}" fill="#f8fafc"/>')
    lines.append(f'<rect x="0" y="0" width="{width}" height="{height}" fill="#dce8f5"/>')

    # --- Powiaty (szary podkład) ---
    lines.append('<g id="counties-bg" fill="#e8eef6" stroke="#c8d4e8" stroke-width="0.3" opacity="0.8">')
    for feat in counties_data.get("features", []):
        geom = feat.get("geometry")
        if geom:
            d = proj.geom_to_path(geom)
            if d:
                lines.append(f'  <path d="{d}"/>')
    lines.append('</g>')

    # --- Zbierz powiaty per ostrzeżenie (do podświetlenia i labelów) ---
    # Mapuj id powiatu → geometria
    county_geom_map = {}
    county_centroid_map = {}
    for feat in counties_data.get("features", []):
        props = feat.get("properties", {})
        cid = props.get("id", "")
        geom = feat.get("geometry")
        if cid and geom:
            county_geom_map[cid] = geom
            ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
            xs = [p[0] for p in ring]
            ys = [p[1] for p in ring]
            county_centroid_map[cid] = (sum(xs)/len(xs), sum(ys)/len(ys))

    # --- Ostrzeżenia — wypełnienie powiatów ---
    active_warnings = [w for w in warnings if w.get("status") in ("active", "pending")]

    for w in active_warnings:
        lvl = w.get("level", 1)
        fill, stroke = LEVEL_COLORS.get(lvl, ("#facc15", "#78600a"))
        opacity = "0.75" if w.get("status") == "active" else "0.4"
        dash = "" if w.get("status") == "active" else 'stroke-dasharray="4,3"'
        counties = w.get("counties", [])

        lines.append(f'<g id="warning-{w.get("id","")[:8]}" '
                     f'fill="{fill}" stroke="{stroke}" stroke-width="1.2" '
                     f'fill-opacity="{opacity}" {dash}>')
        for c in counties:
            cid = c.get("id", "")
            geom = county_geom_map.get(cid)
            if geom:
                d = proj.geom_to_path(geom)
                if d:
                    lines.append(f'  <path d="{d}"/>')
        lines.append('</g>')

    # --- Województwa (kontury na wierzchu) ---
    lines.append('<g id="voivodeships" fill="none" stroke="#4a6fa5" stroke-width="1.2" opacity="0.9">')
    for feat in voiv_data.get("features", []):
        geom = feat.get("geometry")
        if geom:
            d = proj.geom_to_path(geom)
            if d:
                lines.append(f'  <path d="{d}"/>')
    lines.append('</g>')

    # --- Obrys zewnętrzny Polski (gruba linia) ---
    # Rysujemy ponownie wszystkie województwa jako jeden gruby obrys
    lines.append('<g id="poland-border" fill="none" stroke="#1e3a5f" stroke-width="2.0" opacity="1.0">')
    for feat in voiv_data.get("features", []):
        geom = feat.get("geometry")
        if geom:
            d = proj.geom_to_path(geom)
            if d:
                lines.append(f'  <path d="{d}"/>')
    lines.append('</g>')

    # --- Siatka geograficzna ---
    if show_grid:
        lines.append('<g id="grid" stroke="#3b82f6" stroke-width="0.4" opacity="0.25" stroke-dasharray="3,5">')
        for lon in range(15, 25):
            x1, y1 = proj.project(lon, PL_LAT_MIN)
            x2, y2 = proj.project(lon, PL_LAT_MAX)
            lines.append(f'  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
            lines.append(f'  <text x="{x1}" y="{height-8}" '
                         f'font-size="9" fill="#3b82f6" opacity="0.5" text-anchor="middle" '
                         f'font-family="Arial,sans-serif">{lon}°E</text>')
        for lat in range(50, 55):
            x1, y1 = proj.project(PL_LON_MIN, lat)
            x2, y2 = proj.project(PL_LON_MAX, lat)
            lines.append(f'  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}"/>')
            lines.append(f'  <text x="8" y="{y1+4}" '
                         f'font-size="9" fill="#3b82f6" opacity="0.5" '
                         f'font-family="Arial,sans-serif">{lat}°N</text>')
        lines.append('</g>')

    # --- Agregowane labele — jeden per ostrzeżenie na centroidzie obszaru ---
    lines.append('<g id="warning-labels">')
    for w in active_warnings:
        lvl = w.get("level", 1)
        fill, stroke = LEVEL_COLORS.get(lvl, ("#facc15", "#78600a"))
        ph = w.get("phenomenon", "")
        icon = PHENOMENON_ICONS.get(ph, "⚠")
        label_text = PHENOMENON_LABELS.get(ph, ph.replace("_", " "))
        counties = w.get("counties", [])
        if not counties:
            continue

        # Centroid obszaru ostrzeżenia (średnia centroidów powiatów)
        lons, lats = [], []
        for c in counties:
            cid = c.get("id", "")
            if cid in county_centroid_map:
                clon, clat = county_centroid_map[cid]
            else:
                clon = c.get("lon", 0)
                clat = c.get("lat", 0)
            if clon and clat:
                lons.append(clon)
                lats.append(clat)

        if not lons:
            continue

        cx, cy = proj.project(sum(lons)/len(lons), sum(lats)/len(lats))

        # Box z etykietą
        box_w, box_h = 90, 32
        bx, by = cx - box_w/2, cy - box_h/2

        status_marker = "" if w.get("status") == "active" else " (nadch.)"
        full_label = f"St.{lvl} {label_text}{status_marker}"

        lines.append(
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{box_w}" height="{box_h}" '
            f'rx="4" fill="{fill}" fill-opacity="0.92" '
            f'stroke="{stroke}" stroke-width="1.5" filter="url(#shadow)"/>'
        )
        lines.append(
            f'<text x="{cx:.1f}" y="{cy-6:.1f}" text-anchor="middle" '
            f'font-size="11" font-weight="bold" fill="{stroke}" '
            f'font-family="Arial,sans-serif">{icon} {full_label}</text>'
        )
        # Liczba powiatów
        lines.append(
            f'<text x="{cx:.1f}" y="{cy+8:.1f}" text-anchor="middle" '
            f'font-size="9" fill="{stroke}" opacity="0.8" '
            f'font-family="Arial,sans-serif">{len(counties)} powiat{"ów" if len(counties)!=1 else ""}</text>'
        )
    lines.append('</g>')

    # === SEKCJA PODSUMOWANIA (pod mapą) ===
    summary_y = height + 8
    lines.append(f'<rect x="0" y="{height}" width="{width}" height="160" fill="#1e3a5f"/>')

    # Tytuł
    lines.append(f'<text x="{width//2}" y="{summary_y+24}" text-anchor="middle" '
                 f'font-size="16" font-weight="bold" fill="white" '
                 f'font-family="Arial,sans-serif">{title}</text>')

    # Linia oddzielająca
    lines.append(f'<line x1="40" y1="{summary_y+34}" x2="{width-40}" y2="{summary_y+34}" '
                 f'stroke="rgba(255,255,255,0.3)" stroke-width="1"/>')

    # Treść podsumowania — ostrzeżenia
    if active_warnings:
        col_w = (width - 80) // min(len(active_warnings), 4)
        for i, w in enumerate(active_warnings[:4]):
            col_x = 40 + i * col_w
            lvl = w.get("level", 1)
            fill, _ = LEVEL_COLORS.get(lvl, ("#facc15", "#78600a"))
            ph = w.get("phenomenon", "")
            icon = PHENOMENON_ICONS.get(ph, "⚠")
            label = PHENOMENON_LABELS.get(ph, ph)
            counties = w.get("counties", [])

            # Grupuj powiaty per województwo
            voiv_groups: dict = {}
            for c in counties:
                vn = c.get("voiv_name", "Nieznane")
                voiv_groups.setdefault(vn, 0)
                voiv_groups[vn] += 1

            # Sprawdź czy to cała Polska
            if len(voiv_groups) >= 14:
                area_text = "Cała Polska"
            elif len(voiv_groups) == 1:
                vn, cnt = list(voiv_groups.items())[0]
                area_text = f"woj. {vn} ({cnt} pow.)"
            else:
                voiv_list = ", ".join(vn[:8] for vn in sorted(voiv_groups.keys())[:3])
                if len(voiv_groups) > 3:
                    voiv_list += f" +{len(voiv_groups)-3}"
                area_text = voiv_list

            # Czas
            try:
                onset_dt = datetime.fromisoformat(w.get("onset","").replace("Z","+00:00"))
                expires_dt = datetime.fromisoformat(w.get("expires","").replace("Z","+00:00"))
                time_text = (f"{onset_dt.strftime('%d.%m %H:%M')} – "
                             f"{expires_dt.strftime('%d.%m %H:%M')} UTC")
            except Exception:
                time_text = "—"

            status_color = "#22c55e" if w.get("status") == "active" else "#3b82f6"
            status_label = "● Aktywne" if w.get("status") == "active" else "○ Nadchodzące"

            # Blok ostrzeżenia
            lines.append(f'<rect x="{col_x}" y="{summary_y+42}" width="{col_w-10}" height="100" '
                         f'rx="4" fill="{fill}" fill-opacity="0.15" '
                         f'stroke="{fill}" stroke-width="1" stroke-opacity="0.5"/>')
            ry = summary_y + 60
            lines.append(f'<text x="{col_x+8}" y="{ry}" font-size="13" font-weight="bold" '
                         f'fill="{fill}" font-family="Arial,sans-serif">{icon} {label}</text>')
            ry += 16
            lines.append(f'<text x="{col_x+8}" y="{ry}" font-size="10" fill="white" opacity="0.9" '
                         f'font-family="Arial,sans-serif">Stopień {lvl} · {status_label}</text>')
            ry += 14
            lines.append(f'<text x="{col_x+8}" y="{ry}" font-size="9" fill="white" opacity="0.7" '
                         f'font-family="Arial,sans-serif">{area_text}</text>')
            ry += 13
            lines.append(f'<text x="{col_x+8}" y="{ry}" font-size="9" fill="white" opacity="0.6" '
                         f'font-family="Arial,sans-serif">{time_text}</text>')
    else:
        lines.append(f'<text x="{width//2}" y="{summary_y+80}" text-anchor="middle" '
                     f'font-size="14" fill="rgba(255,255,255,0.6)" '
                     f'font-family="Arial,sans-serif">Brak aktywnych ostrzeżeń</text>')

    # Stopka
    lines.append(f'<text x="40" y="{summary_y+152}" font-size="9" fill="rgba(255,255,255,0.5)" '
                 f'font-family="Arial,sans-serif">Stan na: {now_str} · '
                 f'IMGW-PIB Centrum Modelowania Meteorologicznego · MeteoCAP Editor</text>')
    lines.append(f'<text x="{width-40}" y="{summary_y+152}" text-anchor="end" '
                 f'font-size="9" fill="rgba(255,255,255,0.5)" '
                 f'font-family="Arial,sans-serif">© GUGiK PRG</text>')

    lines.append('</svg>')
    return "\n".join(lines)
