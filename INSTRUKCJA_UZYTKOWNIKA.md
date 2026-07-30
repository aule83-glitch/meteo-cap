# IMGW-OSMET — instrukcja użytkownika

*Dla synoptyków. Wersja aplikacji 2.5.33.*

> ⚠ **Narzędzie deweloperskie.** Ostrzeżenia tworzone w OSMET **nie są oficjalnymi
> ostrzeżeniami IMGW-PIB** i nie idą do dystrybucji operacyjnej. Służy do rozwijania
> i testowania nowych rozwiązań.

---

## Spis treści

1. [Zanim zaczniesz](#1-zanim-zaczniesz)
2. [Widoki aplikacji](#2-widoki-aplikacji)
3. [Wydanie ostrzeżenia — krok po kroku](#3-wydanie-ostrzeżenia--krok-po-kroku)
4. [Wybór obszaru](#4-wybór-obszaru)
5. [Treść: opis, skutki, zalecenia](#5-treść-opis-skutki-zalecenia)
6. [Aktualizacja istniejącego ostrzeżenia](#6-aktualizacja-istniejącego-ostrzeżenia)
7. [Kopiowanie i sekwencje czasowe](#7-kopiowanie-i-sekwencje-czasowe)
8. [Odwołanie ostrzeżenia](#8-odwołanie-ostrzeżenia)
9. [Import z IMGW API](#9-import-z-imgw-api)
10. [Widok Status](#10-widok-status)
11. [Eksporty i materiały dla mediów](#11-eksporty-i-materiały-dla-mediów)
12. [Reguły, których system pilnuje](#12-reguły-których-system-pilnuje)
13. [Skróty klawiszowe](#13-skróty-klawiszowe)
14. [Na telefonie](#14-na-telefonie)
15. [Gdy coś nie działa](#15-gdy-coś-nie-działa)

---

## 1. Zanim zaczniesz

**Adres:** `http://apps.container.imgw.ad/osmet-dev/`
(zamiennie: `http://container.imgw.ad:31001/osmet-dev/`)

Aplikacja nie wymaga logowania. Dane są wspólne dla wszystkich — ostrzeżenie zapisane
przez Ciebie zobaczy każdy, kto otworzy OSMET. Lista odświeża się sama co 30 sekund.

**Co jest wspólne, a co Twoje:**

| Wspólne (na serwerze) | Tylko w Twojej przeglądarce |
|---|---|
| ostrzeżenia, historia, biblioteka skutków | niezapisany formularz w edytorze |
| konfiguracja dystrybucji | presety |
| | wybór krajów MeteoAlarm |

Numer wersji w lewym górnym rogu pochodzi wprost z serwera — jeśli po aktualizacji
widzisz stary, zrób twarde odświeżenie (**Ctrl+Shift+R**).

---

## 2. Widoki aplikacji

| Zakładka | Do czego służy |
|---|---|
| **Edytor** | tworzenie i aktualizowanie ostrzeżeń; mapa po lewej, formularz po prawej |
| **Historia** | wszystkie ostrzeżenia z drzewem wersji; stąd wchodzisz w edycję |
| **Status** | obraz operacyjny: mapa stanu, oś czasu, MeteoAlarm, eksporty |
| **Ustawienia** | dystrybucja (FTP/SMTP), webhooki, szablony |

---

## 3. Wydanie ostrzeżenia — krok po kroku

1. **Zakładka Edytor.** Upewnij się, że w sekcji *Rodzaj komunikatu* zaznaczone jest
   **Ostrzeżenie** (nie Aktualizacja, nie Odwołanie).
2. **Zaznacz obszar** na mapie — patrz [rozdział 4](#4-wybór-obszaru).
3. **Wybierz zjawisko** z listy.
4. **Ustaw parametry** suwakami (np. porywy wiatru, suma opadów, temperatura).
   Stopień **wylicza się sam** z progów kryterialnych — pokazuje go duża plakietka
   u góry formularza. Jeśli parametry nie sięgają progu, zobaczysz *„Brak ostrzeżenia"*.
5. **Prawdopodobieństwo wystąpienia** — *Możliwe (<50%)* / *Prawdopodobne (>50%)* /
   *Obserwowane*. Trafia do CAP jako `certainty`.
6. **Okres ważności** — *od* i *do*. Koniec musi być późniejszy niż początek,
   inaczej pole zaświeci na czerwono i zapis będzie zablokowany.
7. **Treść** — opis przebiegu, skutki, zalecenia (patrz [rozdział 5](#5-treść-opis-skutki-zalecenia)).
8. **Zapisz.**

> **Wskazówka:** kliknięcie w powiat na mapie **nigdy** nie włącza edycji istniejącego
> ostrzeżenia — tylko je podświetla. Edycja zaczyna się wyłącznie od jawnego wyboru
> *Aktualizacja* albo przycisku *Aktualizuj* na liście warstw.

---

## 4. Wybór obszaru

Na mapie, po lewej u góry:

- **Klikaj powiaty** — tryb domyślny; każde kliknięcie dodaje lub usuwa powiat
- **Rysuj poligon** — obrysowujesz obszar, system sam wybiera powiaty w środku.
  Poligon jest przy zapisie upraszczany do 20 wierzchołków (wymóg MeteoAlarm)
- **Cała Polska** — zaznacza wszystkie powiaty
- **Wyczyść (N)** — usuwa zaznaczenie
- **↶ ↷** — cofnij / ponów zmianę zaznaczenia

Przy większym zaznaczeniu *Wyczyść* i *Cała Polska* proszą o potwierdzenie —
i tak zawsze możesz cofnąć klawiszem **Ctrl+Z**.

### Powiaty już zajęte

Gdy masz wybrane zjawisko i okres ważności, powiaty **objęte już tym samym zjawiskiem
w nachodzącym czasie** dostają **białą przerywaną obwódkę**. To ostrzeżenie
z wyprzedzeniem: jeśli je zaznaczysz, zapis zostanie odrzucony (patrz
[rozdział 12](#12-reguły-których-system-pilnuje)).

### Lista warstw na mapie

Panel *OSTRZEŻENIA (N)* pokazuje wszystkie aktywne ostrzeżenia:
- klik w pozycję — **wyróżnia** ostrzeżenie na mapie
- **▲ ▼** — zmieniają kolejność warstw; **co na górze listy, to na wierzchu mapy**
  (decyduje o kolorze powiatu i o tym, od czego zaczyna się przeklikiwanie)
- na wyróżnionej pozycji pojawiają się **✎ Aktualizuj** i **⧉ Kopiuj**

Gdy powiat jest objęty kilkoma ostrzeżeniami, kolejne kliknięcia w niego
przełączają między nimi.

---

## 5. Treść: opis, skutki, zalecenia

Trzy pola: **Opis przebiegu**, **Spodziewane skutki**, **Zalecenia — co robić?**
Wypełniają się domyślnymi tekstami dla zjawiska i stopnia. Cokolwiek napiszesz ręcznie,
**nie zostanie już nadpisane** przez szablon.

### Dobór z biblioteki (reguła 3+3)

Pod polami *Skutki* i *Zalecenia* jest przycisk **📚 Dobierz z biblioteki (N)**.
Otwiera listę gotowych sformułowań dla bieżącego zjawiska i stopnia:

- zaznaczasz pozycje polami wyboru,
- **chipy filtra** zawężają do sektora: *transport*, *rolnictwo*, *energetyka*, *budownictwo*,
- licznik pokazuje **wybrano X/3** — powyżej trzech ostrzega kolorem, ale nie blokuje,
- **Wstaw do pola** składa wybór w listę punktowaną.

> **Dlaczego trzy?** Odbiorca zapamiętuje trzy rzeczy, nie trzynaście. Biblioteka jest
> menu, z którego wybierasz to, co pasuje do sytuacji — a nie listą do wklejenia w całości.

Bibliotekę można podmienić bez przebudowy aplikacji: przycisk **⤒ JSON z kreatora**
w panelu doboru wgrywa nowy plik z kreatora matrycy skutków.

---

## 6. Aktualizacja istniejącego ostrzeżenia

1. Wejdź w **Historia** lub użyj **✎ Aktualizuj** na liście warstw na mapie.
2. Formularz wypełni się danymi oryginału, a u góry pojawi się niebieski pasek
   *„Aktualizujesz: …"*.
3. Wybierz **Co robisz?** — system podpowiada typ operacji, ale możesz poprawić:
   - **Eskalacja** — zjawisko się nasila
   - **Deeskalacja** — słabnie
   - **Korekta** — poprawka treści lub parametrów
   - **Przedłużenie / skrócenie** — zmiana czasu
   - **Zmiana obszaru**

### Uwaga: co znaczy zaznaczenie przy aktualizacji

To najważniejsza rzecz w całym edytorze.

**Przy eskalacji i deeskalacji** zaznaczenie wskazuje **wycinek**, na którym zmieniasz
stopień. Pozostałe powiaty **zachowują dotychczasowy stopień** — nic nie znika.
Panel pokaże wtedy: *„Zmiana obejmie 32 powiaty. Pozostałe 61 zachowa stopień 2 do …"*.

**Przy pozostałych operacjach** zaznaczenie to **pełny obszar po aktualizacji**.
Jeśli odznaczysz powiaty, one **wypadną** z ostrzeżenia — panel pokaże je na czerwono,
a przy zapisie dostaniesz pytanie potwierdzające. Przycisk **↺ Przywróć obszar oryginału**
cofa wszystko.

---

## 7. Kopiowanie i sekwencje czasowe

**⧉ Kopiuj** (na wyróżnionym ostrzeżeniu) wypełnia edytor kompletem danych oryginału,
ale jako **nowe** ostrzeżenie — bez powiązania z poprzednim. Czasy przenoszą się wiernie.

Typowe zastosowanie — **sekwencja**: to samo zjawisko na tym samym obszarze,
ale w kolejnych oknach czasowych. Skopiuj, zmień czasy (i ewentualnie stopień), zapisz.

> **Ważne:** okna mogą się **stykać** (koniec 20:00 → początek 20:00), ale **nie mogą
> na siebie nachodzić** dla tego samego zjawiska i powiatu.

---

## 8. Odwołanie ostrzeżenia

W sekcji *Rodzaj komunikatu* wybierz **Odwołanie**, wskaż ostrzeżenie i zapisz.
Generuje CAP z `msgType = Cancel` i powiązaniem do oryginału.

Odwołane ostrzeżenie zostaje w historii (ze śladem), ale przestaje blokować obszar —
możesz w to miejsce wydać nowe.

---

## 9. Import z IMGW API

Przycisk **🌩 Pobierz aktualne ostrzeżenia z IMGW API** na samej górze edytora.

Otworzy się okno z listą tego, co jest w API. Po kliknięciu importu system **porównuje
to ze stanem lokalnym** i pokazuje uzgodnienie:

- **nowe** — wejdą bez pytania,
- **już w bazie** — pominięte,
- **nowsza wersja istniejącego** — API ma świeższą wersję czegoś, co masz,
- **wymaga decyzji** — kolizja z ostrzeżeniem, które **Ty** utworzyłeś lub zmieniałeś.

Do wyboru:

| Przycisk | Skutek |
|---|---|
| **↻ Zastąp stanem z API** | odwołuje kolidujące i zapisuje wersję z API jako obowiązującą |
| **✋ Zachowaj moje, dodaj resztę** | Twoje ostrzeżenia zostają nietknięte, wchodzą tylko bezkolizyjne |
| **Anuluj** | nic się nie dzieje |

> **Dlaczego to pytanie w ogóle jest?** IMGW API nie oznacza, że rekord jest nową
> *wersją* poprzedniego — daje po prostu kolejny wpis. Bez uzgodnienia aktualizacja
> stopnia z 1 na 2 położyłaby się **obok** starej jedynki i przez kilka godzin
> obowiązywałyby dwa ostrzeżenia naraz.

---

## 10. Widok Status

Obraz tego, co obowiązuje — do monitorowania i do materiałów.

**Mapa** pokazuje ostrzeżenia krajowe (kolor = stopień) oraz **MeteoAlarm** z krajów
ościennych jako obszary, z ikoną na region (najwyższy stopień + licznik, gdy jest
ich więcej).

**Oś czasu** (panel u dołu, zwijany nagłówkiem *OŚ CZASU*):
- pasma zjawisk z **filtrem** — kliknięcie chipa wyłącza zjawisko **jednocześnie**
  na osi, mapie i liście,
- wiersze zwinięte do **województw** (to jest zarazem agregat dla RCB/WCZK),
  rozwijane strzałką do **powiatów**,
- **suwak czasu**: przesuwasz → mapa pokazuje stan kraju o tej godzinie.
  Przycisk **● teraz / wszystkie** wraca do pełnego obrazu,
- licznik **„⚠ poza osią: N"** ostrzega, jeśli jakieś aktywne ostrzeżenie nie ma
  czasu lub powiatów i nie da się go narysować.

MeteoAlarm domyślnie pokazuje to, co obowiązuje teraz lub zacznie się w ciągu 24 godzin.

---

## 11. Eksporty i materiały dla mediów

### W Statusie (pasek nad mapą)

- **PDF PL / PDF EN** — raport z mapą, tabelą i szczegółami
- **Eksportuj PNG** — grafika; obok dwa selektory:
  - **zakres**: 🇵🇱 Cała Polska albo konkretne województwo (działa dla PNG i PDF),
  - **format**:
    - *Metryczka* — mapa + zwięzła lista ostrzeżeń,
    - *Infografika poziomo / pionowo / 4:5* — mapa zbiorcza + mapki per zjawisko,
      duża typografia, dla mediów,
    - *Sama mapa poziomo / pionowo* — bez podziału na zjawiska, z listą obok.

Wszystkie grafiki podają **czas lokalny** i mają logo IMGW.

### W edytorze (dół panelu)

- **Zbiorczy XML** — ZIP z plikami CAP wszystkich aktywnych ostrzeżeń
- **ZIP/powiat** — osobny plik XML dla każdego powiatu (format IMGW)
- **Podgląd** — CAP XML bieżącego ostrzeżenia przed pobraniem
- **Wszystkie** — pełny eksport CAP

---

## 12. Reguły, których system pilnuje

Te rzeczy **nie przejdą**, i tak ma być:

| Reguła | Komunikat |
|---|---|
| Koniec ważności musi być po początku | pole na czerwono, zapis zablokowany |
| Ostrzeżenie musi mieć co najmniej jeden powiat | błąd przy zapisie |
| To samo zjawisko + ten sam powiat + nachodzący czas | **konflikt 409** |

### Gdy pojawi się konflikt

Panel pokaże, z czym kolidujesz, i da dwa przyciski:
- **🔍 Pokaż na mapie** — kolidujące powiaty świecą na czerwono,
- **✂ Odznacz kolidujące** — usuwa je z zaznaczenia, żebyś mógł zapisać resztę.

Możesz też zmienić czasy tak, żeby okna się nie nakładały, albo najpierw
zaktualizować/odwołać istniejące ostrzeżenie.

---

## 13. Skróty klawiszowe

| Skrót | Działanie |
|---|---|
| **Ctrl + Z** | cofnij zmianę zaznaczenia |
| **Ctrl + Shift + Z** (lub Ctrl + Y) | ponów |
| **Ctrl + Shift + R** | twarde odświeżenie strony (po aktualizacji aplikacji) |

---

## 14. Na telefonie

Poniżej szerokości ~900 px układ przełącza się w tryb pełnoekranowy: pod nagłówkiem
pojawia się przełącznik **🗺 Mapa / ✎ Edytor**. Wybrany widok zajmuje cały ekran —
mapa jest użyteczna, a formularz czytelny i przewijalny.

W Statusie przełącznik się nie pojawia (mapa jest częścią panelu i zajmuje pełny ekran).

---

## 15. Gdy coś nie działa

| Objaw | Co zrobić |
|---|---|
| Stary numer wersji po aktualizacji | **Ctrl+Shift+R** albo karta prywatna |
| Biała/pusta strona | odśwież; jeśli wraca — zgłoś z zawartością konsoli (**F12**) |
| „Brak ostrzeżenia" mimo ustawionych parametrów | parametry nie sięgają progu kryterialnego — podnieś wartości |
| Nie mogę zapisać, choć wszystko wypełnione | sprawdź czasy (koniec po początku) i czy jest zaznaczony powiat |
| Konflikt przy zapisie | patrz [rozdział 12](#12-reguły-których-system-pilnuje) |
| Zaznaczyłem coś przez pomyłkę | **Ctrl+Z** |
| Import „nic nie robi" | sprawdź, czy nie czeka okno uzgodnienia z wyborem |
| Mapa po obróceniu telefonu wygląda dziwnie | przełącz zakładkę tam i z powrotem |

Przy zgłaszaniu błędu podaj: **numer wersji** (lewy górny róg), co robiłeś krok po kroku
i — jeśli możesz — zrzut konsoli przeglądarki (**F12 → Console**).
