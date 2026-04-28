# MeteoCAP Editor — Roadmap

## Wersja 1.x (zaimplementowane)

- ✅ Edytor ostrzeżeń z dynamicznymi suwakami i kontrolkami per zjawisko
- ✅ Mapa Polski z prawdziwymi granicami GUGiK (16 województw, 380 powiatów)
- ✅ Spatial join — przypisywanie powiatów do narysowanego poligonu
- ✅ Klikanie na powiat aby dodać/usunąć go z zaznaczenia
- ✅ Automatyczne wyznaczanie stopnia zagrożenia (1/2/3) w czasie rzeczywistym
- ✅ Generowanie CAP 1.2 XML (pl-PL + en-GB, EMMA_ID, TERYT, polygon, per-województwo area)
- ✅ Tryb zbiorczy (jeden XML) i per-powiat (ZIP z osobnymi XML)
- ✅ msgType: Alert / Update / Cancel z polem references
- ✅ Endpoint `/cancel` — wydaje CAP Cancel dla istniejącego ostrzeżenia
- ✅ Statusy ostrzeżeń: active / pending / expired / cancelled / updated
- ✅ Widok statusu z ikonami zjawisk na mapie i panelem szczegółów
- ✅ Eksport mapy do PNG
- ✅ Zmiana podkładu mapowego (ciemna, OSM, topo, satelita, hipsometria)
- ✅ Plik konfiguracyjny `warning_texts.py` — opisy i instrukcje per zjawisko/stopień
- ✅ Plik konfiguracyjny `phenomenon_config.py` — ikony, skutki, instrukcje
- ✅ Polskie nazwy powiatów (poprawne kodowanie UTF-8 z GUGiK)
- ✅ Czyszczenie formularza po zapisaniu ostrzeżenia

---

## Wersja 2.0 — Precyzja konturów (PRIORYTET)

### Problem
Obecne kontury zostały uproszczone algorytmem Douglas-Peucker (tolerancja 0.003°)
co powoduje:
- nakładanie się granic sąsiednich powiatów
- widoczne "szpary" między powiatami
- niedokładne przypisywanie powiatów do poligonów (spatial join po centroidach)

### Rozwiązanie
**Pełne dane topologiczne GUGiK** (zamiast uproszczonego SHP):
- Użyć bazy BDOT10k lub PRG (Państwowy Rejestr Granic) w formacie GeoPackage/PostGIS
- Dane dostępne z GUGiK: https://www.geoportal.gov.pl/dane/panstwowy-rejestr-granic
- Załadować do **PostGIS** — pełna precyzja, zapytania przestrzenne po poligonach (nie centroidach)
- Spatial join przez ST_Intersects zamiast point-in-polygon z centroidem
- Wyświetlać w Leaflet z mniejszą tolerancją (0.0005°) lub bez uproszczenia dla małych skal

### Zmiany
- [ ] Migracja z SQLite na PostgreSQL + PostGIS
- [ ] Import danych PRG do PostGIS
- [ ] Endpoint spatial join przez ST_Intersects(polygon, powiat_geom)
- [ ] Uproszczenie ST_Simplify po stronie DB, zależne od zoom level
- [ ] Vector tiles (MVT) zamiast całego GeoJSON — szybsze ładowanie

---

## Wersja 2.1 — MeteoAlarm Integration

### Ostrzeżenia krajów ościennych jako warstwa

**Źródło danych:** MeteoAlarm Atom Feed
- Niemcy (DWD): `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-germany`
- Czechy (CHMI): `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-czech-republic`
- Słowacja: `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-slovakia`
- Austria: `https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-austria`
- Litwa, Ukraina, Białoruś — jeśli dostępne

**Uwaga:** Ładowanie zewnętrznych feedów może spowolnić aplikację.
Dlatego planowane jako **opcjonalna warstwa** (toggle w UI).

### Implementacja
- [ ] Backend endpoint `GET /api/external/meteoalarm?countries=DE,CZ,SK`
  - Pobiera Atom feed, parsuje, cachuje na 10 min
  - Zwraca ujednolicony JSON z polami: country, phenomenon, level, polygon, onset, expires
- [ ] Frontend: toggle "Sąsiednie kraje" w przełączniku warstw mapy
- [ ] Osobne style markerów dla zewnętrznych ostrzeżeń (przezroczyste, z flagą kraju)
- [ ] Ograniczenie do bbox Polski + 200km

---

## Wersja 2.2 — Uwierzytelnianie i multi-user

- [ ] Login/logout (JWT lub LDAP — integracja z AD IMGW)
- [ ] Role: synoptyk (pełne uprawnienia), operator (tylko podgląd), admin
- [ ] Historia zmian (audit log) — kto wydał, kiedy, co zmienił
- [ ] Jednoczesna edycja — blokowanie ostrzeżenia podczas edycji

---

## Wersja 2.3 — Dystrybucja

- [ ] Webhook push — wysłanie CAP XML na wskazany URL po zapisaniu
- [ ] Email/SMS notyfikacje (opcja)
- [ ] Integracja z WIGOS (WMO Information System)
- [ ] Publikacja do MeteoAlarm (wymaga rejestracji jako NMS)

---

## Wersja 2.4 — Zaawansowany edytor

- [ ] Edytor warstwowy — wiele zjawisk jednocześnie na mapie
- [ ] Szablony ostrzeżeń — zapisywanie często używanych konfiguracji
- [ ] Import ostrzeżenia z pliku CAP XML (edycja istniejącego)
- [ ] Podgląd CAP XML przed pobraniem (wbudowany viewer)
- [ ] Wydruk/eksport do PDF — formatowany raport ostrzeżenia
- [ ] Zakres elewacji n.p.m. dla zjawisk górskich

---

## Znane ograniczenia (nie będą naprawiane bez migracji DB)

| Ograniczenie | Przyczyna | Rozwiązanie |
|---|---|---|
| Nakładające się kontury powiatów | Uproszczenie Douglas-Peucker | v2.0 PostGIS |
| Spatial join po centroidach | Brak pełnych poligonów w szybkim query | v2.0 ST_Intersects |
| Ostrzeżenia w pamięci (utrata po restart) | SQLite flat file | v2.0 PostgreSQL |
| Brak concurrent editing | Brak backendu sesji | v2.2 |
---

## Wersja 3.0 — Nowcasting Integration

### Warstwy danych real-time

**Radar IMGW** (HDF5/NetCDF → WMS)
- [ ] Tile server (GeoServer/MapServer) jako źródło WMS
- [ ] Warstwa radarowa w Leaflet (`L.tileLayer.wms`)
- [ ] Animacja sekwencji radarowych (ostatnie N skanów)
- [ ] Kontrolka czasu (player) do przewijania animacji

**Wyładowania atmosferyczne**
- [ ] Endpoint pollingowy lub WebSocket (odświeżanie co 1 min)
- [ ] Markery wyładowań z wiekiem (kolor = czas od uderzenia)
- [ ] Filtr: ostatnie 10/30/60 minut

**Auto-ostrzeżenia nowcastingowe**
- [ ] API przyjmujące propozycje ostrzeżeń z systemu nowcastingowego
- [ ] Widok "Do zatwierdzenia" — lista auto-alertów czekających na weryfikację
- [ ] Workflow: system generuje → synoptyk weryfikuje → klik "Zatwierdź i opublikuj" → CAP
- [ ] Parametry auto-alertu jako wartości wstępne w edytorze (edytowalne)

---

## Wersja 3.1 — Analiza historyczna

- [ ] Overlay przebiegów radarowych do porównania z wydanymi ostrzeżeniami
- [ ] Statystyki trafności ostrzeżeń (ile pokryło się z obserwacjami)
- [ ] Eksport historii do CSV/Excel

---

## Infrastruktura docelowa (produkcja)

Docelowe środowisko to **Linux server + Docker Engine** (nie Docker Desktop):

```
Serwer Linux (VM lub fizyczny, np. RHEL/Ubuntu)
├── Docker Engine (apt install docker.io)
├── docker-compose.yml
│   ├── meteocap-backend   (FastAPI + Python)
│   ├── meteocap-frontend  (nginx serving React)
│   └── meteocap-db        (PostgreSQL + PostGIS)  ← v2.0
├── nginx (host) — reverse proxy, SSL, integracja AD
└── /data/ — volume z ostrzeżeniami i konfiguracją
```

Docker Desktop (Windows) tylko do developmentu. Na produkcji Linux + Docker Engine
eliminuje problemy z politykami domenowymi AD.
