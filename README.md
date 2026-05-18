# IMGW-OSMET v2.4.4

**Narzędzie IMGW-PIB do tworzenia, edycji i publikacji ostrzeżeń meteorologicznych zgodnych ze standardem CAP 1.2.**

Poprzednia nazwa robocza: MeteoCAP Editor.

---

## Szybki start

### Wymagania
- Docker >= 24 + Docker Compose >= 2.x
- **Ważne:** projekt powinien znajdować się **poza OneDrive/chmurą** (np. `C:\Projects\meteo-cap\`) — OneDrive modyfikuje timestampy plików co powoduje błędy cache Dockera

### Uruchomienie

```bash
cd meteo-cap

# Pierwsze uruchomienie lub po aktualizacji kodu:
docker compose build
docker compose up -d

# Aplikacja dostępna na:
# http://localhost:3000
# API docs: http://localhost:8000/docs
```

### Aktualizacja do nowej wersji
```bash
# Wypakuj nowy ZIP nadpisując pliki projektu
docker compose build   # wystarczy, bez --no-cache jeśli projekt jest poza OneDrive
docker compose up -d
```

### Bez Dockera (Windows dev)
```powershell
.\start-no-docker.ps1
# Wymaga Python 3.10+ i Node 18+
```

---

## Stack

| Warstwa    | Technologia                             |
|------------|-----------------------------------------|
| Backend    | FastAPI 0.111, Python 3.12              |
| Frontend   | React 18, Vite 5, Leaflet 1.9           |
| Mapy       | CartoDB Dark / OSM / Esri               |
| Formaty    | CAP 1.2 (XML), GeoJSON, PDF (ReportLab) |
| Kontenery  | Docker Compose (backend + frontend)     |

---

## Changelog

### v2.4.4 (2026-05-10)
- Nazwa aplikacji zmieniona: MeteoCAP Editor → **IMGW-OSMET**
- Logo IMGW-PIB w headerze (SVG) i w raportach PDF (PNG, PL/EN)
- MeteoAlarm — poprawka severity: `Moderate` → stopień 1, `Severe` → 2, `Extreme` → 3
- MeteoAlarm — `awareness_level` skala MA (2/3/4) → poprawnie mapowana na 1/2/3
- MeteoAlarm — markery jako znaki wodne (niski opacity) zamiast pełnych etykiet
- MeteoAlarm — zoom aggregation: zoom ≤5 = 1 marker per kraj (max level), ≥7 = pełna geometria
- MeteoAlarm — hover na markerze rozsuwa etykietę z flagą, nazwą zjawiska i stopniem
- Tooltip powiatów — opóźnienie 700ms (brak zawieszających się hintów)
- Polygon UA bezpośrednio z `<entry>` (UA nie używa EUMETNET geocode)

### v2.4.3 (2026-05-08)
- Fix nowego formatu MeteoAlarm 2026 (CZ/DE/LT): `<cap:geocode>` flat w `<entry>`
- `find_text()` z obsługą atom namespace (dzieci geocode dziedziczą xmlns Atom)
- `geocode_search_roots`: przeszukuje zarówno `<cap:area>` jak i `<entry>`
- `AWARENESS_TYPE_MAP` rozszerzony (fire, hail, frost, fog, gale i in.)
- Default zjawisko zmieniony z `silny_wiatr` → `inne_zagrożenie`
- Priorytet pola `event` (nowy format) przed `awareness_type` (stary)

### v2.4.x (wcześniejsze)
- Integracja MeteoAlarm dla DE, CZ, SK, UA, LT, BY, RU-KGD
- Mapa z Leaflet: powiaty, województwa, tryb rysowania poligonów
- Generowanie CAP 1.2 XML + PDF raport
- Historia ostrzeżeń z podglądem na mapie
- Widok Status z live-feed aktywnych/oczekujących ostrzeżeń

---

## Struktura projektu

```
meteo-cap/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI routes
│   │   ├── data/
│   │   │   ├── meteoalarm_geocodes_pl.json   # lookup EMMA_ID → geometria
│   │   │   ├── counties.json / voivodeships.json
│   │   │   ├── imgw_logo_pl.png / imgw_logo_en.png  # logo dla PDF
│   │   │   └── phenomenon_config.py / warning_texts.py
│   │   ├── services/
│   │   │   ├── meteoalarm.py        # parser feedów MeteoAlarm
│   │   │   ├── cap_generator.py     # generowanie XML CAP 1.2
│   │   │   ├── pdf_generator.py     # raporty PDF
│   │   │   └── delivery.py / webhook.py
│   │   └── models/schemas.py
├── frontend/
│   ├── public/
│   │   ├── assets/imgw_logo_*.svg   # logo UI
│   │   └── geocodes_*.geojson       # granice CZ/DE/SK/LT/PL
│   └── src/
│       ├── components/
│       │   ├── map/MapPanel.js      # mapa Leaflet + MeteoAlarm warstwy
│       │   ├── editor/EditorPanel.js
│       │   └── common/Header.js
│       └── App.js
├── docker-compose.yml
└── README.md
```
