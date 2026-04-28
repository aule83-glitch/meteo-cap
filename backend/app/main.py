from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import json, uuid, os, zipfile, io
from datetime import datetime, timezone
from typing import List

from app.models.schemas import (
    WarningCreate, WarningDB, LevelCheckRequest,
    LevelCheckResponse, SpatialQueryRequest
)
from app.services.warning_levels import (
    determine_warning_level, PHENOMENON_LABELS, MAX_LEVELS
)
from app.services.cap_generator import (
    generate_cap_xml, generate_cap_xml_per_county
)
from app.data.poland_voivodeships import (
    VOIVODESHIPS_GEOJSON, COUNTIES_DATA, COUNTIES_GEOJSON
)

app = FastAPI(
    title="MeteoCAP Editor API",
    description="API do generowania ostrzeżeń meteorologicznych CAP 1.2",
    version="1.2.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True,
    allow_methods=["*"], allow_headers=["*"],
)

# ---- Opcjonalna autoryzacja API Key ----
# Ustaw zmienną środowiskową METEOCAP_API_KEY w docker-compose.yml
# Jeśli pusta — autoryzacja wyłączona (tryb deweloperski)
_API_KEY = os.environ.get("METEOCAP_API_KEY", "")

from fastapi import Request as _Request
from fastapi.responses import JSONResponse as _JSONResponse

@app.middleware("http")
async def api_key_middleware(request: _Request, call_next):
    # Pomiń auth dla: healthcheck, dokumentacji, CORS preflight
    skip_paths = {"/", "/docs", "/redoc", "/openapi.json"}
    if not _API_KEY or request.method == "OPTIONS" or request.url.path in skip_paths:
        return await call_next(request)
    # Sprawdź nagłówek X-API-Key lub query param api_key
    key_header = request.headers.get("X-API-Key", "")
    key_query  = request.query_params.get("api_key", "")
    if key_header == _API_KEY or key_query == _API_KEY:
        return await call_next(request)
    return _JSONResponse(status_code=401, content={"error": "Unauthorized — brak lub błędny API key"})

WARNINGS_DB: dict = {}
STORAGE_FILE = "/data/warnings.json"

def load_warnings():
    if os.path.exists(STORAGE_FILE):
        try:
            with open(STORAGE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_warnings():
    os.makedirs("/data", exist_ok=True)
    with open(STORAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(WARNINGS_DB, f, ensure_ascii=False, indent=2)

def _compute_status(w: dict) -> str:
    """Oblicz aktualny status ostrzeżenia na podstawie czasu."""
    if w.get("msg_type") == "Cancel":
        return "cancelled"
    now = datetime.now(timezone.utc)
    try:
        onset   = datetime.fromisoformat(w["onset"].replace("Z", "+00:00"))
        expires = datetime.fromisoformat(w["expires"].replace("Z", "+00:00"))
    except Exception:
        return "unknown"
    if w.get("is_updated"):
        return "updated"
    if now < onset:
        return "pending"
    if now > expires:
        return "expired"
    return "active"

WARNINGS_DB = load_warnings()


@app.get("/")
def root():
    return {"status": "ok", "service": "MeteoCAP Editor API v1.2"}


@app.get("/api/voivodeships")
def get_voivodeships():
    return JSONResponse(content=VOIVODESHIPS_GEOJSON)


@app.get("/api/counties")
def get_counties():
    return {"counties": COUNTIES_DATA}


@app.get("/api/counties/geojson")
def get_counties_geojson():
    return JSONResponse(content=COUNTIES_GEOJSON)


@app.post("/api/spatial/counties-in-polygon")
def counties_in_polygon(req: SpatialQueryRequest):
    if len(req.polygon) < 3:
        raise HTTPException(400, "Polygon must have at least 3 points")
    result = [c for c in COUNTIES_DATA
              if point_in_polygon(c["lat"], c["lon"], req.polygon)]
    return {"counties": result, "count": len(result)}


def point_in_polygon(lat, lon, polygon):
    n, inside, j = len(polygon), False, len(polygon) - 1
    px, py = lon, lat
    for i in range(n):
        xi, yi = polygon[i][1], polygon[i][0]
        xj, yj = polygon[j][1], polygon[j][0]
        if ((yi > py) != (yj > py)) and \
           (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


@app.post("/api/warnings/check-level", response_model=LevelCheckResponse)
def check_warning_level(req: LevelCheckRequest):
    level = determine_warning_level(req.phenomenon, req.params)
    return LevelCheckResponse(level=level, phenomenon=req.phenomenon, params=req.params)


@app.post("/api/warnings", response_model=WarningDB)
def create_warning(warning: WarningCreate):
    wid   = str(uuid.uuid4())
    level = determine_warning_level(warning.phenomenon, warning.params)
    w     = warning.model_dump()
    w["id"]         = wid
    w["level"]      = level
    w["created_at"] = datetime.utcnow().isoformat()

    # Jeśli to Update — oznacz poprzednie jako zaktualizowane
    if w.get("msg_type") == "Update" and w.get("references_id"):
        ref = WARNINGS_DB.get(w["references_id"])
        if ref:
            ref["is_updated"] = True
            ref["updated_by"] = wid

    # Jeśli to Cancel — oznacz oryginalne jako anulowane
    if w.get("msg_type") == "Cancel" and w.get("references_id"):
        ref = WARNINGS_DB.get(w["references_id"])
        if ref:
            ref["is_cancelled"] = True
            ref["cancelled_by"] = wid

    w["status"] = _compute_status(w)
    try:
        w["cap_xml"] = generate_cap_xml(w)
    except Exception:
        w["cap_xml"] = None

    WARNINGS_DB[wid] = w
    save_warnings()

    # Wyślij do webhooków + FTP + email asynchronicznie
    if w.get("cap_xml") and w.get("msg_type") != "Cancel":
        dispatch_webhooks_async(w["cap_xml"], wid, warning_level=level)
        # Generuj nazwę pliku
        _ph  = w.get("phenomenon", "ostrzezenie")
        _lvl = w.get("level", 1)
        _ts  = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        _fname = f"IMGW_{_ph}_st{_lvl}_{_ts}.xml"
        dispatch_all_async(w["cap_xml"], _fname, w)

    return WarningDB(**w)


@app.get("/api/warnings")
def list_warnings(include_expired: bool = Query(False)):
    warnings = list(WARNINGS_DB.values())
    # Aktualizuj statusy dynamicznie
    for w in warnings:
        w["status"] = _compute_status(w)
    if not include_expired:
        warnings = [w for w in warnings if w["status"] != "expired"]
    warnings.sort(key=lambda x: x.get("onset", ""), reverse=True)
    return {"warnings": warnings, "count": len(warnings)}


@app.get("/api/warnings/active")
def get_active_warnings():
    """Tylko aktywne ostrzeżenia — dla widoku statusu na mapie."""
    now = datetime.now(timezone.utc)
    result = []
    for w in WARNINGS_DB.values():
        status = _compute_status(w)
        w["status"] = status
        if status in ("active", "pending"):
            result.append(w)
    result.sort(key=lambda x: (x.get("level", 0)), reverse=True)
    return {"warnings": result, "count": len(result)}


@app.get("/api/warnings/{warning_id}")
def get_warning(warning_id: str):
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    w["status"] = _compute_status(w)
    return w


@app.delete("/api/warnings/{warning_id}")
def delete_warning(warning_id: str):
    if warning_id not in WARNINGS_DB:
        raise HTTPException(404, "Warning not found")
    del WARNINGS_DB[warning_id]
    save_warnings()
    return {"deleted": warning_id}


@app.post("/api/warnings/{warning_id}/cancel")
def cancel_warning(warning_id: str):
    """Anuluj ostrzeżenie — tworzy nowy CAP z msgType=Cancel."""
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    cancel_data = WarningCreate(
        phenomenon=w["phenomenon"],
        params=w.get("params", {}),
        counties=w.get("counties", []),
        polygon=w.get("polygon"),
        onset=w["onset"],
        expires=w["expires"],
        msg_type="Cancel",
        references_id=warning_id,
    )
    return create_warning(cancel_data)


@app.get("/api/warnings/{warning_id}/xml")
def get_warning_xml(
    warning_id: str,
    mode: str = Query("collective", enum=["collective", "per_county"])
):
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    ph  = w.get("phenomenon", "warning")
    lvl = w.get("level", 1)
    uid = warning_id[:8]

    if mode == "per_county":
        xmls     = generate_cap_xml_per_county(w)
        counties = w.get("counties", [])
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (xml_str, county) in enumerate(
                zip(xmls, counties if counties else [{}] * len(xmls))
            ):
                cname = county.get("id", str(i).zfill(4))
                zf.writestr(f"ostrzezenie_{ph}_st{lvl}_{cname}.xml", xml_str)
        buf.seek(0)
        return Response(
            content=buf.read(), media_type="application/zip",
            headers={"Content-Disposition":
                     f'attachment; filename="ostrzezenia_{ph}_st{lvl}_{uid}.zip"'}
        )
    else:
        cap_xml  = w.get("cap_xml") or generate_cap_xml(w)
        return Response(
            content=cap_xml, media_type="application/xml",
            headers={"Content-Disposition":
                     f'attachment; filename="ostrzezenie_{ph}_st{lvl}_{uid}.xml"'}
        )


@app.get("/api/phenomena")
def get_phenomena():
    return {
        "phenomena": [
            {"id": pid, "label": label, "max_level": MAX_LEVELS.get(pid, 3)}
            for pid, label in PHENOMENON_LABELS.items()
        ]
    }


# ---- Phenomena config (icons, impacts, instructions) ----
from app.data.phenomenon_config import (
    PHENOMENON_ICONS, PHENOMENON_IMPACTS, PHENOMENON_INSTRUCTIONS
)

@app.get("/api/phenomena/config")
def get_phenomena_config():
    """Zwraca ikony, skutki i instrukcje dla każdego zjawiska i stopnia."""
    result = {}
    for pid in PHENOMENON_LABELS:
        result[pid] = {
            "label": PHENOMENON_LABELS[pid],
            "icon": PHENOMENON_ICONS.get(pid, "⚠"),
            "max_level": MAX_LEVELS.get(pid, 3),
            "impacts": PHENOMENON_IMPACTS.get(pid, {}),
            "instructions": PHENOMENON_INSTRUCTIONS.get(pid, {}),
        }
    return result


# ============================================================
# EKSPORT — SVG / PDF
# ============================================================
from app.services.map_exporter import generate_warning_svg
from app.services.pdf_generator import generate_warning_pdf, REPORTLAB_AVAILABLE


@app.get("/api/export/svg")
def export_svg(
    status_filter: str = Query("active,pending",
        description="Statusy do uwzględnienia (csv): active,pending,expired")
):
    """Eksport mapy ostrzeżeń jako SVG."""
    allowed = set(status_filter.split(","))
    warnings = [w for w in WARNINGS_DB.values()
                if _compute_status(w) in allowed]
    for w in warnings:
        w["status"] = _compute_status(w)

    svg = generate_warning_svg(warnings)
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Content-Disposition": 'attachment; filename="meteocap_mapa.svg"'}
    )


@app.get("/api/export/pdf")
def export_pdf(
    status_filter: str = Query("active,pending"),
    voivodeship: str = Query(None, description="Filtr województwa (opcjonalny)"),
    title: str = Query("Raport ostrzeżeń meteorologicznych — IMGW-PIB"),
):
    """Eksport raportu ostrzeżeń jako PDF."""
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(503, "ReportLab nie jest zainstalowany — PDF niedostępny")
    allowed = set(status_filter.split(","))
    warnings = list(WARNINGS_DB.values())
    for w in warnings:
        w["status"] = _compute_status(w)
    warnings = [w for w in warnings if w["status"] in allowed]

    pdf_bytes = generate_warning_pdf(
        warnings,
        title=title,
        voivodeship_filter=voivodeship,
    )
    if not pdf_bytes:
        raise HTTPException(500, "Błąd generowania PDF")

    now = datetime.utcnow().strftime("%Y%m%d_%H%M")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="meteocap_raport_{now}.pdf"'}
    )


# ============================================================
# METEOALARM — ostrzeżenia krajów ościennych
# ============================================================
from app.services.meteoalarm import (
    fetch_country_warnings, fetch_all_neighbors,
    get_cache_status, invalidate_cache, METEOALARM_FEEDS
)


@app.get("/api/meteoalarm/countries")
def get_meteoalarm_countries():
    """Lista dostępnych krajów MeteoAlarm z ich statusem cache."""
    cache_status = get_cache_status()
    return {
        "countries": [
            {
                "code": code,
                "name": info["name"],
                "flag": info["flag"],
                **cache_status.get(code, {"cached": False, "count": 0, "fresh": False}),
            }
            for code, info in METEOALARM_FEEDS.items()
        ]
    }


@app.get("/api/meteoalarm/warnings")
def get_meteoalarm_warnings(
    countries: str = Query(
        "DE,CZ,SK",
        description="Kody krajów oddzielone przecinkami: DE,CZ,SK,UA,LT,BY"
    ),
    refresh: bool = Query(False, description="Wymuś odświeżenie cache")
):
    """
    Pobiera ostrzeżenia MeteoAlarm dla wybranych krajów.
    Cache 10 minut — pierwsze wywołanie może potrwać ~3s.
    """
    country_list = [c.strip().upper() for c in countries.split(",") if c.strip()]
    valid = [c for c in country_list if c in METEOALARM_FEEDS]

    if not valid:
        raise HTTPException(400, f"Nieprawidłowe kody krajów. Dostępne: {list(METEOALARM_FEEDS.keys())}")

    if refresh:
        for cc in valid:
            invalidate_cache(cc)

    results = fetch_all_neighbors(valid, timeout=10)

    all_warnings = []
    for cc, warnings in results.items():
        all_warnings.extend(warnings)

    # Sortuj po poziomie (najwyższe najpierw)
    all_warnings.sort(key=lambda w: w.get("level", 0), reverse=True)

    return {
        "warnings": all_warnings,
        "count": len(all_warnings),
        "countries_requested": valid,
        "countries_with_data": [cc for cc, w in results.items() if w],
    }


@app.delete("/api/meteoalarm/cache")
def clear_meteoalarm_cache(country: str = Query(None)):
    """Czyści cache MeteoAlarm."""
    invalidate_cache(country)
    return {"cleared": country or "all"}


# ============================================================
# WEBHOOKI
# ============================================================
from app.services.webhook import (
    load_webhooks, save_webhooks, dispatch_webhooks_async, test_webhook
)
from pydantic import BaseModel as _BM

class WebhookCreate(_BM):
    name: str
    url: str
    active: bool = True
    min_level: int = 1          # Minimalne st. ostrzeżenia do wysłania (1/2/3)
    headers: dict = {}          # Dodatkowe nagłówki HTTP (np. Authorization)
    description: str = ""


@app.get("/api/webhooks")
def list_webhooks():
    return {"webhooks": load_webhooks()}


@app.post("/api/webhooks")
def create_webhook(wh: WebhookCreate):
    webhooks = load_webhooks()
    new = wh.model_dump()
    new["id"] = f"wh-{int(time.time())}"
    webhooks.append(new)
    save_webhooks(webhooks)
    return new


@app.put("/api/webhooks/{wh_id}")
def update_webhook(wh_id: str, wh: WebhookCreate):
    webhooks = load_webhooks()
    for i, w in enumerate(webhooks):
        if w.get("id") == wh_id:
            updated = wh.model_dump()
            updated["id"] = wh_id
            webhooks[i] = updated
            save_webhooks(webhooks)
            return updated
    raise HTTPException(404, "Webhook not found")


@app.delete("/api/webhooks/{wh_id}")
def delete_webhook(wh_id: str):
    webhooks = load_webhooks()
    webhooks = [w for w in webhooks if w.get("id") != wh_id]
    save_webhooks(webhooks)
    return {"deleted": wh_id}


@app.post("/api/webhooks/{wh_id}/test")
def test_webhook_endpoint(wh_id: str):
    webhooks = load_webhooks()
    wh = next((w for w in webhooks if w.get("id") == wh_id), None)
    if not wh:
        raise HTTPException(404, "Webhook not found")
    result = test_webhook(wh["url"], wh.get("headers", {}))
    return result


# ============================================================
# SZABLONY OSTRZEŻEŃ
# ============================================================
import json as _json

TEMPLATES_FILE = "/data/templates.json"

def _load_templates():
    if not os.path.exists(TEMPLATES_FILE):
        return []
    try:
        with open(TEMPLATES_FILE, encoding="utf-8") as f:
            return _json.load(f)
    except Exception:
        return []

def _save_templates(templates):
    os.makedirs("/data", exist_ok=True)
    with open(TEMPLATES_FILE, "w", encoding="utf-8") as f:
        _json.dump(templates, f, ensure_ascii=False, indent=2)


class TemplateCreate(_BM):
    name: str
    description: str = ""
    phenomenon: str
    params: dict = {}
    headline: str = ""
    instruction: str = ""
    altitude_from_m: float = None
    altitude_to_m: float = None


@app.get("/api/templates")
def list_templates():
    return {"templates": _load_templates()}


@app.post("/api/templates")
def create_template(tpl: TemplateCreate):
    templates = _load_templates()
    new = tpl.model_dump()
    new["id"] = f"tpl-{int(time.time())}"
    new["created_at"] = datetime.utcnow().isoformat()
    templates.append(new)
    _save_templates(templates)
    return new


@app.delete("/api/templates/{tpl_id}")
def delete_template(tpl_id: str):
    templates = [t for t in _load_templates() if t.get("id") != tpl_id]
    _save_templates(templates)
    return {"deleted": tpl_id}


# ============================================================
# IMPORT CAP XML
# ============================================================
from fastapi import UploadFile, File
import xml.etree.ElementTree as _ET

CAP_NS = "urn:oasis:names:tc:emergency:cap:1.2"

def _text(el, tag):
    found = el.find(f"{{{CAP_NS}}}{tag}")
    return found.text.strip() if found is not None and found.text else None


@app.post("/api/import/cap-xml")
async def import_cap_xml(file: UploadFile = File(...)):
    """
    Importuje ostrzeżenie z pliku CAP 1.2 XML.
    Zwraca strukturę kompatybilną z WarningCreate — gotową do wczytania w edytorze.
    """
    content = await file.read()
    try:
        root = _ET.fromstring(content)
    except _ET.ParseError as e:
        raise HTTPException(400, f"Nieprawidłowy XML: {e}")

    if root.tag != f"{{{CAP_NS}}}alert":
        raise HTTPException(400, "Plik nie jest alertem CAP 1.2")

    # Podstawowe pola
    msg_type  = _text(root, "msgType") or "Alert"
    ref_str   = _text(root, "references")
    references_id = None
    if ref_str:
        # Format: "sender,identifier,sent" — wyciągnij identifier
        parts = ref_str.split(",")
        if len(parts) >= 2:
            references_id = parts[1].strip()

    # Pierwszy blok info (preferuj pl-PL)
    infos = root.findall(f"{{{CAP_NS}}}info")
    info = next((i for i in infos if _text(i, "language") == "pl-PL"), None) or \
           (infos[0] if infos else None)

    if info is None:
        raise HTTPException(400, "Brak bloku <info> w CAP XML")

    onset   = _text(info, "onset")
    expires = _text(info, "expires")
    headline = _text(info, "headline") or ""
    description = _text(info, "description") or ""
    instruction = _text(info, "instruction") or ""

    # Parametry
    params_raw = {}
    awareness_type = None
    for param in info.findall(f"{{{CAP_NS}}}parameter"):
        vn = _text(param, "valueName")
        vv = _text(param, "value")
        if vn and vv:
            if vn == "awareness_type":
                awareness_type = vv
            elif vn.startswith("meteo_"):
                key = vn[6:]
                # Spróbuj skonwertować na liczbę
                try:
                    params_raw[key] = float(vv) if '.' in vv else int(vv)
                except ValueError:
                    params_raw[key] = vv

    # Wyznacz zjawisko
    from app.services.meteoalarm import AWARENESS_TYPE_MAP
    phenomenon = "silny_wiatr"
    if awareness_type:
        for key, val in AWARENESS_TYPE_MAP.items():
            if key in awareness_type.lower():
                phenomenon = val
                break

    # Obszar — geocody TERYT
    counties = []
    polygon = None
    from app.data.poland_voivodeships import COUNTIES_DATA
    county_by_id = {c["id"]: c for c in COUNTIES_DATA}

    for area in info.findall(f"{{{CAP_NS}}}area"):
        # Polygon
        poly_el = area.find(f"{{{CAP_NS}}}polygon")
        if poly_el is not None and poly_el.text and polygon is None:
            try:
                coords = []
                for pair in poly_el.text.strip().split():
                    lat, lon = pair.split(",")
                    coords.append([float(lat), float(lon)])
                polygon = coords
            except Exception:
                pass

        # Altitude/Ceiling
        alt_el  = area.find(f"{{{CAP_NS}}}altitude")
        ceil_el = area.find(f"{{{CAP_NS}}}ceiling")

        # Geocodes → powiaty
        for gc in area.findall(f"{{{CAP_NS}}}geocode"):
            vn = _text(gc, "valueName")
            vv = _text(gc, "value")
            if vn == "TERYT" and vv and vv in county_by_id:
                c = county_by_id[vv]
                if not any(x["id"] == vv for x in counties):
                    counties.append(c)

    # Elewacja (z pierwszego area)
    alt_from = alt_to = None
    first_area = info.find(f"{{{CAP_NS}}}area")
    if first_area is not None:
        alt_el  = first_area.find(f"{{{CAP_NS}}}altitude")
        ceil_el = first_area.find(f"{{{CAP_NS}}}ceiling")
        if alt_el is not None and alt_el.text:
            alt_from = round(float(alt_el.text) / 3.28084, 1)  # feet → metry
        if ceil_el is not None and ceil_el.text:
            alt_to = round(float(ceil_el.text) / 3.28084, 1)

    return {
        "phenomenon": phenomenon,
        "params": params_raw,
        "counties": counties,
        "polygon": polygon,
        "onset": onset,
        "expires": expires,
        "headline": headline,
        "description": description,
        "instruction": instruction,
        "msg_type": msg_type,
        "references_id": references_id,
        "altitude_from_m": alt_from,
        "altitude_to_m": alt_to,
        "_source_file": file.filename,
    }


# ============================================================
# DYSTRYBUCJA — FTP + EMAIL
# ============================================================
from app.services.delivery import (
    load_config as _load_delivery_config,
    save_config as _save_delivery_config,
    test_ftp_connection, test_smtp_connection,
    dispatch_all_async, _append_delivery_log
)


@app.get("/api/delivery/config")
def get_delivery_config():
    """Pobierz konfigurację FTP i email (hasła zamaskowane)."""
    cfg = _load_delivery_config()
    # Maskuj hasła w odpowiedzi
    safe = json.loads(json.dumps(cfg))
    for ftp in safe.get("ftp", []):
        if ftp.get("password"):
            ftp["password"] = "***"
    if safe.get("email", {}).get("smtp_password"):
        safe["email"]["smtp_password"] = "***"
    return safe


@app.put("/api/delivery/config")
def update_delivery_config(config: dict):
    """
    Zapisz konfigurację FTP i email.
    Jeśli hasło = '***', zachowaj poprzednie.
    """
    existing = _load_delivery_config()
    # Odtwórz zamaskowane hasła
    for i, ftp in enumerate(config.get("ftp", [])):
        if ftp.get("password") == "***":
            old = next((f for f in existing.get("ftp",[]) if f.get("host")==ftp.get("host")), {})
            config["ftp"][i]["password"] = old.get("password", "")
    if config.get("email", {}).get("smtp_password") == "***":
        config["email"]["smtp_password"] = existing.get("email", {}).get("smtp_password", "")
    _save_delivery_config(config)
    return {"saved": True}


@app.post("/api/delivery/test-ftp")
def test_ftp(ftp_config: dict):
    return test_ftp_connection(ftp_config)


@app.post("/api/delivery/test-smtp")
def test_smtp(email_config: dict):
    return test_smtp_connection(email_config)


@app.get("/api/delivery/log")
def get_delivery_log(limit: int = Query(50)):
    log_file = "/data/delivery_log.json"
    if not os.path.exists(log_file):
        return {"log": []}
    try:
        with open(log_file, encoding="utf-8") as f:
            log = json.load(f)
        return {"log": log[:limit]}
    except Exception:
        return {"log": []}
