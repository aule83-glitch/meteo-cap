# MeteoCAP Editor

**System do tworzenia ostrzeżeń meteorologicznych zgodnych ze standardem CAP 1.2**

Oparty na kryteriach IMGW-PIB. Generuje pliki XML gotowe do dystrybucji przez agregatory CAP, DWH, systemy ostrzegawcze.

---

## Szybki start

### Wymagania
- Docker >= 24
- Docker Compose >= 2.x

### Uruchomienie (produkcja / sieć lokalna)

```bash
# Sklonuj / wypakuj projekt
cd meteo-cap

# Zbuduj i uruchom (pierwsze uruchomienie może potrwać 2-3 min)
docker-compose up --build -d

# Aplikacja dostępna pod:
# http://localhost:3000
# lub w sieci lokalnej: http://<IP-serwera>:3000
```

### Zatrzymanie

```bash
docker-compose down
```

### Logi

```bash
docker-compose logs -f backend    # logi FastAPI
docker-compose logs -f frontend   # logi nginx
```

---

## Tryb deweloperski (hot-reload)

```bash
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

W trybie dev:
- Backend FastAPI dostępny bezpośrednio pod `http://localhost:8000`
- Automatyczna dokumentacja API: `http://localhost:8000/docs`
- Frontend React z hot-reload pod `http://localhost:3000`

---

## Architektura

```
meteocap-frontend  (nginx:alpine)   → port 3000
    │ proxy /api/ →
meteocap-backend   (python:3.12)    → wewnętrzny port 8000
    │
meteocap-warnings  (Docker volume)  → /data/warnings.json
```

---

## Jak używać

### 1. Wybór obszaru na mapie
- Kliknij **Rysuj poligon** lub **Rysuj prostokąt** na mapie
- Narysuj obszar ostrzeżenia — system automatycznie przypisze powiaty
- Możesz też kliknąć **Cała Polska** aby objąć cały kraj

### 2. Edytor ostrzeżenia
- Wybierz **zjawisko meteorologiczne** z listy
- Ustaw **parametry** suwakami — system na bieżąco wskazuje stopień (1/2/3)
- Ustaw **okres ważności** (od/do)
- Opcjonalnie wypełnij nagłówek, opis, zalecenia

### 3. Eksport CAP 1.2
- **Zapisz** — zachowuje w bazie, widoczne w liście ostrzeżeń
- **Zapisz i pobierz CAP XML** — generuje plik XML zgodny z CAP 1.2

---

## Zjawiska i skale

| Zjawisko | Max stopień |
|---|---|
| Burze | 3 |
| Intensywne opady deszczu | 3 |
| Intensywne opady śniegu | 3 |
| Silny wiatr | 3 |
| Silny mróz | 3 |
| Upał | 3 |
| Opady marznące | 3 |
| Roztopy | 3 |
| Silny deszcz z burzami | 3 |
| Zawieje / zamiecie śnieżne | 2 |
| Mgła osadzająca szadź | 1 |
| Gęsta mgła | 1 |
| Oblodzenie | 1 |
| Opady śniegu (poza sezonem) | 1 |
| Przymrozki | 1 |

---

## Format CAP 1.2

Generowany plik XML zawiera:
- `<identifier>` — unikalny ID w formacie `PL-IMGW-{uuid}`
- `<info>` — zdarzenie, kategoria, pilność, dotkliwość, pewność
- `<parameter>` — parametry meteo, kolor ostrzeżenia, kod zjawiska
- `<area>` — opis słowny, poligon geograficzny, kody TERYT powiatów
- `<geocode>` — kody TERYT dla każdego powiatu

---

## Dane geograficzne

Aplikacja zawiera uproszczone dane GeoJSON województw i reprezentatywne punkty centralne powiatów.

**Aby użyć pełnych danych GUGiK:**
1. Pobierz dane z https://bdot.gov.pl lub API GUGiK
2. Zastąp zawartość `backend/app/data/poland_voivodeships.py`
3. Przebuduj kontener: `docker-compose up --build backend`

---

## Roadmap

- [ ] Uwierzytelnianie użytkowników (JWT)
- [ ] PostgreSQL + PostGIS (pełne dane wektorowe powiatów)
- [ ] Zakres elewacji n.p.m. (dla zjawisk górskich)
- [ ] Webhook / HTTP push do zewnętrznych systemów
- [ ] Historia zmian ostrzeżenia (update/cancel CAP msgType)
- [ ] Podgląd XML przed pobraniem
- [ ] Importowanie istniejących ostrzeżeń z pliku CAP XML

---

## Licencja

Projekt wewnętrzny. Kryteria ostrzeżeń na podstawie dokumentacji IMGW-PIB.
