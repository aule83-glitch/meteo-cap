"""
Renderer metryczki PNG — mapa ostrzeżeń + zwięzła legenda.

Powstał, bo poprzednia ścieżka (SVG → svglib → reportlab) była zawodna:
brak/awaria svglib kończyła się cichym fallbackiem do SVG (przycisk „nie działał"),
a dopasowanie powiatów przez ścisłe `==` gubiło część obszarów.

Tutaj rysujemy wprost w Pillow:
  • WSZYSTKIE 380 powiatów jako podkład (brak dziur w mapie),
  • powiaty objęte ostrzeżeniem w kolorze stopnia (per powiat wygrywa NAJWYŻSZY
    stopień — ta sama reguła co na mapie w aplikacji),
  • obrysy województw,
  • metryczka: zjawisko/stopień, liczba powiatów, województwa, okres.
"""

import json
import os
try:
    from zoneinfo import ZoneInfo
    _TZ = ZoneInfo("Europe/Warsaw")
except Exception:            # awaryjnie: czas systemowy
    _TZ = None
from datetime import datetime, timezone

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:  # pragma: no cover
    PIL_AVAILABLE = False

_DATA = os.path.join(os.path.dirname(__file__), "..", "data")

# Kolory spójne z interfejsem aplikacji
LEVEL_FILL = {1: (250, 204, 21), 2: (249, 115, 22), 3: (239, 68, 68)}
BG          = (11, 19, 32)
PANEL       = (17, 28, 46)
COUNTY_BG   = (30, 44, 66)
COUNTY_LINE = (52, 71, 99)
VOIV_LINE   = (120, 150, 190)
TEXT        = (232, 238, 246)
TEXT_DIM    = (150, 170, 195)

PHEN_LABEL = {
    "burze": "Burze", "silny_wiatr": "Silny wiatr", "upal": "Upał",
    "intensywne_opady_deszczu": "Intensywne opady deszczu",
    "silny_deszcz_z_burzami": "Silny deszcz z burzami",
    "intensywne_opady_sniegu": "Intensywne opady śniegu",
    "opady_sniegu": "Opady śniegu", "zawieje_zamiecie": "Zawieje i zamiecie",
    "oblodzenie": "Oblodzenie", "opady_marznace": "Opady marznące",
    "opady_marzniece": "Opady marznące", "przymrozki": "Przymrozki",
    "silny_mroz": "Silny mróz", "roztopy": "Roztopy",
    "gesta_mgla": "Gęsta mgła", "mgla_szadz": "Mgła i szadź",
    "inne_zagrozenie": "Inne zagrożenie",
}


def _load(name):
    with open(os.path.join(_DATA, name), encoding="utf-8") as f:
        return json.load(f)


def _font(size, bold=False):
    """Szuka DejaVu (te same lokalizacje co generator PDF); w razie braku font domyślny."""
    names = ["DejaVuSans-Bold.ttf"] if bold else ["DejaVuSans.ttf"]
    dirs = ["/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu",
            "/usr/share/fonts/TTF", "/usr/share/fonts"]
    for d in dirs:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except Exception:
                    pass
    try:
        return ImageFont.load_default(size)
    except Exception:
        return ImageFont.load_default()


def _rings(geometry):
    """Zwraca listę pierścieni (zewnętrznych) dla Polygon i MultiPolygon."""
    if not geometry:
        return []
    t, coords = geometry.get("type"), geometry.get("coordinates")
    if t == "Polygon":
        return [coords[0]] if coords else []
    if t == "MultiPolygon":
        return [poly[0] for poly in coords if poly]
    return []


class _Proj:
    """Prosta projekcja równoprostokątna z korektą cos(lat) — wystarczająca dla Polski."""

    def __init__(self, features, width, height, pad=14):
        lons, lats = [], []
        for feat in features:
            for ring in _rings(feat.get("geometry")):
                for pt in ring:
                    lons.append(pt[0]); lats.append(pt[1])
        self.min_lon, self.max_lon = min(lons), max(lons)
        self.min_lat, self.max_lat = min(lats), max(lats)
        mid_lat = (self.min_lat + self.max_lat) / 2
        import math
        self.k = math.cos(math.radians(mid_lat))
        w_deg = (self.max_lon - self.min_lon) * self.k
        h_deg = (self.max_lat - self.min_lat)
        sx = (width - 2 * pad) / w_deg
        sy = (height - 2 * pad) / h_deg
        self.s = min(sx, sy)
        self.ox = pad + ((width - 2 * pad) - w_deg * self.s) / 2
        self.oy = pad + ((height - 2 * pad) - h_deg * self.s) / 2

    def __call__(self, lon, lat):
        x = self.ox + (lon - self.min_lon) * self.k * self.s
        y = self.oy + (self.max_lat - lat) * self.s
        return (x, y)


def _fmt(iso):
    if not iso:
        return "—"
    try:
        dt = datetime.fromisoformat(str(iso).replace("Z", "+00:00"))
        # Grafiki trafiają do mediów i decydentów w Polsce — zawsze czas lokalny.
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        dt = dt.astimezone(_TZ) if _TZ else dt.astimezone()
        return dt.strftime("%d.%m %H:%M")
    except Exception:
        return str(iso)[:16].replace("T", " ")


def _synthesis(warnings, county_voiv):
    """Grupuje ostrzeżenia po (zjawisko, stopień) → powiaty, województwa, okres."""
    groups = {}
    for w in warnings:
        key = (w.get("phenomenon", "?"), int(w.get("level", 1) or 1))
        g = groups.setdefault(key, {"counties": set(), "voivs": set(),
                                    "onset": None, "expires": None})
        for c in (w.get("counties") or []):
            cid = str(c.get("id", ""))
            g["counties"].add(cid)
            v = c.get("voiv_name") or county_voiv.get(cid)
            if v:
                g["voivs"].add(v)
        o, e = w.get("onset"), w.get("expires")
        if o and (g["onset"] is None or str(o) < str(g["onset"])):
            g["onset"] = o
        if e and (g["expires"] is None or str(e) > str(g["expires"])):
            g["expires"] = e
    out = []
    for (phen, lvl), g in groups.items():
        out.append({
            "phenomenon": phen, "level": lvl,
            "n_counties": len(g["counties"]),
            "voivs": sorted(g["voivs"]),
            "onset": g["onset"], "expires": g["expires"],
        })
    out.sort(key=lambda x: (-x["level"], -x["n_counties"]))
    return out


def generate_png(warnings, width=1400, height=1000, title=None, voivodeship=None):
    """Zwraca bajty PNG albo None, gdy Pillow niedostępny."""
    if not PIL_AVAILABLE:
        return None

    counties = _load("counties.json").get("features", [])
    voivs = _load("voivodeships.json").get("features", [])
    county_voiv = {f["properties"]["id"]: f["properties"].get("voiv_name")
                   for f in counties}

    if voivodeship:
        # Raport wojewódzki: zostaw tylko ostrzeżenia dotykające województwa
        # ORAZ przytnij ich listę powiatów do tego województwa (bez szumu z sąsiadów).
        target = voivodeship.strip().lower()
        trimmed = []
        for w in warnings:
            own = [c for c in (w.get("counties") or [])
                   if (c.get("voiv_name") or county_voiv.get(str(c.get("id", "")), "")
                       ).strip().lower() == target]
            if own:
                w2 = dict(w); w2["counties"] = own
                trimmed.append(w2)
        warnings = trimmed

    # Układ: mapa po lewej, metryczka po prawej
    panel_w = 430
    map_w = width - panel_w
    img = Image.new("RGB", (width, height), BG)
    dr = ImageDraw.Draw(img, "RGBA")

    proj = _Proj(counties, map_w, height - 70)
    dy = 62  # miejsce na pasek tytułu

    def poly(ring, fill=None, outline=None, w=1):
        pts = [proj(p[0], p[1]) for p in ring]
        pts = [(x, y + dy) for (x, y) in pts]
        if len(pts) < 3:
            return
        if fill:
            dr.polygon(pts, fill=fill)
        if outline:
            dr.line(pts + [pts[0]], fill=outline, width=w)

    # 1. Podkład: WSZYSTKIE powiaty (gwarancja braku dziur w mapie)
    for f in counties:
        for ring in _rings(f.get("geometry")):
            poly(ring, fill=COUNTY_BG, outline=COUNTY_LINE, w=1)

    # 2. Powiaty objęte ostrzeżeniem — per powiat wygrywa najwyższy stopień.
    #    Normalizacja ID przez str() — wcześniej ścisłe porównanie gubiło powiaty.
    best = {}
    for w in warnings:
        lvl = int(w.get("level", 1) or 1)
        for c in (w.get("counties") or []):
            cid = str(c.get("id", "")).strip()
            if cid and lvl > best.get(cid, 0):
                best[cid] = lvl
    geom_by_id = {str(f["properties"]["id"]): f.get("geometry") for f in counties}
    missing = 0
    for cid, lvl in best.items():
        g = geom_by_id.get(cid) or geom_by_id.get(cid.zfill(4))
        if not g:
            missing += 1
            continue
        for ring in _rings(g):
            poly(ring, fill=LEVEL_FILL.get(lvl, LEVEL_FILL[1]), outline=None)

    # 3. Obrysy województw na wierzchu
    for f in voivs:
        for ring in _rings(f.get("geometry")):
            poly(ring, fill=None, outline=VOIV_LINE, w=2)

    # 4. Pasek tytułu + logo
    f_title = _font(26, bold=True)
    f_sub = _font(13)
    dr.rectangle([0, 0, width, 54], fill=PANEL)
    logo_x = 14
    try:
        logo = Image.open(os.path.join(_DATA, "imgw_logo_pl.png")).convert("RGBA")
        lh = 36
        logo = logo.resize((max(1, int(logo.width * lh / logo.height)), lh), Image.LANCZOS)
        img.paste(logo, (logo_x, 9), logo)
        logo_x += logo.width + 12
    except Exception:
        pass
    dr.text((logo_x, 12), title or "Ostrzeżenia meteorologiczne", font=f_title, fill=TEXT)
    stamp = (datetime.now(timezone.utc).astimezone(_TZ) if _TZ else datetime.now()).strftime("%d.%m.%Y %H:%M")  # czas lokalny (Europe/Warsaw)
    dr.text((width - 12, 20), f"stan na {stamp} (czas lokalny)", font=f_sub, fill=TEXT_DIM, anchor="ra")

    # 5. Metryczka
    px = map_w + 1
    dr.rectangle([px, 54, width, height], fill=PANEL)
    x = px + 18
    y = 74
    f_h = _font(15, bold=True)
    f_b = _font(13)
    f_s = _font(11)

    # Miejsce na legendę (nagłówek + 3 wiersze + margines na adnotację)
    _LEGEND_TOP = height - 92
    rows = _synthesis(warnings, county_voiv)
    # A5: dopasuj rozmiar pisma do dostępnej wysokości — przy 1–3 pozycjach panel
    # świecił pustką, przy wielu tekst uciekał poza kadr.
    if rows:
        potrzeba = 26 + sum(19 + 15 + 14 * max(1, (len(", ".join(r["voivs"])) // 34 + 1)) + 9 for r in rows)
        dostepne = _LEGEND_TOP - 74 - 10
        z = max(0.85, min(1.6, dostepne / max(1, potrzeba)))
    else:
        z = 1.0
    f_h  = _font(int(15 * z), bold=True)
    f_b  = _font(int(13 * z))
    f_s  = _font(int(11 * z))
    head = f"Aktywne ostrzeżenia: {len(rows)}" if rows else "Brak aktywnych ostrzeżeń"
    dr.text((x, y), head, font=f_h, fill=TEXT); y += int(26 * z)

    if voivodeship:
        dr.text((x, y), f"woj. {voivodeship}", font=f_s, fill=TEXT_DIM); y += 18

    for r in rows:
        if y > _LEGEND_TOP - 24:
            dr.text((x, y), "…", font=f_b, fill=TEXT_DIM)
            break
        col = LEVEL_FILL.get(r["level"], LEVEL_FILL[1])
        dr.rectangle([x, y + 3, x + 11, y + 14], fill=col)
        label = PHEN_LABEL.get(r["phenomenon"], r["phenomenon"].replace("_", " "))
        dr.text((x + 19, y), f"{label} / {r['level']}°", font=f_b, fill=TEXT)
        y += int(19 * z)
        dr.text((x + 19, y), f"{r['n_counties']} pow. · {_fmt(r['onset'])} → {_fmt(r['expires'])}",
                font=f_s, fill=TEXT_DIM)
        y += int(15 * z)
        # województwa — zawijanie do szerokości panelu
        voiv_txt = ", ".join(v.lower() for v in r["voivs"]) or "—"
        maxw = panel_w - 46
        line = ""
        for word in voiv_txt.split(" "):
            probe = (line + " " + word).strip()
            if dr.textlength(probe, font=f_s) > maxw and line:
                dr.text((x + 19, y), line, font=f_s, fill=TEXT_DIM); y += int(14 * z)
                line = word
            else:
                line = probe
        if line:
            dr.text((x + 19, y), line, font=f_s, fill=TEXT_DIM); y += int(14 * z)
        y += int(9 * z)

    # 6. Stopka: legenda stopni — PIONOWO. Ustawiona w rzędzie nie mieściła się
    #    w panelu (430 px) i opisy były ucinane przy prawej krawędzi.
    ly = _LEGEND_TOP
    dr.text((px + 18, ly), "Stopnie:", font=f_s, fill=TEXT_DIM)
    ly += 16
    for lvl, name in ((1, "1° zachowaj ostrożność"), (2, "2° przygotuj się"), (3, "3° podejmij działania")):
        dr.rectangle([px + 18, ly + 2, px + 28, ly + 12], fill=LEVEL_FILL[lvl])
        dr.text((px + 33, ly), name, font=f_s, fill=TEXT_DIM)
        ly += 17
    if missing:
        dr.text((px + 18, ly + 2), f"⚠ nierozpoznane powiaty: {missing}",
                font=f_s, fill=(250, 204, 21))

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


# ═══════════════════════════════════════════════════════════════════════
#  INFOGRAFIKA DLA MEDIÓW
#  Duża mapa zbiorcza + siatka małych map „per zjawisko" (small multiples).
#  Każda mała mapa pokazuje wyłącznie jedno zjawisko, więc jest co najwyżej
#  trójkolorowa (stopnie 1–3) i od razu odpowiada na pytanie „co i gdzie".
#  Na małych mapach nie rysujemy granic powiatów — przy tej skali zlewają
#  się w szum; zostają granice województw i kontur kraju.
# ═══════════════════════════════════════════════════════════════════════

LAYOUTS = {
    # nazwa: (szerokość, wysokość, kolumny siatki, opis)
    "landscape": (1920, 1080, 3, "poziomo — prezentacja, ekran, TV"),
    "portrait":  (1240, 1754, 2, "pionowo — A4, druk, dokument"),
    "social":    (1080, 1350, 2, "pionowo 4:5 — media społecznościowe"),
}


def _fills_from(warnings):
    """county_id → najwyższy stopień (reguła zgodna z mapą w aplikacji)."""
    out = {}
    for w in warnings:
        lvl = int(w.get("level", 1) or 1)
        for c in (w.get("counties") or []):
            cid = str(c.get("id", "")).strip()
            if cid and lvl > out.get(cid, 0):
                out[cid] = lvl
    return out


def _draw_map(dr, box, counties, voivs, fills, geom_by_id, detail=True):
    """Rysuje mapę w prostokącie box=(x, y, w, h). detail=False → bez granic powiatów."""
    x0, y0, bw, bh = box
    proj = _Proj(counties, bw, bh)

    def draw_ring(ring, fill=None, outline=None, width=1):
        pts = [proj(p[0], p[1]) for p in ring]
        pts = [(x0 + px, y0 + py) for (px, py) in pts]
        if len(pts) < 3:
            return
        if fill:
            dr.polygon(pts, fill=fill)
        if outline:
            dr.line(pts + [pts[0]], fill=outline, width=width)

    # podkład: wszystkie powiaty (gwarancja pełnej mapy, bez dziur)
    for f in counties:
        for ring in _rings(f.get("geometry")):
            draw_ring(ring, fill=COUNTY_BG,
                      outline=COUNTY_LINE if detail else None, width=1)

    # powiaty objęte ostrzeżeniem
    for cid, lvl in fills.items():
        g = geom_by_id.get(cid) or geom_by_id.get(cid.zfill(4))
        if not g:
            continue
        for ring in _rings(g):
            draw_ring(ring, fill=LEVEL_FILL.get(lvl, LEVEL_FILL[1]))

    # granice województw — zawsze, to one dają orientację na małej mapie
    for f in voivs:
        for ring in _rings(f.get("geometry")):
            draw_ring(ring, outline=VOIV_LINE, width=2 if detail else 1)


def _ellipsize(dr, text, font, maxw):
    """Skraca tekst wielokropkiem, aż zmieści się w maxw (podpisy kafli)."""
    t = str(text)
    if dr.textlength(t, font=font) <= maxw:
        return t
    while t and dr.textlength(t + "…", font=font) > maxw:
        t = t[:-1]
    return (t.rstrip() + "…") if t else ""


def _wrap(dr, text, font, maxw):
    lines, line = [], ""
    for word in str(text).split(" "):
        probe = (line + " " + word).strip()
        if dr.textlength(probe, font=font) > maxw and line:
            lines.append(line); line = word
        else:
            line = probe
    if line:
        lines.append(line)
    return lines


def generate_infographic(warnings, orientation="landscape", title=None,
                         voivodeship=None, facets=True):
    """Infografika dla mediów: mapa zbiorcza + mapki per zjawisko.
    orientation: landscape | portrait | social.
    facets=False → sama mapa ogólnopolska, bez podziału na zjawiska."""
    if not PIL_AVAILABLE:
        return None

    W, H, COLS, _ = LAYOUTS.get(orientation, LAYOUTS["landscape"])
    counties = _load("counties.json").get("features", [])
    voivs = _load("voivodeships.json").get("features", [])
    geom_by_id = {str(f["properties"]["id"]): f.get("geometry") for f in counties}
    county_voiv = {f["properties"]["id"]: f["properties"].get("voiv_name") for f in counties}

    if voivodeship:
        t = voivodeship.strip().lower()
        trimmed = []
        for w in warnings:
            own = [c for c in (w.get("counties") or [])
                   if (c.get("voiv_name") or county_voiv.get(str(c.get("id", "")), "")
                       ).strip().lower() == t]
            if own:
                w2 = dict(w); w2["counties"] = own
                trimmed.append(w2)
        warnings = trimmed

    # grupowanie per zjawisko (różne stopnie/okna łączą się w jedną mapkę)
    groups = {}
    for w in warnings:
        g = groups.setdefault(w.get("phenomenon", "?"),
                              {"ws": [], "counties": set(), "voivs": set(),
                               "max": 0, "onset": None, "expires": None})
        g["ws"].append(w)
        g["max"] = max(g["max"], int(w.get("level", 1) or 1))
        for c in (w.get("counties") or []):
            g["counties"].add(str(c.get("id", "")))
            v = c.get("voiv_name") or county_voiv.get(str(c.get("id", "")))
            if v:
                g["voivs"].add(v)
        o, e = w.get("onset"), w.get("expires")
        if o and (g["onset"] is None or str(o) < str(g["onset"])):  g["onset"] = o
        if e and (g["expires"] is None or str(e) > str(g["expires"])): g["expires"] = e
    order = sorted(groups.items(), key=lambda kv: (-kv[1]["max"], -len(kv[1]["counties"])))

    img = Image.new("RGB", (W, H), BG)
    dr = ImageDraw.Draw(img, "RGBA")

    # skalowanie typografii — media oglądają to z dystansu, więc duże kroje
    k = W / 1920.0
    f_title = _font(max(30, int(52 * k)), bold=True)
    f_stamp = _font(max(15, int(23 * k)))
    f_secn  = _font(max(17, int(26 * k)), bold=True)
    f_card  = _font(max(16, int(25 * k)), bold=True)
    f_meta  = _font(max(14, int(20 * k)))
    f_leg   = _font(max(14, int(21 * k)))

    # ── pasek tytułu ──
    head_h = int(96 * k) if orientation == "landscape" else int(110 * k)
    dr.rectangle([0, 0, W, head_h], fill=PANEL)
    lx = int(28 * k)
    try:
        logo = Image.open(os.path.join(_DATA, "imgw_logo_pl.png")).convert("RGBA")
        lh = int(head_h * 0.56)
        logo = logo.resize((max(1, int(logo.width * lh / logo.height)), lh), Image.LANCZOS)
        img.paste(logo, (lx, (head_h - lh) // 2), logo)
        lx += logo.width + int(22 * k)
    except Exception:
        pass
    main_title = title or "OSTRZEŻENIA METEOROLOGICZNE"
    if voivodeship:
        main_title += f" — woj. {voivodeship.lower()}"
    dr.text((lx, head_h // 2), main_title, font=f_title, fill=TEXT, anchor="lm")
    stamp = (datetime.now(timezone.utc).astimezone(_TZ) if _TZ else datetime.now()).strftime("%d.%m.%Y, godz. %H:%M")  # czas lokalny (Europe/Warsaw)
    dr.text((W - int(28 * k), head_h // 2), f"stan na {stamp} (czas lokalny)",
            font=f_stamp, fill=TEXT_DIM, anchor="rm")

    pad = int(26 * k)
    label_h = int(36 * k)          # pas na nagłówki sekcji nad mapami
    body_y = head_h + pad + label_h
    legend_h = int(62 * k)
    body_h = H - body_y - legend_h - pad

    # Jedno zjawisko = mapa zbiorcza JEST mapą tego zjawiska, kafle nic nie wnoszą.
    # facets=False → świadoma rezygnacja z podziału (wariant „tylko mapa ogólna").
    single = (len(order) <= 1) or not facets
    if single:
        # Bez kafli prawa kolumna nie może świecić pustką — trafia tam
        # rozpisana lista zjawisk z województwami (wzór metryczki).
        if orientation == "landscape":
            side_w = int(W * 0.26)      # węziej — odzyskane miejsce dostaje mapa
            big_box = (pad, body_y, W - side_w - 2 * pad, body_h)
            side_box = (W - side_w - pad, body_y, side_w, body_h)
        else:
            side_h = int(body_h * 0.26)
            big_box = (pad, body_y, W - 2 * pad, body_h - side_h - int(16 * k))
            side_box = (pad, body_y + body_h - side_h, W - 2 * pad, side_h)
        grid_x = grid_y = grid_w = grid_h = 0
    elif orientation == "landscape":
        big_w = int(W * 0.50)
        big_box = (pad, body_y, big_w - pad, body_h)
        grid_x, grid_y = big_w + pad // 2, body_y
        grid_w, grid_h = W - big_w - pad - pad // 2, body_h
    else:
        big_h = int(body_h * 0.46)
        big_box = (pad, body_y, W - 2 * pad, big_h)
        grid_x, grid_y = pad, body_y + big_h + int(18 * k)
        grid_w, grid_h = W - 2 * pad, body_h - big_h - int(18 * k)

    # ── mapa zbiorcza ──
    _draw_map(dr, big_box, counties, voivs, _fills_from(warnings), geom_by_id, detail=True)
    if not single:
        dr.text((big_box[0] + 4, big_box[1] - int(6 * k)),
                "SYTUACJA OGÓLNA", font=f_secn, fill=TEXT_DIM, anchor="ls")
    n_c = len(_fills_from(warnings))
    if single and order:
        if len(order) == 1:
            phen, g = order[0]
            head = f"{PHEN_LABEL.get(phen, phen)} — stopień {g['max']}"
        else:
            head = "SYTUACJA OGÓLNA"
        dr.text((big_box[0] + 4, big_box[1] - int(6 * k)), head.upper(),
                font=f_secn, fill=TEXT, anchor="ls")
        dr.text((big_box[0] + big_box[2] - 4, big_box[1] - int(6 * k)),
                f"{n_c} powiatów", font=f_meta, fill=TEXT_DIM, anchor="rs")
    else:
        dr.text((big_box[0] + big_box[2] - 4, big_box[1] - int(6 * k)),
                f"{len(warnings)} ostrzeżeń · {n_c} powiatów",
                font=f_meta, fill=TEXT_DIM, anchor="rs")

    # ── panel z rozpisaną listą (tryb bez kafli) ──
    if single and order:
        sx, sy, sw, sh = side_box
        # Im mniej pozycji, tym większa typografia — panel ma wypełniać przestrzeń,
        # a nie zostawiać pustkę (media i tak kadrują).
        z = 1.45 if len(order) <= 2 else 1.2 if len(order) <= 4 else 1.0
        f_item = _font(max(17, int(28 * k * z)), bold=True)
        f_note = _font(max(14, int(21 * k * z)))
        ty = sy + int(6 * k)
        dr.text((sx, ty), f"AKTYWNE OSTRZEŻENIA: {len(warnings)}",
                font=f_secn, fill=TEXT, anchor="ls")
        ty += int(34 * k)
        for phen, g in order:
            if ty > sy + sh - int(50 * k):
                dr.text((sx, ty), "…", font=f_note, fill=TEXT_DIM); break
            box = int(24 * k * z)
            dr.rectangle([sx, ty, sx + box, ty + box],
                         fill=LEVEL_FILL.get(g["max"], LEVEL_FILL[1]))
            label = PHEN_LABEL.get(phen, phen.replace("_", " "))
            dr.text((sx + box + int(12 * k), ty - int(2 * k)),
                    _ellipsize(dr, f"{label} {g['max']}°", f_item, sw - box - int(16 * k)),
                    font=f_item, fill=TEXT)
            ty += int(34 * k * z)
            dr.text((sx, ty),
                    _ellipsize(dr, f"{len(g['counties'])} powiatów · "
                                   f"{_fmt(g['onset'])} → {_fmt(g['expires'])}", f_note, sw),
                    font=f_note, fill=TEXT_DIM)
            ty += int(28 * k * z)
            # pełna lista województw — zawijana, bez skracania (jest miejsce)
            voiv_txt = ", ".join(v.lower() for v in sorted(g["voivs"]))
            for ln in _wrap(dr, voiv_txt, f_note, sw)[:5]:
                dr.text((sx, ty), ln, font=f_note, fill=TEXT_DIM)
                ty += int(26 * k * z)
            ty += int(20 * k * z)

    # ── siatka mapek per zjawisko (pomijana, gdy zjawisko jest jedno) ──
    if not single:
        dr.text((grid_x + 4, grid_y - int(8 * k)), "WEDŁUG ZJAWISKA",
                font=f_secn, fill=TEXT_DIM, anchor="ls")
    if order and not single:
        # Kolumny dobierane tak, żeby kafel był dość szeroki na podpis
        # („Intensywne opady deszczu" przy 3 kolumnach się nie mieściło).
        cols = 2 if len(order) <= 4 else COLS
        rows = (len(order) + cols - 1) // cols
        cw = grid_w // cols
        ch = grid_h // max(1, rows)
        cap_h = int(104 * k)          # miejsce na 3-wierszowy podpis pod mapką
        for i, (phen, g) in enumerate(order):
            if i >= cols * rows:
                break
            cx = grid_x + (i % cols) * cw
            cy = grid_y + (i // cols) * ch
            mbox = (cx + int(6 * k), cy + int(4 * k),
                    cw - int(12 * k), ch - cap_h)
            _draw_map(dr, mbox, counties, voivs, _fills_from(g["ws"]),
                      geom_by_id, detail=False)
            # podpis
            ty = cy + ch - cap_h + int(8 * k)
            badge = int(20 * k)
            dr.rectangle([cx + int(8 * k), ty + int(4 * k),
                          cx + int(8 * k) + badge, ty + int(4 * k) + badge],
                         fill=LEVEL_FILL.get(g["max"], LEVEL_FILL[1]))
            # Każdy wiersz podpisu przycinany do szerokości kafla —
            # wcześniej długie nazwy i listy województw wychodziły na sąsiada.
            tx = cx + int(8 * k)
            inner = cw - int(20 * k)
            label = PHEN_LABEL.get(phen, phen.replace("_", " "))
            head_txt = _ellipsize(dr, f"{label} {g['max']}°", f_card,
                                  inner - badge - int(10 * k))
            dr.text((tx + badge + int(10 * k), ty), head_txt, font=f_card, fill=TEXT)
            ty += int(30 * k)
            meta = f"{len(g['counties'])} pow. · {_fmt(g['onset'])} → {_fmt(g['expires'])}"
            dr.text((tx, ty), _ellipsize(dr, meta, f_meta, inner), font=f_meta, fill=TEXT_DIM)
            ty += int(23 * k)
            vs = sorted(g["voivs"])
            voiv_txt = ", ".join(v.lower() for v in vs)
            if dr.textlength(voiv_txt, font=f_meta) > inner:
                # nie mieści się → skrót liczbowy zamiast urwanej listy
                voiv_txt = (f"{len(vs)} województw" if len(vs) > 4
                            else _ellipsize(dr, voiv_txt, f_meta, inner))
            dr.text((tx, ty), voiv_txt, font=f_meta, fill=TEXT_DIM)
        if len(order) > cols * rows:
            dr.text((grid_x + grid_w - 4, grid_y + grid_h + int(16 * k)),
                    f"+ {len(order) - cols * rows} kolejnych zjawisk",
                    font=f_meta, fill=TEXT_DIM, anchor="rs")
    elif not order:
        # A4: tylko gdy naprawdę nie ma ostrzeżeń. Wcześniej ta gałąź łapała także
        # tryb bez kafli (single) i rysowała napis w punkcie (0,0) — stąd „ucięty"
        # tekst w lewym górnym rogu infografiki.
        dr.text((big_box[0] + big_box[2] // 2, big_box[1] + big_box[3] // 2),
                "Brak aktywnych ostrzeżeń", font=f_secn, fill=TEXT_DIM, anchor="mm")

    # ── legenda stopni ──
    ly = H - legend_h + int(14 * k)
    lx = pad
    dr.text((lx, ly + int(9 * k)), "STOPIEŃ:", font=f_leg, fill=TEXT_DIM, anchor="lm")
    lx += int(dr.textlength("STOPIEŃ:", font=f_leg)) + int(22 * k)
    # Opisy wyłuskane z Tabeli nr 3 instrukcji IMGW — żaden stopień nie brzmi
    # jak „można zignorować" (przy upale to 1° zbiera żniwo wśród osób starszych).
    for lvl, name in ((1, "1° — zachowaj ostrożność"),
                      (2, "2° — przygotuj się"),
                      (3, "3° — podejmij działania")):
        sq = int(22 * k)
        dr.rectangle([lx, ly, lx + sq, ly + sq], fill=LEVEL_FILL[lvl])
        dr.text((lx + sq + int(9 * k), ly + sq // 2), name, font=f_leg, fill=TEXT, anchor="lm")
        lx += sq + int(dr.textlength(name, font=f_leg)) + int(38 * k)
    dr.text((W - pad, ly + int(11 * k)), "IMGW-PIB · osmet",
            font=f_leg, fill=TEXT_DIM, anchor="rm")

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return buf.getvalue()
