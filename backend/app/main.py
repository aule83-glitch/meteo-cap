from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
import json, uuid, os, zipfile, io
from datetime import datetime, timezone
from typing import List, Optional

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
                data = json.load(f)
            return _migrate_to_v2_1(data)
        except Exception:
            pass
    return {}

def _migrate_to_v2_1(db: dict) -> dict:
    """
    Migracja v2.0 → v2.1 — dodaje pola drzewa wersji.
    Stare rekordy bez warning_group_id dostają je na podstawie references_id chain.
    """
    if not db:
        return db
    # Pierwsza pętla: każdy rekord który nie ma group_id — znajdź root przez references_id
    for wid, w in db.items():
        if "warning_group_id" in w:
            continue
        # Znajdź root chain
        root = w
        seen = {wid}
        while root.get("references_id") and root["references_id"] in db:
            ref_id = root["references_id"]
            if ref_id in seen:
                break  # cycle protection
            seen.add(ref_id)
            root = db[ref_id]
        w["warning_group_id"] = root["id"]
        w["parent_id"] = w.get("references_id")
    # Druga pętla: oblicz version (głębokość w drzewie) i is_active_leaf
    for wid, w in db.items():
        if "version" not in w:
            v = 1
            cur = w
            while cur.get("parent_id") and cur["parent_id"] in db:
                cur = db[cur["parent_id"]]
                v += 1
                if v > 100:
                    break
            w["version"] = v
        if "is_active_leaf" not in w:
            # Aktywny liść = nie zastąpione i nie anulowane
            is_superseded = bool(w.get("is_updated") or w.get("superseded_by"))
            is_cancelled  = bool(w.get("is_cancelled") or w.get("msg_type") == "Cancel")
            w["is_active_leaf"] = not (is_superseded or is_cancelled)
        if "operation_hint" not in w:
            mt = w.get("msg_type", "Alert")
            if mt == "Alert":     w["operation_hint"] = "create"
            elif mt == "Cancel":  w["operation_hint"] = "full_cancel"
            else:                 w["operation_hint"] = "amend"
    return db

def save_warnings():
    os.makedirs("/data", exist_ok=True)
    with open(STORAGE_FILE, "w", encoding="utf-8") as f:
        json.dump(WARNINGS_DB, f, ensure_ascii=False, indent=2)

def _compute_status(w: dict) -> str:
    """Oblicz aktualny status ostrzeżenia na podstawie czasu i flag."""
    # Anulowane (Cancel CAP wydany przez oryginał lub to samo jest Cancel)
    if w.get("msg_type") == "Cancel":
        return "cancelled"
    if w.get("is_cancelled"):
        return "cancelled"
    # Zastąpione aktualizacją
    if w.get("is_updated") or w.get("superseded_by"):
        return "updated"
    now = datetime.now(timezone.utc)
    try:
        onset   = datetime.fromisoformat(w["onset"].replace("Z", "+00:00"))
        expires = datetime.fromisoformat(w["expires"].replace("Z", "+00:00"))
    except Exception:
        return "unknown"
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

    # === Pola drzewa wersji (v2.1) ===
    parent_id = w.get("references_id")
    if parent_id and parent_id in WARNINGS_DB:
        # To jest Update lub kontynuacja w drzewie
        parent = WARNINGS_DB[parent_id]
        w["warning_group_id"] = parent.get("warning_group_id", parent_id)
        w["parent_id"]        = parent_id
        w["version"]          = parent.get("version", 1) + 1
    else:
        # Nowe ostrzeżenie — root drzewa
        w["warning_group_id"] = wid
        w["parent_id"]        = None
        w["version"]          = 1

    # operation_hint — domyślnie z msg_type, można nadpisać explicite z requesta
    if "operation_hint" not in w or not w.get("operation_hint"):
        mt = w.get("msg_type", "Alert")
        if mt == "Alert":     w["operation_hint"] = "create"
        elif mt == "Cancel":  w["operation_hint"] = "full_cancel"
        else:                 w["operation_hint"] = "amend"

    # is_active_leaf — domyślnie True dla nowych Alert/Update; Cancel staje się liściem cancelled
    is_cancelled = w.get("msg_type") == "Cancel"
    w["is_active_leaf"] = not is_cancelled

    # Jeśli to Update — oznacz poprzednie jako zaktualizowane (NIE jest już aktywnym liściem)
    if w.get("msg_type") == "Update" and parent_id:
        ref = WARNINGS_DB.get(parent_id)
        if ref:
            ref["is_updated"]    = True
            ref["updated_by"]    = wid
            ref["superseded_by"] = wid
            ref["is_active_leaf"] = False

    # Jeśli to Cancel — oznacz oryginalne jako anulowane
    if w.get("msg_type") == "Cancel" and parent_id:
        ref = WARNINGS_DB.get(parent_id)
        if ref:
            ref["is_cancelled"]   = True
            ref["cancelled_by"]   = wid
            ref["is_active_leaf"] = False

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
def list_warnings(
    include_archived: bool = Query(True, description="Uwzględnij anulowane i zastąpione (archiwum)"),
    include_expired:  bool = Query(False),
):
    """
    Zwraca listę ostrzeżeń.
    - include_archived=true  → historia zawiera cancelled + updated (archiwum)
    - include_expired=false  → ukrywa naturalnie wygasłe
    Anulowane i zastąpione są ZAWSZE widoczne w historii (archiwum CAP).
    """
    warnings = list(WARNINGS_DB.values())
    for w in warnings:
        w["status"] = _compute_status(w)

    result = []
    for w in warnings:
        st = w["status"]
        if st == "expired" and not include_expired:
            continue
        result.append(w)

    result.sort(key=lambda x: x.get("onset", ""), reverse=True)
    return {"warnings": result, "count": len(result)}


@app.delete("/api/warnings/{warning_id}")
def delete_warning(warning_id: str):
    """
    Usuwa ostrzeżenie z bazy.
    Ostrzeżeń aktywnych/nadchodzących NIE MOŻNA usunąć — należy je najpierw anulować.
    """
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    status = _compute_status(w)
    if status in ("active", "pending"):
        raise HTTPException(
            409,
            "Nie można usunąć aktywnego/nadchodzącego ostrzeżenia. "
            "Najpierw wydaj CAP Cancel, a następnie usuń z historii."
        )
    del WARNINGS_DB[warning_id]
    save_warnings()
    return {"deleted": warning_id}


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


@app.get("/api/warnings/default-texts")
def get_default_texts(
    phenomenon: str = Query(...),
    level: int = Query(...),
    params: str = Query(default="{}")
):
    """
    Zwraca domyślne teksty dla danego zjawiska i stopnia w obu językach (PL + EN).
    - description_pl/en: opis meteorologiczny z warning_texts.py
    - impacts_pl/en:     spodziewane skutki (PL z phenomenon_config, EN z warning_texts)
    - instruction_pl/en: zalecenia (PL z phenomenon_config, EN z warning_texts)

    Wstecz-kompatybilność: zwraca też description, impacts, instruction (wskazują na PL).
    """
    import json
    from app.data.warning_texts import WARNING_CONFIG
    from app.data.phenomenon_config import PHENOMENON_IMPACTS, PHENOMENON_INSTRUCTIONS
    from app.services.cap_generator import _fmt_params

    cfg = WARNING_CONFIG.get(phenomenon)
    if not cfg:
        raise HTTPException(404, f"Zjawisko '{phenomenon}' nie znalezione")
    level_cfg = cfg.get("levels", {}).get(level)
    if not level_cfg:
        raise HTTPException(404, f"Brak konfiguracji stopnia {level} dla '{phenomenon}'")

    try:
        params_dict = json.loads(params)
    except Exception:
        params_dict = {}

    # Description
    description_pl = _fmt_params(level_cfg.get("description_pl", ""), params_dict)
    description_en = _fmt_params(level_cfg.get("description_en", ""), params_dict)

    # Impacts: PL z phenomenon_config (lista punktów), EN z warning_texts (tekst)
    impacts_list_pl = PHENOMENON_IMPACTS.get(phenomenon, {}).get(level, [])
    if impacts_list_pl:
        impacts_pl = "\n".join(f"• {i}" for i in impacts_list_pl)
    else:
        impacts_pl = level_cfg.get("impacts_pl", "")
    impacts_en = level_cfg.get("impacts_en", "")

    # Instructions: PL z phenomenon_config, EN z warning_texts
    instructions_list_pl = PHENOMENON_INSTRUCTIONS.get(phenomenon, {}).get(level, [])
    if instructions_list_pl:
        instruction_pl = "\n".join(f"• {i}" for i in instructions_list_pl)
    else:
        instruction_pl = level_cfg.get("instruction_pl", "")
    instruction_en = level_cfg.get("instruction_en", "")

    return {
        "phenomenon":     phenomenon,
        "level":          level,
        # Wstecz-kompatybilność (= PL)
        "description":    description_pl,
        "impacts":        impacts_pl,
        "instruction":    instruction_pl,
        # Wersje językowe
        "description_pl": description_pl,
        "description_en": description_en,
        "impacts_pl":     impacts_pl,
        "impacts_en":     impacts_en,
        "instruction_pl": instruction_pl,
        "instruction_en": instruction_en,
    }

@app.get("/api/warnings/{warning_id}")
def get_warning(warning_id: str):
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    w["status"] = _compute_status(w)
    return w


@app.post("/api/warnings/{warning_id}/cancel")
def cancel_warning(warning_id: str, body: Optional[dict] = None):
    """
    Anuluj ostrzeżenie (full cancel).
    Oznacza oryginał jako cancelled, generuje CAP Cancel XML i dystrybuuje.
    NIE tworzy nowego rekordu w bazie — oryginał trafia do archiwum jako 'Anulowane'.

    Opcjonalne body: { "reason_code": "ended|not_occurred|downgrade|custom", "reason_text": "..." }
    """
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    if w.get("is_cancelled") or w.get("msg_type") == "Cancel":
        raise HTTPException(409, "Ostrzeżenie jest już anulowane")

    # Powód anulowania
    body = body or {}
    reason_code = body.get("reason_code", "ended")
    reason_text = body.get("reason_text") or {
        "ended":         "Zjawisko ustąpiło.",
        "not_occurred":  "Zjawisko nie wystąpiło.",
        "downgrade":     "Zagrożenie zmalało poniżej poziomu ostrzeżenia.",
    }.get(reason_code, "Ostrzeżenie odwołane.")

    # Oznacz oryginał jako anulowany
    w["is_cancelled"]   = True
    w["cancelled_at"]   = datetime.utcnow().isoformat()
    w["cancel_reason"]  = reason_text
    w["status"]         = "cancelled"
    w["is_active_leaf"] = False

    # Generuj CAP Cancel XML do dystrybucji (nie zapisujemy jako osobny rekord)
    cancel_w = {**w, "msg_type": "Cancel", "references_id": warning_id, "description": reason_text}
    try:
        cancel_xml = generate_cap_xml(cancel_w)
        w["cancel_xml"] = cancel_xml  # zachowaj XML Cancel w oryginale dla pobrania
        # Dystrybuuj CAP Cancel
        _ph    = w.get("phenomenon", "ostrzezenie")
        _lvl   = w.get("level", 1)
        _ts    = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        _fname = f"IMGW_{_ph}_st{_lvl}_{_ts}_CANCEL.xml"
        dispatch_webhooks_async(cancel_xml, warning_id, warning_level=_lvl)
        dispatch_all_async(cancel_xml, _fname, cancel_w)
    except Exception:
        pass

    save_warnings()
    return w


@app.get("/api/warnings/{warning_id}/group")
def get_warning_group(warning_id: str):
    """Zwraca wszystkie wersje tej samej grupy (drzewa) ostrzeżenia, posortowane chronologicznie."""
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    group_id = w.get("warning_group_id") or w["id"]
    versions = [v for v in WARNINGS_DB.values() if v.get("warning_group_id") == group_id]
    versions.sort(key=lambda x: (x.get("version", 1), x.get("created_at", "")))
    return {"group_id": group_id, "versions": versions}


@app.get("/api/warnings/{warning_id}/chain-zip")
def get_warning_chain_zip(warning_id: str):
    """
    Pobierz pełen łańcuch CAP XML wszystkich wersji grupy jako ZIP.
    Każdy plik nazwany v{N}_{operation}_{id}.xml + dodatkowo manifest.txt z chronologią.
    Użyteczne dla audytu, prokuratury, weryfikacji sprawdzalności.
    """
    import io, zipfile
    from fastapi.responses import StreamingResponse

    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    group_id = w.get("warning_group_id") or w["id"]
    versions = [v for v in WARNINGS_DB.values() if v.get("warning_group_id") == group_id]
    versions.sort(key=lambda x: (x.get("version", 1), x.get("created_at", "")))

    buf = io.BytesIO()
    manifest_lines = [
        f"MeteoCAP — łańcuch CAP dla grupy ostrzeżenia",
        f"Group ID: {group_id}",
        f"Liczba wersji: {len(versions)}",
        f"Wygenerowano: {datetime.utcnow().isoformat()}Z",
        "",
        "=" * 70,
        "CHRONOLOGIA WERSJI",
        "=" * 70,
        "",
    ]

    OP_LABELS = {
        "create": "Wydanie", "amend": "Korekta", "escalate": "Eskalacja",
        "deescalate": "Deeskalacja", "extend": "Przedłużenie", "shorten": "Skrócenie",
        "expand_area": "Powiększenie obszaru", "cut_area": "Wycięcie obszaru",
        "partial_cancel": "Cancel (część obszaru)", "full_cancel": "Cancel",
    }

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for v in versions:
            ver = v.get("version", 1)
            op = v.get("operation_hint", v.get("msg_type", "unknown"))
            mt = v.get("msg_type", "Alert")
            vid = v["id"][:8]
            xml = v.get("cap_xml") or v.get("cancel_xml") or ""
            if not xml:
                continue
            fname = f"v{ver:02d}_{op}_{vid}.xml"
            zf.writestr(fname, xml)

            # Wpis w manifeście
            ts = v.get("created_at", "")
            counties = v.get("counties", [])
            level = v.get("level", "?")
            status = "ANULOWANE" if v.get("is_cancelled") else (
                "AKTYWNE" if v.get("is_active_leaf") else "ZASTĄPIONE"
            )
            manifest_lines.extend([
                f"v{ver}  [{ts}]  {OP_LABELS.get(op, op)}",
                f"      msgType: {mt}  |  Stopień: {level}  |  Status: {status}",
                f"      Powiaty: {len(counties)}  |  Plik: {fname}",
                f"      ID: {v['id']}",
            ])
            if v.get("references_id"):
                manifest_lines.append(f"      References: {v['references_id']}")
            if v.get("cancel_reason"):
                manifest_lines.append(f"      Powód anulowania: {v['cancel_reason']}")
            manifest_lines.append("")

        # Manifest
        zf.writestr("MANIFEST.txt", "\n".join(manifest_lines))

    buf.seek(0)
    fname = f"meteocap_chain_{group_id[:8]}_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.zip"
    return StreamingResponse(
        iter([buf.read()]),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'}
    )


@app.get("/api/warnings/{warning_id}/tree")
def get_warning_tree(warning_id: str):
    """
    Zwraca strukturę drzewa wersji jako węzły + krawędzie.
    Dla wizualizacji SVG.
    """
    w = WARNINGS_DB.get(warning_id)
    if not w:
        raise HTTPException(404, "Warning not found")
    group_id = w.get("warning_group_id") or w["id"]
    versions = [v for v in WARNINGS_DB.values() if v.get("warning_group_id") == group_id]
    nodes = []
    edges = []
    for v in versions:
        # Status node
        if v.get("is_cancelled"):       node_status = "cancelled"
        elif v.get("is_active_leaf"):   node_status = "active"
        else:                            node_status = "superseded"
        nodes.append({
            "id":          v["id"],
            "version":     v.get("version", 1),
            "level":       v.get("level"),
            "operation":   v.get("operation_hint", "unknown"),
            "msg_type":    v.get("msg_type"),
            "created_at":  v.get("created_at"),
            "status":      node_status,
            "counties_count": len(v.get("counties", [])),
            "headline":    v.get("headline", ""),
            "is_active_leaf": bool(v.get("is_active_leaf")),
        })
        if v.get("parent_id"):
            edges.append({"from": v["parent_id"], "to": v["id"]})
    return {"group_id": group_id, "nodes": nodes, "edges": edges}


@app.post("/api/warnings/{warning_id}/partial-cancel")
def partial_cancel_warning(warning_id: str, body: dict):
    """
    Wytnij część obszaru z ostrzeżenia.
    Tworzy DWA dzieci tej samej wersji:
    - B: Update z pozostałymi powiatami (kontynuacja, is_active_leaf=True)
    - C: Cancel z wyciętymi powiatami (cancelled, is_active_leaf=False, NIE tworzymy nowego rekordu — tylko CAP XML)

    Body: {
      "counties_to_cancel": ["county_id_1", ...],
      "description_continuation": "...",  // opis dla B (opcjonalny — wczyta szablon cut_area)
      "reason_code": "ended|not_occurred|downgrade|custom",
      "reason_text": "..."  // opcjonalny tekst własny dla cancel
    }
    """
    orig = WARNINGS_DB.get(warning_id)
    if not orig:
        raise HTTPException(404, "Warning not found")
    if not orig.get("is_active_leaf"):
        raise HTTPException(409, "Można wycinać obszar tylko z aktywnego liścia drzewa")

    counties_to_cancel = set(body.get("counties_to_cancel", []))
    if not counties_to_cancel:
        raise HTTPException(400, "Lista counties_to_cancel jest pusta")

    orig_counties = orig.get("counties", [])
    counties_remain    = [c for c in orig_counties if str(c.get("id")) not in {str(x) for x in counties_to_cancel}]
    counties_cancelled = [c for c in orig_counties if str(c.get("id"))     in {str(x) for x in counties_to_cancel}]

    if not counties_remain:
        raise HTTPException(400, "Wycięto wszystkie powiaty — użyj zwykłego anulowania zamiast partial-cancel")
    if not counties_cancelled:
        raise HTTPException(400, "Żaden z wskazanych powiatów nie należy do tego ostrzeżenia")

    # Powód anulowania
    reason_code = body.get("reason_code", "ended")
    reason_text = body.get("reason_text") or {
        "ended":         "Zjawisko ustąpiło dla wskazanego obszaru.",
        "not_occurred":  "Zjawisko nie wystąpiło dla wskazanego obszaru.",
        "downgrade":     "Zagrożenie zmalało poniżej poziomu ostrzeżenia dla wskazanego obszaru.",
    }.get(reason_code, "Ostrzeżenie odwołane dla wskazanego obszaru.")

    # === B: Update z pozostałymi powiatami (kontynuacja) ===
    new_b_id = str(uuid.uuid4())
    b = {**orig}
    b["id"]              = new_b_id
    b["counties"]        = counties_remain
    b["created_at"]      = datetime.utcnow().isoformat()
    b["msg_type"]        = "Update"
    b["operation_hint"]  = "cut_area"
    b["references_id"]   = warning_id
    b["parent_id"]       = warning_id
    b["warning_group_id"] = orig.get("warning_group_id", warning_id)
    b["version"]         = orig.get("version", 1) + 1
    b["is_active_leaf"]  = True
    b["is_cancelled"]    = False
    b["is_updated"]      = False
    b["superseded_by"]   = None
    b["cancel_xml"]      = None

    # Opis B — z body lub szablon cut_area
    if body.get("description_continuation"):
        b["description"] = body["description_continuation"]
    else:
        from app.data.update_templates import get_template, render_template
        ctx = {**(orig.get("params") or {}), "expires": orig.get("expires", "")}
        b["description"] = render_template(get_template(orig["phenomenon"], "cut_area"), ctx)

    b["status"] = _compute_status(b)
    try:
        b["cap_xml"] = generate_cap_xml(b)
    except Exception:
        b["cap_xml"] = None

    # === C: CAP Cancel dla wyciętych powiatów (NIE zapisujemy jako rekord) ===
    new_c_id = str(uuid.uuid4())
    c = {**orig}
    c["id"]              = new_c_id
    c["counties"]        = counties_cancelled
    c["created_at"]      = b["created_at"]
    c["msg_type"]        = "Cancel"
    c["operation_hint"]  = "partial_cancel"
    c["references_id"]   = warning_id
    c["parent_id"]       = warning_id
    c["warning_group_id"] = orig.get("warning_group_id", warning_id)
    c["version"]         = orig.get("version", 1) + 1
    c["is_active_leaf"]  = False
    c["is_cancelled"]    = True
    c["cancel_reason"]   = reason_text
    c["description"]     = reason_text
    c["cancelled_at"]    = b["created_at"]

    try:
        c["cap_xml"] = generate_cap_xml(c)
    except Exception:
        c["cap_xml"] = None

    # === Oznacz oryginał jako zastąpiony ===
    orig["is_updated"]      = True
    orig["is_active_leaf"]  = False
    orig["superseded_by"]   = new_b_id
    orig["status"]          = "updated"

    # === Zapisz ===
    WARNINGS_DB[new_b_id] = b
    WARNINGS_DB[new_c_id] = c
    save_warnings()

    # === Dystrybucja: oba CAP-y ===
    try:
        ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        ph = orig.get("phenomenon", "ostrzezenie")
        lvl = orig.get("level", 1)
        if b.get("cap_xml"):
            dispatch_webhooks_async(b["cap_xml"], new_b_id, warning_level=lvl)
            dispatch_all_async(b["cap_xml"], f"IMGW_{ph}_st{lvl}_{ts}_UPD_CUT.xml", b)
        if c.get("cap_xml"):
            dispatch_webhooks_async(c["cap_xml"], new_c_id, warning_level=lvl)
            dispatch_all_async(c["cap_xml"], f"IMGW_{ph}_st{lvl}_{ts}_CANCEL_PART.xml", c)
    except Exception:
        pass

    return {
        "continuation": b,    # nowy aktywny liść z mniejszym obszarem
        "cancellation": c,    # rekord cancel dla wyciętych powiatów
        "original_id":  warning_id,
    }


@app.post("/api/warnings/{warning_id}/expand-area")
def expand_area_warning(warning_id: str, body: dict):
    """
    Rozszerzenie obszaru ostrzeżenia gdy synoptyk dodaje powiaty NIGDY nie obecne w grupie.

    Body:
    - all_counties:    pełna lista powiatów po rozszerzeniu (stare + nowe)
    - params:          aktualne parametry
    - description, impacts, instruction, headline: treści (opcjonalne)
    - mode:            "split" (zalecane) | "replace"
        split   = Aktualizacja drzewa A z istniejącymi powiatami + nowe Ostrzeżenie (drzewo B) dla nowych
        replace = Odwołanie drzewa A z przyczyną "kontynuacja w nowym ostrzeżeniu" + nowe Ostrzeżenie z całością

    W trybie split tworzymy 2 nowe rekordy w bazie (Update w A + Alert w B), oba z `related_group_ids`.
    """
    orig = WARNINGS_DB.get(warning_id)
    if not orig:
        raise HTTPException(404, "Warning not found")
    if not orig.get("is_active_leaf"):
        raise HTTPException(409, "Można rozszerzać obszar tylko aktywnego liścia")

    all_counties = body.get("all_counties", [])
    if not all_counties:
        raise HTTPException(400, "Lista powiatów jest pusta")
    mode = body.get("mode", "split")
    if mode not in ("split", "replace"):
        raise HTTPException(400, "mode musi być 'split' lub 'replace'")

    # Zbierz wszystkie powiaty kiedykolwiek obecne w grupie A (nawet wycięte/anulowane)
    group_id = orig.get("warning_group_id") or orig["id"]
    all_in_group_ever = set()
    for v in WARNINGS_DB.values():
        if v.get("warning_group_id") == group_id:
            for c in (v.get("counties") or []):
                all_in_group_ever.add(str(c.get("id")))

    # Podział na "były w drzewie" i "nigdy nie było"
    new_counties_in_a = []   # te które były w grupie A
    new_counties_in_b = []   # nigdy nie były w grupie A → idą do drzewa B
    for c in all_counties:
        cid = str(c.get("id"))
        if cid in all_in_group_ever:
            new_counties_in_a.append(c)
        else:
            new_counties_in_b.append(c)

    if not new_counties_in_b:
        raise HTTPException(400, "Brak powiatów które byłyby poza pierwotnym obszarem grupy. Użyj zwykłej aktualizacji.")

    params      = body.get("params", orig.get("params", {}))
    onset       = body.get("onset", orig.get("onset"))
    expires     = body.get("expires", orig.get("expires"))
    headline    = body.get("headline", orig.get("headline"))
    description = body.get("description", orig.get("description"))
    impacts     = body.get("impacts", orig.get("impacts"))
    instruction = body.get("instruction", orig.get("instruction"))

    new_a_id = str(uuid.uuid4())
    new_b_id = str(uuid.uuid4())
    now_iso  = datetime.utcnow().isoformat()

    if mode == "split":
        # === A: Aktualizacja drzewa A z istniejącymi powiatami ===
        a = {**orig}
        a["id"]                = new_a_id
        a["counties"]          = new_counties_in_a
        a["params"]            = params
        a["onset"]             = onset
        a["expires"]           = expires
        a["headline"]          = headline
        a["description"]       = description
        a["impacts"]           = impacts
        a["instruction"]       = instruction
        a["created_at"]        = now_iso
        a["msg_type"]          = "Update"
        a["operation_hint"]    = "amend"
        a["references_id"]     = warning_id
        a["parent_id"]         = warning_id
        a["warning_group_id"]  = group_id
        a["version"]           = orig.get("version", 1) + 1
        a["is_active_leaf"]    = True
        a["is_cancelled"]      = False
        a["is_updated"]        = False
        a["superseded_by"]     = None
        a["cancel_xml"]        = None
        a["related_group_ids"] = [new_b_id]   # wskazuje na korzeń drzewa B
        a["level"]             = determine_warning_level(orig["phenomenon"], params)
        a["status"]            = _compute_status(a)
        try:    a["cap_xml"] = generate_cap_xml(a)
        except: a["cap_xml"] = None

        # === B: Nowe Ostrzeżenie (Alert) — osobne drzewo ===
        b = {**orig}
        b["id"]                = new_b_id
        b["counties"]          = new_counties_in_b
        b["params"]            = params
        b["onset"]             = onset
        b["expires"]           = expires
        b["headline"]          = headline
        b["description"]       = description
        b["impacts"]           = impacts
        b["instruction"]       = instruction
        b["created_at"]        = now_iso
        b["msg_type"]          = "Alert"
        b["operation_hint"]    = "create"
        b["references_id"]     = None
        b["parent_id"]         = None
        b["warning_group_id"]  = new_b_id    # nowy korzeń
        b["version"]           = 1
        b["is_active_leaf"]    = True
        b["is_cancelled"]      = False
        b["is_updated"]        = False
        b["superseded_by"]     = None
        b["cancel_xml"]        = None
        b["related_group_ids"] = [group_id]  # wskazuje na drzewo A
        b["level"]             = determine_warning_level(orig["phenomenon"], params)
        b["status"]            = _compute_status(b)
        try:    b["cap_xml"] = generate_cap_xml(b)
        except: b["cap_xml"] = None

        # Oryginał zastąpiony
        orig["is_updated"]      = True
        orig["is_active_leaf"]  = False
        orig["superseded_by"]   = new_a_id
        orig["status"]          = "updated"

        WARNINGS_DB[new_a_id] = a
        WARNINGS_DB[new_b_id] = b
        save_warnings()

        # Dystrybucja obu CAP-ów
        try:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            ph = orig.get("phenomenon", "ostrzezenie")
            lvl = a.get("level", 1)
            if a.get("cap_xml"):
                dispatch_webhooks_async(a["cap_xml"], new_a_id, warning_level=lvl)
                dispatch_all_async(a["cap_xml"], f"IMGW_{ph}_st{lvl}_{ts}_UPD.xml", a)
            if b.get("cap_xml"):
                dispatch_webhooks_async(b["cap_xml"], new_b_id, warning_level=b.get("level", 1))
                dispatch_all_async(b["cap_xml"], f"IMGW_{ph}_st{b.get('level',1)}_{ts}_NEW.xml", b)
        except Exception:
            pass

        return {
            "mode": "split",
            "updated_in_group_a": a,
            "new_alert_group_b": b,
            "original_id": warning_id,
        }

    else:  # mode == "replace"
        # Odwołanie drzewa A + nowe pełne Ostrzeżenie B
        cancel_reason = "Kontynuacja w nowym ostrzeżeniu po rozszerzeniu obszaru."
        orig["is_cancelled"]   = True
        orig["cancelled_at"]   = now_iso
        orig["cancel_reason"]  = cancel_reason
        orig["status"]         = "cancelled"
        orig["is_active_leaf"] = False

        # Generuj CAP Cancel dla A
        cancel_w = {**orig, "msg_type": "Cancel", "references_id": warning_id, "description": cancel_reason}
        try:
            cancel_xml = generate_cap_xml(cancel_w)
            orig["cancel_xml"] = cancel_xml
        except Exception:
            cancel_xml = None

        # Nowe drzewo B z pełnymi powiatami
        b = {**orig}
        b["id"]                = new_b_id
        b["counties"]          = all_counties
        b["params"]            = params
        b["onset"]             = onset
        b["expires"]           = expires
        b["headline"]          = headline
        b["description"]       = description
        b["impacts"]           = impacts
        b["instruction"]       = instruction
        b["created_at"]        = now_iso
        b["msg_type"]          = "Alert"
        b["operation_hint"]    = "create"
        b["references_id"]     = None
        b["parent_id"]         = None
        b["warning_group_id"]  = new_b_id
        b["version"]           = 1
        b["is_active_leaf"]    = True
        b["is_cancelled"]      = False
        b["is_updated"]        = False
        b["superseded_by"]     = None
        b["cancel_xml"]        = None
        b["cancelled_at"]      = None
        b["cancel_reason"]     = None
        b["related_group_ids"] = [group_id]
        b["level"]             = determine_warning_level(orig["phenomenon"], params)
        b["status"]            = _compute_status(b)
        try:    b["cap_xml"] = generate_cap_xml(b)
        except: b["cap_xml"] = None

        # Dodaj related do oryginału (wstecz)
        orig.setdefault("related_group_ids", []).append(new_b_id)

        WARNINGS_DB[new_b_id] = b
        save_warnings()

        # Dystrybucja: cancel A + alert B
        try:
            ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
            ph = orig.get("phenomenon", "ostrzezenie")
            if cancel_xml:
                dispatch_webhooks_async(cancel_xml, warning_id, warning_level=orig.get("level", 1))
                dispatch_all_async(cancel_xml, f"IMGW_{ph}_st{orig.get('level',1)}_{ts}_CANCEL.xml", cancel_w)
            if b.get("cap_xml"):
                dispatch_webhooks_async(b["cap_xml"], new_b_id, warning_level=b.get("level", 1))
                dispatch_all_async(b["cap_xml"], f"IMGW_{ph}_st{b.get('level',1)}_{ts}_NEW.xml", b)
        except Exception:
            pass

        return {
            "mode": "replace",
            "cancelled_group_a": orig,
            "new_alert_group_b": b,
            "original_id": warning_id,
        }


@app.get("/api/warnings/update-template")
def get_update_template(phenomenon: str, operation: str, params: str = "{}", context: str = "{}"):
    """
    Zwraca podpowiedź szablonu opisu dla operacji Update.

    Query:
    - phenomenon: nazwa zjawiska
    - operation: create | amend | escalate | deescalate | extend | shorten | expand_area | cut_area
    - params: JSON-string z aktualnymi parametrami ostrzeżenia
    - context: JSON-string z dodatkowym kontekstem (observed_value, forecast_value, total_value, old_level, new_level, old_param_value, expires)
    """
    from app.data.update_templates import get_template, render_template
    try:
        params_dict = json.loads(params) if isinstance(params, str) else (params or {})
    except Exception:
        params_dict = {}
    try:
        context_dict = json.loads(context) if isinstance(context, str) else (context or {})
    except Exception:
        context_dict = {}

    ctx = {**params_dict, **context_dict}
    template = get_template(phenomenon, operation)
    rendered = render_template(template, ctx)
    return {
        "template":  template,
        "rendered":  rendered,
        "operation": operation,
    }


@app.put("/api/warnings/{warning_id}")
def update_warning_inplace(warning_id: str, warning: WarningCreate):
    """
    Aktualizuj istniejące ostrzeżenie w miejscu (msgType=Update).

    Stary rekord jest zachowany w historii z polem 'superseded_by'.
    Nowy rekord zastępuje stary z nowym ID, references_id wskazuje na oryginał.
    Zwraca nowe ostrzeżenie z zachowaną ciągłością (nowe ID, CAP msgType=Update).
    """
    orig = WARNINGS_DB.get(warning_id)
    if not orig:
        raise HTTPException(404, "Warning not found")

    # Oblicz nowy level z nowych parametrów
    new_level = determine_warning_level(warning.phenomenon, warning.params)
    new_id = str(uuid.uuid4())

    # Zbuduj nowy rekord
    new_w = warning.model_dump()
    new_w["id"]           = new_id
    new_w["level"]        = new_level
    new_w["created_at"]   = datetime.utcnow().isoformat()
    new_w["msg_type"]     = "Update"
    new_w["references_id"] = warning_id
    new_w["status"]       = _compute_status(new_w)

    try:
        new_w["cap_xml"] = generate_cap_xml(new_w)
    except Exception:
        new_w["cap_xml"] = None

    # Oznacz oryginał jako zastąpiony (zachowany w historii, nie wyświetlany)
    orig["is_updated"]    = True
    orig["superseded_by"] = new_id
    orig["status"]        = "updated"

    WARNINGS_DB[new_id] = new_w
    save_warnings()

    # Dystrybucja
    if new_w.get("cap_xml"):
        dispatch_webhooks_async(new_w["cap_xml"], new_id, warning_level=new_level)
        _ph   = new_w.get("phenomenon", "ostrzezenie")
        _lvl  = new_w.get("level", 1)
        _ts   = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        _fname = f"IMGW_{_ph}_st{_lvl}_{_ts}_UPD.xml"
        dispatch_all_async(new_w["cap_xml"], _fname, new_w)

    return WarningDB(**new_w)


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
# IMPORT — z API IMGW danepubliczne.imgw.pl
# ============================================================

# Mapowanie nazw zjawisk IMGW → nasze klucze phenomenon
_IMGW_PHENOMENON_MAP = {
    "Burze":                             "burze",
    "Deszcz":                            "intensywne_opady_deszczu",
    "Intensywne opady deszczu":          "intensywne_opady_deszczu",
    "Intensywne opady śniegu":           "intensywne_opady_sniegu",
    "Intensywne opady sniegu":           "intensywne_opady_sniegu",
    "Mgła intensywnie osadzająca szadź": "mgla_szadz",
    "Mgla intensywnie osadzajaca szadz": "mgla_szadz",
    "Gęsta mgła":                        "gesta_mgla",
    "Gesta mgla":                        "gesta_mgla",
    "Oblodzenie":                        "oblodzenie",
    "Opady marznące":                    "opady_marzniece",
    "Opady marzniece":                   "opady_marzniece",
    "Opady śniegu":                      "opady_sniegu",
    "Opady sniegu":                      "opady_sniegu",
    "Przymrozki":                        "przymrozki",
    "Roztopy":                           "roztopy",
    "Silny deszcz z burzami":            "silny_deszcz_z_burzami",
    "Silny mróz":                        "silny_mroz",
    "Silny mroz":                        "silny_mroz",
    "Silny wiatr":                       "silny_wiatr",
    "Upał":                              "upal",
    "Upal":                              "upal",
    "Zawieje i zamiecie śnieżne":        "zawieje_zamiecie",
    "Zawieje i zamiecie sniezne":        "zawieje_zamiecie",
    "Zawieje / zamiecie śnieżne":        "zawieje_zamiecie",
}


@app.get("/api/import/imgw")
def import_from_imgw():
    """
    Pobiera aktualne ostrzeżenia z publicznego API IMGW-PIB i mapuje na naszą strukturę.
    Nie zapisuje do bazy — zwraca listę gotową do przeglądu przez synoptyka.
    Źródło: https://danepubliczne.imgw.pl/api/data/warningsmeteo
    """
    import urllib.request
    from app.data.phenomenon_config import PHENOMENON_IMPACTS, PHENOMENON_INSTRUCTIONS
    from app.data.warning_texts import WARNING_CONFIG

    IMGW_API_URL = "https://danepubliczne.imgw.pl/api/data/warningsmeteo"

    # Pobierz dane z API IMGW
    try:
        req = urllib.request.Request(
            IMGW_API_URL,
            headers={"User-Agent": "MeteoCAP-Editor/2.0 IMGW-PIB"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            raw = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        raise HTTPException(502, f"Błąd pobierania danych z API IMGW: {e}")

    # Zbuduj lookup powiatów TERYT → dane
    county_by_teryt = {c["id"]: c for c in COUNTIES_DATA}

    imported = []
    skipped  = []

    for w in raw:
        # Mapuj zjawisko
        nazwa = w.get("nazwa_zdarzenia", "")
        phenomenon = _IMGW_PHENOMENON_MAP.get(nazwa)
        if not phenomenon:
            skipped.append({"id": w.get("id"), "reason": f"Nieznane zjawisko: '{nazwa}'"})
            continue

        # Stopień
        try:
            level = int(w.get("stopien", 1))
        except (ValueError, TypeError):
            level = 1

        # Powiaty z TERYT
        teryt_list = w.get("teryt", [])
        counties = []
        for t in teryt_list:
            c = county_by_teryt.get(str(t))
            if c:
                counties.append({
                    "id":        c["id"],
                    "name":      c["name"],
                    "voiv_id":   c["voiv_id"],
                    "voiv_name": c["voiv_name"],
                    "lat":       c["lat"],
                    "lon":       c["lon"],
                })

        # Czasy — konwertuj z "YYYY-MM-DD HH:MM:SS" na ISO
        def _to_iso(s):
            """Konwertuje czas lokalny PL (CEST=UTC+2 lub CET=UTC+1) na UTC ISO."""
            if not s:
                return None
            try:
                from datetime import datetime, timedelta
                import time as _time
                dt_local = datetime.strptime(str(s), "%Y-%m-%d %H:%M:%S")
                # Ustal offset: CEST (marzec-październik) = UTC+2, CET = UTC+1
                month = dt_local.month
                utc_offset = 2 if 3 <= month <= 10 else 1
                dt_utc = dt_local - timedelta(hours=utc_offset)
                return dt_utc.strftime("%Y-%m-%dT%H:%M:00Z")
            except Exception:
                return str(s)

        onset   = _to_iso(w.get("obowiazuje_od"))
        expires = _to_iso(w.get("obowiazuje_do"))

        # Treść z IMGW jako opis przebiegu
        description = w.get("tresc", "")

        # Skutki i zalecenia z naszego zasobu (phenomenon_config.py)
        impacts_list = PHENOMENON_IMPACTS.get(phenomenon, {}).get(level, [])
        impacts      = "\n".join(f"• {i}" for i in impacts_list) if impacts_list else ""

        instructions_list = PHENOMENON_INSTRUCTIONS.get(phenomenon, {}).get(level, [])
        instruction = "\n".join(f"• {i}" for i in instructions_list) if instructions_list else ""

        # Nagłówek
        from app.services.warning_levels import PHENOMENON_LABELS
        ph_label = PHENOMENON_LABELS.get(phenomenon, nazwa)
        headline = f"Ostrzeżenie meteorologiczne {level}° — {ph_label}"

        imported.append({
            "imgw_id":     w.get("id"),
            "phenomenon":  phenomenon,
            "level":       level,
            "onset":       onset,
            "expires":     expires,
            "headline":    headline,
            "description": description,
            "impacts":     impacts,
            "instruction": instruction,
            "counties":    counties,
            "county_count": len(counties),
            "biuro":       w.get("biuro", ""),
            "prawdopodobienstwo": w.get("prawdopodobienstwo"),
            "msg_type":    "Alert",
        })

    return {
        "source":   IMGW_API_URL,
        "count":    len(imported),
        "skipped":  len(skipped),
        "warnings": imported,
        "skipped_details": skipped,
    }


@app.post("/api/import/imgw/save")
def save_imgw_warnings(body: dict):
    """
    Zapisuje wybrane ostrzeżenia zaimportowane z IMGW do lokalnej bazy.
    Body: { "warnings": [...] }  — lista z /api/import/imgw (pełna lub przefiltrowana).
    """
    warnings_to_save = body.get("warnings", [])
    saved = []
    for w in warnings_to_save:
        wid   = str(uuid.uuid4())
        level = w.get("level") or determine_warning_level(
            w.get("phenomenon", ""), w.get("params", {})
        ) or 1
        new_w = {
            "id":          wid,
            "imgw_id":     w.get("imgw_id"),
            "phenomenon":  w.get("phenomenon"),
            "level":       level,
            "status":      _compute_status({
                "msg_type": "Alert",
                "onset":    w.get("onset", ""),
                "expires":  w.get("expires", ""),
            }),
            "msg_type":    "Alert",
            "onset":       w.get("onset"),
            "expires":     w.get("expires"),
            "headline":    w.get("headline", ""),
            "description": w.get("description", ""),
            "impacts":     w.get("impacts", ""),
            "instruction": w.get("instruction", ""),
            "counties":    w.get("counties", []),
            "params":      {},
            "created_at":  datetime.utcnow().isoformat(),
            "source":      "IMGW-API",
        }
        try:
            new_w["cap_xml"] = generate_cap_xml(new_w)
        except Exception:
            new_w["cap_xml"] = None
        WARNINGS_DB[wid] = new_w
        saved.append(new_w)
    save_warnings()
    return {"saved": len(saved), "warnings": saved}


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
    title: str = Query(None),
    lang: str = Query("pl", description="Język raportu: pl | en"),
):
    """
    Eksport raportu ostrzeżeń jako PDF w wybranym języku (pl|en).
    Domyślny tytuł zostanie ustawiony w pdf_generator zależnie od języka.
    """
    if not REPORTLAB_AVAILABLE:
        raise HTTPException(503, "ReportLab nie jest zainstalowany — PDF niedostępny")
    if lang not in ("pl", "en"):
        raise HTTPException(400, "lang musi być 'pl' lub 'en'")
    allowed = set(status_filter.split(","))
    warnings = list(WARNINGS_DB.values())
    for w in warnings:
        w["status"] = _compute_status(w)
    warnings = [w for w in warnings if w["status"] in allowed]

    pdf_bytes = generate_warning_pdf(
        warnings,
        title=title,
        voivodeship_filter=voivodeship,
        lang=lang,
    )
    if not pdf_bytes:
        raise HTTPException(500, "Błąd generowania PDF")

    now = datetime.utcnow().strftime("%Y%m%d_%H%M")
    suffix = "_en" if lang == "en" else ""
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="meteocap_raport{suffix}_{now}.pdf"'}
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


@app.get("/api/meteoalarm/geocodes/{country_code}")
def get_meteoalarm_geocodes(country_code: str):
    """
    Zwraca GeoJSON z geokodami (poligonami EMMA_ID) dla danego kraju.
    Używane przez frontend do wizualizacji warstwy MeteoAlarm na mapie.
    Pliki GeoJSON serwowane są z katalogu frontend/public/ przez nginx (preferable),
    ale ten endpoint jest fallbackiem gdy nginx nie obsługuje .geojson.
    """
    valid_countries = {"PL", "DE", "CZ", "SK", "LT", "UA", "BY"}
    cc = country_code.upper()
    if cc not in valid_countries:
        raise HTTPException(400, f"Nieznany kraj: {cc}")

    # Szukaj pliku w kilku lokalizacjach
    search_paths = [
        f"/app/frontend_static/geocodes_{cc}.geojson",   # nginx static (prod)
        f"/home/app/frontend/public/geocodes_{cc}.geojson",
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "frontend", "public", f"geocodes_{cc}.geojson"),
    ]
    for path in search_paths:
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                return JSONResponse(content=json.load(f))

    raise HTTPException(404, f"Brak pliku geokodów dla kraju {cc}")


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
