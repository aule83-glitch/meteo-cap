# IMGW-OSMET — Roadmap

**Aktualna wersja: v2.5.33** · pełna historia zmian w `VERSIONING.md`

Plan powstał z pracy operacyjnej — większość pozycji to wnioski z dyżurów synoptycznych,
nie z burzy mózgów przy tablicy.

---

## Diagnoza kierunkowa

Narzędzie odziedziczyło po poprzednim programie (PrOsMet) **paradygmat pracy**,
nie tylko wygląd: jednostką jest dokument ostrzeżenia, a synoptyk ręcznie odwzorowuje
na siatce powiatów obraz, który w głowie ma jako kontur. Wszystko, co dobudowano
(oś czasu, biblioteka skutków, infografiki, reguła nakładania), to warstwy **wokół**
tego rdzenia.

Większość zgłaszanych problemów to objawy jednej przyczyny: **droga od intencji
do dokumentu jest za długa**. Stąd podział planu na dwie osie — naprawy i ergonomia
w obecnym modelu (etapy 1–3) oraz zmiana modelu autorskiego (etap 4).

---

## Etap 1 — „przestań przeszkadzać" ✅ ZROBIONE (2.5.23–2.5.26)

- ✅ Walidacja czasów — nie da się zapisać ostrzeżenia kończącego się przed początkiem
- ✅ Koniec fałszywego straszaka przy eskalacji („wypada 61 powiatów", choć nic nie wypadało)
- ✅ Ochrona zaznaczenia — potwierdzenie przy „Wyczyść" / „Cała Polska", cofanie Ctrl+Z
- ✅ Poprawki grafik: artefakt tekstowy, skalowanie metryczki, czas lokalny zamiast UTC
- ✅ Opisy stopni: *zachowaj ostrożność / przygotuj się / podejmij działania*

## Etap 2 — „zacznij pomagać" 🟡 W TOKU

**Część 1 ✅ (2.5.27–2.5.30):**
- ✅ **B9** MeteoAlarm: deduplikacja wersji odporna na przesuwane okna czasowe;
  wspólne okno czasu dla edytora i Statusu; filtr zjawisk; grupowanie ikon per region
- ✅ **B2** Powiaty zajęte przez to samo zjawisko oznaczane **w trakcie** zaznaczania
- ✅ **B3** Konflikt 409 z podświetleniem na mapie i przyciskiem „Odznacz kolidujące"
- ✅ **B11** Uzgadnianie importu z IMGW API zamiast dosypywania
- ✅ **B12** Wyraźny przycisk importu na górze edytora
- ✅ **B14** Ścieżki zasobów względem prefiksu

**Część 2 — NASTĘPNE W KOLEJCE:**
- 🔲 **B4 + B13** — rozdzielenie: **zapisz roboczo → publikuj → osobna warstwa eksportów**.
  Przepływ docelowy: zaznacz wszystkie strefy zdarzenia (1°, 2°, 3°) → koryguj → publikuj
  zbiorczo. Przycisk „Zbiorczy XML" jest dziś bezużyteczny, gdy wszystko jest wydane —
  miesza zapis z eksportem.
- 🔲 **B10** — suwak czasu w edytorze **między zapisem a publikacją**: podgląd chronologii
  całego zdarzenia zanim cokolwiek pójdzie w świat.

## Etap 2b — HISTORIA i archiwum ⚠ PILNE

**Problem operacyjny:** historia jest dziś na tyle nieczytelna, że synoptyk **czyści ją
do zera, żeby móc pracować**. To znaczy, że system zmusza do niszczenia dokładnie tych
danych, które będą potrzebne do weryfikacji. To nie jest odległy dług — to bieżąca utrata
materiału dowodowego.

**Wymagania:**
- 🔲 **Filtry i wyszukiwanie** (zjawisko, stopień, data, województwo, status) — tak,
  żeby *nie było powodu* czyścić historii
- 🔲 **Rozdzielenie: aktywne / archiwum** — domyślnie widać to, co obowiązuje
- 🔲 **Czytelny łańcuch ewolucji** — kto kogo zastąpił, w którym momencie i dlaczego
  (eskalacja / zawężenie / przedłużenie). Wyzwanie: łańcuchy bywają „patchworkowe" —
  jedno ostrzeżenie rozpada się na kilka, część powiatów idzie własną ścieżką
- 🔲 **Eksport archiwum** pod zewnętrzną weryfikację: „co wydano, kiedy, na jakie powiaty,
  z jakim wyprzedzeniem i prawdopodobieństwem"
- 🔲 Kasowanie historii tylko jako **świadoma operacja archiwizacji**, nigdy jako
  sposób na odzyskanie czytelności

**Cel docelowy:** móc odpowiedzieć na pytanie *„czy cała historia tego ostrzeżenia się
sprawdziła, a jeśli nie — w którym momencie i co zawiodło"*.

---

## Etap 3 — grafika i komunikacja 🔲

- 🔲 **A3** — infografika zlewa stopnie („Upał 3° · 337 powiatów", gdy jest 207×3°,
  106×2°, 24×1°). Rozwiązanie: kafel zostaje jeden na zjawisko, podpis dostaje
  **wiersz na każdy stopień**.
- 🔲 **B6** — jedna formuła skalowania tekstu (dostępne/potrzebne, zakres 0,8–1,5×)
  zamiast progów wg liczby zjawisk.
- 🔲 **B7** — sześć wariantów graficznych → dwa niezależne wybory
  (format × orientacja + przełącznik „mapki per zjawisko").
- 🔲 **Białe tło** dla mediów i druku — czarne źle wygląda na kartce.

## Etap 4 — nowy model autorski ★ rdzeń nowatorstwa 🔲

**C1 — kontury zamiast klikania powiatów.**
Synoptyk rysuje **serię konturów dla całego zdarzenia** (po jednym na strefę
intensywności). Kontury mogą na siebie nachodzić. Logika przypisuje każdemu powiatowi
**dokładnie jedną** strefę → **ekran przeglądu** z licznikami kontrolnymi → korekta
ręczna pojedynczych powiatów → publikacja zbiorcza.

- Reguła rozstrzygania: wyższy stopień wygrywa; przy remisie większy udział powierzchni
  powiatu w konturze.
- **W logice muszą być uwzględnione czasy ważności:** przy rozłącznych czasach oba
  ostrzeżenia mogą współistnieć (dłuższe niższym stopniem w kolejnych dobach), ale
  „ogona" krótszego niż doba nie tworzymy jako osobnego ostrzeżenia.
- **Żaden powiat nie może zginąć po cichu** — ekran przeglądu raportuje przypadki
  brzegowe: powiaty muśnięte konturem w kilka procent, powiaty w „dziurach" między
  konturami, porównanie „miało być objęte" vs „wyszło".

Klikanie powiatów zostaje jako narzędzie korekty, nie jako podstawa pracy.

**Wskaźnik pokrycia powiatu** *(przyjęte z recenzji zewnętrznej, lipiec 2026)*.
Na ekranie przeglądu przy każdym powiecie pokazać **procent powierzchni w konturze**
(np. 98% / 74% / 18%) — jako **pomoc, nie decyzję**. Wartość i tak jest liczona,
bo rozstrzyga remis przy równym stopniu, więc pokazanie jej kosztuje niemal nic,
a wprost wspiera zasadę „żaden powiat nie może zginąć po cichu".

**Scenariusz zdarzenia jako kontener roboczy** *(przyjęte z recenzji)*.
Nie nowy typ ostrzeżenia i nie nowy produkt — **kontener** grupujący strefy jednego
zdarzenia (np. „Fala upałów 7–10 sierpnia" → strefa 1°, 2°, 3°). Publikacja kontenera
tworzy właściwe ostrzeżenia. Spina się z B4 (zapis roboczy vs publikacja) i z C1.
Warianty A/B odłożone — komplikacja bez potwierdzonego popytu.

**Warunek konstrukcyjny:** kontener nie może mieć zaszytego horyzontu czasowego.
Zdarzenia bywają na granicy ostrzeżenia i wczesnego ostrzeżenia (W ↔ EW), a niektóre
sięgają dalej niż 7 dni. Musi też dać się opisać słowami — jeśli nie potrafimy nazwać
zdarzenia jednym zdaniem, kontener nie ma sensu.

**C2 — rytm czasowy jako cecha zjawiska.**
Upał ma naturalny rytm dobowy; opad ciągły trwa np. od 18:00 pierwszego dnia
do 14:00 trzeciego. Narzędzie **proponuje** granice zgodne z rytmem zjawiska,
synoptyk może nadpisać. Ryzyko do pilnowania: nadmiar przełączników konfiguracyjnych.

## Etap 5 — dane wejściowe 🔲

**C3 — skrzynka propozycji i podgląd prognoz.** Zgłaszane niezależnie przez dwóch
synoptyków: potrzeba widoku prognoz/modeli, żeby określić czas trwania upału i Tmax
w poszczególnych lokalizacjach (dziś przepisywane z mapki obok).

1. Import CAP jako **trwały draft** w kolejce, z metką pochodzenia (źródło, czas,
   prawdopodobieństwo) i ekranem przeglądu: przyjmij / zmodyfikuj / odrzuć.
   Nigdy autopublikacja.
2. Pole prognostyczne jako **warstwa pod konturami** — rysowanie stref „po danych".
3. Automatyczna propozycja konturów z przekroczeń progów (wzór DWD: ASG proponuje,
   ASE zatwierdza — odpowiedzialność zostaje przy synoptyku).

**C4 — teksty PL i EN obok siebie.** Przy wąskim panelu dwie kolumny mogą być za ciasne;
do sprawdzenia układ dwukolumnowy na szerokim ekranie z powrotem do przełącznika
na wąskim.

---

## Wątki otwarte (nieprzypisane do etapu)

- **Puste opisy EN przy imporcie z IMGW** — importer nie parsuje liczb z polskiej treści,
  więc szablon angielski wychodzi z `— mm` / `— km/h`. W audycie feedu z 21.06 dotyczyło
  to 16 z 17 plików. Istotne, bo IMGW jest publisherem MeteoAlarm.
- **`tresc_en` w bibliotece skutków** — dwujęzyczność biblioteki (decyzja podjęta,
  niewdrożona).
- Filtry i wyszukiwarka w liście ostrzeżeń; wskaźnik pozycji cyklu „2/3" na mapie.
- Publiczny wariant widoku Status (mapa dziś/jutro + oś czasu jako komponent read-only).
- Presety przeniesione na serwer — dziś w `localStorage`, więc nie są współdzielone
  w zespole.
- **Eksport archiwum pod weryfikację.** Sama analiza (POD/FAR, reliability, Brier)
  pozostaje osobną warstwą/aplikacją. Ale OSMET musi **nie niszczyć danych** potrzebnych
  do jej wykonania: potrzebny jest czysty eksport „co wydano, kiedy, na jakie powiaty,
  z jakim wyprzedzeniem i prawdopodobieństwem". Mała funkcja, odblokowuje zewnętrzny
  moduł. **Nie odkładać za daleko** — bez tych danych za kilka lat będzie dużo opinii
  i mało dowodów na to, czy nowy sposób ostrzegania jest lepszy od starego.

  **Otwarty problem: skąd wziąć dane obserwacyjne.** OSMET wie tylko, *co wydano* —
  do weryfikacji potrzeba jeszcze, *co się wydarzyło*. Źródła (pomiary stacyjne,
  radar, raporty służb, doniesienia medialne) mają różną rozdzielczość przestrzenną
  i czasową, a zjawiska punktowe (trąba, grad) bywają nieobserwowane mimo wystąpienia.
  Do rozstrzygnięcia w projekcie weryfikacji, nie w OSMET — ale OSMET musi dostarczyć
  swoją połowę danych w formie nadającej się do połączenia.
- Estetyka ikon MeteoAlarm — poprawiona, ale wciąż do dopracowania.
- Sprawdzić wywołania API przez bramę `apps.container.imgw.ad/osmet-dev/api/`
  (bezpośrednio przez `:31001` działa).

## Horyzont dalszy

- **CAP v2.0** — termin zgodności ok. 8 miesięcy od połowy 2026. Kod ma abstrakcję wersji,
  ale profil trzeba będzie dopisać.
- **Parsowanie poligonów ukraińskich** — UA wysyła `<cap:polygon>` bez geokodu EMMA.
- **Baza danych — decyzja zrewidowana (lipiec 2026).** Wcześniej: „dopiero gdy pojawi się
  praca wielu synoptyków". Teraz: **gdy historia i weryfikacja zaczną mieć znaczenie** —
  czyli praktycznie od razu, bo płaski JSON już dziś wymusza czyszczenie historii.

  **Rekomendacja: SQLite, nie PostgreSQL.** Jeden plik w katalogu danych, bez serwera,
  kopia zapasowa nadal przez zwykłe skopiowanie pliku — prostota wdrożenia zostaje
  nienaruszona. Zysk: indeksy i zapytania („co obowiązywało w powiecie X o godzinie T"),
  poprawne łańcuchy wersji, transakcje zamiast przepisywania całego pliku przy każdym zapisie.

  **PostgreSQL + PostGIS** dopiero przy C1, i tylko jeśli przecinanie konturów z powiatami
  okaże się zbyt wolne po stronie Pythona — albo gdy pojawi się realna praca równoległa.
- **Autoryzacja LDAP/AD IMGW** — warunek konieczny przed jakimkolwiek użyciem operacyjnym.
- **Publikacja do MeteoAlarm** — walidacja profilu EUMETNET.

---

## Audyt przed każdym buildem (obowiązkowy)

Powstał po realnych regresjach. **Kontrola składni ich nie wykrywa** — plik może być
poprawny składniowo i nie działać.

1. Czy gdziekolwiek nie został goły `|| '/api'` (musi być względem `BASE_URL`)
2. Czy nie ma bezwzględnych ścieżek `src="/assets`
3. Czy każdy użyty hook Reacta jest zaimportowany
4. Czy każdy endpoint jest związany z **właściwą** funkcją (dekorator nie może zostać
   oddzielony od swojej definicji)
5. Obecność kluczowych elementów: `base: '/osmet-dev/'`, port `31001`, `_dedupe_versions`,
   `_analyze_import`, `_live_imgw_ids`, `_read_app_version`, `renderLibPicker`
6. Składnia wszystkich plików frontu (esbuild) i kompilacja backendu (`py_compile`)

**Historia wpadek, które to wymusiły:**
- v2.3.1 — brakujący import `Optional` → backend nie startował, wszystko na 502
- v2.3.2 — nieistniejąca stała `LEVEL_BORDERS` → czarny ekran po zapisaniu ostrzeżenia
- v2.5.24 — brakujący import `useRef` → biała strona
- v2.5.25 — utrata prefiksu API w trzech plikach → 404 na wszystkich warstwach mapy
- v2.5.30 — nowy kod wcisnął się między dekorator a funkcję zapisu → import nic nie zapisywał

**Wniosek:** aktualizować **całym ZIP-em**, nie pojedynczymi plikami. Mieszanie wersji
plików było źródłem większości powyższych.

---

## Zasady utrzymania kodu

**Nowe funkcje nie trafiają do `EditorPanel.js` ani `MapPanel.js`, jeśli mogą być
osobnym komponentem.** Oba pliki są już duże i każda dokładana funkcja pogarsza sytuację.
To zasada, nie refaktor — nie przepisujemy istniejącego kodu, tylko przestajemy dokładać.

**Filozofia przewodnia: „proponuj, nie publikuj".** Dotyczy importu z IMGW, przyszłych
modeli, nowcastingu i konturów. System sugeruje — synoptyk decyduje i to on klika
publikację. Żadna ścieżka nie może kończyć się automatycznym wydaniem ostrzeżenia.

**Kierunek nadrzędny.** Największą innowacją OSMET nie jest CAP, MeteoAlarm ani eksporty,
tylko przejście od *klikania powiatów* do *opisywania zdarzenia meteorologicznego*.
Kolejne funkcje mają ten kierunek wspierać, a nie od niego odciągać.
