from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import json, uuid, os, zipfile, io
from datetime import datetime
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
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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

WARNINGS_DB = load_warnings()


@app.get("/")
def root():
    return {"status": "ok", "service": "MeteoCAP Editor API v1.1"}


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


def point_in_polygon(lat: float, lon: float, polygon: List) -> bool:
    n, inside = len(polygon), False
    px, py, j = lon, lat, n - 1
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
    return LevelCheckResponse(level=level,
                               phenomenon=req.phenomenon,
                               params=req.params)


@app.post("/api/warnings", response_model=WarningDB)
def create_warning(warning: WarningCreate):
    wid   = str(uuid.uuid4())
    level = determine_warning_level(warning.phenomenon, warning.params)
    w     = warning.model_dump()
    w["id"]         = wid
    w["level"]      = level
    w["created_at"] = datetime.utcnow().isoformat()
    try:
        w["cap_xml"] = generate_cap_xml(w)        # zbiorczy XML
    except Exception as e:
        w["cap_xml"] = None
    WARNINGS_DB[wid] = w
    save_warnings()
    return WarningDB(**w)


@app.get("/api/warnings")
def list_warnings():
    warnings = sorted(WARNINGS_DB.values(),
                      key=lambda x: x.get("created_at", ""), reverse=True)
    return {"warnings": warnings, "count": len(warnings)}


@app.get("/api/warnings/{warning_id}")
def get_warning(warning_id: str):
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    return w


@app.delete("/api/warnings/{warning_id}")
def delete_warning(warning_id: str):
    if warning_id not in WARNINGS_DB:
        raise HTTPException(404, "Warning not found")
    del WARNINGS_DB[warning_id]
    save_warnings()
    return {"deleted": warning_id}


@app.get("/api/warnings/{warning_id}/xml")
def get_warning_xml(
    warning_id: str,
    mode: str = Query("collective", enum=["collective", "per_county"])
):
    """
    Pobierz CAP XML.
    - mode=collective (domyślny): jeden plik XML dla całego obszaru
    - mode=per_county: ZIP z osobnym XML dla każdego powiatu (format IMGW)
    """
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")

    ph  = w.get("phenomenon", "warning")
    lvl = w.get("level", 1)
    uid = warning_id[:8]

    if mode == "per_county":
        xmls = generate_cap_xml_per_county(w)
        counties = w.get("counties", [])

        # Spakuj do ZIP
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for i, (xml_str, county) in enumerate(
                zip(xmls, counties if counties else [{}] * len(xmls))
            ):
                cname = county.get("id", str(i).zfill(4))
                fname = f"ostrzezenie_{ph}_st{lvl}_{cname}.xml"
                zf.writestr(fname, xml_str)
        buf.seek(0)
        zip_filename = f"ostrzezenia_{ph}_st{lvl}_{uid}.zip"
        return Response(
            content=buf.read(),
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{zip_filename}"'}
        )
    else:
        # Zbiorczy
        cap_xml = w.get("cap_xml") or generate_cap_xml(w)
        filename = f"ostrzezenie_{ph}_st{lvl}_{uid}.xml"
        return Response(
            content=cap_xml,
            media_type="application/xml",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )


@app.get("/api/phenomena")
def get_phenomena():
    return {
        "phenomena": [
            {"id": pid, "label": label, "max_level": MAX_LEVELS.get(pid, 3)}
            for pid, label in PHENOMENON_LABELS.items()
        ]
    }
