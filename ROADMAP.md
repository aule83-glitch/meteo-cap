# MeteoCAP Editor — Roadmap i Todo

## Aktualna wersja: v2.3.2 (HOTFIX 2)

---

## 🐛 v2.3.2 — Hotfix 2

- **Naprawiono crash UI po zapisaniu ostrzeżenia (ekran czarny).**
  W MapPanel.js i StatusView.js użycie nieistniejącej stałej `LEVEL_BORDERS` (linie 231, 263, 228, 266) powodowało `ReferenceError: LEVEL_BORDERS is not defined` przy renderze labelów na mapie. Wywalało się dopiero przy próbie wyrenderowania ostrzeżenia (gdy lista nie była pusta), więc startowy ekran wyglądał normalnie — crashowało po zapisie pierwszego ostrzeżenia.
- Dodana stała `LEVEL_BORDERS` w obu plikach z ciemniejszymi obramowaniami dla kontrastu (`#a16207`, `#9a3412`, `#7f1d1d`).
- **Lekcja na przyszłość:** użycie nieistniejących nazw przeżyje analizę składniową. Skrypt audytujący zostanie dodany do checklisty buildów (skanuje pliki .js pod kątem stałych UPPERCASE używanych bez deklaracji/importu).

## 🐛 v2.3.1 — Hotfix 1

- **Naprawiono crash backendu przy starcie kontenera.** Wprowadzony w v2.1.0 (przy refaktorze `cancel_warning`) brakujący import `Optional` z `typing` powodował `NameError: name 'Optional' is not defined` przy ładowaniu `app/main.py`. Backend nie startował → wszystkie endpointy zwracały 502 Bad Gateway. Frontend działał, ale nie miał z kim rozmawiać.
- **Lekcja na przyszłość:** lokalna walidacja przez `ast.parse()` sprawdza tylko składnię, nie wykrywa NameError. Trzeba uruchomić rzeczywisty `import` modułu albo `python -c "from app.main import app"` żeby wyłapać brakujące importy. Dodaję ten krok do checklisty buildów.

---

## ✨ Nowe w v2.3.0 — Wielojęzyczność (PL + EN)

### Dlaczego
MeteoAlarm/EUMETNET wymaga ostrzeżeń co najmniej w języku polskim i angielskim.
Dotąd CAP miał dwa bloki `<info>` (pl-PL, en-GB), ale angielski używał tylko szablonów —
gdy synoptyk edytował polski tekst, angielski się rozjeżdżał. PDF nie miał wersji EN w ogóle.

### Backend
- **`/api/warnings/default-texts`** zwraca teraz `description_pl/en`, `impacts_pl/en`, `instruction_pl/en` (oraz wstecz-kompatybilne `description`, `impacts`, `instruction` = PL)
- **Schemat `WarningCreate`** ma nowe pola: `description_en`, `impacts_en`, `instruction_en`, `headline_en`
- **CAP generator** używa pól EN z ostrzeżenia (jeśli synoptyk wpisał własne) lub szablonu z `warning_texts.py` jako fallback
- **CAP XML** zawiera teraz `<parameter><valueName>impacts</valueName>` w obu blokach `<info>` — wcześniej skutki nie szły do CAP wcale
- **PDF generator** dostał parametr `lang='pl'|'en'` z pełnym słownikiem EN: tytuł, etykiety, statusy ("ACTIVE"/"UPCOMING"/"EXPIRED"/"CANCELLED"), polskie nazwy zjawisk → angielskie ("Heavy rainfall", "Severe frost"...)
- **Endpoint `/api/export/pdf?lang=pl|en`** generuje raport w wybranym języku, plik z sufiksem `_en`

### Frontend
- **Toggle 🇵🇱 PL / 🇬🇧 EN** nad textareami opisu — synoptyk pisze polski, klika EN żeby sprawdzić/poprawić wersję angielską (pre-wypełnioną z szablonu)
- Brak duplikacji pól na ekranie (były 3 textarea — są 3, tylko z togglem nad)
- Pola EN auto-populują się z `default-texts` analogicznie do PL
- Reset przy zmianie zjawiska — oba języki dostają nowe szablony
- Wykrywanie ręcznej edycji per język (`*EnUserEdited`) — żeby nie nadpisywać zmian synoptyka
- **3 przyciski PDF** w nagłówku archiwum: `📄 PDF PL` / `📄 PDF EN` / `📄📄 PL + EN` (oba na raz, dwa osobne pliki)

### Dla synoptyka
- Domyślnie pracuje w PL (toggle nie przeszkadza)
- Gdy chce sprawdzić co pójdzie do MeteoAlarm — klika EN
- Dla większości ostrzeżeń wystarczy szablon EN bez edycji
- PDF EN potrzebny ad-hoc dla odbiorców międzynarodowych — pobierany na żądanie

---

## ✨ Nowe w v2.2.0 — Rozszerzanie obszaru + polskie nazewnictwo

### Detekcja nowych powiatów poza grupą
Gdy synoptyk w trybie aktualizacji zaznacza powiat który **nigdy** nie był w żadnej wersji drzewa
ostrzeżenia (sprawdzane przez endpoint `/api/warnings/{id}/group`):

- W edytorze pojawia się ostrzeżenie wizualne: ile takich powiatów, lista nazw, pouczenie
- Przy zapisie automatycznie otwiera się dialog wyboru:
  - **➕ Rozszerz obszar (zalecane, domyślne):** system tworzy dwa komunikaty CAP — Aktualizację dla starych powiatów + nowe Ostrzeżenie dla nowych. Dwa drzewa wersji powiązane przez `related_group_ids`. Zachowuje historię obu obszarów niezależnie.
  - **♻ Zastąp wszystko nowym ostrzeżeniem:** odwołuje pierwotne (z przyczyną "kontynuacja w nowym"), tworzy nowe ostrzeżenie z całością. Stare drzewo zamknięte.

Powód wprowadzenia: standard CAP wymaga, by odbiorca powiatu który dotychczas nie miał ostrzeżenia,
dostał Alert (pierwsze wydanie), nie Update. Inaczej byłby to "missing alert" w audycie sprawdzalności.

### Backend
- Nowy endpoint `POST /api/warnings/{id}/expand-area` z `mode: split | replace`
- Pole `related_group_ids` w modelu danych — łączy drzewa "soft link" (nie struktura grafu)
- W trybie `split` wstrzykiwane są wzajemne referencje między A i B przy tworzeniu

### Polskie nazewnictwo UI
Standardowo CAP używa angielskich nazw. W naszym UI te nazwy są pierwszego rzędu po polsku,
z angielskim CAP w nawiasie / tooltipie:
- "Alert" → **"Ostrzeżenie"** (Alert)
- "Update" → **"Aktualizacja"** (Update)
- "Cancel" → **"Odwołanie"** (Cancel)

Konsekwencje:
- Przyciski wyboru rodzaju komunikatu mają polskie etykiety + tooltip z nazwą CAP
- Akcja "✕ Anuluj" w karcie ostrzeżenia → "✕ Odwołaj"
- Tytuł modalu "Anuluj ostrzeżenie" → "Odwołaj ostrzeżenie"
- Inne "Anuluj" w UI (np. zamykanie dialogu) zostają — to standardowe polskie znaczenie "zamknij okno"

---

## ✨ Nowe w v2.1.2

- **Kontekst eskalacji w opisie** — przy `operationHint = escalate/deescalate` dla zjawisk kumulacyjnych (opady deszczu/śniegu, burze) edytor pokazuje dodatkową sekcję z polami:
  - "Zaobserwowano dotychczas" (np. 35 mm)
  - "Prognoza pozostała" (np. 25 mm)
  - "Suma łącznie" (auto-wyliczane)

  Wartości są wstrzykiwane do szablonu opisu (`{observed_value}`, `{forecast_value}`, `{total_value}`). Pojawia się tylko dla zjawisk kumulacyjnych: opady deszczu, opady śniegu, intensywne opady śniegu, deszcz z burzami, burze. Pozostałe zjawiska bez tej sekcji — nie ma nowych pól w CAP XML, tylko bogatszy `description`.

- **Partial cancel — masowe zaznaczanie:**
  - Globalne: `☑ Zaznacz wszystkie` / `☐ Odznacz wszystkie` / `⇄ Odwróć`
  - Per województwo: `☑ całe` / `☐ żadne` obok nazwy każdego województwa

- **MeteoAlarm — wszyscy sąsiedzi domyślnie ON:** DE, CZ, SK, UA, LT (Białoruś nie udostępnia feedu meteoalarm — czeka na integrację z WMO GMAS)

---

## ✨ Nowe w v2.1.1 — Polish drzewa wersji

- **Modal podglądu** pokazuje numer wersji (badge) i typ operacji (etykieta)
- **Editor** filtruje listę "Update" tylko do aktywnych liści (zablokowanie Update na zastąpionych wersjach)
- **Status — przyciski w panelu szczegółów:** "✎ Edytuj (Update)" przekierowuje do edytora w trybie Update z wczytanym ostrzeżeniem; "🌳 Drzewo wersji" otwiera modal SVG
- **ZIP łańcucha CAP** — endpoint `/chain-zip` zwraca wszystkie wersje grupy jako ZIP z manifestem (przycisk "📦 Pobierz łańcuch CAP" w modal drzewa). Format: `v01_create_abc12345.xml`, `v02_escalate_def67890.xml`, ..., `MANIFEST.txt`. Użyteczne dla audytu, prokuratury, weryfikacji sprawdzalności
- **Tooltip w drzewie SVG** — najechanie na węzeł pokazuje pełen opis (wersja, stopień, operacja, status, liczba powiatów, czas, ID)
- **Label na mapie** pokazuje:
  - 🔼/🔽 ikonę przy escalate/deescalate
  - `v2`, `v3`... badge dla wersji > 1

---

## ✨ Nowe w v2.1.0 — Drzewo wersji ostrzeżeń

### Backend
- **Model danych drzewa:** każde ostrzeżenie ma `warning_group_id`, `parent_id`, `version`, `is_active_leaf`, `operation_hint`
- **Migracja v2.0 → v2.1:** automatyczna przy starcie aplikacji — odtwarza grupy z istniejących `references_id`
- **Endpointy:**
  - `GET /api/warnings/{id}/group` — wszystkie wersje grupy
  - `GET /api/warnings/{id}/tree` — struktura drzewa (nodes + edges) dla wizualizacji
  - `POST /api/warnings/{id}/partial-cancel` — wycięcie części obszaru z ostrzeżenia
  - `GET /api/warnings/update-template` — szablon opisu dla operacji Update z interpolacją
- **Cancel z przyczyną:** `POST /api/warnings/{id}/cancel` body `{reason_code, reason_text}` — przyczyna trafia do `description` CAP Cancel
- **~85 szablonów opisów** dla 15 zjawisk × 7 operacji w `update_templates.py`

### Frontend
- **Auto-zgadywanie operation:** w trybie Update system wykrywa typ operacji (escalate / deescalate / extend / shorten / expand_area / cut_area / amend) na podstawie diff oryginału vs aktualnych wartości
- **Auto-szablon opisu:** zmiana `operation_hint` wczytuje odpowiedni szablon z interpolacją parametrów
- **Modal Cancel z przyczyną:** trzy presety + opcja własnego tekstu
- **Modal Partial Cancel:** zaznaczanie powiatów do wycięcia (grupowane po województwach), preset przyczyny, wynik = automatycznie 2 CAP-y (Update + Cancel)
- **Modal Tree View (SVG):** wizualizacja drzewa wersji z węzłami pokazującymi wersję, stopień, operację, status (aktywny / zastąpiony / anulowany), kolorami stopni i krawędziami między rodzicami a dziećmi
- **Audit trail w Historii:** trzy nowe przyciski na karcie ostrzeżenia (👁 Podgląd, 🌳 Drzewo, ✂ Wytnij)

### Operacje obsługiwane
| Operacja | Skutek |
|----------|--------|
| `create` | Pierwsze wydanie (Alert) |
| `amend` | Korekta detali bez zmiany stopnia |
| `escalate` | Wzrost stopnia (zjawisko nasila się) |
| `deescalate` | Spadek stopnia (zjawisko słabnie) |
| `extend` | Przedłużenie czasu obowiązywania |
| `shorten` | Skrócenie czasu obowiązywania |
| `expand_area` | Powiększenie obszaru ostrzeżenia |
| `cut_area` | Wycięcie części obszaru (kontynuacja dla pozostałych) |
| `partial_cancel` | CAP Cancel dla wyciętego podzbioru (auto-towarzysz cut_area) |
| `full_cancel` | Pełne anulowanie ostrzeżenia |

---

## ✅ Zrealizowane (v2.0.x)

### Edytor
- 15 zjawisk meteorologicznych z suwakami, radio, checkbox per zjawisko
- Automatyczny stopień 1/2/3 w czasie rzeczywistym (kryteria IMGW-PIB)
- Trzy pola tekstowe: Opis przebiegu, Spodziewane skutki, Zalecenia — co robić?
- Autoteksty z `warning_texts.py` i `phenomenon_config.py` z interpolacją parametrów (debounce 250ms)
- Persystencja stanu edytora przy przełączaniu zakładek (editorDraft)
- Presety parametrów (localStorage)
- Import CAP XML z pliku
- Podgląd XML przed pobraniem

### Mapa
- 380 powiatów GUGiK PRG + 16 województw (WGS84)
- Kolorowe poligony powiatów dla ostrzeżeń (żółty/pomarańczowy/czerwony)
- Zaznaczanie edycji → cyjan
- Rysowanie poligonów i prostokątów → spatial join
- Klikanie na powiat = toggle zaznaczenia
- Jeden label per ostrzeżenie z ikoną, zjawiskiem, stopniem i czasem ważności

### CAP 1.2
- Dwa bloki info: pl-PL + en-GB
- EMMA_ID (primary) + TERYT (secondary) jako geocode
- msgType Alert/Update/Cancel z references
- Tryb zbiorczy XML + per-powiat ZIP

### Historia i Status
- Archiwum: anulowane/zastąpione widoczne w historii z separatorem
- Blokada usuwania aktywnych ostrzeżeń (tylko Cancel → archiwum)
- Widok Status z kolorowymi poligonami i ikonami zjawisk
- Eksport PNG z widoku Status (dopasowany do konturów Polski)
- Modal podglądu treści ostrzeżenia
- Panel szczegółów po kliknięciu na powiat lub label w Status

### Import IMGW API
- Pobieranie z `danepubliczne.imgw.pl/api/data/warningsmeteo`
- Mapowanie zjawisk IMGW → klucze phenomenon
- TERYT → powiaty (1:1)
- Konwersja czasu CEST→UTC
- Modal podglądu przed zapisem

### MeteoAlarm
- Warstwa ostrzeżeń DE/CZ/SK/UA/LT/BY (cache 10min)
- Geokody EMMA_ID z plikami GeoJSON (1144 kodów)
- Fallback na marker centrum kraju

### Eksport
- PDF raport A4 z polskimi znakami (DejaVu Sans)
- Trzy sekcje per ostrzeżenie: Przebieg, Skutki, Zalecenia
- SVG mapa ostrzeżeń
- Eksport PNG z widoku Status

### Dystrybucja
- FTP/FTPS push XML po zapisaniu
- Email SMTP/STARTTLS z HTML + załącznik XML
- Webhooki HTTP POST
- Log dystrybucji

---

## 🟡 Planowane ulepszenia (v2.2.x i dalej)

- [ ] **Grupowanie historii po `warning_group_id`** — expandowalne grupy zamiast płaskiej listy wszystkich wersji
- [ ] **Miniaturka mapy w PDF per ostrzeżenie** — Pillow + GeoJSON
- [ ] **Logo IMGW-PIB w PDF** — wymaga dostarczenia pliku przez IMGW
- [ ] **Geokody MeteoAlarm dla Ukrainy** — pobranie pliku geocodes_UA.geojson z meteoalarm.org (obecnie UA pokazuje markery zamiast konturów, bo lookup nie zawiera kodów UA)
- [ ] **Białoruś przez WMO GMAS** — gdy WMO udostępni API, zintegrować feed BY
- [ ] **Obrys grupy powiatów** — prawdziwy dissolve granic (PostGIS w v3.0)
- [ ] **Pole `created_by`** — przygotowanie pod LDAP w v3.2

---

## 🟠 Roadmap (większe wersje)

### v3.0 — PostgreSQL + PostGIS
- Spatial join po poligonach (ST_Intersects) zamiast centroidów
- Brak szczelin konturów
- Prawdziwy dissolve obszarów ostrzeżeń (ST_Union)
- Concurrent editing, historia zmian audytowalna

### v3.2 — Autoryzacja LDAP/AD IMGW
- Role: synoptyk / kierownik / administrator
- Pole `created_by` wypełniane z LDAP
- Audit log z imieniem i nazwiskiem operatora

### v4.0 — Nowcasting
- Warstwy radarowe HDF5/NetCDF → GeoServer WMS → Leaflet
- Wyładowania atmosferyczne (WebSocket, animacja)
- Auto-ostrzeżenia z nowcastingu → workflow weryfikacji przez synoptyka

### v4.2 — Publikacja MeteoAlarm
- FTP EUMETNET (wymaga rejestracji jako NMS)
- Format METEOALARM awareness_level/awareness_type

---

## 📝 Znane ograniczenia

1. **Spatial join po centroidach** — przy rysowaniu poligonu na granicy powiatu możliwe błędy. Rozwiązanie: PostGIS (v3.0)
2. **Flat-file JSON** — brak concurrent editing. Rozwiązanie: PostgreSQL (v3.0)
3. **Brak auth per-user** — tylko opcjonalny API key. Rozwiązanie: LDAP/AD (v3.2)
4. **Brak prawdziwego dissolve** — obrys obszaru ostrzeżenia tylko poprzez kolorowanie poligonów (v2.1 nie ma już convex hull, który dawał błędne efekty)

---

## ✨ v2.4.4 (2026-05-10) — IMGW-OSMET, MeteoAlarm UX

### Zmiany

**Rebranding**
- Nazwa aplikacji: MeteoCAP Editor → **IMGW-OSMET** (robocza)
- Logo IMGW-PIB w headerze (SVG `imgw_logo_pl.svg`) i w raportach PDF (PNG, PL/EN)

**MeteoAlarm — severity fix**
- `Moderate` → stopień 1 (żółty) — poprzednio błędnie 2
- `awareness_level` "2; yellow" → 1, "3; orange" → 2, "4; red" → 3
- Formuła: `level = clamp(1, awareness_level_num - 1, 3)`

**MeteoAlarm — UX markerów**
- Markery jako znaki wodne: opacity 0.45–0.6 (było: pełne etykiety 100%)
- Hover rozsuwa label z emoji + flagą + nazwą zjawiska + stopniem
- Zoom aggregation: zoom ≤5 → 1 marker per kraj (najwyższy stopień), ≥7 → pełna geometria
- Renderowanie reaguje na `zoomend` (useCallback + osobny effect)

**Tooltip powiatów**
- Opóźnienie 700ms przed pojawieniem się hintu (mouseover → setTimeout)
- mouseout natychmiast czyści timer i zamyka tooltip
- Rozwiązuje problem "zawieszających się" hintów przy szybkim przejeżdżaniu kursorem

### Pending

- [ ] Weryfikacja DE (>100 entries, grouping po identifier)
- [ ] UA — weryfikacja poligonów w produkcji (feed live)
- [ ] Clustering markerów MA na zoom 6-7 (Leaflet.markercluster)
- [ ] Ustawienia językowe (PL/EN toggle w headerze wpływający na PDF)

---

## ✨ v2.5.0-b1 (2026-05-10) — Optymalizacja + spatial clustering

### Zmiany

**Schemat wersjonowania**
- Nowy format: `MAJOR.MINOR.PATCH[-bBUILD]`, opis w VERSIONING.md
- Plik `VERSION` w root projektu
- Wersja w UI (header), `/api/` response i nazwie ZIP

**Optymalizacja rozmiaru (ZIP: 16MB → ~6MB)**
- `meteoalarm_geocodes_pl.json`: 33MB → 2.3MB
  - Usunięto 890 wpisów nieużywanych krajów (ES, AT, FR, FI, IE i in.)
  - Uproszczono geometrie algorytmem RDP (ε=0.002): 597k → 63k punktów (−89%)
- `counties.json`: 4.6MB → 2.2MB (RDP ε=0.001, mniej agresywny dla PL)
- `geocodes_CZ/LT/PL/DE.geojson`: łącznie ok. 400KB mniej
- `imgw_logo_pl/en.png`: 700KB → 85KB każde (resize 300px + optymalizacja PIL)
- Usunięto `BRIEFING_NOWA_SESJA.py` i `MODEL_SELECTION.md` z builda

**MeteoAlarm — spatial clustering**
- Zastąpienie agregacji per-kraj klasteringiem geometrycznym (pixel-distance)
- Hamburg-przymrozek i Monachium-upał = 2 osobne markery we właściwych miejscach
- Klaster (gdy markery <40px od siebie na zoom≤5): kółko z liczbą, tooltip "N ostrzeżeń"
- Kontury rysowane zawsze niezależnie od zoom

**Tooltips — globalny div**
- Powiaty i MeteoAlarm: jeden `<div id="county-global-tt">` w `document.body`
- Brak Leaflet `bindTooltip` → brak "duchów" zawieszonych tooltipów
- 600ms delay na pojawienie się hintu powiatów

### Pending / następny sprint
- [ ] Poprawka zaznaczania powiatów poligonem (centroid vs bbox vs intersection)
- [ ] Mapka powiatów w PDF (aktywne obszary)
- [ ] Kompletność kolorowania w podglądzie PNG (StatusView)
- [ ] Telefon: ngrok/local network URL

---

## 🗒️ Backlog / Todo (niezaplanowane sprinty)

### Edytor — reorganizacja layoutu
Obecny problem: pola edycji są funkcjonalne ale trzeba dużo scrollować żeby znaleźć sekcje (aktualizacja, import, wysyłka). 

Propozycje do przemyślenia:
- **Tabs/sekcje** w panelu edytora: "Treść" | "Obszar" | "Wysyłka/Publish" | "Import"
- Albo **collapsible sections** z zapamiętywaniem stanu (które rozwinięte)
- Kluczowe akcje (Zapisz, Wyślij CAP, PDF) zawsze widoczne — sticky toolbar na górze/dole panelu
- Na wąskim ekranie (telefon) panel edytora jako drawer/modal zamiast sidebara

### Zaznaczanie obszarów po wysokości npm (NMT)
Nowa funkcjonalność wymagająca danych:
- **Brak NMT** — trzeba pozyskać dane wysokościowe (np. SRTM 90m lub EU-DEM 25m, oba darmowe)
- Pomysł: użytkownik podaje próg wysokości (np. "powyżej 500m npm") → system generuje kontur z NMT → automatycznie zaznacza powiaty których znacząca część leży powyżej progu
- Alternatywa lżejsza: prekalkulowane kontury dla kilku progów (200/300/500/800/1000m) zapisane jako GeoJSON — bez NMT w runtime
- Backend: endpoint `/api/spatial/counties-above-elevation?threshold=500`
- Do ustalenia: źródło danych NMT, rozdzielczość, format (GeoTIFF → contouring w scipy/rasterio)

**Zależności:** dane NMT, biblioteka do konturowania (rasterio lub GDAL), ewentualnie pre-processing offline

---

## 🔭 Wizja długoterminowa — system trójwarstwowy

### Trzy warstwy ostrzeżeń

```
WARSTWA 1 — Early Warning (EW)
  Wyprzedzenie: 48h+ (do 5 dni)
  Cel: planowanie, dysponowanie siłami i środkami
  Odbiorcy: służby zarządzania kryzysowego, energetyka, transport
  Charakter: probabilistyczny, szeroki obszar, niższa pewność

WARSTWA 2 — Warning właściwy (W)  ← obecny system
  Wyprzedzenie: 0–48h
  Cel: gotowość i reakcja
  Odbiorcy: wszystkie służby + społeczeństwo
  Charakter: deterministyczny, CAP 1.2, obecny workflow

WARSTWA 3 — Nowcast (NC)
  Wyprzedzenie: 0–3h, aktualizacja co ~15min
  Cel: natychmiastowa reakcja operacyjna
  Odbiorcy: pogotowie, straż, operacyjni dyspozytorzy
  Charakter: zagnieżdżony w W, auto-update z zatwierdzeniem człowieka
```

### Impact-based / Impact-oriented warnings
- Zamiast "wiatr 25 m/s" → "ryzyko uszkodzeń dachów w zabudowie z lat 70."
- Wymaga warstw GIS:
  - Ukształtowanie terenu (NMT — patrz wyżej)
  - Infrastruktura krytyczna i wrażliwa
  - Specjalne regiony (góry, jeziora, parki narodowe)
  - Stan zdrowia drzew (ryzyko wywrotów)
  - Specjalne okresy ekspozycji (pielgrzymki, obozy, imprezy masowe)
- Źródła: GUGiK, BDOT10k, dane IMGW, dane zewnętrzne przez API/WFS

### Nowcasting — człowiek w pętli
- Input: zewnętrzne modele nowcastingowe (np. INCA, DWD-STEPS, Rad-EXTRAKT)
- Pipeline: model → auto-walidacja spójności z aktywnym W → propozycja aktualizacji
- Jeśli spójne z ostrzeżeniem → auto-zatwierdzone
- Jeśli rozbieżne → do ręcznego zatwierdzenia przez dyżurnego
- UI: panel "Nowcast queue" z diff względem aktywnego ostrzeżenia

### Zależności techniczne (do zaprojektowania)
- Rozszerzenie schematu CAP lub osobny format dla EW i NC
- WebSocket lub SSE dla live-update NC w UI
- Scheduler (np. APScheduler już w backendzie?) dla auto-fetch modeli
- Model danych: relacja EW → W → NC (drzewo, nie płaska lista)

---

## v2.5.1 (2026-05-10)

- Label PL ostrzeżeń: orientacja pozioma (ikona + tekst + czas w jednej linii)
- Markery MA: pill-shape zamiast kółka, skrót tekstowy (WTR/BRZ/SNI...) zamiast emoji — czytelne na każdym tle i rozmiarze
- Hover MA: border-radius pill zamiast circle
- Tooltip MA i powiatów: word-wrap, max-width — brak rozciągania w kosmos
- StatusView: sekcja MeteoAlarm (kraje ościenne) gdy MA włączone — ostrzeżenia per kraj z treścią
- MA state przeniesiony do App.js — jeden fetch dla mapy i statusu
- Wersja 2.5.1 (poprawne inkrementowanie od teraz)

---

## v2.5.2 (2026-05-10)
- MA klaster: emoji/skrót zjawiska w pill zamiast liczby; liczba depesz → tylko tooltip
- MA lizaki: dodge — markery nakładające się przesuwane o ~15km od siebie
- Label PL: fix pionowego layoutu — `className='ma-warn-label'` + CSS `flex-direction:row !important`
- Label PL: `iconAnchor` skorygowany żeby label był wyśrodkowany względem centroidu

---

## v2.5.3 (2026-05-10)
- StatusView: mapa przywrócona — MA section jako `max-height:220px` panel na dole z `overflow-y:auto`
- MA skróty: WIATR, BURZE, ŚNIEG, DESZCZ, MRÓZ, UPAŁ, MGŁA, GRAD zamiast kodów WTR/BRZ/SNI
- Pill font zmniejszony do 8px żeby dłuższe słowa się mieściły

---

## v2.5.4 (2026-05-10)
- Import IMGW: deduplication po imgw_id — ponowny klik nie tworzy duplikatów
- Import IMGW: preview oznacza już istniejące ostrzeżenia (greyed-out, "✓ już w bazie")
- Import IMGW: przycisk "Importuj nowe (N)" zamiast "Importuj wszystkie" — pomija istniejące
- Import IMGW: gdy wszystko już zaimportowane → przycisk disabled "Wszystkie już zaimportowane"
- Backend: /import/imgw zwraca `already_exists` i `new_count` per ostrzeżenie

---

## v2.5.5 (2026-05-10)
- MA markery: powrót do kółka z emoji (nie pill z tekstem), rozmiar 22-24px
- MA hover: kółko→półkole + rozwinięcie labela z count w nawiasie jeśli klaster
- Dodge iteracyjny: 5 przejść, symetryczne rozsunięcie po kącie (Math.cos/sin), większy efekt
- Usunięto orphaned block z poprzedniej refaktoryzacji (duplikat makeMarker)
- PL label: font 12px, emoji 18px, iconAnchor [0,18] — widoczny i wycentrowany

---

## v2.5.6 (2026-05-10)
- Spatial join przepisany: intersection + 10% area coverage zamiast tylko centroidu
  - Sutherland-Hodgman polygon clipping (czysty Python, bez shapely)
  - Shoelace formula dla powierzchni
  - 3 kryteria: centroid powiatu w poligonie LUB ≥10% powiatu nakryte LUB centroid poligonu w powiecie
  - Naprawia: zaznaczanie poligonem, dziury w PNG StatusView, brakujące powiaty w danych ostrzeżeń
- PDF: statyczna mapka per ostrzeżenie (7.5×5.5 cm)
  - Wszystkie powiaty PL w jasnoszarym tle, objęte w kolorze poziomu ostrzeżenia
  - Bez podkładu OSM — czysta wektorowa grafika w ReportLab Drawing
  - Korekta merkatorska (lat_correction = cos(lat))

---

## v2.5.7 (2026-05-10)

### Spatial join — naprawa orientacji clip
- Sutherland-Hodgman wymaga CCW; Leaflet Draw rysuje CW
- Auto-detekcja orientacji przez signed area + reverse jeśli CW
- Test ad-hoc: dla Wielkopolski stary 18 powiatów → nowy 26 (graniczne złapane: Ostrowski, Rawicki, Gnieźnieński, Turecki, Wschowski itd.)
- Próg pokrycia 10% → 5% (Wolsztyński z 9.4% wcześniej pomijany)

### PNG StatusView — przepisany na metryczkę social-media (B+B1)
- Endpoint `/api/export/png` w backend (svglib + reportlab.renderPM)
- Layout 1200×1000: header (tytuł, data, liczba), mapa 700px, footer z syntezą
- Synteza per zjawisko: "burze · stopień 2 · 14 powiatów · woj. małopolskie, podkarpackie"
- Heurystyka: ≤3 województw → wymień nazwy małymi literami; więcej → tylko liczba
- Cluster-based labelki (jeden per zwarty obszar, max 70px odstęp)
- Dodge: jeśli klastry nadal blisko siebie, rozsuwa się je iteracyjnie (3 przejścia)

### PDF — refaktoryzacja czytelności
- Mapka wycentrowana, większa (8.5×6.5 cm), bez tekstu obok (duplikacja usunięta)
- "Powiaty objęte" zamiast "Obszar ostrzeżenia" (różny od `area_desc` w detail_table)
- Wykrywanie całych województw — `_area_summary` porównuje liczbę powiatów z totalami
- "całe woj. dolnośląskie" zamiast wymieniania 27 powiatów (radykalna redukcja długości)
- "Całe województwa" jako jedna linia zbiorcza dla wielu w pełni objętych
- Nazwy województw/powiatów małymi literami (zgodne z polskimi zasadami pisowni)

---

## v2.5.8 (2026-05-17)
- PDF: usunięto podwójną mapkę (duplikat `block_elements.append(_map_row)`)
- PDF: mapka wycentrowana, większa (8.5×6.5 cm)
- PDF: "całe województwa:" jedna linia zbiorcza, powiaty wymieniane tylko dla niekompletnych
- PDF: małe litery w nazwach województw/powiatów
- Docker: port frontendu zmieniony 3000 → 3001 (konflikt z geodata-viz)
- Nowy endpoint `/api/export/cap-xml` — zbiorczy ZIP ze wszystkimi aktywnymi CAP XML
  - Ostrzeżenia z IMGW API bez XML → generowane on-the-fly
  - Przycisk "📦 Eksportuj wszystkie CAP XML" w edytorze
