# MeteoCAP Editor v2.0

**Narzędzie IMGW-PIB do tworzenia, edycji i publikacji ostrzeżeń meteorologicznych zgodnych ze standardem CAP 1.2.**

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

## Funkcje

### Edytor ostrzeżeń
- 15 zjawisk meteorologicznych z suwakami, radio i checkbox
- Automatyczny stopień 1/2/3 w czasie rzeczywistym
- Autoteksty: opis przebiegu, skutki i zalecenia ładowane automatycznie po wyznaczeniu stopnia
- Persystencja stanu formularza przy przełączaniu zakładek
- Import ostrzeżeń z API IMGW (`danepubliczne.imgw.pl`)
- Import CAP XML z pliku

### Mapa
- 380 powiatów GUGiK PRG + 16 województw (WGS84)
- Rysowanie obszaru ostrzeżenia: poligon, prostokąt lub klikanie na powiaty
- Kolorowanie powiatów kolorem stopnia (żółty/pomarańczowy/czerwony)
- MeteoAlarm: ostrzeżenia krajów ościennych DE/CZ/SK/UA/LT/BY

### CAP 1.2
- Dwa bloki info: pl-PL + en-GB
- EMMA_ID + TERYT jako geocode
- msgType: Alert / Update / Cancel
- Tryb zbiorczy XML + per-powiat ZIP

### Dystrybucja
- FTP/FTPS push XML
- Email SMTP z HTML + załącznik
- Webhooki HTTP POST

### Eksport
- PDF raport A4 (polskie znaki, skutki i zalecenia per ostrzeżenie)
- PNG z widoku Status (dopasowany do konturów Polski)
- SVG mapa ostrzeżeń

---

## Struktura projektu

```
meteo-cap/
├── backend/
│   ├── app/
│   │   ├── main.py              # 25+ endpointów REST (FastAPI)
│   │   ├── services/
│   │   │   ├── cap_generator.py # Generator CAP 1.2
│   │   │   ├── warning_levels.py# Logika stopni (kryteria IMGW-PIB)
│   │   │   ├── pdf_generator.py # Raport PDF (ReportLab + DejaVu)
│   │   │   ├── map_exporter.py  # Generator SVG
│   │   │   ├── meteoalarm.py    # MeteoAlarm Atom feed parser
│   │   │   └── delivery.py      # FTP + email dystrybucja
│   │   └── data/
│   │       ├── warning_texts.py     # Opisy per zjawisko/stopień ← EDYTUJ TU
│   │       ├── phenomenon_config.py # Ikony, skutki, instrukcje ← EDYTUJ TU
│   │       ├── counties.json        # 380 powiatów GeoJSON (4.6 MB)
│   │       └── voivodeships.json    # 16 województw GeoJSON
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── App.js
│       ├── components/
│       │   ├── editor/EditorPanel.js   # Główny formularz
│       │   ├── editor/WarningsList.js  # Historia ostrzeżeń
│       │   ├── map/MapPanel.js         # Mapa Leaflet (edytor)
│       │   └── map/StatusView.js       # Widok Status
│       └── utils/
│           ├── editorDraft.js  # Persystencja stanu edytora
│           └── mapState.js     # Persystencja zoom/podkładu
├── docker-compose.yml
├── ROADMAP.md          # ← Todo i planowane funkcje
└── start-no-docker.ps1
```

### Dane persystowane (Docker volume `/data`)
```
/data/
├── warnings.json       # Baza ostrzeżeń
├── delivery_config.json# Konfiguracja FTP/email
├── delivery_log.json   # Log wysyłek
└── webhooks.json       # Konfiguracja webhooków
```

---

## Konfiguracja

### Teksty ostrzeżeń
Edytuj `backend/app/data/warning_texts.py` — opisy, instrukcje i skutki per zjawisko i stopień.

### Kryteria stopni
Edytuj `backend/app/data/warning_levels.py` — progi parametrów dla każdego zjawiska.

### API Key (opcjonalny)
```yaml
# docker-compose.yml
environment:
  - METEOCAP_API_KEY=twoj_klucz
```

---

## Stack techniczny

| Komponent | Technologia |
|-----------|-------------|
| Backend   | FastAPI (Python 3.12), flat JSON → docelowo PostgreSQL |
| Frontend  | React + Vite, Leaflet.js |
| Serwer    | nginx (reverse proxy) |
| PDF       | ReportLab + DejaVu Sans (polskie znaki) |
| Kontener  | Docker Compose |

---

## Znane ograniczenia

- Spatial join po centroidach (nie po poligonach) — planowane PostGIS v3.0
- Flat-file JSON — brak concurrent editing — planowane PostgreSQL v3.0
- Brak autoryzacji per-user — planowane LDAP/AD v3.2

Szczegółowy roadmap: [ROADMAP.md](./ROADMAP.md)

---

*IMGW-PIB MeteoCAP Editor | Standard CAP 1.2 | © 2026*
