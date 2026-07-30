import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { getMapState, setMapState, saveMapPosition } from '../../utils/mapState';

const MA_LEVEL_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const MA_COUNTRY_BORDER = { DE:'#3b82f6', CZ:'#22c55e', SK:'#a78bfa', UA:'#fbbf24', LT:'#fb923c',
  RU_KGD:'#9ca3af', BY:'#9ca3af' };  // RU/BY — szare, poglądowe

// Adres API względem BASE_URL — aplikacja działa i pod /osmet-dev/, i bezpośrednio po porcie.
const API = import.meta.env.VITE_API_URL || ((import.meta.env.BASE_URL || '/') + 'api');

const VOIV_STYLE   = { color: 'rgba(59,130,246,0.8)', fillColor: 'transparent', fillOpacity: 0, weight: 1.8 };
// Kolejność ostrzeżeń: ręczna (lista boczna) > stopień malejąco > onset.
// Indeks 0 = wierzch mapy (wygrywa kolor powiatu, label na wierzchu, pierwszy w cyklu).
function orderActiveWarnings(warnings, warnOrder) {
  const act = (warnings || []).filter(w =>
    (w.status === 'active' || w.status === 'pending') &&
    w.is_active_leaf !== false && !w.is_cancelled);
  const pos = new Map((warnOrder || []).map((id, i) => [id, i]));
  return act.slice().sort((a, b) => {
    const pa = pos.has(a.id) ? pos.get(a.id) : Infinity;
    const pb = pos.has(b.id) ? pos.get(b.id) : Infinity;
    if (pa !== pb) return pa - pb;
    if ((b.level || 0) !== (a.level || 0)) return (b.level || 0) - (a.level || 0);
    return String(a.onset || '').localeCompare(String(b.onset || ''));
  });
}

const COUNTY_STYLE = { color: 'rgba(59,130,246,0.25)', fillColor: 'rgba(59,130,246,0.03)', fillOpacity: 1, weight: 0.6 };
const SEL_STYLE    = { color: '#38bdf8', fillColor: 'rgba(56,189,248,0.25)', fillOpacity: 1, weight: 2.0 };
const POLY_STYLE   = { color: '#06b6d4', fillColor: 'rgba(6,182,212,0.1)', fillOpacity: 1, weight: 2 };
const HIGHLIGHT_STYLE = { color: '#a78bfa', fillColor: 'rgba(167,139,250,0.2)', fillOpacity: 1, weight: 2.5 };

const LEVEL_COLORS  = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const LEVEL_BORDERS = { 1: '#a16207', 2: '#9a3412', 3: '#7f1d1d' };  // ciemniejsze obramowania dla kontrastu


const TILE_LAYERS = [
  { id: 'dark',     label: 'Ciemna',       icon: '🌑', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attr: '© CARTO © OSM' },
  { id: 'osm',      label: 'OSM',          icon: '🗺',  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',             attr: '© OSM' },
  { id: 'topo',     label: 'Topografia',   icon: '⛰',  url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',              attr: '© OpenTopoMap' },
  { id: 'satellite',label: 'Satelita',     icon: '🛰',  url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri', noSub: true },
  { id: 'relief',   label: 'Hipsometria', icon: '🏔',  url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}', attr: '© Esri', noSub: true },
  { id: 'dark_topo',label: 'Ciemna+Topo', icon: '🌒',  url: null,
    layers: ['https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
             'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'],
    blend: true, attr: '© CARTO © Esri' },
];

const PHENOMENON_ICONS = {
  burze:'⛈', intensywne_opady_deszczu:'🌧', intensywne_opady_sniegu:'❄',
  silny_wiatr:'💨', silny_mroz:'🥶', upal:'🌡', opady_marzniece:'🌨',
  roztopy:'💧', silny_deszcz_z_burzami:'⛈', zawieje_zamiecie:'🌪',
  mgla_szadz:'🌫', gesta_mgla:'🌫', oblodzenie:'🧊',
  opady_sniegu:'🌨', przymrozki:'🌡',
};
// Skróty tekstowe dla markerów MA — czytelne na każdym tle i rozmiarze
const PHENOMENON_ABBR = {
  burze:                    'BURZE',
  intensywne_opady_deszczu: 'DESZCZ',
  intensywne_opady_sniegu:  'ŚNIEG',
  silny_wiatr:              'WIATR',
  silny_mroz:               'MRÓZ',
  upal:                     'UPAŁ',
  opady_marzniece:          'MARZNIE',
  roztopy:                  'ROZTOPY',
  silny_deszcz_z_burzami:   'BURZE',
  zawieje_zamiecie:         'ZAWIEJA',
  mgla_szadz:               'MGŁA',
  gesta_mgla:               'MGŁA',
  oblodzenie:               'OBLODZ.',
  opady_sniegu:             'ŚNIEG',
  przymrozki:               'PRZYMRZ.',
  inne_zagrożenie:          'INNE',
  pozar_lasu:               'POŻAR',
  grad:                     'GRAD',
};
const PHENOMENON_SHORT = {
  burze:'Burze', intensywne_opady_deszczu:'Op. deszczu',
  intensywne_opady_sniegu:'Op. śniegu', silny_wiatr:'Wiatr',
  silny_mroz:'Silny mróz', upal:'Upał', opady_marzniece:'Op. marz.',
  roztopy:'Roztopy', silny_deszcz_z_burzami:'Deszcz+burze',
  zawieje_zamiecie:'Zawieje', mgla_szadz:'Mgła+szadź',
  gesta_mgla:'Gęsta mgła', oblodzenie:'Oblodzenie',
  opady_sniegu:'Op. śniegu', przymrozki:'Przymrozki',
};

export default function MapPanel({
  onPolygonDrawn, selectedCounties, warnings,
  onClear, onCountyToggle,
  highlightedWarningId,
  editingWarningId,
  warnOrder = [],
  onWarnOrderChange,
  onUndoSelection,
  onRedoSelection,
  conflictCounties = [],
  draftContext = null,
  onRequestEdit,
  onRequestCopy,
  onHighlightWarning,
  showWarningLabels = true,
  // MA state z App.js — gdy dostarczone, MapPanel nie fetcha samodzielnie
  maWarningsProp, maEnabledProp, maLoadingProp, onMaStateChange,
}) {
  const mapRef       = useRef(null);
  // Cykl podświetlania: klikanie na powiat krąży po ostrzeżeniach na tym powiecie
  const cycleRef     = useRef({ countyId: null, index: -1 });
  const warningsRef  = useRef([]);   // aktualne warnings dostępne w starych closure'ach (click handler)
  const onCountyToggleRef = useRef(null);
  const onHighlightWarningRef = useRef(null);
  const warnOrderRef = useRef([]);
  const pickModeRef = useRef(false);  // tryb klikania powiatów do edycji
  const leafletMap   = useRef(null);
  const drawnItems   = useRef(null);
  const drawControl  = useRef(null);
  const countyLayers = useRef({});
  const voivLayer    = useRef(null);
  const countyLayer  = useRef(null);
  const warnLayers   = useRef([]);     // warstwy ostrzeżeń (kółka + centroid label)
  const hlLayers     = useRef([]);     // podświetlone ostrzeżenie
  const tileRef      = useRef(null);
  const tile2Ref     = useRef(null);
  const allCountiesRef = useRef([]);

  const [drawMode,   setDrawMode]   = useState(false);
  const [pickMode,   setPickMode]   = useState(false);  // Tryb klikania powiatów do edycji
  const [loading,      setLoading]      = useState(true);
  const [layersLoaded, setLayersLoaded] = useState(false);
  const [activeBase, setActiveBase] = useState(getMapState().tileLayerId);
  const [showPicker, setShowPicker] = useState(false);
  const [warnListOpen, setWarnListOpen] = useState(true);   // boczna lista ostrzeżeń (warstwy)
  const [L, setL] = useState(null);
  const [maEnabled, setMaEnabled] = useState(() => {
    if (maEnabledProp !== undefined) return maEnabledProp;
    try { return localStorage.getItem('meteocap_ma_enabled') === 'true'; } catch { return false; }
  });
  const [maCountries, setMaCountries] = useState(() => {
    try {
      const stored = localStorage.getItem('meteocap_ma_countries');
      return stored ? JSON.parse(stored) : ['DE','CZ','SK','UA','LT'];
    } catch { return ['DE','CZ','SK','UA','LT']; }
  });
  // Gdy MA warnings zarządzane z App.js, używaj propsów; inaczej lokalny state
  const [maWarningsLocal, setMaWarningsLocal] = useState([]);
  const maWarnings = maWarningsProp !== undefined ? maWarningsProp : maWarningsLocal;
  const [maLoading, setMaLoading] = useState(false);

  // Synchronizuj maEnabled z propsem gdy zmieni się w App
  useEffect(() => {
    if (maEnabledProp !== undefined) setMaEnabled(maEnabledProp);
  }, [maEnabledProp]);
  const maLayersRef = useRef([]);

  // Ładuj Leaflet dynamicznie
  useEffect(() => {
    let alive = true;
    (async () => {
      const lf = await import('leaflet');
      await import('leaflet-draw');
      if (alive) setL(lf.default || lf);
    })();
    return () => { alive = false; };
  }, []);

  // Synchronizuj refy z bieżącymi propsami (do użycia w starych closure'ach kliknięcia powiatu)
  useEffect(() => {
    warningsRef.current = warnings || [];
    onCountyToggleRef.current = onCountyToggle;
    onHighlightWarningRef.current = onHighlightWarning;
    warnOrderRef.current = warnOrder;
    pickModeRef.current = pickMode;
  }, [warnings, onCountyToggle, onHighlightWarning, pickMode, warnOrder]);

  // Inicjalizacja mapy
  useEffect(() => {
    if (!L || !mapRef.current || leafletMap.current) return;
    const state = getMapState();
    const map = L.map(mapRef.current, {
      center: state.center, zoom: state.zoom,
      zoomControl: true, attributionControl: false,
    });
    L.control.attribution({ prefix: false }).addTo(map);
    tileRef.current = L.tileLayer(TILE_LAYERS[0].url, { maxZoom: 19 }).addTo(map);
    drawnItems.current = new L.FeatureGroup().addTo(map);
    const dc = new L.Control.Draw({
      draw: { polygon: { allowIntersection: false, shapeOptions: POLY_STYLE },
              rectangle: { shapeOptions: POLY_STYLE },
              circle: false, circlemarker: false, marker: false, polyline: false },
      edit: { featureGroup: drawnItems.current },
    });
    map.addControl(dc);
    drawControl.current = dc;
    setTimeout(() => { const t = document.querySelector('.leaflet-draw'); if (t) t.style.display = 'none'; }, 100);

    // Zapisuj pozycję przy każdym ruchu
    map.on('moveend zoomend', () => saveMapPosition(map));

    // Globalny tooltip powiatów — jeden div na całą mapę, bez Leaflet bindTooltip.
    // Rozwiązuje problem "duchów" (tooltipów które nie gasną przy szybkim przejściu).
    window._countyTT = (() => {
      let el = document.getElementById('county-global-tt');
      if (!el) {
        el = document.createElement('div');
        el.id = 'county-global-tt';
        el.style.cssText = [
          'position:fixed', 'z-index:9998', 'pointer-events:none', 'display:none',
          'background:var(--bg-surface,#1e293b)', 'color:var(--text-primary,#f1f5f9)',
          'border:1px solid var(--border,#334155)', 'border-radius:4px',
          'padding:5px 8px', 'font-size:11px', 'line-height:1.45',
          'box-shadow:0 2px 8px rgba(0,0,0,0.5)', 'max-width:200px',
          'white-space:normal', 'word-break:break-word',
        ].join(';');
        document.body.appendChild(el);
      }
      return {
        show(html, e) {
          el.innerHTML = html;
          el.style.display = 'block';
          this.move(e);
        },
        move(e) {
          const oe = e.originalEvent || e;
          el.style.left = (oe.clientX + 14) + 'px';
          el.style.top  = (oe.clientY - 10) + 'px';
        },
        hide() { el.style.display = 'none'; },
      };
    })();

    leafletMap.current = map;
    loadLayers(map, L);
  }, [L]);

  // Zmiana podkładu
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    const cfg = TILE_LAYERS.find(t => t.id === activeBase);
    if (!cfg) return;
    if (tileRef.current) map.removeLayer(tileRef.current);
    if (tile2Ref.current) { map.removeLayer(tile2Ref.current); tile2Ref.current = null; }
    if (cfg.blend && cfg.layers) {
      tileRef.current  = L.tileLayer(cfg.layers[0], { maxZoom: 19, opacity: 1 }).addTo(map);
      tile2Ref.current = L.tileLayer(cfg.layers[1], { maxZoom: 18, opacity: 0.35, subdomains: '' }).addTo(map);
    } else {
      const opts = { maxZoom: cfg.maxZoom || 19 };
      if (cfg.noSub) opts.subdomains = '';
      tileRef.current = L.tileLayer(cfg.url, opts).addTo(map);
    }
    setMapState({ tileLayerId: activeBase });
    if (countyLayer.current) countyLayer.current.bringToFront();
    if (voivLayer.current)   voivLayer.current.bringToFront();
  }, [activeBase, L]);

  const loadLayers = async (map, L) => {
    setLoading(true);
    try {
      const [voivRes, powRes, centRes] = await Promise.all([
        axios.get(`${API}/voivodeships`),
        axios.get(`${API}/counties/geojson`),
        axios.get(`${API}/counties`),
      ]);
      allCountiesRef.current = centRes.data.counties || [];
      countyLayer.current = L.geoJSON(powRes.data, {
        style: COUNTY_STYLE,
        onEachFeature: (feature, layer) => {
          countyLayers.current[feature.properties.id] = layer;
          // Tooltip powiatów — globalny div, nie Leaflet bindTooltip.
          // Leaflet zostawia "duchy" tooltipów przy szybkim przejściu przez wiele
          // warstw. Globalny div eliminuje ten problem całkowicie.
          const ttHtml = `<b>${feature.properties.name}</b><br><span style="opacity:.7;font-size:10px">${feature.properties.voiv_name}</span>`;
          let _ctt = null; // timer
          layer.on('mouseover', function(e) {
            clearTimeout(_ctt);
            _ctt = setTimeout(() => window._countyTT.show(ttHtml, e), 600);
          });
          layer.on('mousemove', function(e) {
            window._countyTT.move(e);
          });
          layer.on('mouseout', function() {
            clearTimeout(_ctt);
            window._countyTT.hide();
          });
          layer.on('click', () => {
            const countyId = feature.properties.id;
            const fnHighlight = onHighlightWarningRef.current;
            const fnToggle    = onCountyToggleRef.current;

            // Tryb "Klikaj powiaty" — kliknięcie zaznacza/odznacza powiat do edycji (cyjan)
            if (pickModeRef.current) {
              if (fnToggle) fnToggle(feature.properties);
              return;
            }

            // Tryb domyślny — klik na powiat = cykl podświetleń ostrzeżeń
            // Kolejność cyklu = kolejność warstw na mapie (lista boczna decyduje o wierzchu)
            const activeWarnings = orderActiveWarnings(warningsRef.current, warnOrderRef.current)
              .filter(w => (w.counties || []).some(c => String(c.id) === String(countyId)));
            const cycle = cycleRef.current;

            if (activeWarnings.length === 0) {
              // Brak ostrzeżeń → nic nie rób (żadnej edycji bez intencji)
              cycle.countyId = null;
              cycle.index = -1;
              if (fnHighlight) fnHighlight(null);
              return;
            }

            if (cycle.countyId !== countyId) {
              // Nowy powiat — pokaż pierwsze ostrzeżenie
              cycle.countyId = countyId;
              cycle.index = 0;
              if (fnHighlight) fnHighlight(activeWarnings[0].id);
              return;
            }

            // Ten sam powiat — następne ostrzeżenie LUB odznaczenie
            cycle.index++;
            if (cycle.index >= activeWarnings.length) {
              // Po ostatnim ostrzeżeniu → odznacz wszystko (powrót do stanu początkowego)
              cycle.index = -1;
              cycle.countyId = null;
              if (fnHighlight) fnHighlight(null);
              return;
            }
            // Pokaż kolejne ostrzeżenie w cyklu
            if (fnHighlight) fnHighlight(activeWarnings[cycle.index].id);
          });
        },
      }).addTo(map);
      voivLayer.current = L.geoJSON(voivRes.data, { style: VOIV_STYLE, interactive: false }).addTo(map);
    } catch (e) { console.warn('Błąd ładowania warstw:', e); }
    finally { setLoading(false); setLayersLoaded(true); }
  };

  // dawny osobny efekt selekcji usunięty — malowanie zunifikowane w jednym efekcie niżej,
  //  żeby dwa mechanizmy nie walczyły o te same warstwy różnymi regułami

  // Podświetl ostrzeżenie z historii/edytora
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    hlLayers.current.forEach(l => { if (l.restore) l.restore(); });
    hlLayers.current = [];
    if (!highlightedWarningId) return;
    const w = warnings.find(x => x.id === highlightedWarningId);
    if (!w) return;
    // Wzmocniony kolor ostrzeżenia (mniej przezroczysty, grubsza ramka)
    const lvlColor = LEVEL_COLORS[w.level] || '#facc15';
    const hlStyle = {
      color: LEVEL_BORDERS[w.level] || '#92400e',
      fillColor: lvlColor,
      fillOpacity: 0.55,  // wzmocniony vs normalny 0.25
      weight: 3,
    };
    (w.counties || []).forEach(c => {
      const layer = countyLayers.current[c.id];
      if (layer) {
        const prevStyle = { ...layer.options };
        layer.setStyle(hlStyle);
        hlLayers.current.push({ restore: () => layer.setStyle(prevStyle) });
      }
    });
  }, [highlightedWarningId, warnings, L]);

  // MALOWANIE POWIATÓW — jedna reguła: powiat maluje NAJWYŻSZY stopień spośród
  // pokrywających go ostrzeżeń; nakładanie sygnalizuje jasna, grubsza obwódka.
  // W trybie Update (editingWarningId) pozostałe ostrzeżenia są przygaszone.
  // Markery-labele żyją w OSOBNYM efekcie niżej — klik powiatu (selekcja)
  // przemalowuje tylko poligony, bez odtwarzania markerów (bez migotania).
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    // Reset wszystkich powiatów do bazowego stylu
    Object.values(countyLayers.current).forEach(l => l.setStyle(COUNTY_STYLE));

    const ordered = orderActiveWarnings(warnings, warnOrder);
    const selectedIds = new Set((selectedCounties || []).map(c => String(c.id)));

    // 1. Per-powiat: zwycięzca = ostrzeżenie NAJWYŻEJ w kolejności warstw
    //    (lista boczna; domyślnie najwyższy stopień). Licz nakładanie.
    const best = {};  // countyId -> { level, pending, count, wid }
    ordered.forEach(w => {
      (w.counties || []).forEach(c => {
        const id = String(c.id);
        const cur = best[id];
        if (!cur) best[id] = { level: w.level, pending: w.status === 'pending', count: 1, wid: w.id };
        else cur.count += 1;   // pierwszy w kolejności już wygrał — tylko licznik nakładania
      });
    });

    // 2. Pomaluj powiaty wg zwycięzcy
    Object.entries(best).forEach(([id, b]) => {
      const layer = countyLayers.current[id];
      if (!layer) return;
      const color = LEVEL_COLORS[b.level] || '#facc15';
      // przygaszenie: trwa edycja innego ostrzeżenia, a powiat nie należy do edytowanego obszaru (selekcji)
      const dimmed = editingWarningId && b.wid !== editingWarningId && !selectedIds.has(id);
      layer.setStyle({
        color: LEVEL_BORDERS[b.level] || color,
        fillColor: color,
        fillOpacity: dimmed ? 0.10 : 0.38,
        weight: b.pending ? 1.5 : 2.5,
        dashArray: b.pending ? '6,4' : null,
        opacity: dimmed ? 0.35 : 1,
      });
    });

    // B2: powiaty ZAJĘTE przez to samo zjawisko w nachodzącym czasie —
    // widoczne od razu, zanim synoptyk zacznie klikać (dotąd dowiadywał się
    // dopiero z błędu 409 po zaznaczeniu kilkudziesięciu powiatów).
    if (draftContext && draftContext.phenomenon && draftContext.onset && draftContext.expires) {
      const o = Date.parse(draftContext.onset), e = Date.parse(draftContext.expires);
      if (!isNaN(o) && !isNaN(e) && e > o) {
        const busy = new Set();
        warnings.forEach(w => {
          if (w.id === draftContext.excludeId) return;
          if (w.phenomenon !== draftContext.phenomenon) return;
          if (!(w.status === 'active' || w.status === 'pending')) return;
          const wo = w.onset ? Date.parse(w.onset) : null;
          const we = w.expires ? Date.parse(w.expires) : null;
          if (wo == null || we == null) return;
          if (o < we && wo < e) (w.counties || []).forEach(c => busy.add(String(c.id)));
        });
        busy.forEach(id => {
          const l = countyLayers.current[id];
          if (l) l.setStyle({ color: '#e8eef6', weight: 2, dashArray: '3,3', fillOpacity: 0.45 });
        });
      }
    }

    // Przywróć cyjan dla zaznaczonych powiatów edycji (priorytet nad kolorem ostrzeżenia)
    selectedCounties.forEach(c => {
      const l = countyLayers.current[c.id];
      if (l) l.setStyle(SEL_STYLE);
    });
    // B3: powiaty kolidujące — najbardziej rzucający się w oczy styl, na wierzchu
    (conflictCounties || []).forEach(id => {
      const l = countyLayers.current[String(id)];
      if (l) {
        l.setStyle({ color: '#ef4444', weight: 3.5, dashArray: null, fillColor: '#ef4444', fillOpacity: 0.55 });
        try { l.bringToFront(); } catch (e) {}
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // Klucz zamiast obiektu: nowy obiekt o tych samych wartościach nie wywoła
  // przemalowania całej mapy (380 poligonów).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warnings, selectedCounties, editingWarningId, warnOrder,
      (conflictCounties || []).join(','),
      draftContext ? `${draftContext.phenomenon}|${draftContext.onset}|${draftContext.expires}|${draftContext.excludeId}` : '',
      L, layersLoaded]);

  // MARKERY-LABELE per ostrzeżenie — osobny efekt: odtwarzane tylko przy zmianie
  // ostrzeżeń / trybu edycji / widoczności, NIE przy każdym kliku powiatu.
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    warnLayers.current.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
    warnLayers.current = [];
    const ordered = orderActiveWarnings(warnings, warnOrder);
    ordered
      .forEach((w, wi) => {
        const color    = LEVEL_COLORS[w.level] || '#facc15';
        const icon     = PHENOMENON_ICONS[w.phenomenon] || '⚠';
        const label    = PHENOMENON_SHORT[w.phenomenon] || w.phenomenon;
        const counties = w.counties || [];
        const isDashed = w.status === 'pending';
        const dimmed   = editingWarningId && w.id !== editingWarningId;

        // JEDEN label na centroidzie obszaru
        if (!showWarningLabels || counties.length === 0) return;
        const lats = counties.map(c => c.lat).filter(Boolean);
        const lons = counties.map(c => c.lon).filter(Boolean);
        if (!lats.length) return;
        const clat = lats.reduce((a,b)=>a+b,0) / lats.length;
        const clon = lons.reduce((a,b)=>a+b,0) / lons.length;

        // Czas ważności do wyświetlenia w labelu
        const fmtTime = iso => iso
          ? new Date(iso).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
          : '—';
        const onsetStr   = fmtTime(w.onset);
        const expiresStr = fmtTime(w.expires);
        const statusDot  = w.status === 'active' ? '●' : '○';

        const divHtml = `
          <div style="
            background:${color};color:#000;border:2px solid ${LEVEL_BORDERS[w.level]||color};
            border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;
            white-space:nowrap;
            box-shadow:0 2px 8px rgba(0,0,0,0.4);
            display:flex;flex-direction:row;align-items:center;gap:6px;
            opacity:${dimmed ? '0.25' : (isDashed ? '0.82' : '1')};
            line-height:1.2;
          ">
            <span style="font-size:18px;line-height:1;flex-shrink:0">${icon}</span>
            <span style="font-size:12px">St.${w.level} ${label}</span>
            ${w.operation_hint === 'escalate' ? '<span title="Eskalacja">⬆</span>' : ''}
            ${w.operation_hint === 'deescalate' ? '<span title="Deeskalacja">⬇</span>' : ''}
            ${(w.version || 1) > 1 ? `<span style="font-size:9px;opacity:0.6;font-family:monospace">v${w.version}</span>` : ''}
            <span style="font-size:10px;opacity:0.7;font-weight:500">do ${expiresStr}</span>
          </div>`;

        const marker = L.marker([clat, clon], {
          icon: L.divIcon({
            html: divHtml,
            className: 'ma-warn-label',
            iconAnchor: [0, 18],   // ~połowa wysokości labela (padding 5+5 + font 12*1.2 = ~24px → środek ~12, z marginesem)
          }),
          zIndexOffset: (dimmed ? 250 : 400) + (ordered.length - wi) * 3, interactive: true,
        });
        marker.bindTooltip(
          `<b>${icon} ${label}</b> — Stopień ${w.level}<br>` +
          `${counties.length} powiat${counties.length===1?'':counties.length<5?'y':'ów'}<br>` +
          `<small>Od: ${onsetStr}<br>Do: ${expiresStr}</small>`,
          { className: 'map-county-tooltip' }
        );
        marker.addTo(map);
        warnLayers.current.push(marker);

      });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warnings, editingWarningId, warnOrder, showWarningLabels, L, layersLoaded]);

  // Mapa w kontenerze o zmiennej wysokości (układ mobilny, obrót ekranu):
  // wymuś przeliczenie rozmiaru, inaczej Leaflet zostaje z nieaktualnymi wymiarami.
  useEffect(() => {
    const fix = () => { try { leafletMap.current && leafletMap.current.invalidateSize(); } catch (e) {} };
    const t = setTimeout(fix, 250);
    window.addEventListener('orientationchange', fix);
    window.addEventListener('resize', fix);
    return () => { clearTimeout(t); window.removeEventListener('orientationchange', fix); window.removeEventListener('resize', fix); };
  }, [L, layersLoaded]);

  // MeteoAlarm — ładuj lokalnie tylko gdy nie ma propsów z App.js
  useEffect(() => {
    if (maWarningsProp !== undefined) return; // zarządzane z App
    if (!maEnabled) { setMaWarningsLocal([]); return; }
    const load = async () => {
      setMaLoading(true);
      try {
        const res = await axios.get(`${API}/meteoalarm/warnings?countries=${maCountries.join(',')}`);
        setMaWarningsLocal(res.data.warnings || []);
      } catch (e) { console.warn('MeteoAlarm error:', e); }
      finally { setMaLoading(false); }
    };
    load();
    const interval = setInterval(load, 600000);
    return () => clearInterval(interval);
  }, [maEnabled, maCountries, maWarningsProp]);

  // Renderuj warstwy MeteoAlarm — odświeża się przy zmianie danych LUB zoom
  // Renderuj warstwy MeteoAlarm
  // Strategia:
  //   - Zawsze rysuj kolorowe kontury ostrzeżeń (niezależnie od zoom)
  //   - Jeden marker per ostrzeżenie, nad centrum jego konturów
  //   - Przy zoom ≤5: agreguj per kraj → 1 marker nad centrum wszystkich konturów kraju
  //   - Tooltip: globalny, zarządzany ręcznie (bez bindTooltip na polygon)
  //     → eliminuje "duchy" zawieszonych tooltipów
  const renderMaLayers = useCallback(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    maLayersRef.current.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    maLayersRef.current = [];
    if (!maEnabled || maWarnings.length === 0) return;

    const zoom = map.getZoom();

    const geomToRings = (geometry) => {
      if (!geometry) return [];
      if (geometry.type === 'Polygon') return [geometry.coordinates[0].map(c => [c[1], c[0]])];
      if (geometry.type === 'MultiPolygon') return geometry.coordinates.map(poly => poly[0].map(c => [c[1], c[0]]));
      return [];
    };

    // Zbierz wszystkie ringi per ostrzeżenie (do centroidu)
    // Struktura: [{warning, rings:[...]}]
    // B9b: edytor i Status muszą pokazywać TO SAMO. Wcześniej edytor rysował
    // wszystko, co przyszło z feedu, a Status filtrował po czasie — stąd „w edytorze
    // tylko wiatr/2, w Statusie wiatr/2 i burze/2".
    const _now = Date.now(), _horizon = _now + 24 * 3600 * 1000;
    const maVisible = maWarnings.filter(w => {
      const o = w.onset ? Date.parse(w.onset) : null;
      const e = w.expires ? Date.parse(w.expires) : null;
      if (e != null && e < _now) return false;       // wygasłe
      if (o != null && o > _horizon) return false;   // dalsza przyszłość
      return true;
    });

    const withRings = maVisible.map(w => {
      const rings = [];
      if (w.geocode_geometries && w.geocode_geometries.length > 0) {
        w.geocode_geometries.forEach(gg => geomToRings(gg.geometry).forEach(r => { if (r.length >= 3) rings.push(r); }));
      } else if (w.polygon && w.polygon.length >= 3) {
        rings.push(w.polygon.map(p => [p[1], p[0]]));
      }
      return { w, rings };
    });

    // Globalny tooltip div — jeden na całą mapę, bez Leaflet bindTooltip
    let ttEl = document.getElementById('ma-global-tt');
    if (!ttEl) {
      ttEl = document.createElement('div');
      ttEl.id = 'ma-global-tt';
      ttEl.className = 'map-county-tooltip leaflet-tooltip';
      ttEl.style.cssText = 'position:fixed;z-index:9999;pointer-events:none;display:none;max-width:260px;font-size:11px;line-height:1.5;padding:6px 9px;border-radius:4px;box-shadow:0 2px 8px rgba(0,0,0,0.4);white-space:normal;word-break:break-word';
      document.body.appendChild(ttEl);
    }
    let ttTimer = null;
    const showTT = (html, e) => {
      clearTimeout(ttTimer);
      ttEl.innerHTML = html;
      ttEl.style.display = 'block';
      moveTT(e);
    };
    const moveTT = (e) => {
      const x = e.originalEvent ? e.originalEvent.clientX : e.clientX;
      const y = e.originalEvent ? e.originalEvent.clientY : e.clientY;
      ttEl.style.left = (x + 14) + 'px';
      ttEl.style.top  = (y - 10) + 'px';
    };
    const hideTT = () => {
      ttTimer = setTimeout(() => { ttEl.style.display = 'none'; }, 80);
    };
    // Cleanup przy usuwaniu warstw
    const cleanupTT = () => { clearTimeout(ttTimer); ttEl.style.display = 'none'; };

    // Narysuj kontury dla WSZYSTKICH ostrzeżeń
    withRings.forEach(({ w, rings }) => {
      const color       = MA_LEVEL_COLORS[w.level] || '#facc15';
      const borderColor = MA_COUNTRY_BORDER[w.country] || '#64748b';
      const flag        = w.country_flag || '';
      const isPolitical = w.political_caution;
      const cautionNote = isPolitical
        ? `<br/><span style="font-size:9px;opacity:0.65;color:#9ca3af">⚠ ${w.source_note || 'Dane poza MeteoAlarm/EUMETNET'}</span>` : '';
      const phenLabel   = PHENOMENON_SHORT[w.phenomenon] || w.phenomenon;
      const tooltipHtml = `${flag} <b>${w.country_name}</b><br/>${phenLabel} — Stopień ${w.level}` +
        (w.area_desc ? `<br/><span style="font-size:10px;opacity:0.8">${w.area_desc}</span>` : '') + cautionNote;

      rings.forEach((ring, ri) => {
        const poly = L.polygon(ring, {
          color: borderColor, weight: 0.9,
          fillColor: color, fillOpacity: 0.12,
          dashArray: '4,5',
        });
        poly.on('mouseover', (e) => showTT(tooltipHtml, e));
        poly.on('mousemove', (e) => moveTT(e));
        poly.on('mouseout',  ()  => hideTT());
        poly.addTo(map);
        maLayersRef.current.push(poly);
      });
    });

    // Markery: przy zoom ≤5 agreguj per kraj, inaczej 1 per ostrzeżenie
    const FALLBACK_CENTERS = {
      DE:[51.2,10.5], CZ:[49.8,15.5], SK:[48.7,19.7], LT:[55.9,23.9],
      BY:[53.7,28.0], UA:[49.0,32.0], RU_KGD:[54.7,20.5],
    };

    const makeMarker = (clat, clon, w, zoom, count = 1) => {
      const color       = MA_LEVEL_COLORS[w.level] || '#facc15';
      const borderColor = MA_COUNTRY_BORDER[w.country] || '#64748b';
      const flag        = w.country_flag || '';
      const phenIcon    = PHENOMENON_ICONS[w.phenomenon] || '⚠';
      const phenLabel   = PHENOMENON_SHORT[w.phenomenon] || w.phenomenon;
      const dotAlpha    = zoom <= 5 ? 0.65 : 0.8;
      const textColor   = w.level >= 3 ? '#fff' : '#111';
      // Kółko z emoji — rozmiar zależy od zoom
      const dotSize = zoom <= 5 ? 22 : 24;
      const fontSize = zoom <= 5 ? 13 : 14;
      const html = `
<div class="ma-wm-wrap" style="opacity:${dotAlpha}">
  <div class="ma-wm-dot" style="background:${color};border:2px solid ${borderColor};
    border-radius:50%;width:${dotSize}px;height:${dotSize}px;
    display:flex;align-items:center;justify-content:center;
    font-size:${fontSize}px;line-height:1;
    box-shadow:0 1px 5px rgba(0,0,0,0.4);
    flex-shrink:0;transition:border-radius 0.15s;
  ">${phenIcon}</div>
  <div class="ma-wm-label" style="max-width:0;overflow:hidden;opacity:0;
    background:${color};border:2px solid ${borderColor};border-left:none;
    border-radius:0 4px 4px 0;height:${dotSize}px;
    display:flex;align-items:center;font-size:10px;font-weight:700;color:${textColor};
    box-shadow:2px 1px 4px rgba(0,0,0,0.2);
    transition:max-width 0.18s,opacity 0.12s,padding 0.12s;white-space:nowrap;
  ">${flag} ${phenLabel} St.${w.level}${count > 1 ? ` (${count})` : ''}</div>
</div>`;
      const half = Math.round(dotSize / 2);
      const mi = L.marker([clat, clon], {
        icon: L.divIcon({ html, className: 'ma-wm-marker', iconAnchor: [half, half] }),
        interactive: true, zIndexOffset: 500,
      });
      const ttHtml = count > 1
        ? `${flag} <b>${w.country_name}</b><br/>${phenIcon} ${phenLabel} St.${w.level}<br/><span style="opacity:0.8">${count} ostrzeżeń w okolicy</span>`
        : `${flag} <b>${w.country_name}</b> — ${phenLabel}<br/>Stopień ${w.level}` +
          (w.area_desc ? `<br/><span style="font-size:10px;opacity:0.8">${w.area_desc}</span>` : '');
      mi.on('mouseover', (e) => showTT(ttHtml, e));
      mi.on('mousemove', (e) => moveTT(e));
      mi.on('mouseout',  ()  => hideTT());
      mi.addTo(map);
      maLayersRef.current.push(mi);
    };

    // Centroidy per ostrzeżenie (z własnych ringów, nie per kraj)
    const candidates = [];
    withRings.forEach(({ w, rings }) => {
      const flat = rings.flat();
      let clat, clon;
      if (flat.length > 0) {
        clat = flat.reduce((s, p) => s + p[0], 0) / flat.length;
        clon = flat.reduce((s, p) => s + p[1], 0) / flat.length;
      } else {
        const fb = FALLBACK_CENTERS[w.country];
        if (!fb) return;
        [clat, clon] = fb;
      }
      candidates.push({ w, clat, clon });
    });

    // Pixel-distance spatial clustering — bez zewnętrznych bibliotek.
    // Markery bliżej niż CLUSTER_PX pikseli na ekranie łączą się w jeden.
    // Klaster = najwyższy stopień w grupie; tooltip pokazuje ile zjawisk.
    // Hamburg-przymrozek i Monachium-upał daleko od siebie → 2 osobne markery. ✓
    const CLUSTER_PX = zoom <= 5 ? 40 : zoom <= 7 ? 28 : 0; // 0 = brak clusteringu

    let finalMarkers = candidates.map(c => ({ ...c, count: 1 }));
    if (CLUSTER_PX > 0 && candidates.length > 1) {
      const used = new Array(candidates.length).fill(false);
      const clusters = [];
      candidates.forEach((c, i) => {
        if (used[i]) return;
        const px = map.latLngToContainerPoint([c.clat, c.clon]);
        const group = [c];
        used[i] = true;
        candidates.forEach((c2, j) => {
          if (used[j]) return;
          const px2 = map.latLngToContainerPoint([c2.clat, c2.clon]);
          if (Math.hypot(px.x - px2.x, px.y - px2.y) < CLUSTER_PX) {
            group.push(c2); used[j] = true;
          }
        });
        const clat = group.reduce((s, x) => s + x.clat, 0) / group.length;
        const clon = group.reduce((s, x) => s + x.clon, 0) / group.length;
        const top  = group.reduce((a, b) => b.w.level > a.w.level ? b : a);
        clusters.push({ w: top.w, clat, clon, count: group.length });
      });
      finalMarkers = clusters;
    }

    // Dodge iteracyjny — przesuwa nakładające się markery aż się rozejdą
    // (max 5 iteracji żeby nie pętlić w nieskończoność)
    if (finalMarkers.length > 1) {
      const DODGE_PX = zoom <= 5 ? 26 : 22;
      const STEP = zoom <= 5 ? 0.25 : 0.18; // stopnie ~25km/18km
      for (let pass = 0; pass < 5; pass++) {
        let moved = false;
        for (let i = 0; i < finalMarkers.length; i++) {
          for (let j = 0; j < i; j++) {
            const px1 = map.latLngToContainerPoint([finalMarkers[i].clat, finalMarkers[i].clon]);
            const px2 = map.latLngToContainerPoint([finalMarkers[j].clat, finalMarkers[j].clon]);
            if (Math.hypot(px1.x - px2.x, px1.y - px2.y) < DODGE_PX) {
              // Rozsuń symetrycznie w przeciwnych kierunkach
              const angle = (i / finalMarkers.length) * 2 * Math.PI;
              finalMarkers[i] = { ...finalMarkers[i],
                clon: finalMarkers[i].clon + Math.cos(angle) * STEP,
                clat: finalMarkers[i].clat + Math.sin(angle) * STEP * 0.5,
              };
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
    }

    finalMarkers.forEach(({ w, clat, clon, count }) => makeMarker(clat, clon, w, zoom, count));


    // Wyczyść globalny tooltip gdy warstwy są usuwane
    maLayersRef.current._cleanupTT = cleanupTT;
  }, [maWarnings, maEnabled, L]);

  useEffect(() => {
    renderMaLayers();
    return () => {
      // Cleanup tooltip przy unmount/re-render
      if (maLayersRef.current._cleanupTT) maLayersRef.current._cleanupTT();
    };
  }, [renderMaLayers]);

  // Reaguj na zoom — agregacja/dezagregacja markerów MA
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;
    const onZoom = () => renderMaLayers();
    map.on('zoomend', onZoom);
    return () => map.off('zoomend', onZoom);
  }, [renderMaLayers]);



  // Draw events
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    const onCreated = async (e) => {
      drawnItems.current.clearLayers();
      drawnItems.current.addLayer(e.layer);
      setDrawMode(false);
      const latlngs = e.layer.getLatLngs()[0];
      const polygon = latlngs.map(ll => [ll.lat, ll.lng]);
      if (polygon.length > 0) polygon.push(polygon[0]);
      try {
        const res = await axios.post(`${API}/spatial/counties-in-polygon`, { polygon });
        onPolygonDrawn(polygon, res.data.counties || []);
      } catch { onPolygonDrawn(polygon, []); }
    };
    map.on(L.Draw.Event.CREATED, onCreated);
    return () => map.off(L.Draw.Event.CREATED, onCreated);
  }, [L, onPolygonDrawn]);

  const startDraw = useCallback((DrawClass) => {
    const map = leafletMap.current;
    if (!map || !L) return;
    setDrawMode(true);
    const key = DrawClass === L.Draw.Polygon ? 'polygon' : 'rectangle';
    new DrawClass(map, drawControl.current.options.draw[key]).enable();
  }, [L]);

  const selectAll = useCallback(async () => {
    // B1: „Cała Polska" nadpisuje istniejące zaznaczenie — pytamy, jeśli jest co stracić
    if (selectedCounties.length > 5 &&
        !window.confirm(`Zaznaczyć całą Polskę?\n\nObecne zaznaczenie (${selectedCounties.length} powiatów) zostanie zastąpione.\nCtrl+Z cofa.`)) {
      return;
    }
    const poly = [[55,14],[55,24.2],[49,24.2],[49,14],[55,14]];
    try {
      const res = await axios.post(`${API}/spatial/counties-in-polygon`, { polygon: poly });
      onPolygonDrawn(poly, res.data.counties || []);
    } catch (e) { console.warn(e); }
  }, [onPolygonDrawn]);

  const clearAll = useCallback(() => {
    drawnItems.current?.clearLayers();
    setDrawMode(false);
    setPickMode(false);
    onClear();
  }, [onClear]);

  // Przenoszenie ostrzeżenia na liście (góra listy = wierzch mapy)
  const moveWarn = (i, d) => {
    const ordered = orderActiveWarnings(warnings, warnOrder);
    const ids = ordered.map(w => w.id);
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    if (onWarnOrderChange) onWarnOrderChange(ids);
  };
  const _miniBtn = { background:'transparent', border:'none', color:'#7e93b0', cursor:'pointer', fontSize:8, lineHeight:'9px', padding:'0 3px' };
  const _actBtn  = { flex:1, fontSize:10, padding:'3px 6px', borderRadius:6, border:'1px solid #3b82f6',
                     background:'rgba(59,130,246,0.15)', color:'#93c5fd', cursor:'pointer' };

  return (
    <div className="map-container">
      <div ref={mapRef} className="map-leaflet" />

      {loading && (
        <div style={{
          position:'absolute',top:0,left:0,right:0,bottom:0,
          background:'rgba(6,10,18,0.75)',display:'flex',alignItems:'center',
          justifyContent:'center',zIndex:1000,flexDirection:'column',gap:12,
        }}>
          <div style={{width:32,height:32,border:'3px solid rgba(59,130,246,0.3)',
            borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
          <span style={{fontSize:13,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>
            Ładowanie granic administracyjnych…
          </span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Toolbar rysowania */}
      <div className="map-toolbar">
        <button className={`map-btn ${drawMode?'active':''}`} onClick={()=>startDraw(L?.Draw?.Polygon)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 12L5 3l4 5 3-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="2" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="5" cy="3" r="1.2" fill="currentColor"/>
            <circle cx="9" cy="8" r="1.2" fill="currentColor"/>
            <circle cx="12" cy="2" r="1.2" fill="currentColor"/>
          </svg>
          Rysuj poligon
        </button>
        <button className={`map-btn ${pickMode?'active':''}`}
          onClick={()=>setPickMode(p=>!p)}
          title={pickMode ? 'Wyłącz tryb klikania powiatów' : 'Włącz tryb klikania powiatów (zaznaczanie do edycji)'}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {pickMode ? 'Klikam powiaty…' : 'Klikaj powiaty'}
        </button>
        <button className={`map-btn ${drawMode?'active':''}`} onClick={selectAll}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 7h10M7 2v10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5"/>
          </svg>
          Cała Polska
        </button>
        {selectedCounties.length > 0 && (
          <button className="map-btn danger" onClick={clearAll}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Wyczyść ({selectedCounties.length})
          </button>
        )}
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="map-btn" onClick={() => onUndoSelection && onUndoSelection()}
            title="Cofnij zmianę zaznaczenia (Ctrl+Z)" style={{ flex: 1, justifyContent: 'center' }}>↶</button>
          <button className="map-btn" onClick={() => onRedoSelection && onRedoSelection()}
            title="Ponów (Ctrl+Shift+Z)" style={{ flex: 1, justifyContent: 'center' }}>↷</button>
        </div>
      </div>

      {/* LISTA OSTRZEŻEŃ — kolejność = warstwy mapy; klik = wyróżnienie (link z mapą) */}
      {(() => {
        const ordered = orderActiveWarnings(warnings, warnOrder);
        if (!ordered.length) return null;
        return (
          <div className="map-warnings-list" style={{ position:'absolute', left:10, top:244, zIndex:950, width:238,
            background:'rgba(13,20,33,0.93)', border:'1px solid #22344e',
            borderRadius:10, boxShadow:'0 4px 16px rgba(0,0,0,0.45)', overflow:'hidden',
            maxHeight:'46%', display:'flex', flexDirection:'column' }}>
            <div onClick={() => setWarnListOpen(o => !o)}
              style={{ padding:'6px 10px', cursor:'pointer', userSelect:'none', flexShrink:0,
                fontSize:10.5, fontWeight:700, letterSpacing:'0.06em', color:'#7e93b0',
                display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:9 }}>{warnListOpen ? '▾' : '▸'}</span>
              OSTRZEŻENIA ({ordered.length})
              <span style={{ marginLeft:'auto', fontWeight:400, fontSize:8.5, opacity:0.7 }}>góra = wierzch mapy</span>
            </div>
            {warnListOpen && (
              <div style={{ overflowY:'auto', padding:'0 6px 6px' }}>
                {ordered.map((w, i) => {
                  const hl = highlightedWarningId === w.id;
                  const color = LEVEL_COLORS[w.level] || '#facc15';
                  const canUpdate = w.is_active_leaf !== false && !w.superseded_by;
                  return (
                    <div key={w.id} style={{ marginBottom:4, borderRadius:8,
                      border: hl ? `1.5px solid ${color}` : '1px solid #22344e',
                      background: hl ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.03)' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 6px', cursor:'pointer' }}
                        onClick={() => onHighlightWarning && onHighlightWarning(hl ? null : w.id)}
                        title={hl ? 'Kliknij, by odwyróżnić' : 'Kliknij, by wyróżnić na mapie'}>
                        <span style={{ width:10, height:10, borderRadius:3, background:color, flexShrink:0,
                          border: w.status === 'pending' ? '1px dashed #fff' : 'none' }} />
                        <span style={{ fontSize:10.5, color:'#e8eef6', whiteSpace:'nowrap',
                          overflow:'hidden', textOverflow:'ellipsis', flex:1 }}>
                          St.{w.level} {PHENOMENON_SHORT[w.phenomenon] || w.phenomenon}
                          {(w.version || 1) > 1 ? ` v${w.version}` : ''}
                        </span>
                        <span style={{ fontSize:8.5, color:'#7e93b0', fontFamily:'monospace', flexShrink:0 }}>
                          {w.expires ? 'do ' + new Date(w.expires).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : ''}
                        </span>
                        <span style={{ display:'flex', flexDirection:'column', flexShrink:0 }}>
                          <button onClick={(e) => { e.stopPropagation(); moveWarn(i, -1); }} disabled={i === 0}
                            style={{ ..._miniBtn, opacity: i === 0 ? 0.25 : 1 }} title="Wyżej (bliżej wierzchu mapy)">▲</button>
                          <button onClick={(e) => { e.stopPropagation(); moveWarn(i, 1); }} disabled={i === ordered.length - 1}
                            style={{ ..._miniBtn, opacity: i === ordered.length - 1 ? 0.25 : 1 }} title="Niżej">▼</button>
                        </span>
                      </div>
                      {hl && (
                        <div style={{ display:'flex', gap:4, padding:'0 6px 6px' }}>
                          {canUpdate && onRequestEdit && (
                            <button onClick={() => onRequestEdit(w.id)} style={_actBtn}
                              title="Wczytaj do edytora jako aktualizację tego ostrzeżenia">✎ Aktualizuj</button>
                          )}
                          {onRequestCopy && (
                            <button onClick={() => onRequestCopy(w.id)} style={{ ..._actBtn, opacity:0.85 }}
                              title="Zduplikuj jako NOWE ostrzeżenie (zmień stopień/zasięg/czas i zapisz)">⧉ Kopiuj</button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {/* Toggle MeteoAlarm (prawy dół) */}
      <div style={{position:'absolute',bottom:12,right:12,zIndex:900,display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
        <button
          onClick={() => setMaEnabled(p => {
            const next = !p;
            try { localStorage.setItem('meteocap_ma_enabled', String(next)); } catch {}
            return next;
          })}
          style={{
            padding:'6px 12px', borderRadius:'var(--radius-md)',
            border:'1px solid '+(maEnabled?'var(--accent-blue)':'var(--border)'),
            background:maEnabled?'rgba(59,130,246,0.15)':'var(--bg-surface)',
            color:maEnabled?'var(--text-accent)':'var(--text-secondary)',
            fontSize:12, cursor:'pointer', fontFamily:'var(--font-display)',
            display:'flex',alignItems:'center',gap:6,boxShadow:'var(--shadow-card)',
          }}>
          {maLoading ? '⏳' : '🌍'} MeteoAlarm {maEnabled ? 'ON' : 'OFF'}
        </button>
        {maEnabled && (
          <div style={{
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-md)',padding:'6px 10px',
            display:'flex',gap:6,flexWrap:'wrap',maxWidth:200,
            boxShadow:'var(--shadow-card)',
          }}>
            {['DE','CZ','SK','UA','LT','RU_KGD','BY'].map(cc => {
              const flags = {DE:'🇩🇪',CZ:'🇨🇿',SK:'🇸🇰',UA:'🇺🇦',LT:'🇱🇹',RU_KGD:'🇷🇺',BY:'🇧🇾'};
              const caution = ['RU_KGD','BY'].includes(cc);  // dane spoza MeteoAlarm/EUMETNET
              const active = maCountries.includes(cc);
              return (
                <button key={cc}
                  onClick={() => setMaCountries(prev => {
                    const next = active ? prev.filter(c=>c!==cc) : [...prev,cc];
                    try { localStorage.setItem('meteocap_ma_countries', JSON.stringify(next)); } catch {}
                    return next;
                  })}
                  title={caution
                    ? `${cc} — dane poglądowe spoza MeteoAlarm/EUMETNET. Traktuj z ostrożnością.`
                    : cc}
                  style={{
                    padding:'2px 7px',borderRadius:4,fontSize:11,cursor:'pointer',
                    border:`1px solid ${caution
                      ? (active ? '#9ca3af' : 'var(--border)')
                      : (active ? MA_COUNTRY_BORDER[cc]||'var(--accent-blue)' : 'var(--border)')}`,
                    background: active
                      ? (caution ? 'rgba(156,163,175,0.15)' : `${MA_COUNTRY_BORDER[cc]}22`)
                      : 'var(--bg-elevated)',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    opacity: caution ? 0.85 : 1,
                  }}>
                  {flags[cc]} {cc === 'RU_KGD' ? 'RU-KGD' : cc}
                  {caution && <span style={{marginLeft:3,fontSize:8,opacity:0.7}}>⚠</span>}
                </button>
              );
            })}
            <div style={{width:'100%',fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              {maWarnings.length} ostrzeżeń · cache 10min
            </div>
            {maCountries.some(c => ['RU_KGD','BY'].includes(c)) && (
              <div style={{width:'100%',fontSize:9,color:'var(--text-muted)',
                padding:'3px 0',borderTop:'1px solid var(--border)',lineHeight:1.4}}>
                ⚠ RU/BY — dane poglądowe, poza MeteoAlarm/EUMETNET
              </div>
            )}
          </div>
        )}
      </div>

      {/* Picker podkładu (lewy dół) */}
      <div style={{position:'absolute',bottom:12,left:12,zIndex:900}}>
        <button className="map-btn" onClick={()=>setShowPicker(p=>!p)} style={{gap:6}}>
          <span style={{fontSize:14}}>{TILE_LAYERS.find(t=>t.id===activeBase)?.icon||'🗺'}</span>
          Podkład
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d={showPicker?"M1 5l4-4 4 4":"M1 1l4 4 4-4"} stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
        {showPicker && (
          <div style={{
            position:'absolute',bottom:'100%',left:0,marginBottom:6,
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',padding:6,
            display:'flex',flexDirection:'column',gap:4,
            boxShadow:'var(--shadow-panel)',minWidth:165,
          }}>
            {TILE_LAYERS.map(t => (
              <button key={t.id} onClick={()=>{setActiveBase(t.id);setShowPicker(false);}}
                style={{
                  display:'flex',alignItems:'center',gap:8,padding:'6px 10px',
                  borderRadius:'var(--radius-md)',
                  border:'1px solid '+(activeBase===t.id?'var(--accent-blue)':'transparent'),
                  background:activeBase===t.id?'rgba(59,130,246,0.1)':'transparent',
                  color:activeBase===t.id?'var(--text-accent)':'var(--text-secondary)',
                  fontSize:12,cursor:'pointer',fontFamily:'var(--font-display)',
                  textAlign:'left',width:'100%',
                }}>
                <span style={{fontSize:16}}>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
