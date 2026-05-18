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


def _format_synthesis(active_warnings: list) -> list:
    """Buduje syntezę: per zjawisko liczba ostrzeżeń + powiatów, oraz lista województw
    jeśli ≤3, w przeciwnym razie tylko "X województw"."""
    by_phen = {}
    for w in active_warnings:
        ph = w.get("phenomenon", "inne")
        if ph not in by_phen:
            by_phen[ph] = {"count": 0, "max_level": 0, "voivs": set(), "county_ids": set()}
        by_phen[ph]["count"] += 1
        by_phen[ph]["max_level"] = max(by_phen[ph]["max_level"], w.get("level", 1))
        for c in w.get("counties", []):
            vn = c.get("voiv_name", "")
            if vn:
                by_phen[ph]["voivs"].add(vn)
            cid = c.get("id", "")
            if cid:
                by_phen[ph]["county_ids"].add(cid)

    lines = []
    # Sortuj po max_level malejąco
    for ph, info in sorted(by_phen.items(), key=lambda x: -x[1]["max_level"]):
        label = PHENOMENON_LABELS.get(ph, ph.replace("_", " "))
        icon = PHENOMENON_ICONS.get(ph, "⚠")
        ncp = len(info["county_ids"])
        nv = len(info["voivs"])

        # Obszar — heurystyka C-z-B-fallbackiem
        if nv >= 14:
            area_text = "cała Polska"
        elif nv <= 3:
            # Wymień województwa małymi literami
            voivs_sorted = sorted(v.lower() for v in info["voivs"])
            area_text = "woj. " + ", ".join(voivs_sorted)
        else:
            area_text = f"{nv} województw, {ncp} powiatów"

        lines.append({
            "icon": icon,
            "label": label,
            "level": info["max_level"],
            "count": info["count"],
            "ncp": ncp,
            "area": area_text,
        })
    return lines


def generate_warning_svg(
    warnings: list,
    width: int = 1200,
    height: int = 1000,
    show_grid: bool = False,
    title: str = "Ostrzeżenia meteorologiczne — IMGW-PIB",
    generated_at: Optional[str] = None,
) -> str:
    """
    Generuje SVG z metryczką ostrzeżeń (styl IMGW hydro/meteo):
      - Pasek nagłówka z tytułem, datą, logo
      - Mapa Polski z zakolorowanymi powiatami + labelkami cluster-based
      - Stopka z syntezą per zjawisko (małe litery w nazwach woj.)

    warnings: lista dict z polami phenomenon, level, counties, onset, expires, status
    Zwraca: string SVG
    """
    # Layout sections
    HEADER_H = 80
    MAP_H = 700
    FOOTER_H = height - HEADER_H - MAP_H  # ~220px na syntezę
    MAP_Y = HEADER_H

    proj = MapProjection(width, MAP_H, margin=30)
    # Offset projekcji — przesuwamy współrzędne y o HEADER_H
    proj_y_offset = MAP_Y

    now_str = generated_at or datetime.now().strftime("%d.%m.%Y · %H:%M")

    # Wczytaj dane geograficzne
    try:
        voiv_data = _load_json("voivodeships.json")
        counties_data = _load_json("counties.json")
    except Exception:
        voiv_data = {"features": []}
        counties_data = {"features": []}

    lines = []
    lines.append(f'<svg xmlns="http://www.w3.org/2000/svg" '
                 f'width="{width}" height="{height}" '
                 f'viewBox="0 0 {width} {height}">')

    # Definicje
    lines.append('<defs>')
    lines.append('  <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">'
                 '<feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity="0.25"/></filter>')
    lines.append('</defs>')

    # === TŁO ===
    lines.append(f'<rect width="{width}" height="{height}" fill="#ffffff"/>')

    # === HEADER ===
    lines.append(f'<rect x="0" y="0" width="{width}" height="{HEADER_H}" fill="#1e3a5f"/>')
    # Tytuł
    lines.append(f'<text x="32" y="36" font-size="22" font-weight="bold" '
                 f'fill="white" font-family="Arial,sans-serif">{title}</text>')
    # Data
    lines.append(f'<text x="32" y="62" font-size="13" '
                 f'fill="rgba(255,255,255,0.85)" font-family="Arial,sans-serif">'
                 f'<tspan fill="#fca5a5" font-weight="bold">Stan na</tspan>  {now_str}</text>')
    # Liczba ostrzeżeń (prawy róg)
    active_warnings = [w for w in warnings if w.get("status") in ("active", "pending")]
    n_active = len(active_warnings)
    lines.append(f'<text x="{width-32}" y="36" text-anchor="end" font-size="13" '
                 f'fill="rgba(255,255,255,0.7)" font-family="Arial,sans-serif">'
                 f'IMGW-PIB · MeteoCAP</text>')
    lines.append(f'<text x="{width-32}" y="62" text-anchor="end" font-size="20" '
                 f'font-weight="bold" fill="white" font-family="Arial,sans-serif">'
                 f'Liczba aktywnych ostrzeżeń: {n_active}</text>')

    # === OBSZAR MAPY ===
    lines.append(f'<rect x="0" y="{MAP_Y}" width="{width}" height="{MAP_H}" fill="#f8fafc"/>')

    # Override projekcji żeby uwzględnić MAP_Y
    orig_project = proj.project
    def project_offset(lon, lat):
        x, y = orig_project(lon, lat)
        return x, y + proj_y_offset
    proj.project = project_offset

    def geom_to_path_offset(geom):
        return proj.geom_to_path(geom)
    # geom_to_path używa proj.project — automatycznie z offsetem

    # --- Wszystkie powiaty (jasne tło, bez dziur) ---
    lines.append('<g id="counties-bg" fill="#eef2f7" stroke="#cbd5e1" stroke-width="0.4">')
    for feat in counties_data.get("features", []):
        geom = feat.get("geometry")
        if geom:
            d = proj.geom_to_path(geom)
            if d:
                lines.append(f'  <path d="{d}"/>')
    lines.append('</g>')

    # Mapa centroidów powiatów (do labelek)
    county_centroid_map = {}
    for feat in counties_data.get("features", []):
        props = feat.get("properties", {})
        cid = props.get("id", "")
        geom = feat.get("geometry")
        if cid and geom:
            ring = geom["coordinates"][0] if geom["type"] == "Polygon" else geom["coordinates"][0][0]
            xs = [p[0] for p in ring]; ys = [p[1] for p in ring]
            county_centroid_map[cid] = (sum(xs)/len(xs), sum(ys)/len(ys))

    # --- Powiaty z ostrzeżeniami — zakolorowane ---
    # Posortuj po level rosnąco żeby wyższe (poważniejsze) były na wierzchu
    for w in sorted(active_warnings, key=lambda x: x.get("level", 1)):
        lvl = w.get("level", 1)
        fill, stroke = LEVEL_COLORS.get(lvl, ("#facc15", "#78600a"))
        opacity = 0.85
        lines.append(f'<g fill="{fill}" fill-opacity="{opacity}" '
                     f'stroke="{stroke}" stroke-width="0.4">')
        for c in w.get("counties", []):
            cid = c.get("id", "")
            # Odszukaj geometrię w counties_data
            for feat in counties_data.get("features", []):
                if feat.get("properties", {}).get("id") == cid:
                    geom = feat.get("geometry")
                    if geom:
                        d = proj.geom_to_path(geom)
                        if d:
                            lines.append(f'  <path d="{d}"/>')
                    break
        lines.append('</g>')

    # --- Obrysy województw ---
    lines.append('<g id="voivs" fill="none" stroke="#475569" stroke-width="1" opacity="0.6">')
    for feat in voiv_data.get("features", []):
        geom = feat.get("geometry")
        if geom:
            d = proj.geom_to_path(geom)
            if d:
                lines.append(f'  <path d="{d}"/>')
    lines.append('</g>')

    # --- Cluster-based labelki (B1) ---
    # Strategia: dla każdego ostrzeżenia wyznacz centroid. Następnie połącz w klastry
    # ostrzeżenia których centroidy są bliżej niż 80px.
    label_candidates = []
    for w in active_warnings:
        counties = w.get("counties", [])
        if not counties:
            continue
        lons, lats = [], []
        for c in counties:
            cid = c.get("id", "")
            if cid in county_centroid_map:
                clon, clat = county_centroid_map[cid]
                lons.append(clon); lats.append(clat)
        if not lons:
            continue
        cx, cy = proj.project(sum(lons)/len(lons), sum(lats)/len(lats))
        label_candidates.append({"w": w, "cx": cx, "cy": cy})

    # Cluster — group label_candidates by proximity
    CLUSTER_PX = 70
    used = [False] * len(label_candidates)
    clusters = []
    for i, lc in enumerate(label_candidates):
        if used[i]: continue
        group = [lc]; used[i] = True
        for j, lc2 in enumerate(label_candidates):
            if used[j]: continue
            d = ((lc["cx"] - lc2["cx"])**2 + (lc["cy"] - lc2["cy"])**2) ** 0.5
            if d < CLUSTER_PX:
                group.append(lc2); used[j] = True
        # Centroid klastra
        ccx = sum(g["cx"] for g in group) / len(group)
        ccy = sum(g["cy"] for g in group) / len(group)
        # Top warning klastra (najwyższy level)
        top_w = max((g["w"] for g in group), key=lambda x: x.get("level", 1))
        clusters.append({"cx": ccx, "cy": ccy, "top_w": top_w, "count": len(group)})

    # Dodge — rozsuń klastry które są nadal blisko
    for _ in range(3):
        moved = False
        for i in range(len(clusters)):
            for j in range(i):
                dx = clusters[i]["cx"] - clusters[j]["cx"]
                dy = clusters[i]["cy"] - clusters[j]["cy"]
                d = (dx*dx + dy*dy) ** 0.5
                if d < CLUSTER_PX * 1.2 and d > 0:
                    push = (CLUSTER_PX * 1.2 - d) / 2
                    ux, uy = dx/d, dy/d
                    clusters[i]["cx"] += ux * push
                    clusters[i]["cy"] += uy * push
                    clusters[j]["cx"] -= ux * push
                    clusters[j]["cy"] -= uy * push
                    moved = True
        if not moved: break

    # Renderuj labelki klastrów (styl jak w Status: kolorowy box, ikona + tekst)
    lines.append('<g id="warning-labels">')
    for cl in clusters:
        w = cl["top_w"]
        lvl = w.get("level", 1)
        fill, stroke = LEVEL_COLORS.get(lvl, ("#facc15", "#78600a"))
        ph = w.get("phenomenon", "")
        icon = PHENOMENON_ICONS.get(ph, "⚠")
        label_text = PHENOMENON_LABELS.get(ph, ph.replace("_", " "))
        # Cluster z >1 ostrzeżeniem — pokaż licznik
        count_suffix = f" (+{cl['count']-1})" if cl['count'] > 1 else ""
        text = f"St.{lvl} {label_text}{count_suffix}"
        # Szacuj szerokość boxa
        box_w = max(75, len(text) * 6.5 + 24)
        box_h = 24
        bx = cl["cx"] - box_w/2; by = cl["cy"] - box_h/2
        lines.append(
            f'<rect x="{bx:.1f}" y="{by:.1f}" width="{box_w:.1f}" height="{box_h}" '
            f'rx="4" fill="{fill}" fill-opacity="0.95" '
            f'stroke="{stroke}" stroke-width="1.5" filter="url(#shadow)"/>'
        )
        # Ikona po lewej, tekst dalej
        lines.append(
            f'<text x="{bx+8:.1f}" y="{cl["cy"]+5:.1f}" '
            f'font-size="14" font-family="Arial,sans-serif">{icon}</text>'
        )
        lines.append(
            f'<text x="{bx+28:.1f}" y="{cl["cy"]+5:.1f}" '
            f'font-size="11" font-weight="bold" fill="{stroke}" '
            f'font-family="Arial,sans-serif">{text}</text>'
        )
    lines.append('</g>')

    # === FOOTER — SYNTEZA ===
    F_Y = HEADER_H + MAP_H
    lines.append(f'<rect x="0" y="{F_Y}" width="{width}" height="{FOOTER_H}" fill="#1e3a5f"/>')

    if active_warnings:
        synthesis = _format_synthesis(active_warnings)
        # Tytuł sekcji
        lines.append(f'<text x="32" y="{F_Y+30}" font-size="14" font-weight="bold" '
                     f'fill="rgba(255,255,255,0.7)" font-family="Arial,sans-serif" '
                     f'letter-spacing="1.5">SYNTEZA OSTRZEŻEŃ</text>')
        # Linia
        lines.append(f'<line x1="32" y1="{F_Y+40}" x2="{width-32}" y2="{F_Y+40}" '
                     f'stroke="rgba(255,255,255,0.2)" stroke-width="1"/>')

        # Każde zjawisko jako linia
        max_rows = min(len(synthesis), 6)
        row_h = (FOOTER_H - 90) // max(max_rows, 1)
        for i, s in enumerate(synthesis[:6]):
            y = F_Y + 60 + i * row_h
            fill, stroke = LEVEL_COLORS.get(s["level"], ("#facc15", "#78600a"))
            # Lewy: kolorowy znacznik
            lines.append(f'<rect x="32" y="{y-12}" width="6" height="20" rx="2" fill="{fill}"/>')
            # Ikona + nazwa zjawiska
            lines.append(f'<text x="48" y="{y+4}" font-size="14" '
                         f'font-family="Arial,sans-serif">{s["icon"]}</text>')
            lines.append(f'<text x="72" y="{y+4}" font-size="13" font-weight="bold" '
                         f'fill="white" font-family="Arial,sans-serif">'
                         f'{s["label"]} <tspan fill="{fill}">· stopień {s["level"]}</tspan></text>')
            # Po prawej: licznik powiatów + obszar
            lines.append(f'<text x="{width-32}" y="{y+4}" text-anchor="end" font-size="12" '
                         f'fill="rgba(255,255,255,0.85)" font-family="Arial,sans-serif">'
                         f'{s["ncp"]} powiat{"ów" if s["ncp"]!=1 else ""} · {s["area"]}</text>')

        if len(synthesis) > 6:
            y = F_Y + 60 + 6 * row_h
            lines.append(f'<text x="48" y="{y+4}" font-size="11" '
                         f'fill="rgba(255,255,255,0.6)" font-family="Arial,sans-serif" '
                         f'font-style="italic">+ {len(synthesis)-6} innych zjawisk</text>')
    else:
        lines.append(f'<text x="{width//2}" y="{F_Y+FOOTER_H//2}" text-anchor="middle" '
                     f'font-size="16" fill="rgba(255,255,255,0.6)" '
                     f'font-family="Arial,sans-serif">Brak aktywnych ostrzeżeń</text>')

    # Stopka — legenda + źródło
    leg_y = height - 18
    legend_items = [(1, "Stopień 1"), (2, "Stopień 2"), (3, "Stopień 3")]
    lx = 32
    for lvl, lbl in legend_items:
        fill, _ = LEVEL_COLORS[lvl]
        lines.append(f'<rect x="{lx}" y="{leg_y-9}" width="12" height="12" rx="2" fill="{fill}"/>')
        lines.append(f'<text x="{lx+18}" y="{leg_y}" font-size="10" '
                     f'fill="rgba(255,255,255,0.7)" font-family="Arial,sans-serif">{lbl}</text>')
        lx += 95
    lines.append(f'<text x="{width-32}" y="{leg_y}" text-anchor="end" font-size="10" '
                 f'fill="rgba(255,255,255,0.5)" font-family="Arial,sans-serif">'
                 f'© IMGW-PIB · dane GUGiK PRG</text>')

    lines.append('</svg>')
    return "\n".join(lines)


def generate_warning_png(warnings: list, width: int = 1200, height: int = 1000) -> bytes:
    """Renderuje metryczkę SVG do PNG (przez reportlab renderPM + svglib lub fallback).
    Zwraca bajty PNG."""
    svg = generate_warning_svg(warnings, width=width, height=height)
    # Próbujemy svglib → reportlab → PNG
    try:
        from svglib.svglib import svg2rlg
        from reportlab.graphics import renderPM
        import io
        rlg = svg2rlg(io.StringIO(svg))
        png_bytes = io.BytesIO()
        renderPM.drawToFile(rlg, png_bytes, fmt="PNG", dpi=120)
        return png_bytes.getvalue()
    except ImportError:
        # Fallback: cairosvg
        try:
            import cairosvg
            return cairosvg.svg2png(bytestring=svg.encode("utf-8"),
                                    output_width=width, output_height=height)
        except ImportError:
            return None
