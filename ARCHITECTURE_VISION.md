# IMGW-OSMET — Architektura systemu trójwarstwowego
*Dokument projektowy v0.3 — 2026-05-10*
*Status: do dyskusji, nie do wdrożenia*
*v0.3: reforma PrONieb, spójność CAP, podejście do nowcastingu*

---

## 1. Diagnoza — dlaczego PrONieb jest niekompatybilny

PrONieb powstał jako osobny produkt, nie jako "wcześniejsza wersja ostrzeżenia".
Efekty tej decyzji:

- Brak CAP → nie wchodzi do standardowych kanałów dystrybucji
- Sztywne doby (7:30→7:30) → nie pasują do naturalnego czasu zjawisk
- Brak prawdopodobieństwa → odbiorca nie wie czy to "prawie pewne" czy "może być"
- Nakładanie się z W → dezorientacja odbiorców, brak jasnego priorytetu
- Aktualizacja raz dziennie → może być nieaktualna przez wiele godzin

**Wniosek:** PrONieb to ostrzeżenie z wyprzedzeniem, które udaje że nim nie jest.
Reforma = przyznać to i ujednolicić strukturę.

---

## 2. Propozycja reformy — Early Warning jako pełnoprawna warstwa

### Kluczowa zmiana: PrONieb → Early Warning (EW)

EW to ostrzeżenie CAP z:
- `msgType = Alert`
- `urgency = Future` (zamiast `Immediate`/`Expected` w W)
- `certainty = Possible` lub `Likely` (zamiast `Observed` w W)
- dodatkowym parametrem `imgw:product_type = early_warning`

To wszystko. Reszta struktury **identyczna jak W**.

### Co zyskujemy
- Jeden model danych dla EW i W — ten sam edytor, te same pola
- EW wchodzi do CAP XML i do tych samych kanałów dystrybucji
- Odbiorcy którzy chcą tylko W — filtrują po `urgency != Future`
- Odbiorcy którzy chcą EW — filtrują po `imgw:product_type = early_warning`
- Spójność na mapie — EW i W to ten sam typ obiektu, różni się stylem wyświetlania

---

## 3. Co zostaje ze sztywnych dób, co odpada

### Problem sztywnych dób
Sztywne 7:30→7:30 były uproszczeniem operacyjnym — łatwiej powiedzieć
"prognoza na jutro" niż określać dokładne godziny dla zjawiska które dopiero
ma nastąpić. Ale to powoduje że EW i W nie dają się sensownie zestawiać.

### Propozycja: miękkie okna z domyślną dobą
- EW ma `onset` i `expires` jak W — pełna kontrola
- Przy tworzeniu nowego EW: system **proponuje** dobę jako domyślny preset
  (D+1: jutro 6:00 → pojutrze 6:00, D+2, D+3)
- Dyżurny może to zmienić — np. "od jutra 14:00 do pojutrza 8:00"
- Sztywne doby jako preset, nie jako ograniczenie

### Co to zmienia operacyjnie
- EW może precyzyjnie opisać "nocna burza D+2" (22:00→4:00)
  zamiast "cała doba D+2"
- Nakładanie się EW i W staje się naturalne i czytelne — oba mają
  dokładne czasy, system może pokazać oś czasu
- Aktualizacja EW → można aktualizować kiedy trzeba, nie tylko raz dziennie
  (choć raz dziennie nadal będzie normą operacyjną)

---

## 4. Model danych — ujednolicony

### Jeden model: WarningRecord
```
WarningRecord {
  # Identyfikacja
  id: str,
  product_type: "warning" | "early_warning" | "nowcast",
  
  # Czas — identyczny dla wszystkich typów
  issued_at: datetime,
  onset: datetime,
  expires: datetime,
  
  # Treść — identyczna
  phenomenon: str,
  level: 1 | 2 | 3,
  headline_pl: str,
  headline_en: str,
  description_pl: str,
  
  # Obszar — identyczny
  counties: [str],
  voivodeships: [str],
  polygon: GeoJSON | null,
  
  # CAP metadata
  urgency: "Immediate"|"Expected"|"Future",   # zależy od product_type
  certainty: "Observed"|"Likely"|"Possible",  # zależy od product_type
  
  # Powiązania między warstwami
  parent_id: str | null,        # EW z którego powstał W; W z którego NC
  children_ids: [str],          # W które powstały z tego EW; NC tego W
  
  # EW-specific (null dla W i NC)
  early_warning: {
    forecast_day: 1|2|3 | null,   # preset doby (null = własny czas)
    hazard: "low"|"medium"|"high",
    exposure: "low"|"medium"|"high",
    risk_level: 1|2|3,            # obliczany z hazard×exposure
  } | null,
  
  # NC-specific (null dla EW i W)
  nowcast: {
    source_model: str,
    source_fetched_at: datetime,
    auto_approved: bool,
    consistency_score: float,
    delta_summary: str,           # "obszar rozszerza się na NE, szczyt ~28 m/s"
  } | null,
  
  # Workflow
  status: "draft"|"active"|"updated"|"cancelled"|"expired",
  issued_by: str,
  updated_by: str | null,
  updated_at: datetime | null,
}
```

### Domyślne wartości CAP per typ
```
product_type    urgency      certainty    severity_z_level
early_warning   Future       Possible     Minor/Moderate/Severe
warning         Expected     Likely       Moderate/Severe/Extreme
nowcast         Immediate    Observed     (jak parent W)
```

---

## 5. Nowcast — "podpowiedź z zewnątrz"

### Realia które opisujesz
- API jest lub będzie dostępne
- Kryteria modelu != kryteria IMGW → to nie jest gotowy NC, to surowiec
- Człowiek musi zatwierdzić zanim wyjdzie jako produkt IMGW

### Podejście: NC jako propozycja, nie automatyczny alert

```
Model zewnętrzny → fetch co 15 min
    ↓
Translacja: kryteria modelu → kryteria IMGW
    ↓
Dopasowanie do aktywnych W (obszar, czas, zjawisko)
    ↓
Brak dopasowania → ignoruj (model widzi coś innego niż IMGW)
    ↓
Jest dopasowanie:
    consistency_score > 0.8 → propozycja NC "auto-ready"
    consistency_score < 0.8 → propozycja NC "wymaga uwagi"
    ↓
Dyżurny widzi propozycję → zatwierdza / modyfikuje / odrzuca
    ↓
Zatwierdzone NC → CAP z product_type=nowcast, parent_id=W.id
```

### Translacja kryteriów
To jest najtrudniejsza część. Przykład:

```
Model mówi: "wind gust > 15 m/s w siatce 2km×2km"
IMGW W mówi: "wiatr w porywach >18 m/s, poziom 1"

Translacja:
  - próg modelu (15) < próg IMGW (18) → obniż certainty
  - obszar modelu (siatka) vs obszar W (powiaty) → spatial join
  - consistency_score zależy od % nakrycia i różnicy progów
```

Reguły translacji będą wymagały kalibracji na danych historycznych.
Na start: proste progi ręcznie zdefiniowane per zjawisko.

---

## 6. Oś czasu — jak trzy warstwy wyglądają razem

```
Czas →
        D-3      D-2      D-1      D0       D+1
        
EW:  [===========================]          (wydany 3 dni wcześniej)
EW:           [================]           (zaktualizowany D-2)
W:                      [=======]          (wydany D-1, precyzyjny)
NC:                           [=][=][=]    (aktualizowany co godzinę)
```

- EW "schodzi" gdy W obejmuje ten sam czas i obszar
- NC jest "dzieckiem" W — nie może istnieć bez aktywnego W
- Na mapie: EW = szary kontur, W = kolorowy kontur, NC = animowany kontur

---

## 7. Kompatybilność wsteczna PrONieb

Jeśli PrONieb ma historię którą warto zachować:

```python
def migrate_prononieb(old_prononieb: dict) -> WarningRecord:
    return WarningRecord(
        product_type = "early_warning",
        onset        = parse_doba(old_prononieb["forecast_day"]),  # 7:30→7:30
        expires      = parse_doba(old_prononieb["forecast_day"]) + 24h,
        phenomenon   = old_prononieb["phenomenon"],
        level        = old_prononieb.get("level", 1),
        early_warning = {
            "forecast_day": old_prononieb["forecast_day"],
            "hazard": "medium",    # brak danych → default
            "exposure": "medium",
            "risk_level": old_prononieb.get("level", 1),
        },
        # ... reszta z defaults
    )
```

Stare PrONieby stają się EW z zachowanymi datami i zjawiskami.

---

## 8. UI — minimalne zmiany, maksymalna spójność

### Edytor — jeden dla wszystkich typów
```
[Nowe ostrzeżenie ▾]
  → Wczesne ostrzeżenie (EW)
  → Ostrzeżenie właściwe (W)
  → (Nowcast — tylko z aktywnego W)
```

Formularz identyczny — różni się tylko:
- EW: dodatkowa sekcja "Prognoza" (hazard/exposure/forecast_day preset)
- NC: tylko zatwierdź/modyfikuj/odrzuć — nie tworzony od zera

### Status view
```
┌─ WCZESNE OSTRZEŻENIA ──────────────────────────────────────┐
│ D+1 🔵 Silny wiatr / Dolny Śląsk / możliwy poz.2          │
│ D+2 🔵 Burze / Mazowsze / możliwy poz.1                    │
└────────────────────────────────────────────────────────────┘
┌─ AKTYWNE OSTRZEŻENIA ──────────────────────────────────────┐
│ 🟠 Silny wiatr / pow. wrocławski / do 22:00                │
└────────────────────────────────────────────────────────────┘
┌─ NOWCAST (jeśli aktywny) ──────────────────────────────────┐
│ ⚡ Wiatr wzmaga się na NW, szczyt ~26 m/s ok. 18:30       │
│    [zatwierdź] [modyfikuj] [odrzuć]                        │
└────────────────────────────────────────────────────────────┘
```

---

## 9. Otwarte pytania v0.3

1. **Jeden PrONieb per dobę czy kilka zjawisk?**
   Stary model: komplet zjawisk na dobę w jednym dokumencie.
   Nowy model: jedno zjawisko = jeden EW (jak W).
   *Rekomendacja: nowy model — łatwiej zarządzać, aktualizować, anulować.*
   *Migracja: stary PrONieb "5 zjawisk na D+1" → 5 osobnych EW.*

2. **Aktualizacja EW — kiedy obowiązkowo?**
   Jeśli rezygnujemy ze sztywnej reguły "raz dziennie" to co ją zastępuje?
   Propozycja: system pokazuje flagę "EW nieaktualizowany >18h" dla aktywnych EW.

3. **Translacja kryteriów nowcastingowych — kto definiuje reguły?**
   To wymaga ekspertyzy meteorologicznej, nie tylko kodowania.
   Czy IMGW ma tabelę "próg modelu X → próg IMGW Y"?

4. **NC bez aktywnego W — co robić?**
   Model widzi silne zjawisko, ale W jeszcze nie wydano.
   Opcja A: NC czeka (nie może istnieć samodzielnie)
   Opcja B: NC "sugeruje wydanie W" — powiadomienie dla dyżurnego
   *Rekomendacja: B — to wartościowa informacja operacyjna*

5. **CAP dla EW — czy na pewno chcemy to samo co dla W?**
   `urgency=Future` i `certainty=Possible` to standard WMO dla EW.
   Ale czy odbiorcy zewnętrzni są gotowi na EW w CAP?
   Może najpierw wewnętrznie (bez dystrybucji CAP), potem zewnętrznie?

---

## 10. Kamienie milowe v0.3

```
Sprint 1:   Reorganizacja edytora W (layout/UX) — bez nowych typów
Sprint 2:   Model danych WarningRecord — ujednolicony schemat
            Migracja PrONieb → EW (skrypt jednorazowy)
Sprint 3:   Edytor EW (rozszerzenie istniejącego)
            EW w Status view i na mapie
            CAP XML dla EW
Sprint 4:   Risk matrix (hazard × exposure) w edytorze EW
            Walidacja spójności EW↔W (flagi w UI)
Sprint 5:   NC — fetch zewnętrznego API, translacja kryteriów (wewnętrzny)
Sprint 6:   NC — panel zatwierdzania, CAP NC (zewnętrzny)
```

Każdy sprint = działająca funkcja, nie połowiczny system.
EW przed NC — to ważniejsze i prostsze do wdrożenia.
