# ================================================================
# SKRYPT BRIEFINGOWY — MeteoCAP Editor
# Wklej całość na początku nowej sesji Claude
# ================================================================

"""
Kontynuacja projektu MeteoCAP Editor — narzędzie IMGW-PIB
do edycji i publikacji ostrzeżeń meteorologicznych CAP 1.2.

Repo GitHub: https://github.com/aule83-glitch/meteo-cap
(wgraj też ZIP meteo-cap.zip jeśli repo nie jest aktualne)

═══════════════════════════════════════════════════════════
STACK TECHNICZNY
═══════════════════════════════════════════════════════════
Backend:  FastAPI (Python 3.12), plik flat JSON → docelowo PostgreSQL
Frontend: React + Vite (NIE react-scripts), Leaflet.js
Serwer:   nginx (reverse proxy), Docker Compose
OS dev:   Windows + Docker Desktop (bez WSL — polityka AD IMGW)
OS prod:  Linux + Docker Engine (docelowo)

═══════════════════════════════════════════════════════════
CO DZIAŁA (stan na koniec sesji)
═══════════════════════════════════════════════════════════
EDYTOR:
  ✓ 15 zjawisk meteorologicznych, suwaki/radio/checkbox per zjawisko
  ✓ Automatyczny stopień 1/2/3 w czasie rzeczywistym (kryteria IMGW-PIB z PDF)
  ✓ Szablony ostrzeżeń (zapisz/wczytaj konfigurację) → /data/templates.json
  ✓ Import CAP XML z pliku (wypełnia formularz edytora)
  ✓ Podgląd XML przed pobraniem (modal z koloryzacją składni)
  ✓ Zakres elewacji n.p.m. (altitude/ceiling w CAP)
  ✓ msgType: Alert / Update / Cancel (lista rozwijana aktywnych ostrzeżeń)

MAPA:
  ✓ Leaflet + CARTO Dark (domyślny) + 5 innych podkładów
  ✓ 380 powiatów GUGiK PRG + 16 województw (WGS84, SHP→GeoJSON)
  ✓ Rysowanie poligonów i prostokątów → spatial join po centroidach
  ✓ Klikanie na powiat = toggle zaznaczenia
  ✓ Agregowane labele (jeden label per ostrzeżenie, nie per powiat)
  ✓ Podświetlanie obszaru ostrzeżenia z historii (fiolet)
  ✓ MeteoAlarm: warstwy ostrzeżeń DE/CZ/SK/UA/LT/BY (cache 10min)
  ✓ Persystencja zoom i podkładu przy przełączaniu zakładek

CAP 1.2:
  ✓ Dwa bloki info: pl-PL + en-GB
  ✓ EMMA_ID (primary) + TERYT (secondary) jako geocode
  ✓ Obszar per województwo (osobny <area> per woj. z listą powiatów)
  ✓ msgType Alert/Update/Cancel z <references>
  ✓ awareness_level, awareness_type (METEOALARM format)
  ✓ OID identifier: 2.49.0.0.616.0.PL.{timestamp}{uid}
  ✓ Tryb zbiorczy XML + per-powiat ZIP (format IMGW)

DYSTRYBUCJA (zakładka Ustawienia):
  ✓ FTP — push XML po zapisaniu, konfiguracja wielu serwerów,
          test połączenia, log wysyłek, FTPS (TLS), tryb pasywny
          Nazwa pliku: IMGW_zjawisko_stN_YYYYMMDD_HHMMSS.xml
  ✓ Email — SMTP/STARTTLS, HTML z opisem + XML jako załącznik,
            lista odbiorców z filtrem po stopniu ostrzeżenia
  ✓ Webhooki HTTP POST (dla systemów IT)
  ✓ Log dystrybucji → /data/delivery_log.json

EKSPORT:
  ✓ SVG — mapa ostrzeżeń (podkład wektorowy PL, legenda, podsumowanie)
  ✓ PDF — raport A4 gotowy do druku (ReportLab)

INNE:
  ✓ API Key auth (opcjonalna: METEOCAP_API_KEY w docker-compose.yml)
  ✓ Pliki konfig: warning_texts.py, phenomenon_config.py (edytowalne)
  ✓ Statusy: active/pending/expired/cancelled/updated, auto-refresh 30s

═══════════════════════════════════════════════════════════
STRUKTURA PLIKÓW (kluczowe)
═══════════════════════════════════════════════════════════
backend/
  app/main.py                    — 25+ endpointów REST
  app/services/
    cap_generator.py             — generator CAP 1.2
    warning_levels.py            — logika stopni (27 testów ✓)
    map_exporter.py              — generator SVG
    pdf_generator.py             — raport PDF (ReportLab)
    meteoalarm.py                — MeteoAlarm Atom feed parser
    delivery.py                  — FTP + email dystrybucja
    webhook.py                   — HTTP webhook push
  app/data/
    warning_texts.py             — opisy/instrukcje per zjawisko/stopień
    phenomenon_config.py         — ikony, skutki, instrukcje (EDYTUJ TU)
    voivodeships.json            — 16 województw GeoJSON (217 KB)
    counties.json                — 380 powiatów GeoJSON (4.6 MB, tol=0.0003°)
    counties_centroids.json      — centroidy dla spatial join (38 KB)

frontend/src/
  App.js                         — główny komponent, routing zakładek
  components/
    map/MapPanel.js              — mapa Leaflet z wszystkimi warstwami
    map/StatusView.js            — widok status z ikonami na mapie
    editor/EditorPanel.js        — edytor ostrzeżeń (główny formularz)
    editor/WarningsList.js       — historia ostrzeżeń
    editor/WebhooksPanel.js      — zarządzanie webhookami
    editor/DeliveryPanel.js      — konfiguracja FTP + email
  utils/mapState.js              — persystencja zoom/podkładu

/data/ (Docker volume, persistuje między restartami):
  warnings.json                  — baza ostrzeżeń
  templates.json                 — szablony
  webhooks.json                  — konfiguracja webhooków
  delivery_config.json           — konfiguracja FTP/email
  delivery_log.json              — log wysyłek

═══════════════════════════════════════════════════════════
ZNANE OGRANICZENIA (nie błędy — świadome kompromisy)
═══════════════════════════════════════════════════════════
1. KONTURY POWIATÓW: szczeliny < 0.22px przy zoom 10 (Douglas-Peucker
   upraszcza niezależnie każdy powiat). Niewidoczne w praktyce.
   Rozwiązanie docelowe: PostGIS + ST_Snap (v2.0)

2. SPATIAL JOIN: po centroidach (nie po poligonach). Przy rysowaniu
   poligonu na granicy powiatu — możliwe błędy. Rozwiązanie: PostGIS ST_Intersects (v2.0)

3. PERSYSTENCJA: JSON flat-file. Brak concurrent editing.
   Rozwiązanie: PostgreSQL (v2.0)

4. BRAK UWIERZYTELNIANIA per-user. Tylko opcjonalny API key.
   Rozwiązanie: LDAP/AD IMGW (v2.2)

═══════════════════════════════════════════════════════════
ROADMAP — PRIORYTETY
═══════════════════════════════════════════════════════════
v2.0  PostgreSQL + PostGIS (spatial join po poligonach, brak szczelin)
v2.2  Autoryzacja LDAP/AD IMGW, role, audit log
v2.3  Publikacja MeteoAlarm (FTP EUMETNET, wymaga rejestracji jako NMS)
v3.0  NOWCASTING:
      - Warstwy radarowe (HDF5/NetCDF → GeoServer WMS → Leaflet)
      - Wyładowania atmosferyczne (WebSocket, animacja)
      - Auto-ostrzeżenia z nowcastingu → workflow weryfikacji przez synoptyka

═══════════════════════════════════════════════════════════
URUCHOMIENIE
═══════════════════════════════════════════════════════════
Produkcja (Linux):
  docker compose build --no-cache
  docker compose up -d
  → http://localhost:3000

Dev bez Dockera (Windows):
  .\start-no-docker.ps1
  (wymaga Python 3.10+ i Node 18+)

API docs: http://localhost:8000/docs
FTP/email config: zakładka Ustawienia → Dystrybucja

═══════════════════════════════════════════════════════════
DRUGI PROJEKT (geo-viz z HDF5) — opisz w nowej sesji
═══════════════════════════════════════════════════════════
Próby wizualizacji danych radarowych HDF5 — problem z geometrią
(brak ustawienia układu współrzędnych?). Wgraj pliki HDF5 i opisz
co próbowałeś osiągnąć — prawdopodobnie chodzi o reprojekcję
z układu radarowego (polarnego lub LAEA) na WGS84.
"""
