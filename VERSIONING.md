# IMGW-OSMET — schemat wersjonowania

## Format: `MAJOR.MINOR.PATCH[-bBUILD]`

| Segment | Kiedy rośnie | Przykład |
|---------|-------------|---------|
| MAJOR   | Przełomowa zmiana architektury lub całkowity redesign | 3.0.0 |
| MINOR   | Nowa funkcjonalność (nowy moduł, nowy widok, nowa integracja) | 2.5.0 |
| PATCH   | Naprawy błędów, poprawki UX, drobne usprawnienia | 2.5.1 |
| `-bN`   | Build wewnętrzny — wersja do testów, nie do wdrożenia produkcyjnego | 2.5.0-b1 |

## Zasady

- **ZIP do testu** → zawsze `-bN` (b1, b2, …). Gdy zaakceptowany → PATCH lub MINOR bez przyrostka.
- Wersja widoczna w UI (lewy górny róg), w `/api/` (pole `version`), w plikach ZIP i w README.
- Plik `VERSION` w root projektu zawiera aktualną wersję (jedna linia).
- Każda wersja ma wpis w ROADMAP.md.

## Historia milestones

| Wersja  | Data       | Co ważnego |
|---------|------------|------------|
| 2.4.3   | 2026-05-08 | Fix MeteoAlarm 2026 (CZ/DE/LT atom namespace) |
| 2.4.4   | 2026-05-10 | Rebranding IMGW-OSMET, logo, severity fix, tooltip fix |
| 2.5.0   | 2026-05-10 | Spatial clustering MA, tooltip global div, optymalizacja rozmiaru |
