from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
import uuid


class County(BaseModel):
    id: str
    name: str
    voiv_id: str
    voiv_name: str
    lat: float
    lon: float


class WarningCreate(BaseModel):
    phenomenon: str
    params: Dict[str, Any] = {}
    counties: List[County] = []
    polygon: Optional[List[List[float]]] = None
    onset: str
    expires: str
    headline: Optional[str] = None
    description: Optional[str] = None
    instruction: Optional[str] = None
    sender: str = "imgw-pib@meteo.pl"
    sender_name: str = "IMGW-PIB Centrum Modelowania Meteorologicznego"
    altitude_from_m: Optional[float] = None
    altitude_to_m: Optional[float] = None
    # --- Update/Cancel fields ---
    msg_type: str = "Alert"          # Alert | Update | Cancel
    references_id: Optional[str] = None   # ID ostrzeżenia które to aktualizuje


class WarningDB(WarningCreate):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level: Optional[int] = None
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    cap_xml: Optional[str] = None
    # Status derived fields
    status: str = "pending"   # pending | active | expired | cancelled | updated


class LevelCheckRequest(BaseModel):
    phenomenon: str
    params: Dict[str, Any]


class LevelCheckResponse(BaseModel):
    level: Optional[int]
    phenomenon: str
    params: Dict[str, Any]


class SpatialQueryRequest(BaseModel):
    polygon: List[List[float]]
