import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';
import { getMapState, setMapState, saveMapPosition } from '../../utils/mapState';

const MA_LEVEL_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const MA_COUNTRY_BORDER = { DE:'#3b82f6', CZ:'#22c55e', SK:'#a78bfa', UA:'#fbbf24', LT:'#fb923c', BY:'#f43f5e' };

const API = import.meta.env.VITE_API_URL || '/api';

const VOIV_STYLE   = { color: 'rgba(59,130,246,0.8)', fillColor: 'transparent', fillOpacity: 0, weight: 1.8 };
const COUNTY_STYLE = { color: 'rgba(59,130,246,0.25)', fillColor: 'rgba(59,130,246,0.03)', fillOpacity: 1, weight: 0.6 };
const SEL_STYLE    = { color: '#38bdf8', fillColor: 'rgba(56,189,248,0.25)', fillOpacity: 1, weight: 2.0 };
const POLY_STYLE   = { color: '#06b6d4', fillColor: 'rgba(6,182,212,0.1)', fillOpacity: 1, weight: 2 };
const HIGHLIGHT_STYLE = { color: '#a78bfa', fillColor: 'rgba(167,139,250,0.2)', fillOpacity: 1, weight: 2.5 };

const LEVEL_COLORS  = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const LEVEL_BORDERS = { 1: '#b8960a', 2: '#c45f00', 3: '#9a0000' };

// Convex hull — obrys zewnętrzny grupy centroidów [[lat,lon],...]
function convexHull(pts) {
  if (pts.length < 3) return pts;
  const cross = (O, A, B) =>
    (A[0]-O[0])*(B[1]-O[1]) - (A[1]-O[1])*(B[0]-O[0]);
  const sorted = [...pts].sort((a,b) => a[0]-b[0] || a[1]-b[1]);
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0)
      lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = sorted.length-1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0)
      upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0,-1), ...upper.slice(0,-1)];
}

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
  highlightedWarningId,   // ID ostrzeżenia do podświetlenia (z historii/edytora)
  showWarningLabels = true,
}) {
  const mapRef       = useRef(null);
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
  const [loading,      setLoading]      = useState(true);
  const [layersLoaded, setLayersLoaded] = useState(false);
  const [activeBase, setActiveBase] = useState(getMapState().tileLayerId);
  const [showPicker, setShowPicker] = useState(false);
  const [L, setL] = useState(null);
  const [maEnabled, setMaEnabled]       = useState(false);   // warstwa MeteoAlarm
  const [maCountries, setMaCountries]   = useState(['DE','CZ','SK']);
  const [maWarnings, setMaWarnings]     = useState([]);
  const [maLoading, setMaLoading]       = useState(false);
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
          layer.bindTooltip(
            `<b>${feature.properties.name}</b><br><span style="opacity:.7;font-size:10px">${feature.properties.voiv_name}</span>`,
            { className: 'map-county-tooltip', sticky: true }
          );
          layer.on('click', () => { if (onCountyToggle) onCountyToggle(feature.properties); });
        },
      }).addTo(map);
      voivLayer.current = L.geoJSON(voivRes.data, { style: VOIV_STYLE, interactive: false }).addTo(map);
    } catch (e) { console.warn('Błąd ładowania warstw:', e); }
    finally { setLoading(false); setLayersLoaded(true); }
  };

  // Podświetl zaznaczone powiaty (cyjan) — nie kasuje kolorów ostrzeżeń
  useEffect(() => {
    // Dla każdego powiatu: przywróć kolor ostrzeżenia lub bazowy
    Object.keys(countyLayers.current).forEach(countyId => {
      const layer = countyLayers.current[countyId];
      if (!layer) return;
      const activeWarning = warnings
        .filter(w => w.status === 'active' || w.status === 'pending')
        .find(w => (w.counties || []).some(c => String(c.id) === String(countyId)));
      if (activeWarning) {
        const color = LEVEL_COLORS[activeWarning.level] || '#facc15';
        const isDashed = activeWarning.status === 'pending';
        layer.setStyle({
          color, fillColor: color, fillOpacity: 0.35,
          weight: isDashed ? 1.5 : 2, dashArray: isDashed ? '6,4' : null,
        });
      } else {
        layer.setStyle(COUNTY_STYLE);
      }
    });
    // Nałóż cyjan na zaznaczone
    selectedCounties.forEach(c => {
      const l = countyLayers.current[c.id];
      if (l) l.setStyle(SEL_STYLE);
    });
  }, [selectedCounties, warnings]);

  // Podświetl ostrzeżenie z historii/edytora
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    hlLayers.current.forEach(l => map.removeLayer(l));
    hlLayers.current = [];
    if (!highlightedWarningId) return;
    const w = warnings.find(x => x.id === highlightedWarningId);
    if (!w) return;
    (w.counties || []).forEach(c => {
      const layer = countyLayers.current[c.id];
      if (layer) {
        layer.setStyle(HIGHLIGHT_STYLE);
        hlLayers.current.push({ restore: () => layer.setStyle(COUNTY_STYLE) });
      }
    });
  }, [highlightedWarningId, warnings, L]);

  // Agregowane labele i markery ostrzeżeń
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    // Usuń stare markery (labele)
    warnLayers.current.forEach(l => { try { map.removeLayer(l); } catch (e) {} });
    warnLayers.current = [];

    // Reset wszystkich powiatów do bazowego stylu
    Object.values(countyLayers.current).forEach(l => l.setStyle(COUNTY_STYLE));

    warnings
      .filter(w => w.status === 'active' || w.status === 'pending')
      .forEach(w => {
        const color    = LEVEL_COLORS[w.level] || '#facc15';
        const icon     = PHENOMENON_ICONS[w.phenomenon] || '⚠';
        const label    = PHENOMENON_SHORT[w.phenomenon] || w.phenomenon;
        const counties = w.counties || [];
        const isDashed = w.status === 'pending';

        // Koloruj poligony powiatów
        const borderColor = LEVEL_BORDERS[w.level] || color;
        counties.forEach(c => {
          const layer = countyLayers.current[c.id];
          if (layer) {
            layer.setStyle({
              color: borderColor,
              fillColor: color,
              fillOpacity: 0.38,
              weight: isDashed ? 1.5 : 2.5,
              dashArray: isDashed ? '6,4' : null,
            });
          }
        });

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
            background:${color};color:#000;border:2.5px solid ${LEVEL_BORDERS[w.level]||color};
            border-radius:7px;padding:4px 8px;font-size:11px;font-weight:700;
            white-space:nowrap;box-shadow:0 2px 10px rgba(0,0,0,0.45);
            display:flex;flex-direction:column;align-items:flex-start;gap:1px;
            opacity:${isDashed?'0.82':'1'};min-width:90px;
          ">
            <div style="display:flex;align-items:center;gap:5px">
              <span style="font-size:17px;line-height:1">${icon}</span>
              <span>St.${w.level} ${label}</span>
              <span style="font-size:9px;opacity:0.7">${statusDot}</span>
            </div>
            <div style="font-size:9px;opacity:0.8;font-weight:500;letter-spacing:0.01em">
              do ${expiresStr}
            </div>
          </div>`;

        const marker = L.marker([clat, clon], {
          icon: L.divIcon({ html: divHtml, className: '', iconAnchor: [0, 0] }),
          zIndexOffset: 400, interactive: true,
        });
        marker.bindTooltip(
          `<b>${icon} ${label}</b> — Stopień ${w.level}<br>` +
          `${counties.length} powiat${counties.length===1?'':counties.length<5?'y':'ów'}<br>` +
          `<small>Od: ${onsetStr}<br>Do: ${expiresStr}</small>`,
          { className: 'map-county-tooltip' }
        );
        marker.addTo(map);
        warnLayers.current.push(marker);

        // Obrys całego obszaru ostrzeżenia — convex hull centroidów
        if (lats.length >= 3) {
          const pts = lats.map((lat,i) => [lat, lons[i]]);
          const hull = convexHull(pts);
          if (hull.length >= 3) {
            const outline = L.polygon(hull, {
              color: LEVEL_BORDERS[w.level] || color,
              fillColor: 'transparent',
              fillOpacity: 0,
              weight: 3,
              dashArray: isDashed ? '8,5' : null,
              opacity: 0.85,
              smoothFactor: 1.5,
            });
            outline.addTo(map);
            warnLayers.current.push(outline);
          }
        }
      });

    // Przywróć cyjan dla zaznaczonych powiatów edycji (priorytet nad kolorem ostrzeżenia)
    selectedCounties.forEach(c => {
      const l = countyLayers.current[c.id];
      if (l) l.setStyle(SEL_STYLE);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warnings, showWarningLabels, L, layersLoaded]);

  // MeteoAlarm — ładuj gdy włączone
  useEffect(() => {
    if (!maEnabled) {
      setMaWarnings([]);
      return;
    }
    const load = async () => {
      setMaLoading(true);
      try {
        const res = await axios.get(`${API}/meteoalarm/warnings?countries=${maCountries.join(',')}`);
        setMaWarnings(res.data.warnings || []);
      } catch (e) { console.warn('MeteoAlarm error:', e); }
      finally { setMaLoading(false); }
    };
    load();
    const interval = setInterval(load, 600000); // odśwież co 10 min
    return () => clearInterval(interval);
  }, [maEnabled, maCountries]);

  // Renderuj warstwy MeteoAlarm
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    maLayersRef.current.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
    maLayersRef.current = [];
    if (!maEnabled || maWarnings.length === 0) return;

    // Konwertuj geometry GeoJSON (Polygon / MultiPolygon) → tablica ringów [[lat,lon],…]
    const geomToRings = (geometry) => {
      if (!geometry) return [];
      if (geometry.type === 'Polygon') {
        return [geometry.coordinates[0].map(c => [c[1], c[0]])];
      }
      if (geometry.type === 'MultiPolygon') {
        return geometry.coordinates.map(poly => poly[0].map(c => [c[1], c[0]]));
      }
      return [];
    };

    maWarnings.forEach(w => {
      const color       = MA_LEVEL_COLORS[w.level] || '#facc15';
      const borderColor = MA_COUNTRY_BORDER[w.country] || '#64748b';
      const flag        = w.country_flag || '';
      const tooltipBase = `${flag} <b>${w.country_name}</b><br/>${w.event || w.phenomenon}<br/>Stopień ${w.level}`;

      const allRings = [];   // wszystkie ringi tego ostrzeżenia (do centroidu labela)

      if (w.geocode_geometries && w.geocode_geometries.length > 0) {
        // Preferuj precyzyjne granice powiatów z lookupowego pliku (EMMA_ID)
        w.geocode_geometries.forEach(gg => {
          const rings = geomToRings(gg.geometry);
          rings.forEach(ring => {
            if (ring.length < 3) return;
            const poly = L.polygon(ring, {
              color: borderColor, weight: 1.2,
              fillColor: color, fillOpacity: 0.18,
              dashArray: '5,4',
            });
            poly.bindTooltip(
              `${tooltipBase}<br/><span style="font-size:10px;opacity:0.8">${gg.name}</span>`,
              { className: 'map-county-tooltip' }
            );
            poly.addTo(map);
            maLayersRef.current.push(poly);
            allRings.push(...ring);
          });
        });

      } else if (w.polygon && w.polygon.length >= 3) {
        // Fallback: polygon bezpośrednio z feed (DWD, niektóre kraje)
        const ring = w.polygon.map(p => [p[1], p[0]]);
        const poly = L.polygon(ring, {
          color: borderColor, weight: 1.5,
          fillColor: color, fillOpacity: 0.15,
          dashArray: '5,4',
        });
        poly.bindTooltip(
          `${tooltipBase}<br/><span style="font-size:10px;opacity:0.8">${w.area_desc || ''}</span>`,
          { className: 'map-county-tooltip' }
        );
        poly.addTo(map);
        maLayersRef.current.push(poly);
        allRings.push(...ring);

      } else {
        // Ostatni fallback: marker w centrum kraju
        const CENTERS = { DE:[51.2,10.5], CZ:[49.8,15.5], SK:[48.7,19.7], LT:[55.9,23.9], BY:[53.7,28.0], UA:[49.0,32.0] };
        const center = CENTERS[w.country];
        if (center) {
          const icon = L.divIcon({
            html: `<div style="background:${color};border:2px solid ${borderColor};border-radius:4px;padding:3px 7px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${flag} St.${w.level}</div>`,
            className: '', iconAnchor: [0, 0],
          });
          const mi = L.marker(center, { icon, interactive: true });
          mi.bindTooltip(`${tooltipBase}<br/><span style="font-size:10px;opacity:0.8">${w.area_desc || ''}</span>`, { className: 'map-county-tooltip' });
          mi.addTo(map);
          maLayersRef.current.push(mi);
        }
        return; // brak geometrii → nie dodajemy dodatkowego labela
      }

      // Jeden label per ostrzeżenie — centroid wszystkich jego geometrii
      if (allRings.length > 0) {
        const clat = allRings.reduce((s, p) => s + p[0], 0) / allRings.length;
        const clon = allRings.reduce((s, p) => s + p[1], 0) / allRings.length;
        const labelHtml = `<div style="background:${color};border:2px solid ${borderColor};border-radius:4px;padding:2px 7px;font-size:10px;font-weight:700;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.4);pointer-events:none">${flag} St.${w.level}</div>`;
        const mi = L.marker([clat, clon], {
          icon: L.divIcon({ html: labelHtml, className: '', iconAnchor: [0, 0] }),
          interactive: false, zIndexOffset: 500,
        });
        mi.addTo(map);
        maLayersRef.current.push(mi);
      }
    });
  }, [maWarnings, maEnabled, L]);

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
    const poly = [[55,14],[55,24.2],[49,24.2],[49,14],[55,14]];
    try {
      const res = await axios.post(`${API}/spatial/counties-in-polygon`, { polygon: poly });
      onPolygonDrawn(poly, res.data.counties || []);
    } catch (e) { console.warn(e); }
  }, [onPolygonDrawn]);

  const clearAll = useCallback(() => {
    drawnItems.current?.clearLayers();
    setDrawMode(false);
    onClear();
  }, [onClear]);

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
        <button className={`map-btn ${drawMode?'active':''}`} onClick={()=>startDraw(L?.Draw?.Rectangle)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          Rysuj prostokąt
        </button>
        <button className="map-btn" onClick={selectAll}>
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
      </div>

      {/* Toggle MeteoAlarm (prawy dół) */}
      <div style={{position:'absolute',bottom:12,right:12,zIndex:900,display:'flex',flexDirection:'column',gap:6,alignItems:'flex-end'}}>
        <button
          onClick={() => setMaEnabled(p=>!p)}
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
            {['DE','CZ','SK','UA','LT','BY'].map(cc => {
              const flags = {DE:'🇩🇪',CZ:'🇨🇿',SK:'🇸🇰',UA:'🇺🇦',LT:'🇱🇹',BY:'🇧🇾'};
              const active = maCountries.includes(cc);
              return (
                <button key={cc}
                  onClick={() => setMaCountries(prev => active ? prev.filter(c=>c!==cc) : [...prev,cc])}
                  style={{
                    padding:'2px 7px',borderRadius:4,fontSize:11,cursor:'pointer',
                    border:'1px solid '+(active?MA_COUNTRY_BORDER[cc]||'var(--accent-blue)':'var(--border)'),
                    background:active?`${MA_COUNTRY_BORDER[cc]}22`:'var(--bg-elevated)',
                    color:active?'var(--text-primary)':'var(--text-muted)',
                  }}>
                  {flags[cc]} {cc}
                </button>
              );
            })}
            <div style={{width:'100%',fontSize:9,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              {maWarnings.length} ostrzeżeń · cache 10min
            </div>
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
