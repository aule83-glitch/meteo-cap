"""
Szablony opisów ostrzeżeń dla operacji Update.

Każde zjawisko ma zestaw szablonów per typ operacji:
- create: pierwsze wydanie (Alert) — używamy istniejących z warning_texts.py
- amend: korekta detali bez zmiany stopnia
- escalate: zjawisko nasila się (wzrost stopnia)
- deescalate: zjawisko słabnie (spadek stopnia)
- extend: przedłużenie czasu
- shorten: skrócenie czasu
- expand_area: rozszerzenie obszaru
- cut_area: wycięcie części obszaru (kontynuacja dla pozostałych)
- partial_cancel: tekst dla wyciętego obszaru (CAP Cancel dla podzbioru)
- full_cancel: pełne anulowanie

Zmienne dostępne w szablonach:
- {observed_value}, {observed_unit} — co zaobserwowano dotychczas (synoptyk wpisuje)
- {forecast_value}, {forecast_unit} — co jeszcze prognozujemy
- {total_value}, {total_unit} — łącznie (auto-wyliczone)
- {old_level}, {new_level} — poprzedni i nowy stopień
- {old_param_value} — poprzednia wartość kluczowego parametru
- {new_param_value} — nowa wartość
- {expires} — nowy czas zakończenia (sformatowany)
- {reason} — powód anulowania (np. "Zjawisko ustąpiło")
- + wszystkie zmienne z params (gust_kmh, tmin, rain_mm, ...)
"""

# Szablony pogrupowane: phenomenon → operation → tekst
# Jeśli brak konkretnego zjawiska/operacji, używamy GENERIC.

GENERIC = {
    "amend": "Aktualizacja ostrzeżenia — skorygowano parametry.",
    "escalate": "Zjawisko nasila się — podniesiono stopień ostrzeżenia z {old_level} na {new_level}.",
    "deescalate": "Intensywność zjawiska maleje — obniżono stopień ostrzeżenia z {old_level} na {new_level}.",
    "extend": "Czas obowiązywania ostrzeżenia przedłużono do {expires}.",
    "shorten": "Czas obowiązywania ostrzeżenia skrócono do {expires}.",
    "expand_area": "Obszar ostrzeżenia rozszerzono o dodatkowe powiaty.",
    "cut_area": "Obszar ostrzeżenia zmniejszono — zagrożenie nie obejmuje już części powiatów.",
    "partial_cancel": "Ostrzeżenie odwołane dla wskazanego obszaru. {reason}",
    "full_cancel": "Ostrzeżenie odwołane. {reason}",
}

UPDATE_TEMPLATES = {
    # ============ INTENSYWNE OPADY (kumulacyjne) ============
    "intensywne_opady_deszczu": {
        "amend": "Aktualizacja prognozy: suma opadów do {rain_mm} mm w ciągu {hours} godzin.",
        "escalate": (
            "Opady deszczu utrzymują się i nasilają. Aktualnie zaobserwowano "
            "około {observed_value} mm. W pozostałym okresie ważności ostrzeżenia "
            "spadnie jeszcze do {forecast_value} mm. Łącznie suma opadów osiągnie {total_value} mm."
        ),
        "deescalate": (
            "Intensywność opadów zmniejsza się. Dotychczas zaobserwowano około "
            "{observed_value} mm. W pozostałym okresie ważności prognozuje się "
            "jeszcze do {forecast_value} mm."
        ),
        "extend": (
            "Opady deszczu utrzymają się dłużej niż prognozowano. Ważność "
            "ostrzeżenia przedłużono do {expires}. Łączna suma opadów do {rain_mm} mm."
        ),
        "shorten": "Opady ustępują wcześniej niż prognozowano. Ważność ostrzeżenia skrócono do {expires}.",
        "expand_area": "Obszar ostrzeżenia o intensywnych opadach rozszerzono. Suma opadów do {rain_mm} mm w ciągu {hours} godzin.",
        "cut_area": "Obszar ostrzeżenia zmniejszono. Dla pozostałych powiatów obowiązują dotychczasowe parametry: suma opadów do {rain_mm} mm.",
    },

    "intensywne_opady_sniegu": {
        "amend": "Aktualizacja prognozy: opady śniegu do {snow_cm} cm w ciągu {hours} godzin.",
        "escalate": (
            "Opady śniegu nasilają się. Dotychczas spadło około {observed_value} cm. "
            "W pozostałym okresie prognozuje się dodatkowo do {forecast_value} cm. "
            "Łączna pokrywa świeżego śniegu osiągnie {total_value} cm."
        ),
        "deescalate": (
            "Opady śniegu słabną. Dotychczas spadło około {observed_value} cm. "
            "W pozostałym okresie prognozuje się jeszcze do {forecast_value} cm."
        ),
        "extend": "Opady śniegu utrzymają się dłużej niż prognozowano. Ważność przedłużono do {expires}.",
        "shorten": "Opady śniegu ustępują wcześniej. Ważność ostrzeżenia skrócono do {expires}.",
        "expand_area": "Obszar ostrzeżenia o opadach śniegu rozszerzono. Suma opadów do {snow_cm} cm.",
        "cut_area": "Obszar ostrzeżenia zmniejszono. Dla pozostałych powiatów obowiązują dotychczasowe parametry.",
    },

    "opady_sniegu": {
        "amend": "Aktualizacja prognozy: opady śniegu do {snow_cm} cm w ciągu {hours} godzin.",
        "escalate": "Opady śniegu nasilają się. Dotychczas {observed_value} cm. W pozostałym okresie do {forecast_value} cm. Łącznie do {total_value} cm.",
        "deescalate": "Opady słabną. Dotychczas {observed_value} cm, w pozostałym okresie do {forecast_value} cm.",
        "extend": "Opady utrzymają się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Opady ustępują wcześniej. Ważność skrócono do {expires}.",
    },

    "opady_marzniece": {
        "amend": "Aktualizacja prognozy opadów marznących.",
        "escalate": "Opady marznące nasilają się. Wzrost zagrożenia gołoledzią.",
        "deescalate": "Opady marznące słabną.",
        "extend": "Opady marznące utrzymają się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Opady marznące ustępują. Ważność skrócono do {expires}.",
    },

    # ============ BURZE (kumulacyjne, dynamiczne) ============
    "burze": {
        "amend": "Aktualizacja prognozy burz: opady do {rain_mm} mm, porywy do {gust_kmh} km/h.",
        "escalate": (
            "Aktywność burzowa nasila się. Obserwowane dotychczas {observed_value} mm opadu. "
            "W pozostałym okresie prognozuje się jeszcze do {forecast_value} mm oraz porywy "
            "wiatru do {gust_kmh} km/h."
        ),
        "deescalate": "Aktywność burzowa słabnie. W pozostałym okresie ostrzeżenia możliwe jeszcze pojedyncze burze.",
        "extend": "Aktywność burzowa utrzyma się dłużej. Ważność ostrzeżenia przedłużono do {expires}.",
        "shorten": "Burze ustępują wcześniej. Ważność ostrzeżenia skrócono do {expires}.",
        "expand_area": "Obszar ostrzeżenia o burzach rozszerzono.",
        "cut_area": "Obszar ostrzeżenia zmniejszono — zagrożenie burzowe nie obejmuje już części powiatów.",
    },

    "silny_deszcz_z_burzami": {
        "amend": "Aktualizacja: opady do {rain_mm} mm, możliwe burze.",
        "escalate": "Intensywność opadów i aktywność burzowa rosną. Dotychczas {observed_value} mm, w pozostałym okresie do {forecast_value} mm. Łącznie do {total_value} mm.",
        "deescalate": "Intensywność zjawiska maleje. W pozostałym okresie do {forecast_value} mm opadu.",
        "extend": "Zjawisko utrzyma się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Zjawisko ustępuje wcześniej. Ważność skrócono do {expires}.",
    },

    # ============ WIATR (stanowy, ale z porywami) ============
    "silny_wiatr": {
        "amend": "Aktualizacja prognozy: porywy do {gust_kmh} km/h, prędkość średnia do {avg_kmh} km/h.",
        "escalate": (
            "Wiatr nasila się. Prognozuje się porywy do {gust_kmh} km/h "
            "(poprzednio do {old_param_value} km/h)."
        ),
        "deescalate": "Wiatr słabnie. Prognozowane porywy do {gust_kmh} km/h.",
        "extend": "Silny wiatr utrzyma się dłużej. Ważność ostrzeżenia przedłużono do {expires}.",
        "shorten": "Wiatr słabnie. Ważność ostrzeżenia skrócono do {expires}.",
        "expand_area": "Obszar ostrzeżenia o silnym wietrze rozszerzono. Porywy do {gust_kmh} km/h.",
        "cut_area": "Obszar ostrzeżenia zmniejszono. Dla pozostałych powiatów porywy do {gust_kmh} km/h.",
    },

    "zawieje_zamiecie": {
        "amend": "Aktualizacja: porywy do {gust_kmh} km/h przy opadach śniegu.",
        "escalate": "Zawieje nasilają się — porywy do {gust_kmh} km/h.",
        "deescalate": "Zawieje słabną.",
        "extend": "Zawieje utrzymają się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Zawieje ustępują. Ważność skrócono do {expires}.",
    },

    # ============ TEMPERATURA (stanowa, wielodniowa) ============
    "upal": {
        "amend": "Aktualizacja prognozy: temperatura maksymalna do {tmax}°C, minimalna w nocy do {tmin_night}°C.",
        "escalate": (
            "Fala upałów nasila się. Prognozuje się wzrost temperatury maksymalnej "
            "do {tmax}°C (poprzednio do {old_param_value}°C)."
        ),
        "deescalate": "Intensywność upału maleje. Temperatura maksymalna w pozostałym okresie do {tmax}°C.",
        "extend": "Fala upałów utrzyma się dłużej niż prognozowano. Ważność ostrzeżenia przedłużono do {expires}.",
        "shorten": "Upał ustępuje wcześniej. Ważność ostrzeżenia skrócono do {expires}.",
        "expand_area": "Obszar ostrzeżenia o upale rozszerzono. Temperatura maksymalna do {tmax}°C.",
        "cut_area": "Obszar ostrzeżenia zmniejszono. Dla pozostałych powiatów temperatura maksymalna do {tmax}°C.",
    },

    "silny_mroz": {
        "amend": "Aktualizacja prognozy: temperatura minimalna do {tmin}°C.",
        "escalate": "Mróz nasila się. Prognozowana temperatura minimalna do {tmin}°C (poprzednio do {old_param_value}°C).",
        "deescalate": "Mróz słabnie. Temperatura minimalna w pozostałym okresie do {tmin}°C.",
        "extend": "Mróz utrzyma się dłużej. Ważność ostrzeżenia przedłużono do {expires}.",
        "shorten": "Mróz słabnie wcześniej. Ważność skrócono do {expires}.",
    },

    "przymrozki": {
        "amend": "Aktualizacja prognozy przymrozków: temperatura minimalna do {tmin}°C.",
        "escalate": "Zagrożenie przymrozkami rośnie. Temperatura minimalna do {tmin}°C.",
        "deescalate": "Zagrożenie przymrozkami maleje.",
        "extend": "Przymrozki wystąpią również w kolejnych nocach. Ważność przedłużono do {expires}.",
        "shorten": "Zagrożenie przymrozkami ustępuje. Ważność skrócono do {expires}.",
    },

    # ============ WIDZIALNOŚĆ ============
    "mgla_szadz": {
        "amend": "Aktualizacja: widzialność do {visibility_m} m.",
        "escalate": "Mgła gęstnieje. Widzialność spada do {visibility_m} m.",
        "deescalate": "Mgła ustępuje. Widzialność wzrasta.",
        "extend": "Mgła utrzyma się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Mgła ustępuje wcześniej. Ważność skrócono do {expires}.",
    },

    "gesta_mgla": {
        "amend": "Aktualizacja: widzialność do {visibility_m} m.",
        "escalate": "Mgła gęstnieje. Widzialność spada do {visibility_m} m.",
        "deescalate": "Mgła ustępuje.",
        "extend": "Mgła utrzyma się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Mgła ustępuje wcześniej. Ważność skrócono do {expires}.",
    },

    "oblodzenie": {
        "amend": "Aktualizacja ostrzeżenia o oblodzeniu.",
        "escalate": "Zagrożenie oblodzeniem rośnie.",
        "deescalate": "Zagrożenie oblodzeniem maleje.",
        "extend": "Oblodzenie utrzyma się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Oblodzenie ustępuje. Ważność skrócono do {expires}.",
    },

    # ============ HYDRO ============
    "roztopy": {
        "amend": "Aktualizacja prognozy roztopów.",
        "escalate": "Intensywność roztopów rośnie — wzrost zagrożenia podtopieniami.",
        "deescalate": "Intensywność roztopów maleje.",
        "extend": "Roztopy utrzymają się dłużej. Ważność przedłużono do {expires}.",
        "shorten": "Roztopy ustępują. Ważność skrócono do {expires}.",
    },
}

# Powody dla full_cancel / partial_cancel
CANCEL_REASONS = {
    "ended":      "Zjawisko ustąpiło.",
    "not_occurred": "Zjawisko nie wystąpiło.",
    "downgrade":  "Zagrożenie zmalało poniżej poziomu ostrzeżenia.",
    "custom":     "",  # synoptyk wpisuje własny tekst
}


def get_template(phenomenon: str, operation: str) -> str:
    """Zwraca szablon dla zjawiska i operacji. Fallback na GENERIC."""
    ph_templates = UPDATE_TEMPLATES.get(phenomenon, {})
    if operation in ph_templates:
        return ph_templates[operation]
    return GENERIC.get(operation, "Aktualizacja ostrzeżenia.")


def render_template(template: str, ctx: dict) -> str:
    """
    Bezpieczne podstawienie zmiennych w szablonie. 
    Brakujące zmienne stają się '—'.
    """
    import re
    safe = {k: (str(v) if v is not None else "—") for k, v in ctx.items()}
    try:
        return template.format(**safe)
    except (KeyError, ValueError):
        return re.sub(r'\{(\w+)\}', lambda m: safe.get(m.group(1), '—'), template)
