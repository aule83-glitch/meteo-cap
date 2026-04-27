import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const VOIV_STYLE  = { color: 'rgba(59,130,246,0.8)', fillColor: 'transparent', fillOpacity: 0, weight: 1.8 };
const COUNTY_STYLE= { color: 'rgba(59,130,246,0.3)', fillColor: 'rgba(59,130,246,0.03)', fillOpacity: 1, weight: 0.6 };
const SEL_STYLE   = { color: '#facc15', fillColor: 'rgba(250,204,21,0.22)', fillOpacity: 1, weight: 1.8 };
const POLY_STYLE  = { color: '#06b6d4', fillColor: 'rgba(6,182,212,0.1)', fillOpacity: 1, weight: 2 };
const WARN_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };

const TILE_LAYERS = [
  {
    id: 'dark',
    label: 'Ciemna',
    icon: '🌑',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '© CARTO © OSM',
  },
  {
    id: 'osm',
    label: 'OSM',
    icon: '🗺',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'topo',
    label: 'Topografia',
    icon: '⛰',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© OpenTopoMap © OSM',
  },
  {
    id: 'satellite',
    label: 'Satelita',
    icon: '🛰',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri © DigitalGlobe',
    maxZoom: 18,
    subdomains: false,
  },
  {
    id: 'relief',
    label: 'Hipsometria',
    icon: '🏔',
    url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri',
    subdomains: false,
  },
  {
    id: 'dark_topo',
    label: 'Ciemna + topo',
    icon: '🌒',
    url: null,  // kombinacja dwóch warstw
    layers: [
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}',
    ],
    blendMode: true,
    attribution: '© CARTO © Esri',
  },
];

export default function MapPanel({ onPolygonDrawn, selectedCounties, warnings, onClear }) {
  const mapRef       = useRef(null);
  const leafletMap   = useRef(null);
  const drawnItems   = useRef(null);
  const drawControl  = useRef(null);
  const countyLayers = useRef({});
  const voivLayer    = useRef(null);
  const countyLayer  = useRef(null);
  const warnLayers   = useRef([]);
  const tileLayerRef = useRef(null);
  const tileLayer2Ref= useRef(null);
  const allCounties  = useRef([]);

  const [drawMode,    setDrawMode]    = useState(false);
  const [loading,     setLoading]     = useState(true);
  const [activeBase,  setActiveBase]  = useState('dark');
  const [showBasePicker, setShowBasePicker] = useState(false);
  const [L, setL] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const leaflet = await import('leaflet');
      await import('leaflet-draw');
      if (alive) setL(leaflet.default || leaflet);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current, {
      center: [52.1, 19.4], zoom: 6,
      zoomControl: true, attributionControl: false,
    });
    L.control.attribution({ prefix: false })
      .addAttribution('© CARTO © OSM © Esri')
      .addTo(map);

    // Domyślna warstwa
    const def = TILE_LAYERS[0];
    tileLayerRef.current = L.tileLayer(def.url, { maxZoom: 19 }).addTo(map);

    drawnItems.current = new L.FeatureGroup().addTo(map);
    const dc = new L.Control.Draw({
      draw: {
        polygon:   { allowIntersection: false, shapeOptions: POLY_STYLE },
        rectangle: { shapeOptions: POLY_STYLE },
        circle: false, circlemarker: false, marker: false, polyline: false,
      },
      edit: { featureGroup: drawnItems.current },
    });
    map.addControl(dc);
    drawControl.current = dc;
    setTimeout(() => {
      const t = document.querySelector('.leaflet-draw');
      if (t) t.style.display = 'none';
    }, 100);

    leafletMap.current = map;
    loadLayers(map, L);
  }, [L]);

  // Zmiana podkładu
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    const cfg = TILE_LAYERS.find(t => t.id === activeBase);
    if (!cfg) return;

    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    if (tileLayer2Ref.current) { map.removeLayer(tileLayer2Ref.current); tileLayer2Ref.current = null; }

    if (cfg.blendMode && cfg.layers) {
      // Ciemna + topo: hipsometria z opacity
      tileLayerRef.current = L.tileLayer(cfg.layers[0], { maxZoom: 19, opacity: 1 }).addTo(map);
      tileLayer2Ref.current = L.tileLayer(cfg.layers[1], { maxZoom: 18, opacity: 0.35 }).addTo(map);
    } else {
      const opts = { maxZoom: cfg.maxZoom || 19 };
      if (cfg.subdomains === false) opts.subdomains = '';
      tileLayerRef.current = L.tileLayer(cfg.url, opts).addTo(map);
    }

    // Warstwy wektorowe zawsze na wierzchu
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
      allCounties.current = centRes.data.counties || [];

      countyLayer.current = L.geoJSON(powRes.data, {
        style: COUNTY_STYLE,
        onEachFeature: (feature, layer) => {
          countyLayers.current[feature.properties.id] = layer;
          layer.bindTooltip(
            `<b>${feature.properties.name}</b><br><span style="opacity:.7;font-size:10px">${feature.properties.voiv_name}</span>`,
            { className: 'map-county-tooltip', sticky: true }
          );
        },
      }).addTo(map);

      voivLayer.current = L.geoJSON(voivRes.data, {
        style: VOIV_STYLE,
        interactive: false,
      }).addTo(map);

    } catch (e) {
      console.warn('Błąd ładowania warstw:', e);
    } finally {
      setLoading(false);
    }
  };

  // Podświetlenie zaznaczonych powiatów
  useEffect(() => {
    Object.values(countyLayers.current).forEach(l => l.setStyle(COUNTY_STYLE));
    selectedCounties.forEach(c => {
      const l = countyLayers.current[c.id];
      if (l) l.setStyle(SEL_STYLE);
    });
  }, [selectedCounties]);

  // Ostrzeżenia
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    warnLayers.current.forEach(l => map.removeLayer(l));
    warnLayers.current = [];
    warnings.forEach(w => {
      (w.counties || []).forEach(c => {
        const color = WARN_COLORS[w.level] || '#4a5a78';
        const m = L.circleMarker([c.lat, c.lon], {
          radius: 6, color, fillColor: color, fillOpacity: 0.5, weight: 2,
        });
        m.bindTooltip(`Stopień ${w.level} — ${c.name}`, { className: 'map-county-tooltip' });
        m.addTo(map);
        warnLayers.current.push(m);
      });
    });
  }, [warnings, L]);

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

  const startDraw = useCallback((Type) => {
    const map = leafletMap.current;
    if (!map || !L) return;
    setDrawMode(true);
    new Type(map, drawControl.current.options.draw[
      Type === L.Draw.Polygon ? 'polygon' : 'rectangle'
    ]).enable();
  }, [L]);

  const selectAll = useCallback(async () => {
    const polygon = [[55.0,14.0],[55.0,24.2],[49.0,24.2],[49.0,14.0],[55.0,14.0]];
    try {
      const res = await axios.post(`${API}/spatial/counties-in-polygon`, { polygon });
      onPolygonDrawn(polygon, res.data.counties || []);
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
          justifyContent:'center',zIndex:1000,flexDirection:'column',gap:12
        }}>
          <div style={{width:32,height:32,border:'3px solid rgba(59,130,246,0.3)',
            borderTopColor:'#3b82f6',borderRadius:'50%',animation:'spin 1s linear infinite'}}/>
          <span style={{fontSize:13,color:'var(--text-secondary)',fontFamily:'var(--font-mono)'}}>
            Ładowanie granic administracyjnych…
          </span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <div className="map-toolbar">
        <button className={`map-btn ${drawMode?'active':''}`}
          onClick={() => startDraw(L?.Draw?.Polygon)}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 12L5 3l4 5 3-6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="2" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="5" cy="3" r="1.2" fill="currentColor"/>
            <circle cx="9" cy="8" r="1.2" fill="currentColor"/>
            <circle cx="12" cy="2" r="1.2" fill="currentColor"/>
          </svg>
          Rysuj poligon
        </button>
        <button className={`map-btn ${drawMode?'active':''}`}
          onClick={() => startDraw(L?.Draw?.Rectangle)}>
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

      {/* Picker podkładów mapowych */}
      <div style={{ position:'absolute', bottom:12, left:12, zIndex:900 }}>
        <button
          className="map-btn"
          onClick={() => setShowBasePicker(p => !p)}
          style={{ gap: 6 }}
        >
          <span style={{ fontSize: 14 }}>
            {TILE_LAYERS.find(t => t.id === activeBase)?.icon || '🗺'}
          </span>
          Podkład
          <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
            <path d={showBasePicker ? "M1 5l4-4 4 4" : "M1 1l4 4 4-4"}
              stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>

        {showBasePicker && (
          <div style={{
            position:'absolute', bottom:'100%', left:0, marginBottom:6,
            background:'var(--bg-surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', padding:6,
            display:'flex', flexDirection:'column', gap:4,
            boxShadow:'var(--shadow-panel)', minWidth:160,
          }}>
            {TILE_LAYERS.map(t => (
              <button key={t.id}
                onClick={() => { setActiveBase(t.id); setShowBasePicker(false); }}
                style={{
                  display:'flex', alignItems:'center', gap:8,
                  padding:'6px 10px', borderRadius:'var(--radius-md)',
                  border:'1px solid ' + (activeBase===t.id ? 'var(--accent-blue)' : 'transparent'),
                  background: activeBase===t.id ? 'rgba(59,130,246,0.1)' : 'transparent',
                  color: activeBase===t.id ? 'var(--text-accent)' : 'var(--text-secondary)',
                  fontSize:12, cursor:'pointer', fontFamily:'var(--font-display)',
                  textAlign:'left', width:'100%',
                }}
              >
                <span style={{ fontSize:16 }}>{t.icon}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
