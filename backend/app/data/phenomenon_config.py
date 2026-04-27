"""
Plik konfiguracyjny ikon, skutków i instrukcji dla zjawisk meteorologicznych.
Edytuj ten plik aby dostosować ikony SVG, skutki i instrukcje.

Struktura:
  "id_zjawiska": {
      "icon": "emoji lub kod SVG",
      "icon_svg": "ścieżka SVG path d=...",
      "color_map": {1: kolor, 2: kolor, 3: kolor},
      "impacts": {
          1: ["skutek 1", "skutek 2", "skutek 3"],
          2: [...],
          3: [...],
      },
      "instructions": {
          1: ["instrukcja 1", "instrukcja 2", "instrukcja 3"],
          2: [...],
          3: [...],
      }
  }

UWAGA: impacts i instructions to listy po 3 elementy (może być więcej lub mniej).
Kolory są w formacie hex i powinny odpowiadać stopniom 1=żółty, 2=pomarańczowy, 3=czerwony.
"""

PHENOMENON_ICONS = {
    # Emoji ikony do wyświetlania na mapie i w interfejsie
    "burze":                    "⛈",
    "intensywne_opady_deszczu": "🌧",
    "intensywne_opady_sniegu":  "❄",
    "silny_wiatr":              "💨",
    "silny_mroz":               "🥶",
    "upal":                     "🌡",
    "opady_marzniece":          "🌨",
    "roztopy":                  "💧",
    "silny_deszcz_z_burzami":   "⛈",
    "zawieje_zamiecie":         "🌪",
    "mgla_szadz":               "🌫",
    "gesta_mgla":               "🌫",
    "oblodzenie":               "🧊",
    "opady_sniegu":             "🌨",
    "przymrozki":               "🌡",
}

# SVG path shapes do precyzyjniejszego rysowania na mapie (opcjonalne)
PHENOMENON_SVG_PATHS = {
    "silny_wiatr": "M3 12c0-5 4-9 9-9s9 4 9 9M3 12c0 5 4 9 9 9M21 12c0 5-4 9-9 9M8 12a4 4 0 008 0",
    "burze": "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
    "intensywne_opady_deszczu": "M12 2a7 7 0 017 7c0 3-1.5 5.5-4 7H9c-2.5-1.5-4-4-4-7a7 7 0 017-7zM8 18v4M12 18v4M16 18v4",
    "silny_mroz": "M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07L19.07 4.93",
    "upal": "M12 2a10 10 0 100 20A10 10 0 0012 2zM12 6v2M12 16v2M6 12H4M20 12h-2",
    "gesta_mgla": "M4 12h16M4 8h16M4 16h12",
    "oblodzenie": "M12 2L8 8H4l4 3-2 7 6-4 6 4-2-7 4-3h-4L12 2z",
}

PHENOMENON_IMPACTS = {
    "silny_wiatr": {
        1: [
            "Uszkodzenia gałęzi drzew i elementów małej architektury",
            "Utrudnienia w ruchu drogowym pojazdów wysokich i dwukołowych",
            "Możliwe krótkotrwałe przerwy w dostawie energii elektrycznej",
        ],
        2: [
            "Połamane drzewa, uszkodzone dachy i elewacje budynków",
            "Poważne utrudnienia i możliwe zamknięcia dróg",
            "Przerwy w dostawie energii elektrycznej, uszkodzenia linii energetycznych",
        ],
        3: [
            "Rozległe zniszczenia infrastruktury, budynków i drzewostanu",
            "Paraliż komunikacyjny, zamknięte autostrady i drogi ekspresowe",
            "Masowe i długotrwałe przerwy w dostawie energii i usług komunalnych",
        ],
    },

    "burze": {
        1: [
            "Lokalne podtopienia ulic i piwnic",
            "Uszkodzenia infrastruktury od wyładowań atmosferycznych",
            "Możliwe krótkotrwałe przerwy w ruchu drogowym i kolejowym",
        ],
        2: [
            "Podtopienia budynków i dróg, lokalne powodzie błyskawiczne",
            "Uszkodzenia infrastruktury, drzewostanu, pojazdów od gradu",
            "Przerwy w ruchu pociągów, opóźnienia lotów",
        ],
        3: [
            "Rozległe powodzie błyskawiczne zagrażające życiu",
            "Masowe zniszczenia infrastruktury i mienia",
            "Konieczność ewakuacji, interwencje służb ratowniczych na dużą skalę",
        ],
    },

    "intensywne_opady_deszczu": {
        1: [
            "Podtopienia ulic i niżej położonych terenów",
            "Utrudnienia w ruchu drogowym i kolejowym",
            "Wezbrania małych cieków wodnych",
        ],
        2: [
            "Podtopienia budynków, zalane piwnice i garaże",
            "Poważne utrudnienia komunikacyjne, zamknięcia dróg",
            "Wezbrania rzek, ryzyko powodzi na obszarach zalewowych",
        ],
        3: [
            "Rozległe powodzie błyskawiczne, zagrożenie dla życia",
            "Konieczność ewakuacji mieszkańców z terenów zalewowych",
            "Poważne uszkodzenia infrastruktury, mosty i przepusty pod wodą",
        ],
    },

    "intensywne_opady_sniegu": {
        1: [
            "Utrudnienia w ruchu drogowym, ślizgawica",
            "Opóźnienia w komunikacji miejskiej i kolejowej",
            "Konieczność użycia pojazdów z napędem 4x4",
        ],
        2: [
            "Paraliż komunikacyjny, zamknięcia dróg i autostrad",
            "Poważne zakłócenia w ruchu kolejowym i lotniczym",
            "Możliwe przerwy w dostawie energii od oblodzonych linii",
        ],
        3: [
            "Całkowity paraliż komunikacyjny, duże zaspy śnieżne",
            "Unieruchomione pojazdy, konieczność interwencji służb",
            "Zagrożenie dla zdrowia i życia osób przebywających na zewnątrz",
        ],
    },

    "silny_mroz": {
        1: [
            "Zagrożenie dla osób bezdomnych i starszych, ryzyko odmrożeń",
            "Uszkodzenia instalacji wodnych w niezabezpieczonych budynkach",
            "Utrudnienia w uruchamianiu pojazdów, awarie akumulatorów",
        ],
        2: [
            "Poważne zagrożenie zdrowia i życia osób narażonych",
            "Masowe awarie instalacji wodnych, przerwy w dostawie wody",
            "Awarie urządzeń grzewczych, wzrost zapotrzebowania na ciepło",
        ],
        3: [
            "Ekstremalne zagrożenie życia przy nawet krótkotrwałym pobycie na zewnątrz",
            "Awarie infrastruktury krytycznej: wodociągów, ogrzewania, energetyki",
            "Konieczność otwarcia ogrzewalni, mobilizacja służb socjalnych",
        ],
    },

    "upal": {
        1: [
            "Pogorszenie samopoczucia, ryzyko udaru cieplnego u osób starszych i dzieci",
            "Wzrost zużycia energii, możliwe przeciążenia sieci energetycznej",
            "Pogorszenie jakości powietrza, nasilenie smogu fotochemicznego",
        ],
        2: [
            "Wzrost zachorowań na udar cieplny i odwodnienie",
            "Zwiększona śmiertelność wśród osób starszych i chorych",
            "Ryzyko pożarów traw i lasów, spadek poziomu wód",
        ],
        3: [
            "Masowy wzrost zachorowań, przeciążenie służby zdrowia",
            "Poważne zagrożenie życia przy braku dostępu do chłodzenia",
            "Pożary lasów, niedobory wody pitnej, awarie infrastruktury od upału",
        ],
    },

    "opady_marzniece": {
        1: [
            "Oblodzenie dróg i chodników, ryzyko wypadków i poślizgnięć",
            "Oblodzenie gałęzi drzew, ryzyko połamania i spadania na jezdnię",
            "Utrudnienia w ruchu drogowym i pieszym",
        ],
        2: [
            "Poważne oblodzenie dróg, liczne wypadki komunikacyjne",
            "Oblodzenie linii energetycznych i trakcji kolejowej",
            "Paraliż komunikacji w miastach, opóźnienia pociągów",
        ],
        3: [
            "Ekstremalne oblodzenie infrastruktury, zagrożenie dla życia",
            "Masowe awarie linii energetycznych i telekomunikacyjnych",
            "Całkowity paraliż ruchu, konieczność ewakuacji lub pozostania w domach",
        ],
    },

    "roztopy": {
        1: [
            "Podtopienia pól i łąk, wezbrania małych rzek",
            "Utrudnienia w ruchu drogowym na terenach nizinnych",
            "Osłabienie gruntu, możliwe uszkodzenia dróg gruntowych",
        ],
        2: [
            "Wezbrania rzek, podtopienia zabudowań na obszarach zalewowych",
            "Poważne utrudnienia drogowe, możliwe podtopienia dróg",
            "Ryzyko przerwania wałów przeciwpowodziowych",
        ],
        3: [
            "Rozległe powodzie, zagrożenie dla życia i mienia",
            "Konieczność ewakuacji ludności z terenów zalewowych",
            "Poważne straty w rolnictwie i infrastrukturze",
        ],
    },

    "silny_deszcz_z_burzami": {
        1: [
            "Lokalne podtopienia, utrudnienia w ruchu",
            "Ryzyko wyładowań atmosferycznych, przerwy w zasilaniu",
            "Wezbrania lokalnych cieków wodnych",
        ],
        2: [
            "Powodzie błyskawiczne w dolinach i zagłębieniach terenu",
            "Poważne uszkodzenia infrastruktury od gradu i wiatru",
            "Zagrożenie dla osób przebywających na otwartym terenie",
        ],
        3: [
            "Rozległe powodzie błyskawiczne, bezpośrednie zagrożenie życia",
            "Masowe zniszczenia infrastruktury, mienia i upraw",
            "Konieczność ewakuacji, mobilizacja wszystkich służb ratowniczych",
        ],
    },

    "zawieje_zamiecie": {
        1: [
            "Zasypanie dróg przez zaspy, ograniczona widzialność",
            "Poważne utrudnienia w ruchu drogowym i kolejowym",
            "Ryzyko unieruchomienia pojazdów w terenie otwartym",
        ],
        2: [
            "Całkowite zamknięcie dróg, paraliż komunikacyjny",
            "Unieruchomione pojazdy, konieczność interwencji służb",
            "Zagrożenie dla życia osób przebywających poza zabudowaniami",
        ],
    },

    "mgla_szadz": {
        1: [
            "Oblodzenie gałęzi drzew i napowietrznych linii energetycznych",
            "Możliwe przerwy w dostawie energii od oblodzeń linii",
            "Utrudnienia w ruchu drogowym i lotniczym",
        ],
    },

    "gesta_mgla": {
        1: [
            "Poważne utrudnienia w ruchu drogowym, ryzyko wypadków",
            "Ograniczenia i opóźnienia w lotnictwie",
            "Utrudnienia w ruchu morskim i śródlądowym",
        ],
    },

    "oblodzenie": {
        1: [
            "Oblodzenie dróg i chodników, ryzyko wypadków",
            "Utrudnienia w ruchu drogowym, kolizje i poślizgnięcia",
            "Ryzyko urazów pieszych na śliskich powierzchniach",
        ],
    },

    "opady_sniegu": {
        1: [
            "Utrudnienia w ruchu drogowym na drogach drugorzędnych",
            "Konieczność odśnieżania i posypywania nawierzchni",
            "Opóźnienia w transporcie miejskim i regionalnym",
        ],
    },

    "przymrozki": {
        1: [
            "Uszkodzenia wiosennych upraw, sadów i ogrodów",
            "Straty w rolnictwie i ogrodnictwie",
            "Ryzyko oblodzenia nawierzchni w godzinach rannych",
        ],
    },
}

PHENOMENON_INSTRUCTIONS = {
    "silny_wiatr": {
        1: [
            "Zabezpiecz przedmioty ogrodowe, markizy, anteny które mogą zostać porwane",
            "Zachowaj ostrożność prowadząc pojazdy wysokie i holując przyczepy",
            "Unikaj przebywania w pobliżu starych drzew i prowizorycznych konstrukcji",
        ],
        2: [
            "Ogranicz podróże do absolutnie niezbędnych, szczególnie w terenie otwartym",
            "Nie parkuj pod drzewami i słupami energetycznymi",
            "Przygotuj się na możliwe przerwy w dostawie prądu — naładuj urządzenia, zaopatrz w latarki",
        ],
        3: [
            "Pozostań w budynku, z dala od okien i przeszkleń",
            "Wyłącz urządzenia elektryczne, odsuń się od okien",
            "Słuchaj poleceń służb ratowniczych, nie wychylaj się na zewnątrz",
        ],
    },

    "burze": {
        1: [
            "Obserwuj radar burzowy i najnowsze prognozy przed wyjazdem",
            "Nie stój pod drzewami ani wysokimi obiektami podczas burzy",
            "Zabezpiecz mienie zewnętrzne przed wiatrem i gradem",
        ],
        2: [
            "Odłóż aktywności na zewnątrz do czasu przejścia burzy",
            "Unikaj terenów zalewowych i dolin — ryzyko powodzi błyskawicznych",
            "Schroń się w solidnym budynku lub samochodzie (nie pod drzewami!)",
        ],
        3: [
            "Natychmiast przenieś się do solidnego budynku lub piwnicy",
            "Nie wchodź do zalanych pomieszczeń ani pojazdów — prąd elektryczny!",
            "Zadzwoń pod 112 jeśli Twoje bezpieczeństwo jest zagrożone",
        ],
    },

    "intensywne_opady_deszczu": {
        1: [
            "Sprawdź drożność studzienek i rynien przed nadejściem opadów",
            "Unikaj jazdy przez zalane odcinki dróg — nawet 15 cm wody może unieść auto",
            "Monitoruj stan pobliskich rzek i strumieni",
        ],
        2: [
            "Przenieś cenne przedmioty z piwnicy i parteru w wyższe miejsca",
            "Przygotuj worek z dokumentami i niezbędnymi rzeczami na wypadek ewakuacji",
            "Śledź komunikaty władz lokalnych i IMGW",
        ],
        3: [
            "Ewakuuj się z terenów zagrożonych przed nadejściem kulminacji",
            "Absolutnie nie wchodź do zalanych budynków — ryzyko porażenia i zawalenia",
            "Zadzwoń pod 112 — nie czekaj aż woda dojdzie do drzwi",
        ],
    },

    "intensywne_opady_sniegu": {
        1: [
            "Sprawdź stan opon i płyn do spryskiwaczy przed wyjazdem",
            "Zarezerwuj więcej czasu na dojazd, jedź z dostosowaną prędkością",
            "Miej w samochodzie łopatę, koc, ciepłe ubranie na wypadek unieruchomienia",
        ],
        2: [
            "Odłóż podróż jeśli to możliwe, zwłaszcza w terenie otwartym",
            "Sprawdź stan dróg przez aplikację GDDKiA lub podobną przed wyjazdem",
            "Jeśli musisz jechać — powiadom kogoś o trasie i planowanym czasie dotarcia",
        ],
        3: [
            "Zostań w domu — wyjeżdżaj tylko w absolutnej konieczności",
            "Przygotuj zapas żywności i wody na kilka dni w razie odcięcia",
            "Słuchaj poleceń służb — możliwe zamknięcia dróg i nakazy ewakuacji",
        ],
    },

    "silny_mroz": {
        1: [
            "Ubieraj się warstwowo, zakryj twarz, dłonie i uszy na zewnątrz",
            "Sprawdź czy osoby starsze i sąsiedzi mają ogrzewanie i żywność",
            "Zabezpiecz instalacje wodne w nieogrzewanych pomieszczeniach (garaże, piwnice)",
        ],
        2: [
            "Ogranicz przebywanie na zewnątrz do minimum absolutnie niezbędnego",
            "Zadzwoń do straży miejskiej lub opieki społecznej w sprawie bezdomnych",
            "Przygotuj się na możliwe awarie ogrzewania — miej awaryjne źródło ciepła",
        ],
        3: [
            "Pozostań w ogrzewanym pomieszczeniu, nie wychodź bez absolutnej konieczności",
            "W przypadku odmrożeń — nie masuj, ogrzewaj stopniowo, wezwij pomoc",
            "Przy awarii ogrzewania — natychmiast poszukaj noclegu w ogrzewanym miejscu",
        ],
    },

    "upal": {
        1: [
            "Pij minimum 2-3 litry wody dziennie, unikaj alkoholu i kofeiny",
            "Unikaj przebywania na słońcu między 11:00 a 16:00",
            "Noś lekkie, jasne ubrania i nakrycie głowy",
        ],
        2: [
            "Zostań w klimatyzowanych lub zacienionych pomieszczeniach w godzinach szczytu",
            "Sprawdzaj regularnie samopoczucie osób starszych i dzieci w Twoim otoczeniu",
            "Nigdy nie zostawiaj dzieci i zwierząt w zamkniętych samochodach",
        ],
        3: [
            "Przy objawach udaru (czerwona twarz, brak potu, wysoka temperatura) — dzwoń 112",
            "Schładzaj ciało mokrymi ręcznikami i chłodną (nie lodowatą) wodą",
            "Zgłoś się do punktu chłodzenia jeśli nie masz klimatyzacji ani wentylatora",
        ],
    },

    "opady_marzniece": {
        1: [
            "Noś buty antypoślizgowe, poruszaj się ostrożnie po chodnikach",
            "Ogranicz korzystanie z samochodu — nawet niewielkie oblodzenie jest groźne",
            "Zachowaj duże odstępy od poprzedzających pojazdów",
        ],
        2: [
            "Unikaj podróży jeśli to możliwe — drogi mogą być ekstremalnie śliskie",
            "Jeśli musisz jechać — jedź bardzo wolno, hamuj z dużym wyprzedzeniem",
            "Miej przy sobie środki antypoślizgowe (piasek, sól) jeśli utkniesz",
        ],
        3: [
            "Nie wychodź z domu bez absolutnej konieczności",
            "Jeśli musisz wyjść — poruszaj się jak najwolniej z pełnym skupieniem",
            "Telefon na 112 gotowy — ryzyko poważnych upadków jest bardzo wysokie",
        ],
    },

    "roztopy": {
        1: [
            "Monitoruj poziom rzek i potoków w swojej okolicy",
            "Sprawdź drożność studzienek i rowów melioracyjnych",
            "Przenieś wartościowe przedmioty z piwnic i parteru",
        ],
        2: [
            "Śledź komunikaty hydrologiczne IMGW i władz lokalnych",
            "Przygotuj dokumenty i niezbędne rzeczy do szybkiej ewakuacji",
            "Nie wchodź do podtopionych pomieszczeń bez wyłączenia prądu",
        ],
        3: [
            "Ewakuuj się z terenów zagrożonych na polecenie służb lub z własnej inicjatywy",
            "Nie przekraczaj zalewanych dróg i brodów — nawet samochodem terenowym",
            "Dzwoń pod 112 gdy woda zaczyna wchodzić do budynku",
        ],
    },

    "silny_deszcz_z_burzami": {
        1: [
            "Unikaj otwartych przestrzeni i pojedynczych drzew podczas wyładowań",
            "Sprawdź stan rynien i odpływów przed nadejściem opadów",
            "Śledź aktualne radary i ostrzeżenia IMGW",
        ],
        2: [
            "Schroń się w solidnym budynku z dala od okien",
            "Unikaj dolinnych i zalewowych dróg — ryzyko błyskawicznego zalania",
            "Naładuj telefon, przygotuj latarkę i awaryjne zapasy",
        ],
        3: [
            "Natychmiast ewakuuj się z terenów zalewowych",
            "Nie wchodź do zalanych miejsc — ryzyko porażenia prądem",
            "Kontakt 112 — nie czekaj na eskalację zagrożenia",
        ],
    },

    "zawieje_zamiecie": {
        1: [
            "Sprawdź prognozę przed wyjazdem — możliwe nagłe zamknięcia dróg",
            "Jedź wolno, używaj świateł mijania, zachowaj bezpieczne odstępy",
            "Miej w aucie awaryjny zestaw — koc, łopatę, ciepłe jedzenie",
        ],
        2: [
            "Zrezygnuj z podróży w terenie otwartym — zaspy mogą uniemożliwić przejazd",
            "Jeśli utkniesz w zaspie — zostań w pojeździe, uruchamiaj silnik co godzinę",
            "Zadzwoń do GDDKiA (tel. 19 111) lub 112 jeśli utkniesz",
        ],
    },

    "mgla_szadz": {
        1: [
            "Używaj świateł przeciwmgielnych i ogranicz prędkość",
            "Uwaga na oblodzone gałęzie mogące spaść na drogę",
            "Zachowaj szczególną ostrożność na mostach i wiaduktach",
        ],
    },

    "gesta_mgla": {
        1: [
            "Włącz światła przeciwmgielne (tylko tylne gdy mgła >50m)",
            "Redukuj prędkość — widzialność może spaść poniżej 50m bez ostrzeżenia",
            "Zachowaj odległość co najmniej 4 sekundy od poprzedniego pojazdu",
        ],
    },

    "oblodzenie": {
        1: [
            "Ubierz buty antypoślizgowe przed wyjściem z domu",
            "Jedź wolno i hamuj z dużym wyprzedzeniem, szczególnie na mostach",
            "Posyp oblodzone chodniki przy posesji piaskiem lub solą",
        ],
    },

    "opady_sniegu": {
        1: [
            "Sprawdź opony przed wyjazdem — śnieg wymaga opon zimowych",
            "Odśnież auto — lód na dachu to zagrożenie dla innych",
            "Zarezerwuj dodatkowy czas na dotarcie do celu",
        ],
    },

    "przymrozki": {
        1: [
            "Zabezpiecz wrażliwe rośliny agrowłókniną lub folią przed nocą",
            "Rolnicy: rozważ podlewanie roślin przed przymrozkiem (lód izoluje)",
            "Sprawdź termometr rano przed wyjazdem — ryzyko czarnego lodu",
        ],
    },
}
