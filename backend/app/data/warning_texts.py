"""
Plik konfiguracyjny opisów i instrukcji dla ostrzeżeń meteorologicznych.
Edytuj ten plik aby dostosować treść generowanych CAPów.

Struktura każdego zjawiska:
  "id_zjawiska": {
      "awareness_type": "kod METEOALARM",
      "event_pl": "Nazwa zdarzenia po polsku (bez koloru — dodawany automatycznie)",
      "event_en": "Event name in English",
      "levels": {
          1: {
              "description_pl": "Opis zjawiska po polsku. Może zawierać {param_...} do interpolacji.",
              "description_en": "...",
              "instruction_pl": "Zalecenia po polsku.",
              "instruction_en": "...",
              "impacts_pl": "Spodziewane skutki po polsku.",
              "impacts_en": "...",
          },
          2: { ... },
          3: { ... },
      }
  }

Dostępne zmienne interpolacji w description (wypełniane automatycznie z parametrów):
  {gust_kmh}     — porywy wiatru km/h
  {avg_kmh}      — prędkość średnia wiatru km/h
  {wind_dir}     — kierunek wiatru
  {rain_mm}      — suma opadów deszczu mm
  {snow_cm}      — przyrost pokrywy śnieżnej cm
  {tmin}         — temperatura minimalna °C
  {tmax}         — temperatura maksymalna °C
  {tmin_night}   — temperatura nocna minimalna °C
  {visibility_m} — widzialność m
  {hours}        — czas trwania h
  {days}         — liczba dni
  {ts}           — temperatura średnia dobowa °C
"""

WARNING_CONFIG = {

    "silny_wiatr": {
        "awareness_type": "3; wind",
        "event_pl": "alert na silny wiatr",
        "event_en": "wind warning",
        "levels": {
            1: {
                "description_pl": (
                    "Prognozuje się wystąpienie silnego wiatru. "
                    "Porywy wiatru do {gust_kmh} km/h"
                    "{wind_dir_str}. "
                    "Lokalnie możliwe uszkodzenia drzew i obiektów budowlanych."
                ),
                "description_en": (
                    "Strong wind is forecast. "
                    "Wind gusts up to {gust_kmh} km/h{wind_dir_str_en}. "
                    "Local damage to trees and structures possible."
                ),
                "instruction_pl": (
                    "Spodziewaj się utrudnień. "
                    "Zabezpiecz przedmioty, które mogą zostać porwane przez wiatr. "
                    "Zachowaj ostrożność podczas jazdy, w szczególności pojazdami wysokimi."
                ),
                "instruction_en": (
                    "BE AWARE of travel disruption and some damage. "
                    "Secure loose objects. "
                    "Take care when driving, especially in high-sided vehicles."
                ),
                "impacts_pl": "Możliwe utrudnienia w ruchu drogowym i kolejowym. Możliwe przerwy w dostawie energii elektrycznej.",
                "impacts_en": "Possible disruption to road and rail transport. Possible power outages.",
            },
            2: {
                "description_pl": (
                    "Prognozuje się wystąpienie bardzo silnego wiatru. "
                    "Porywy wiatru do {gust_kmh} km/h"
                    "{wind_dir_str}. "
                    "Możliwe znaczne szkody w drzewostanie i infrastrukturze."
                ),
                "description_en": (
                    "Very strong wind is forecast. "
                    "Wind gusts up to {gust_kmh} km/h{wind_dir_str_en}. "
                    "Significant damage to trees and infrastructure possible."
                ),
                "instruction_pl": (
                    "BĄDŹ PRZYGOTOWANY na poważne utrudnienia. "
                    "Nie parkuj pod drzewami i słupami energetycznymi. "
                    "Unikaj zbędnych podróży. "
                    "Zabezpiecz mienie przed uszkodzeniem."
                ),
                "instruction_en": (
                    "BE PREPARED for significant disruption. "
                    "Do not park under trees or power lines. "
                    "Avoid unnecessary travel. "
                    "Secure property against damage."
                ),
                "impacts_pl": "Prawdopodobne utrudnienia lub przerwy w ruchu drogowym i kolejowym. Prawdopodobne przerwy w dostawie energii elektrycznej. Możliwe uszkodzenia budynków.",
                "impacts_en": "Likely disruption to transport. Likely power outages. Possible building damage.",
            },
            3: {
                "description_pl": (
                    "Prognozuje się wystąpienie gwałtownego wiatru o ekstremalnej sile. "
                    "Porywy wiatru do {gust_kmh} km/h"
                    "{wind_dir_str}. "
                    "Zagrożenie życia. Rozległe szkody w infrastrukturze."
                ),
                "description_en": (
                    "Extremely violent wind is forecast. "
                    "Wind gusts up to {gust_kmh} km/h{wind_dir_str_en}. "
                    "Danger to life. Widespread infrastructure damage."
                ),
                "instruction_pl": (
                    "DZIAŁAJ NATYCHMIAST. "
                    "Pozostań w bezpiecznym miejscu z dala od okien. "
                    "Nie wychodź na zewnątrz. "
                    "Słuchaj komunikatów służb ratowniczych."
                ),
                "instruction_en": (
                    "TAKE ACTION NOW. "
                    "Stay in a safe place away from windows. "
                    "Do not go outside. "
                    "Follow advice from emergency services."
                ),
                "impacts_pl": "Zagrożenie życia i zdrowia. Rozległe uszkodzenia budynków i infrastruktury. Poważne zakłócenia w transporcie i dostawach energii.",
                "impacts_en": "Danger to life. Widespread building and infrastructure damage. Major disruption to transport and power supplies.",
            },
        },
    },

    "burze": {
        "awareness_type": "2; thunderstorm",
        "event_pl": "alert burzowy",
        "event_en": "thunderstorm warning",
        "levels": {
            1: {
                "description_pl": (
                    "Prognozuje się wystąpienie burz z opadami deszczu "
                    "do {rain_mm} mm{hail_str}. "
                    "Lokalnie porywy wiatru do {gust_kmh} km/h."
                ),
                "description_en": (
                    "Thunderstorms with rainfall up to {rain_mm} mm{hail_str_en} are forecast. "
                    "Locally wind gusts up to {gust_kmh} km/h."
                ),
                "instruction_pl": "Spodziewaj się utrudnień. Unikaj otwartych przestrzeni i pojedynczych drzew podczas burzy. Zabezpiecz przedmioty mogące zostać porwane przez wiatr.",
                "instruction_en": "BE AWARE. Avoid open ground and isolated trees during thunderstorms. Secure loose outdoor objects.",
                "impacts_pl": "Możliwe lokalne podtopienia, uszkodzenia drzew i przerwy w dostawie energii.",
                "impacts_en": "Possible local flooding, tree damage and power outages.",
            },
            2: {
                "description_pl": (
                    "Prognozuje się wystąpienie gwałtownych burz z intensywnymi opadami deszczu "
                    "do {rain_mm} mm{hail_str}. "
                    "Porywy wiatru do {gust_kmh} km/h."
                ),
                "description_en": (
                    "Severe thunderstorms with heavy rainfall up to {rain_mm} mm{hail_str_en} are forecast. "
                    "Wind gusts up to {gust_kmh} km/h."
                ),
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Unikaj terenów zalewowych i potoków. Nie parkuj w pobliżu drzew. Ogranicz podróżowanie podczas burzy.",
                "instruction_en": "BE PREPARED. Avoid flood-prone areas and streams. Do not park near trees. Limit travel during the storm.",
                "impacts_pl": "Prawdopodobne podtopienia, znaczne uszkodzenia drzew i infrastruktury, przerwy w ruchu drogowym.",
                "impacts_en": "Likely flooding, significant tree and infrastructure damage, transport disruption.",
            },
            3: {
                "description_pl": (
                    "Prognozuje się wystąpienie ekstremalnych burz z bardzo intensywnymi opadami "
                    "powyżej {rain_mm} mm{hail_str}. "
                    "Porywy wiatru do {gust_kmh} km/h. Zagrożenie życia."
                ),
                "description_en": (
                    "Extreme thunderstorms with very heavy rainfall exceeding {rain_mm} mm{hail_str_en} are forecast. "
                    "Wind gusts up to {gust_kmh} km/h. Danger to life."
                ),
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Pozostań w solidnym budynku. Nie wchodź do podtapianych pomieszczeń i pojazdów. Słuchaj komunikatów służb ratowniczych.",
                "instruction_en": "TAKE ACTION NOW. Stay in a sturdy building. Do not enter flooded rooms or vehicles. Follow emergency services advice.",
                "impacts_pl": "Zagrożenie życia. Rozległe podtopienia, poważne uszkodzenia infrastruktury, paraliż komunikacyjny.",
                "impacts_en": "Danger to life. Widespread flooding, major infrastructure damage, transport paralysis.",
            },
        },
    },

    "intensywne_opady_deszczu": {
        "awareness_type": "1; rain",
        "event_pl": "alert na intensywne opady deszczu",
        "event_en": "heavy rain warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie intensywnych opadów deszczu. Suma opadów {rain_mm} mm w czasie do {hours} godzin. Lokalnie możliwe podtopienia.",
                "description_en": "Heavy rainfall of {rain_mm} mm within {hours} hours is forecast. Local flooding possible.",
                "instruction_pl": "Spodziewaj się utrudnień. Unikaj terenów zalewowych. Bądź gotowy na szybkie reagowanie w razie zalania.",
                "instruction_en": "BE AWARE of possible disruption. Avoid flood-prone areas. Be ready to act quickly if flooding occurs.",
                "impacts_pl": "Możliwe podtopienia dróg i piwnic, utrudnienia w ruchu drogowym.",
                "impacts_en": "Possible road and basement flooding, transport disruption.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie bardzo intensywnych opadów deszczu. Suma opadów {rain_mm} mm w czasie do {hours} godzin. Zagrożenie podtopieniami i powodziami błyskawicznymi.",
                "description_en": "Very heavy rainfall of {rain_mm} mm within {hours} hours is forecast. Risk of flash flooding.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Zabezpiecz mienie przed zalaniem. Unikaj jazdy przez zalane odcinki dróg. Sprawdź stan okolicznych cieków wodnych.",
                "instruction_en": "BE PREPARED. Protect property from flooding. Do not drive through flooded roads. Monitor local waterways.",
                "impacts_pl": "Prawdopodobne podtopienia budynków i dróg, lokalne powodzie błyskawiczne, zakłócenia w ruchu.",
                "impacts_en": "Likely building and road flooding, flash floods possible, significant transport disruption.",
            },
            3: {
                "description_pl": "Prognozuje się wystąpienie ekstremalnych opadów deszczu. Suma opadów powyżej {rain_mm} mm w czasie do {hours} godzin. Wysokie zagrożenie powodziami błyskawicznymi. Zagrożenie życia.",
                "description_en": "Extreme rainfall exceeding {rain_mm} mm within {hours} hours is forecast. High risk of flash flooding. Danger to life.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Ewakuuj się z terenów zagrożonych. Nie wchodź do zalanych pomieszczeń. Nie przekraczaj zalewanych dróg i brodów.",
                "instruction_en": "TAKE ACTION NOW. Evacuate from at-risk areas. Do not enter flooded buildings. Do not cross flooded roads.",
                "impacts_pl": "Zagrożenie życia. Rozległe powodzie, poważne uszkodzenia infrastruktury, konieczność ewakuacji.",
                "impacts_en": "Danger to life. Widespread flooding, major infrastructure damage, evacuation likely required.",
            },
        },
    },

    "intensywne_opady_sniegu": {
        "awareness_type": "4; snow-ice",
        "event_pl": "alert na intensywne opady śniegu",
        "event_en": "heavy snowfall warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie intensywnych opadów śniegu. Przyrost pokrywy śnieżnej o {snow_cm} cm w czasie do {hours} godzin. Możliwe utrudnienia w ruchu.",
                "description_en": "Heavy snowfall of {snow_cm} cm within {hours} hours is forecast. Possible travel disruption.",
                "instruction_pl": "Spodziewaj się utrudnień w ruchu drogowym. Dostosuj prędkość do warunków. Sprawdź stan dróg przed wyjazdem.",
                "instruction_en": "BE AWARE of travel disruption. Adjust speed to conditions. Check road conditions before travelling.",
                "impacts_pl": "Możliwe utrudnienia w ruchu drogowym i kolejowym, konieczność odśnieżania.",
                "impacts_en": "Possible road and rail disruption, snow clearance required.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie bardzo intensywnych opadów śniegu. Przyrost pokrywy śnieżnej o {snow_cm} cm w czasie do {hours} godzin. Prawdopodobne poważne utrudnienia w ruchu.",
                "description_en": "Very heavy snowfall of {snow_cm} cm within {hours} hours is forecast. Significant travel disruption likely.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY na poważne utrudnienia. Odłóż podróż jeśli to możliwe. Zaopatrz się w prowiant i ogrzewanie na wypadek unieruchomienia pojazdu.",
                "instruction_en": "BE PREPARED for significant disruption. Delay travel if possible. Carry supplies in case you become stranded.",
                "impacts_pl": "Prawdopodobne zamknięcia dróg, zakłócenia w ruchu kolejowym i lotniczym, trudności z odśnieżaniem.",
                "impacts_en": "Likely road closures, rail and air disruption, major snow clearance operation.",
            },
            3: {
                "description_pl": "Prognozuje się wystąpienie ekstremalnych opadów śniegu. Przyrost pokrywy śnieżnej powyżej {snow_cm} cm w czasie do {hours} godzin. Paraliż komunikacyjny. Zagrożenie życia.",
                "description_en": "Extreme snowfall exceeding {snow_cm} cm within {hours} hours is forecast. Transport paralysis. Danger to life.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Pozostań w domu jeśli to możliwe. Nie wyjeżdżaj bez absolutnej konieczności. Słuchaj poleceń służb.",
                "instruction_en": "TAKE ACTION NOW. Stay at home if possible. Do not travel unless absolutely necessary. Follow official advice.",
                "impacts_pl": "Zagrożenie życia. Całkowite zamknięcie dróg, unieruchomienie pojazdów, konieczność interwencji służb ratowniczych.",
                "impacts_en": "Danger to life. Complete road closures, stranded vehicles, emergency service intervention required.",
            },
        },
    },

    "silny_mroz": {
        "awareness_type": "5; low-temperature",
        "event_pl": "alert na silny mróz",
        "event_en": "extreme cold warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie silnych mrozów. Temperatura minimalna od {tmin}°C. Zagrożenie dla osób przebywających na zewnątrz.",
                "description_en": "Severe frost is forecast. Minimum temperature down to {tmin}°C. Risk to people outdoors.",
                "instruction_pl": "Spodziewaj się utrudnień. Ubieraj się ciepło. Ogranicz czas spędzany na zewnątrz. Sprawdź czy osoby starsze i bezdomne mają dostęp do ciepła.",
                "instruction_en": "BE AWARE. Dress warmly. Limit time outdoors. Check on elderly people and rough sleepers.",
                "impacts_pl": "Zagrożenie dla osób bezdomnych i starszych, możliwe uszkodzenia instalacji wodnych.",
                "impacts_en": "Risk to homeless and elderly people, possible water pipe damage.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie bardzo silnych mrozów. Temperatura minimalna od {tmin}°C. Poważne zagrożenie dla zdrowia i infrastruktury.",
                "description_en": "Very severe frost is forecast. Minimum temperature down to {tmin}°C. Serious risk to health and infrastructure.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Noś wielowarstwowe okrycia. Nie wychodź bez konieczności. Chroń instalacje wodne przed zamarznięciem. Zaalarmuj służby o osobach potrzebujących pomocy.",
                "instruction_en": "BE PREPARED. Wear multiple layers. Avoid going outside unnecessarily. Protect water pipes. Alert services about people needing help.",
                "impacts_pl": "Zagrożenie dla zdrowia i życia osób narażonych, pęknięcia rur, problemy z ogrzewaniem, zakłócenia w transporcie.",
                "impacts_en": "Risk to health and life of vulnerable people, burst pipes, heating failures, transport disruption.",
            },
            3: {
                "description_pl": "Prognozuje się wystąpienie ekstremalnych mrozów. Temperatura minimalna poniżej {tmin}°C. Ekstremalne zagrożenie dla życia. Możliwe awarie infrastruktury krytycznej.",
                "description_en": "Extreme frost is forecast. Minimum temperature below {tmin}°C. Extreme danger to life. Critical infrastructure failure possible.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Pozostań w ogrzewanych pomieszczeniach. Wezwij pomoc dla osób narażonych. Przygotuj się na ewentualne awarie ogrzewania i energii.",
                "instruction_en": "TAKE ACTION NOW. Stay in heated buildings. Get help for vulnerable people. Prepare for possible heating and power failures.",
                "impacts_pl": "Zagrożenie życia. Masowe awarie infrastruktury, ryzyko ofiar wśród osób narażonych, poważne zakłócenia w funkcjonowaniu miast.",
                "impacts_en": "Danger to life. Widespread infrastructure failures, risk of casualties among vulnerable groups, major urban disruption.",
            },
        },
    },

    "upal": {
        "awareness_type": "6; high-temperature",
        "event_pl": "alert na upał",
        "event_en": "heat warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie upałów. Temperatura maksymalna do {tmax}°C. Możliwe pogorszenie samopoczucia, szczególnie u osób wrażliwych.",
                "description_en": "Hot weather is forecast. Maximum temperature up to {tmax}°C. Possible health impacts, especially for vulnerable people.",
                "instruction_pl": "Spodziewaj się utrudnień. Pij dużo wody. Unikaj przebywania na słońcu w godzinach 11-16. Chroń głowę przed słońcem.",
                "instruction_en": "BE AWARE. Drink plenty of water. Avoid being in the sun between 11am and 4pm. Cover your head in the sun.",
                "impacts_pl": "Możliwy wzrost zachorowań na udar cieplny wśród osób starszych i dzieci.",
                "impacts_en": "Possible increase in heat-related illness among elderly and children.",
            },
            2: {
                "description_pl": "Prognozuje się utrzymywanie się upałów przez co najmniej {days} doby. Temperatura maksymalna do {tmax}°C, nocna minimalna powyżej {tmin_night}°C. Zagrożenie dla zdrowia.",
                "description_en": "Hot weather is forecast to persist for at least {days} days. Maximum temperature up to {tmax}°C, night minimum above {tmin_night}°C. Health risk.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Regularnie nawadniaj się. Zadbaj o osoby starsze, dzieci i zwierzęta domowe. Unikaj wysiłku fizycznego w godzinach największego upału. Wietrz pomieszczenia w nocy.",
                "instruction_en": "BE PREPARED. Stay hydrated. Look after elderly people, children and pets. Avoid physical exertion in peak heat. Ventilate buildings at night.",
                "impacts_pl": "Zagrożenie udarem cieplnym i odwodnieniem. Wzrost śmiertelności wśród starszych. Możliwe ograniczenia w dostawie energii.",
                "impacts_en": "Risk of heatstroke and dehydration. Increased mortality among elderly. Possible energy supply constraints.",
            },
            3: {
                "description_pl": "Prognozuje się utrzymywanie się ekstremalnych upałów przez co najmniej {days} doby. Temperatura maksymalna powyżej {tmax}°C. Ekstremalne zagrożenie dla zdrowia i życia.",
                "description_en": "Extreme heat is forecast to persist for at least {days} days. Maximum temperature above {tmax}°C. Extreme risk to health and life.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Przebywaj w chłodnych pomieszczeniach. Natychmiast wezwij pomoc medyczną przy objawach udaru cieplnego. Zadbaj o najbardziej narażonych w otoczeniu.",
                "instruction_en": "TAKE ACTION NOW. Stay in cool rooms. Seek immediate medical help for signs of heatstroke. Look after the most vulnerable around you.",
                "impacts_pl": "Zagrożenie życia. Masowy wzrost zachorowań i śmiertelności. Przeciążenie służby zdrowia. Zagrożenie pożarami.",
                "impacts_en": "Danger to life. Mass increase in illness and mortality. Healthcare system strain. Fire risk.",
            },
        },
    },

    "opady_marzniece": {
        "awareness_type": "2; snow-ice",
        "event_pl": "alert na opady marznące",
        "event_en": "freezing rain warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie słabych opadów marznącego deszczu lub marznącej mżawki, trwających do 12 godzin. Powierzchnie dróg i chodników mogą pokryć się lodem.",
                "description_en": "Freezing rain or drizzle is forecast, lasting up to 12 hours. Road and pavement surfaces may become icy.",
                "instruction_pl": "Spodziewaj się utrudnień. Zachowaj szczególną ostrożność w ruchu pieszym i drogowym. Używaj środków antypoślizgowych.",
                "instruction_en": "BE AWARE of icy surfaces. Take extra care when walking and driving. Use anti-slip footwear.",
                "impacts_pl": "Możliwe oblodzenie dróg, chodników i trakcji kolejowej.",
                "impacts_en": "Possible icing of roads, pavements and rail lines.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie opadów marznącego deszczu lub marznącej mżawki o umiarkowanej lub silnej intensywności lub słabych trwających powyżej 12 godzin. Oblodzenie dróg i chodników.",
                "description_en": "Moderate or heavy freezing rain is forecast, or light freezing rain lasting over 12 hours. Icing of roads and pavements.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY na poważne utrudnienia. Ogranicz podróżowanie do niezbędnego minimum. Zachowaj szczególną ostrożność. Unikaj jazdy jeśli to możliwe.",
                "instruction_en": "BE PREPARED for significant disruption. Limit travel to essential journeys. Take extreme care. Avoid driving if possible.",
                "impacts_pl": "Poważne oblodzenie dróg i infrastruktury kolejowej, liczne wypadki i kolizje, utrudnienia w komunikacji.",
                "impacts_en": "Severe icing of roads and rail, numerous accidents, major transport disruption.",
            },
            3: {
                "description_pl": "Prognozuje się wystąpienie opadów marznącego deszczu o umiarkowanej lub silnej intensywności, trwających powyżej 12 godzin. Ekstremalnie niebezpieczne warunki drogowe. Zagrożenie życia.",
                "description_en": "Moderate to heavy freezing rain lasting over 12 hours is forecast. Extremely dangerous road conditions. Danger to life.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Unikaj wszelkich podróży. Pozostań w domu. W razie konieczności wyjścia — poruszaj się tylko pieszo z najwyższą ostrożnością.",
                "instruction_en": "TAKE ACTION NOW. Avoid all travel. Stay at home. If you must go out, walk only with extreme caution.",
                "impacts_pl": "Zagrożenie życia. Paraliż komunikacyjny, rozległe oblodzenie infrastruktury, konieczność interwencji służb.",
                "impacts_en": "Danger to life. Transport paralysis, widespread infrastructure icing, emergency service intervention required.",
            },
        },
    },

    "roztopy": {
        "awareness_type": "1; rain",
        "event_pl": "alert na roztopy",
        "event_en": "snowmelt warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie roztopów śniegu. Temperatura dobowa powyżej {ts}°C przez co najmniej dwie doby. Możliwe lokalne podtopienia.",
                "description_en": "Snowmelt is forecast. Daily temperature above {ts}°C for at least two days. Local flooding possible.",
                "instruction_pl": "Spodziewaj się utrudnień. Monitoruj stan lokalnych rzek i potoków. Unikaj terenów zalewowych.",
                "instruction_en": "BE AWARE. Monitor local rivers and streams. Avoid flood-prone areas.",
                "impacts_pl": "Możliwe podtopienia terenów nisko położonych i pól.",
                "impacts_en": "Possible flooding of low-lying land and fields.",
            },
            2: {
                "description_pl": "Prognozuje się gwałtowne roztopy śniegu przy temperaturze dobowej powyżej {ts}°C oraz opadach deszczu {rain_mm} mm/24h. Prawdopodobne podtopienia i wezbrania rzek.",
                "description_en": "Rapid snowmelt forecast with daily temperature above {ts}°C and rainfall of {rain_mm} mm/24h. Flooding and river rises likely.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Zabezpiecz mienie przed zalaniem. Monitoruj komunikaty hydrologiczne. Sprawdź drożność rowów melioracyjnych.",
                "instruction_en": "BE PREPARED. Protect property from flooding. Monitor hydrological bulletins. Check drainage ditches.",
                "impacts_pl": "Prawdopodobne wezbrania rzek, podtopienia terenów rolniczych i zabudowanych, utrudnienia drogowe.",
                "impacts_en": "Likely river flooding, agricultural and urban flooding, road disruption.",
            },
            3: {
                "description_pl": "Prognozuje się gwałtowne i rozległe roztopy śniegu przy temperaturze dobowej powyżej {ts}°C oraz intensywnych opadach deszczu powyżej {rain_mm} mm/24h. Wysokie zagrożenie powodziowe.",
                "description_en": "Rapid and widespread snowmelt forecast with daily temperature above {ts}°C and heavy rainfall exceeding {rain_mm} mm/24h. High flood risk.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Ewakuuj się z terenów zagrożonych. Śledź komunikaty IMGW i służb kryzysowych. Nie wchodź na tereny zalewowe.",
                "instruction_en": "TAKE ACTION NOW. Evacuate from at-risk areas. Follow IMGW and emergency service alerts. Do not enter flooded areas.",
                "impacts_pl": "Zagrożenie życia. Rozległe powodzie, ewakuacje, poważne straty w infrastrukturze i rolnictwie.",
                "impacts_en": "Danger to life. Widespread flooding, evacuations, major infrastructure and agricultural losses.",
            },
        },
    },

    "silny_deszcz_z_burzami": {
        "awareness_type": "2; thunderstorm",
        "event_pl": "alert na silny deszcz z burzami",
        "event_en": "heavy rain with thunderstorms warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie intensywnych opadów deszczu z burzami. Łączna suma opadów {rain_mm} mm w czasie do {hours} godzin.",
                "description_en": "Heavy rain with thunderstorms is forecast. Total rainfall {rain_mm} mm within {hours} hours.",
                "instruction_pl": "Spodziewaj się utrudnień. Unikaj otwartych przestrzeni. Monitoruj stan lokalnych rzek.",
                "instruction_en": "BE AWARE. Avoid open ground. Monitor local rivers.",
                "impacts_pl": "Możliwe lokalne podtopienia i uszkodzenia infrastruktury.",
                "impacts_en": "Possible local flooding and infrastructure damage.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie bardzo intensywnych opadów deszczu z burzami. Łączna suma opadów {rain_mm} mm w czasie do {hours} godzin. Zagrożenie powodziami błyskawicznymi.",
                "description_en": "Very heavy rain with severe thunderstorms is forecast. Total rainfall {rain_mm} mm within {hours} hours. Flash flood risk.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY. Unikaj terenów zalewowych i dolin rzek. Nie parkuj w pobliżu cieków wodnych.",
                "instruction_en": "BE PREPARED. Avoid flood plains and river valleys. Do not park near watercourses.",
                "impacts_pl": "Prawdopodobne powodzie błyskawiczne, uszkodzenia infrastruktury, zakłócenia w transporcie.",
                "impacts_en": "Likely flash floods, infrastructure damage, transport disruption.",
            },
            3: {
                "description_pl": "Prognozuje się wystąpienie ekstremalnych opadów deszczu z burzami. Łączna suma opadów powyżej {rain_mm} mm w czasie do {hours} godzin. Zagrożenie życia.",
                "description_en": "Extreme rainfall with thunderstorms is forecast. Total rainfall exceeding {rain_mm} mm within {hours} hours. Danger to life.",
                "instruction_pl": "DZIAŁAJ NATYCHMIAST. Ewakuuj się z terenów zagrożonych. Nie wchodź do zalanych budynków i pojazdów.",
                "instruction_en": "TAKE ACTION NOW. Evacuate from at-risk areas. Do not enter flooded buildings or vehicles.",
                "impacts_pl": "Zagrożenie życia. Rozległe powodzie błyskawiczne, poważne uszkodzenia infrastruktury.",
                "impacts_en": "Danger to life. Widespread flash flooding, major infrastructure damage.",
            },
        },
    },

    "mgla_szadz": {
        "awareness_type": "7; fog",
        "event_pl": "alert na mgłę intensywnie osadzającą szadź",
        "event_en": "rime fog warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie mgły intensywnie osadzającej szadź. Widzialność poniżej {visibility_m} m, utrzymująca się powyżej {hours} godzin. Oblodzenie gałęzi drzew i napowietrznych linii energetycznych.",
                "description_en": "Dense rime fog is forecast. Visibility below {visibility_m} m for over {hours} hours. Icing of trees and overhead power lines.",
                "instruction_pl": "Spodziewaj się utrudnień. Zachowaj ostrożność w ruchu drogowym. Uwaga na oblodzone gałęzie mogące łamać się i spadać na jezdnię.",
                "instruction_en": "BE AWARE of travel disruption. Take care driving. Watch out for icy branches that may fall onto roads.",
                "impacts_pl": "Możliwe uszkodzenia linii energetycznych i telekomunikacyjnych, utrudnienia w ruchu drogowym.",
                "impacts_en": "Possible damage to power and communication lines, travel disruption.",
            },
        },
    },

    "gesta_mgla": {
        "awareness_type": "7; fog",
        "event_pl": "alert na gęstą mgłę",
        "event_en": "dense fog warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie gęstej mgły ograniczającej widzialność poniżej {visibility_m} m, utrzymującej się powyżej {hours} godzin.",
                "description_en": "Dense fog with visibility below {visibility_m} m is forecast, persisting for over {hours} hours.",
                "instruction_pl": "Spodziewaj się utrudnień. Jedź wolniej i zwiększ odstępy. Używaj świateł przeciwmgielnych. Unikaj wyprzedzania.",
                "instruction_en": "BE AWARE. Drive slower and increase following distance. Use fog lights. Avoid overtaking.",
                "impacts_pl": "Poważne utrudnienia w ruchu drogowym i lotniczym.",
                "impacts_en": "Significant disruption to road and air traffic.",
            },
        },
    },

    "oblodzenie": {
        "awareness_type": "2; snow-ice",
        "event_pl": "alert na oblodzenie",
        "event_en": "icing warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się zamarzanie mokrej nawierzchni dróg i chodników po opadach deszczu ze śniegiem i mokrego śniegu powodujące ich oblodzenie.",
                "description_en": "Freezing of wet road and pavement surfaces is forecast following sleet and wet snow, causing icing.",
                "instruction_pl": "Spodziewaj się utrudnień. Oblodzenie chodników i dróg wpływające na pogorszenie warunków ruchu drogowego. Z powodu śliskiej nawierzchni należy zachować ostrożność w ruchu pieszym i podczas prowadzenia pojazdów.",
                "instruction_en": "BE AWARE of widespread ice on roads and pavements. Take care when walking, cycling or driving due to slippery surfaces.",
                "impacts_pl": "Oblodzenie nawierzchni dróg i chodników, ryzyko poślizgnięć i wypadków drogowych.",
                "impacts_en": "Icy roads and pavements, risk of slips and road accidents.",
            },
        },
    },

    "opady_sniegu": {
        "awareness_type": "4; snow-ice",
        "event_pl": "alert na opady śniegu",
        "event_en": "snowfall warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie opadów śniegu poza sezonem zimowym. Przyrost pokrywy śnieżnej o {snow_cm} cm w czasie do {hours} godzin. Możliwe utrudnienia w ruchu.",
                "description_en": "Out-of-season snowfall is forecast. Snow accumulation of {snow_cm} cm within {hours} hours. Travel disruption possible.",
                "instruction_pl": "Spodziewaj się utrudnień w ruchu drogowym. Sprawdź stan dróg przed wyjazdem. Dostosuj prędkość do warunków.",
                "instruction_en": "BE AWARE of travel disruption. Check road conditions before travelling. Adjust speed to conditions.",
                "impacts_pl": "Możliwe utrudnienia w ruchu drogowym, konieczność odśnieżania.",
                "impacts_en": "Possible road disruption, snow clearance required.",
            },
        },
    },

    "przymrozki": {
        "awareness_type": "5; low-temperature",
        "event_pl": "alert na przymrozki",
        "event_en": "frost warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie przymrozków w okresie wiosennym. Temperatura minimalna poniżej {tmin}°C przy średniej dobowej powyżej 0°C. Zagrożenie dla upraw.",
                "description_en": "Spring frost is forecast. Minimum temperature below {tmin}°C with daily mean above 0°C. Risk to crops.",
                "instruction_pl": "Spodziewaj się strat. Zabezpiecz wrażliwe uprawy. Chroń rośliny ozdobne. Rolnicy — zastosuj dostępne metody ochrony przeciwprzymrozkowej.",
                "instruction_en": "BE AWARE of crop losses. Protect vulnerable crops. Cover ornamental plants. Farmers — apply available frost protection measures.",
                "impacts_pl": "Zagrożenie dla wiosennych upraw, sadów i ogrodów. Możliwe straty w rolnictwie.",
                "impacts_en": "Risk to spring crops, orchards and gardens. Possible agricultural losses.",
            },
        },
    },

    "zawieje_zamiecie": {
        "awareness_type": "4; snow-ice",
        "event_pl": "alert na zawieje i zamiecie śnieżne",
        "event_en": "blizzard warning",
        "levels": {
            1: {
                "description_pl": "Prognozuje się wystąpienie zawiei lub zamiatania śnieżnego. Prędkość wiatru średnia {avg_kmh} km/h, porywy do {gust_kmh} km/h. Ograniczona widzialność z powodu unoszącego się śniegu.",
                "description_en": "Blowing or drifting snow is forecast. Mean wind speed {avg_kmh} km/h, gusts up to {gust_kmh} km/h. Reduced visibility due to blowing snow.",
                "instruction_pl": "Spodziewaj się poważnych utrudnień w ruchu. Możliwe zasypanie dróg przez zaspy. Ogranicz podróżowanie do minimum.",
                "instruction_en": "BE AWARE of serious travel disruption. Roads may become blocked by drifts. Limit travel to essential journeys.",
                "impacts_pl": "Zasypanie dróg przez zaspy, poważne utrudnienia w ruchu drogowym, ograniczona widzialność.",
                "impacts_en": "Roads blocked by drifts, serious road travel disruption, reduced visibility.",
            },
            2: {
                "description_pl": "Prognozuje się wystąpienie silnych zawiei lub zamiatania śnieżnego. Prędkość wiatru średnia powyżej {avg_kmh} km/h, porywy do {gust_kmh} km/h. Bardzo ograniczona widzialność. Zagrożenie życia.",
                "description_en": "Severe blizzard conditions are forecast. Mean wind speed above {avg_kmh} km/h, gusts up to {gust_kmh} km/h. Very low visibility. Danger to life.",
                "instruction_pl": "BĄDŹ PRZYGOTOWANY na ekstremalne warunki. Nie wyjeżdżaj w trasę. Jeśli jesteś w podróży — zatrzymaj się w bezpiecznym miejscu. Słuchaj komunikatów służb.",
                "instruction_en": "BE PREPARED for extreme conditions. Do not start any journey. If already travelling — stop in a safe place. Follow official advice.",
                "impacts_pl": "Zagrożenie życia. Całkowite zamknięcie dróg, unieruchomienie pojazdów, konieczność interwencji służb ratowniczych.",
                "impacts_en": "Danger to life. Complete road closures, stranded vehicles, emergency service intervention required.",
            },
        },
    },
}

# Mapowanie METEOALARM awareness_level
AWARENESS_LEVEL_MAP = {
    1: "2; yellow; Moderate",
    2: "3; orange; Severe",
    3: "4; red; Extreme",
}

# Mapowanie severity CAP
SEVERITY_MAP = {
    1: "Minor",
    2: "Moderate",
    3: "Extreme",
}

# Mapowanie urgency CAP
URGENCY_MAP = {
    1: "Expected",
    2: "Expected",
    3: "Immediate",
}

# Kolory ostrzeżeń
COLOR_MAP = {
    1: "yellow",
    2: "orange",
    3: "red",
}

COLOR_PL = {
    1: "Żółty",
    2: "Pomarańczowy",
    3: "Czerwony",
}

COLOR_EN = {
    1: "Yellow",
    2: "Orange",
    3: "Red",
}
