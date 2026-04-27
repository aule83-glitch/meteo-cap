from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import json
import uuid
import os
from datetime import datetime
from typing import List

from app.models.schemas import (
    WarningCreate, WarningDB, LevelCheckRequest,
    LevelCheckResponse, SpatialQueryRequest, County
)
from app.services.warning_levels import (
    determine_warning_level, PHENOMENON_LABELS, MAX_LEVELS
)
from app.services.cap_generator import generate_cap_xml
from app.data.poland_voivodeships import VOIVODESHIPS_GEOJSON, COUNTIES_DATA

app = FastAPI(
    title="MeteoCAP Editor API",
    description="API do generowania ostrzeżeń meteorologicznych CAP 1.2",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage (replace with SQLite/PostgreSQL in production)
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
    return {"status": "ok", "service": "MeteoCAP Editor API v1.0"}


@app.get("/api/voivodeships")
def get_voivodeships():
    """Return GeoJSON of Polish voivodeships."""
    return JSONResponse(content=VOIVODESHIPS_GEOJSON)


@app.get("/api/counties")
def get_counties():
    """Return all counties with centroids."""
    return {"counties": COUNTIES_DATA}


@app.post("/api/spatial/counties-in-polygon")
def counties_in_polygon(req: SpatialQueryRequest):
    """
    Find counties whose centroid falls within the given polygon.
    Uses ray-casting algorithm.
    """
    polygon = req.polygon
    if len(polygon) < 3:
        raise HTTPException(400, "Polygon must have at least 3 points")

    result = []
    for county in COUNTIES_DATA:
        if point_in_polygon(county["lat"], county["lon"], polygon):
            result.append(county)

    return {"counties": result, "count": len(result)}


def point_in_polygon(lat: float, lon: float, polygon: List) -> bool:
    """Ray-casting algorithm for point-in-polygon test."""
    n = len(polygon)
    inside = False
    px, py = lon, lat
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][1], polygon[i][0]
        xj, yj = polygon[j][1], polygon[j][0]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


@app.post("/api/warnings/check-level", response_model=LevelCheckResponse)
def check_warning_level(req: LevelCheckRequest):
    """Calculate warning level based on phenomenon and parameters."""
    level = determine_warning_level(req.phenomenon, req.params)
    return LevelCheckResponse(
        level=level,
        phenomenon=req.phenomenon,
        params=req.params
    )


@app.post("/api/warnings", response_model=WarningDB)
def create_warning(warning: WarningCreate):
    """Create a new meteorological warning."""
    wid = str(uuid.uuid4())
    level = determine_warning_level(warning.phenomenon, warning.params)

    w_dict = warning.model_dump()
    w_dict["id"] = wid
    w_dict["level"] = level
    w_dict["created_at"] = datetime.utcnow().isoformat()

    # Generate CAP XML
    try:
        cap_xml = generate_cap_xml(w_dict)
        w_dict["cap_xml"] = cap_xml
    except Exception as e:
        w_dict["cap_xml"] = None

    WARNINGS_DB[wid] = w_dict
    save_warnings()

    return WarningDB(**w_dict)


@app.get("/api/warnings")
def list_warnings():
    """List all warnings."""
    warnings = list(WARNINGS_DB.values())
    warnings.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return {"warnings": warnings, "count": len(warnings)}


@app.get("/api/warnings/{warning_id}")
def get_warning(warning_id: str):
    """Get a specific warning."""
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    return w


@app.delete("/api/warnings/{warning_id}")
def delete_warning(warning_id: str):
    """Delete a warning."""
    if warning_id not in WARNINGS_DB:
        raise HTTPException(404, "Warning not found")
    del WARNINGS_DB[warning_id]
    save_warnings()
    return {"deleted": warning_id}


@app.get("/api/warnings/{warning_id}/xml")
def get_warning_xml(warning_id: str):
    """Download CAP 1.2 XML for a warning."""
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")

    cap_xml = w.get("cap_xml")
    if not cap_xml:
        # Regenerate
        try:
            cap_xml = generate_cap_xml(w)
        except Exception as e:
            raise HTTPException(500, f"XML generation failed: {str(e)}")

    phenomenon = w.get("phenomenon", "warning")
    level = w.get("level", 1)
    filename = f"ostrzezenie_{phenomenon}_st{level}_{warning_id[:8]}.xml"

    return Response(
        content=cap_xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


@app.get("/api/phenomena")
def get_phenomena():
    """Return list of all meteorological phenomena with metadata."""
    return {
        "phenomena": [
            {
                "id": pid,
                "label": label,
                "max_level": MAX_LEVELS.get(pid, 3)
            }
            for pid, label in PHENOMENON_LABELS.items()
        ]
    }
