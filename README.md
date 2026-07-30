# IMGW-OSMET v2.5.33

**Narzędzie IMGW-PIB do tworzenia, edycji i publikacji ostrzeżeń meteorologicznych
zgodnych ze standardem CAP 1.2.**

> ⚠ **Narzędzie deweloperskie.** Służy do rozwijania i testowania nowych koncepcji
> ostrzegania (edytor CAP, ostrzeżenia oparte na skutkach, prezentacja stanu).
> Ostrzeżenia tworzone w OSMET **nie są oficjalnymi ostrzeżeniami IMGW-PIB**
> i nie podlegają dystrybucji operacyjnej.

Poprzednia nazwa robocza: MeteoCAP Editor.

---

## Spis dokumentacji

| Plik | Zawartość |
|------|-----------|
| `README.md` | ten plik — uruchomienie, stack, struktura |
| `INSTRUKCJA_UZYTKOWNIKA.md` | **instrukcja dla synoptyków** — jak wydawać i aktualizować ostrzeżenia |
| `ROADMAP.md` | co zrobione, co planowane, w jakiej kolejności |
| `VERSIONING.md` | pełna historia wersji |
| `ARCHITECTURE_VISION.md` | koncepcja trójwarstwowa (Early Warning / ostrzeżenie / nowcast) |
| `deploy/INSTALL_LINUX.md` | instalacja bez Dockera (Python + systemd + nginx) |
| `deploy/APPS_PROXY.md` | wdrożenie za wspólną bramą `apps.container.imgw.ad` |

---

## Szybki start (Docker)

### Wymagania
- Docker >= 24 + Docker Compose >= 2.x
- Projekt **poza OneDrive/chmurą** — synchronizacja zmienia znaczniki czasu plików
  i psuje cache budowania obrazów

### Uruchomienie
```bash
cd meteo-cap
docker compose up -d --build
```

Aplikacja: **http://localhost:31001/osmet-dev/**
Dokumentacja API: **http://localhost:8000/docs**

### Aktualizacja
```bash
# rozpakuj nowy ZIP nadpisując pliki projektu (CAŁY ZIP, nie pojedyncze pliki)
docker compose up -d --build
```
Po aktualizacji zrób w przeglądarce twarde odświeżenie (**Ctrl+Shift+R**) — inaczej
może wisieć poprzednia wersja interfejsu z cache.

Dane (baza ostrzeżeń, biblioteka skutków, konfiguracja dystrybucji) żyją w wolumenie
Dockera `meteocap-warnings` i przeżywają przebudowy obrazu.

### Instalacja bez Dockera
Python + uvicorn pod systemd + nginx — pełna instrukcja w `deploy/INSTALL_LINUX.md`.
Katalog danych ustawia się zmienną `OSMET_DATA_DIR` (domyślnie `/data`).
**SQLite nie jest potrzebny** — aplikacja nie używa bazy SQL.

---

## Wdrożenie zakładowe (container.imgw.ad)

| Port | Kontener | Aplikacja |
|------|----------|-----------|
| 31000 | `apps-proxy` | brama nginx — za nią `apps.container.imgw.ad` |
| **31001** | `meteocap-frontend` | **IMGW-OSMET** -> `/osmet-dev/` |
| 31002 | `casexp` | Case Explorer -> `/casexp/` |

Dostęp równoważny:
- przez bramę: `http://apps.container.imgw.ad/osmet-dev/`
- bezpośrednio: `http://container.imgw.ad:31001/osmet-dev/`

Aplikacja **zna swój prefiks** (`base: '/osmet-dev/'` w `vite.config.js`), dlatego
w konfiguracji bramy `proxy_pass` jest **bez** ukośnika na końcu. Szczegóły i przepis
na dokładanie kolejnych aplikacji: `deploy/APPS_PROXY.md`.

---

## Główne funkcje

### Edytor ostrzeżeń
- Wybór obszaru: klikanie powiatów lub rysowanie poligonu (rzutowanego na powiaty)
- Automatyczne wyznaczanie stopnia z parametrów meteorologicznych
- Prawdopodobieństwo wystąpienia -> CAP `certainty` (schemat CHMI)
- **Biblioteka skutków i zaleceń** — dobór pozycji wg zjawiska, stopnia i sektora
  (transport / rolnictwo / energetyka / budownictwo), reguła **3+3**;
  wgrywana jako JSON z kreatora matrycy, bez przebudowy aplikacji
- Aktualizacje z jawnym podglądem zmiany obszaru; eskalacja i deeskalacja na wycinku
- Kopiowanie ostrzeżeń (sekwencje czasowe)
- Historia zaznaczenia z cofaniem (**Ctrl+Z** / **Ctrl+Shift+Z**)
- Podgląd zajętości: powiaty objęte już tym samym zjawiskiem w nachodzącym czasie
  są oznaczane **zanim** zaczniesz klikać

### Import z IMGW API
Pobranie aktualnych ostrzeżeń z publicznego API IMGW z **uzgodnieniem stanu**:
klasyfikacja na nowe / już w bazie / nowsza wersja istniejącego / wymagające decyzji.
Rekordy pochodzące z API i nietknięte można zastąpić automatycznie; kolizja z pracą
synoptyka zawsze wymaga potwierdzenia.

### Widok Status
- Mapa stanu z ostrzeżeniami krajowymi i **MeteoAlarm** (obszarowo, z geokodów EMMA)
- **Oś czasu** — pasma zjawisk, województwa rozwijalne do powiatów,
  suwak czasu sprzężony z mapą
- Filtry zjawisk działające jednocześnie na mapę, oś czasu i listę

### Eksporty
- **CAP 1.2 XML** — pojedynczy, zbiorczy (ZIP), per powiat (format IMGW)
- **PDF** — raport krajowy i wojewódzki, PL/EN
- **PNG** — metryczka oraz **infografika dla mediów** (mapa zbiorcza + mapki per zjawisko),
  trzy orientacje: poziomo 1920x1080, pionowo A4, 4:5 pod media społecznościowe
- Dystrybucja: FTP, SMTP, webhooki

### Reguły operacyjne wymuszane przez system
- To samo zjawisko **nie może** mieć dwóch ostrzeżeń na tym samym powiecie
  w nachodzącym czasie (HTTP 409). Sekwencje ze stykającymi się oknami są dozwolone.
- Koniec ważności musi być późniejszy niż początek.
- Ostrzeżenie musi obejmować co najmniej jeden powiat lub poligon.
- Poligony rysowane odręcznie są upraszczane do <=20 wierzchołków (wymóg MeteoAlarm).

---

## Stack

| Warstwa | Technologia |
|---------|-------------|
| Backend | FastAPI 0.115, Python 3.12, uvicorn |
| Frontend | React 18, Vite 5, Leaflet 1.9 |
| Mapy | CartoDB Dark / OSM / Esri |
| Grafika | Pillow (PNG), ReportLab (PDF) |
| Formaty | CAP 1.2 (XML), GeoJSON, PDF, PNG |
| Storage | **płaskie pliki JSON** — zapis atomowy, kopia `.bak`, blokada wątkowa |
| Kontenery | Docker Compose (backend + frontend) |

**Bezpieczeństwo danych:** zapis przez plik tymczasowy i `os.replace` (atomowo),
kopia poprzedniej wersji w `.bak`, a przy uszkodzonej bazie backend **odmawia startu**
z czytelnym komunikatem — zamiast po cichu wystartować z pustą bazą i utrwalić stratę.

---

## Struktura projektu

```
meteo-cap/
├── VERSION                      # JEDNO źródło numeru wersji (czyta backend, pokazuje UI)
├── backend/
│   ├── Dockerfile
│   └── app/
│       ├── main.py              # trasy FastAPI (51 endpointów)
│       ├── data/
│       │   ├── counties.json / voivodeships.json / counties_centroids.json
│       │   ├── meteoalarm_geocodes_pl.json      # EMMA_ID -> geometria
│       │   ├── impacts_library.json             # biblioteka skutków i zaleceń
│       │   ├── warning_texts.py / warning_levels.py / phenomenon_config.py
│       │   └── imgw_logo_pl.png / imgw_logo_en.png
│       ├── services/
│       │   ├── meteoalarm.py    # parser feedów + deduplikacja wersji
│       │   ├── cap_generator.py # CAP 1.2 XML + upraszczanie poligonów
│       │   ├── png_map.py       # metryczka i infografika dla mediów
│       │   ├── pdf_generator.py # raporty PDF
│       │   ├── map_exporter.py / delivery.py / webhook.py
│       └── models/schemas.py
├── frontend/
│   ├── Dockerfile / nginx.conf  # serwowanie statyków pod prefiksem + proxy /api
│   ├── vite.config.js           # base: '/osmet-dev/'
│   ├── public/
│   │   ├── assets/imgw_logo_*.svg
│   │   └── geocodes_*.geojson   # granice PL/CZ/DE/SK/LT
│   └── src/
│       ├── App.js               # stan współdzielony, historia zaznaczenia
│       ├── App.css              # style + responsywność (< 900 px)
│       └── components/
│           ├── map/MapPanel.js      # mapa edytora, warstwy, lista ostrzeżeń
│           ├── map/StatusView.js    # widok Status + oś czasu + MeteoAlarm
│           ├── editor/EditorPanel.js
│           └── common/Header.js
├── deploy/                      # systemd, nginx, apps-proxy, instrukcje
└── docker-compose.yml
```

---

## Uwagi dla rozwijających

**Numer wersji ma jedno źródło** — plik `VERSION`. Backend czyta go przy starcie,
interfejs pobiera przez `/api/version`. Nie wpisuj numeru w kodzie.

**Adres API liczy się względem prefiksu** (`BASE_URL`) w ośmiu plikach frontu.
Wpisanie gołego `/api` psuje aplikację pod bramą.

**Audyt przed każdym buildem** (opis w `ROADMAP.md`) sprawdza m.in.: brak gołego `/api`,
ścieżki zasobów, importy hooków Reacta, poprawne wiązanie endpointów z funkcjami,
składnię całego frontu i kompilację backendu. Powstał po realnych regresjach —
kontrola składni ich **nie** wykrywa.

**Aktualizuj całym ZIP-em**, nie pojedynczymi plikami. Mieszanie wersji plików
było źródłem trzech regresji.
