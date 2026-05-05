# Wybór modelu Claude dla MeteoCAP — Praktyczny przewodnik

## 🎯 Haiku 4.5 (najszybszy, najtańszy)

**Kiedy:** Mikro-zmiany, prostej logiki, copywriting, formaty
- ✅ "Zmień kolor X na Y w CSS"
- ✅ "Dodaj pole `cancelled_at` do rekordu"
- ✅ "Napisz alert do usera o błędzie"
- ✅ "Konwertuj timestamp UTC → lokalny w JS"
- ✅ "Usuń zmienną `convexHull` z kodu"
- ✅ Prostej regex'y, single-file edits

**Nie dla:**
- ❌ Architektonicznych decyzji
- ❌ Multi-file refactoringu
- ❌ Debugowania niejaśnych błędów
- ❌ Nowych integracji (API, auth)

**Typowy koszt:** 500-2000 tokens / wymiana

---

## 🟦 Sonnet 4.6 (standard dla 90% pracy)

**Kiedy:** Implementacja features, bugfixy, optymalizacja, integracje
- ✅ "Dodaj modal podglądu treści do Historii"
- ✅ "Napraw export PNG — dziury w powiatach"
- ✅ "Zaimplementuj debounce na suwakami"
- ✅ "Dodaj color picker do interfejsu"
- ✅ "Pobierz dane z nowego API endpoint'u"
- ✅ "Audyt — czy wszystkie zmienne se podstawiają"
- ✅ "Debugowanie: czemu Status nie pokazuje panelu"
- ✅ Full-stack features (backend + frontend razem)
- ✅ Pisanie dokumentacji (README, ROADMAP)
- ✅ Refactoring gotowego kodu (reorganizacja, cleanup)

**Kiedy się zatrzymać i pójść do Opusa:**
- Gdy Sonnet proponuje jakby "intuicyjne" rozwiązanie które wymaga drugiego przejścia
- Gdy zadanie ma składnik "czy to dobra architektura?"
- Gdy pojawia się wiele alternatyw i chcesz wagi argumentów

**Typowy koszt:** 5000-15000 tokens / wymiana

---

## 🔷 Opus 4.7 z Adaptive Thinking (dla decyzji architektonicznych)

**Kiedy:** Redesign, nowe moduły, refactoring architektoniczny, trudne decyzje
- ✅ "Zastąp flat JSON PostgreSQL + PostGIS — jak to zrobić"
- ✅ "Jak zaimplementować proper dissolve granic powiatów zamiast convex hull"
- ✅ "Przeprojektuj system Update — drzewo wersji czy sequence"
- ✅ "Czy przejść na WebSocket dla nowcastingu czy wystarczy polling"
- ✅ "Architektura: auth per-user czy API key w headerze"
- ✅ Debugowanie systemu (wiele zmiennych, niespodziewane interakcje)
- ✅ Decyzje o trade-offach (prędkość vs precyzja, uproszczenie vs feature-richness)
- ✅ Kiedy zaczynasz nowy duży moduł (v3.0 migration, nowcasting)

**Charakterystyczne sygnały:**
- "Jak powinniśmy to zrobić?" zamiast "Zrób to"
- Wiele możliwych podejść i nie wiadomo które wybrać
- Zmiana fundamentalnych założeń (JSON→DB, flat hierarchy→relacyjna)
- Spore ryzyko jeśli pójdzie nie tak (nieprawidłowa migracja, arch decyzja którą trudno cofnąć)

**Typowy koszt:** 20000-50000 tokens / wymiana (adaptive thinking dodaje ~3-4x)

---

## 📋 Przewodnik decyzyjny — flowchart

```
Masz zadanie dla Claude?

1. Jest to zmiana w jednym pliku, <50 linii, semantycznie prosta?
   → Haiku 4.5 ✅

2. Jest to feature, bugfix, refactoring istniejącego modułu, integracja?
   → Sonnet 4.6 ✅
   
3. Czy przy implementacji Sonet mówi "proponuję X, ale mogę też Y albo Z"?
   → Opus 4.7 ✅ (dyskusja arch)

4. Zmiana struktury systemu, nowy duży moduł, migracja danych?
   → Opus 4.7 z thinking ✅

5. Nie wiesz który model — domyślnie?
   → Sonnet 4.6
```

---

## 🏗️ Konkretne przykłady z MeteoCAP

| Zadanie | Model | Dlaczego |
|---------|-------|----------|
| Zmień kolor labeli na mapie z żółtego na pomarańczowy | Haiku | Jedna zmiana CSS, 5 minut |
| Dodaj miniaturkę mapy do PDF na stronę | Sonnet | Multi-file (PDF gen + GeoJSON + drawing logic), integracja istniejących modułów |
| Czy zrobić dissolve via turf.js czy PostGIS? | Opus | Arch decyzja, trade-off: złożoność vs dokładność, wpływ na całą aplikację |
| Napraw PNG export — powiaty bez ostrzeżeń nie renderzą się | Sonnet | Bugfix, wymaga zrozumienia Leaflet + Canvas rendering, ale w istniejącym kodzie |
| Zmień "Przebieg" na "Opis przebiegu" we wszystkich stringach | Haiku | Text replacement, jedna zmiana wszędzie |
| Implementuj LDAP auth dla użytkowników IMGW | Sonnet/Opus | Sonnet jeśli masz spec; Opus jeśli pytasz "jak to architekturować" |
| Przejście na WebSocket dla live nowcastingu (v4.0) | Opus + thinking | Decyzja o całej nowej warstwie aplikacji |
| Dodaj przycisk "Refresh" do toolbar | Haiku | Jedno pole, jeden handler, 2 minuty |
| Obsługa Update — czy zamieniać, czy tworzyć wersję? | Opus + thinking | Fundamentalna zmiana w modelu danych |

---

## ⚙️ Reguły prakseologiczne

### Dla Ciebie (user):
1. **Zanim napiszesz prompt:** zastanów się 10 sekund — "czy to jest kwestia implementacji czy decyzji architektonicznej?"
2. **Jeśli niepewny:** idź z Sonnet. Jeśli naprawdę zatnie, zawsze możesz pogadać na Opusie co do arch.
3. **W jednej sesji:** możesz mieszać. Zacznij coś na Sonet, jeśli się zatnie → przejdź na Opus do dyskusji, wrób do Sonnet na implementację.

### Dla mnie (asystent):
1. **Sonnet:** nie udam że znam lepiej — mówię wprost kiedy coś wygląda na arch decyzję i proponuję Opusa
2. **Opus:** robię pause, myślę o trade-offach, pytam wprost zamiast "intuicyjnie proponować"
3. **Haiku:** używam do sprawdzenia czy coś się kompiluje, nie do logiki biznesowej

---

## 💰 Szacunkowe koszty (OpenRouter pricing):

| Model | $/1M input | $/1M output | Typowy koszt/wymiana | Typowe wymiane/sesja |
|-------|-----------|-----------|----------------------|----------------------|
| Haiku 4.5 | $0.08 | $0.4 | ~$0.01 | 50-100 |
| Sonnet 4.6 | $3 | $15 | ~$0.10-0.30 | 20-30 |
| Opus 4.7 | $15 | $60 | ~$1-3 (bez thinking) | 5-10 |
| Opus 4.7 + thinking | $15 | $60 | ~$3-10 (thinking dodaje 3-4x) | 3-5 |

→ **Sesja 10 wymian Sonnet:** ~$1-3
→ **Sesja 10 wymian Opus + thinking:** ~$30-100 (ale decyzje architektoniczne zarabiają)

