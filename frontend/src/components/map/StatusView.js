import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUS_COLORS = {
  active:    { bg: '#ef4444', border: '#ef4444', label: 'Aktywne' },
  pending:   { bg: '#3b82f6', border: '#3b82f6', label: 'Nadchodzące' },
  expired:   { bg: '#4a5a78', border: '#4a5a78', label: 'Wygasłe' },
  cancelled: { bg: '#6b7280', border: '#6b7280', label: 'Anulowane' },
  updated:   { bg: '#8b5cf6', border: '#8b5cf6', label: 'Zaktualizowane' },
};

const LEVEL_COLORS  = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const LEVEL_BORDERS = { 1: '#b8960a', 2: '#c45f00', 3: '#9a0000' };

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

const PHENOMENON_LABELS_SHORT = {
  burze: 'Burze',
  intensywne_opady_deszczu: 'Opady deszczu',
  intensywne_opady_sniegu: 'Opady śniegu',
  silny_wiatr: 'Silny wiatr',
  silny_mroz: 'Silny mróz',
  upal: 'Upał',
  opady_marzniece: 'Opady marznące',
  roztopy: 'Roztopy',
  silny_deszcz_z_burzami: 'Deszcz z burzami',
  zawieje_zamiecie: 'Zawieje',
  mgla_szadz: 'Mgła+szadź',
  gesta_mgla: 'Gęsta mgła',
  oblodzenie: 'Oblodzenie',
  opady_sniegu: 'Opady śniegu',
  przymrozki: 'Przymrozki',
};

export default function StatusView({ warnings, onRefresh }) {
  const [phenomenaConfig, setPhenomenaConfig] = useState({});
  const [labelMode, setLabelMode] = useState('icon'); // icon | text | both
  const [filterStatus, setFilterStatus] = useState('all'); // all | active | pending
  const [selectedWarning, setSelectedWarning] = useState(null);
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const markersRef = useRef([]);
  const countyLayers = useRef({});
  const [L, setL] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [layersLoaded, setLayersLoaded] = useState(false);

  useEffect(() => {
    axios.get(`${API}/phenomena/config`)
      .then(r => setPhenomenaConfig(r.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    import('leaflet').then(leaflet => {
      if (alive) setL(leaflet.default || leaflet);
    });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!L || !mapRef.current || leafletMap.current) return;
    const map = L.map(mapRef.current, {
      center: [52.1, 19.4], zoom: 6,
      zoomControl: true, attributionControl: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }).addTo(map);
    L.control.attribution({ prefix: false })
      .addAttribution('© CARTO © OSM').addTo(map);
    leafletMap.current = map;

    // Załaduj GeoJSON powiatów (potrzebne do kolorowania poligonów)
    axios.get(`${API}/counties/geojson`).then(res => {
      L.geoJSON(res.data, {
        style: { color: 'rgba(59,130,246,0.2)', fillColor: 'rgba(59,130,246,0.02)', fillOpacity: 1, weight: 0.5 },
        onEachFeature: (feature, layer) => {
          countyLayers.current[feature.properties.id] = layer;
        },
      }).addTo(map);
      setLayersLoaded(true);
    }).catch(() => {});
  }, [L]);

  // Renderuj ostrzeżenia — koloruje poligony powiatów
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L || !layersLoaded) return;  // czekaj na GeoJSON

    markersRef.current.forEach(m => { try { map.removeLayer(m); } catch(e) {} });
    markersRef.current = [];

    // Reset poligonów do bazowego stylu
    Object.values(countyLayers.current).forEach(l => l.setStyle({
      color: 'rgba(59,130,246,0.2)', fillColor: 'rgba(59,130,246,0.02)', fillOpacity: 1, weight: 0.5,
    }));

    const filtered = warnings.filter(w =>
      filterStatus === 'all' ? true : w.status === filterStatus
    );

    filtered.forEach(warning => {
      const lvlColor = LEVEL_COLORS[warning.level] || '#facc15';
      const icon  = phenomenaConfig[warning.phenomenon]?.icon || '⚠';
      const label = PHENOMENON_LABELS_SHORT[warning.phenomenon] || warning.phenomenon;
      const counties = warning.counties || [];
      const isDashed = warning.status === 'pending';

      // Koloruj poligony powiatów
      counties.forEach(c => {
        const layer = countyLayers.current[c.id];
        if (layer) {
          const borderColor = LEVEL_BORDERS[warning.level] || lvlColor;
          layer.setStyle({
            color: borderColor, fillColor: lvlColor, fillOpacity: 0.38,
            weight: isDashed ? 1.5 : 2.5, dashArray: isDashed ? '6,4' : null,
          });
          layer.bindTooltip(
            `<b>${icon} ${label}</b> — stopień ${warning.level}<br><span style="opacity:.8">${c.name} (${c.voiv_name})</span>`,
            { className: 'map-county-tooltip' }
          );
          layer.on('click', () => setSelectedWarning(warning));
        }
      });

      // Jeden label per ostrzeżenie
      const lats = counties.map(c => c.lat).filter(Boolean);
      const lons = counties.map(c => c.lon).filter(Boolean);
      if (!lats.length) return;
      const clat = lats.reduce((a,b)=>a+b,0)/lats.length;
      const clon = lons.reduce((a,b)=>a+b,0)/lons.length;

      let iconHtml = '';
      if (labelMode === 'icon') {
        iconHtml = `<div style="font-size:26px;line-height:1;filter:drop-shadow(0 0 5px ${lvlColor})">${icon}</div>`;
      } else if (labelMode === 'text') {
        iconHtml = `<div style="background:${lvlColor};color:#000;font-size:10px;font-weight:700;padding:3px 7px;border-radius:4px;white-space:nowrap">${label} ${warning.level}°</div>`;
      } else {
        iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:2px"><div style="font-size:22px;filter:drop-shadow(0 0 5px ${lvlColor})">${icon}</div><div style="background:${lvlColor};color:#000;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;white-space:nowrap">${label} ${warning.level}°</div></div>`;
      }

      const marker = L.marker([clat, clon], {
        icon: L.divIcon({ html: iconHtml, iconSize: null, className: '', iconAnchor: [0, 0] }),
        zIndexOffset: 400, interactive: false,
      });
      marker.addTo(map);
      markersRef.current.push(marker);

      // Obrys zewnętrzny grupy powiatów — convex hull centroidów
      if (lats.length >= 3) {
        const pts = lats.map((lat,i) => [lat, lons[i]]);
        const hull = convexHull(pts);
        if (hull.length >= 3) {
          const outline = L.polygon(hull, {
            color: LEVEL_BORDERS[warning.level] || lvlColor,
            fillColor: 'transparent',
            fillOpacity: 0,
            weight: 3,
            dashArray: isDashed ? '8,5' : null,
            opacity: 0.85,
            smoothFactor: 1.5,
          });
          outline.addTo(map);
          markersRef.current.push(outline);
        }
      }
    });
  }, [warnings, labelMode, filterStatus, phenomenaConfig, L, layersLoaded]);

  const handleExportPNG = useCallback(async () => {
    setExporting(true);
    try {
      const map = leafletMap.current;
      if (!map) return;

      // Dopasuj widok do granic Polski i poczekaj na re-render
      const polandBounds = [[49.0, 14.1], [54.9, 24.2]];
      map.fitBounds(polandBounds, { padding: [20, 20], animate: false });
      await new Promise(r => setTimeout(r, 600));

      const container = map.getContainer();
      const w = container.offsetWidth;
      const h = container.offsetHeight;

      const filtered = warnings.filter(ww =>
        filterStatus === 'all' || ww.status === filterStatus
      );

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
      svgContent += `<rect width="${w}" height="${h}" fill="#060a12"/>`;
      svgContent += `<text x="10" y="18" fill="#8ca0c0" font-size="10" font-family="monospace">MeteoCAP — Mapa ostrzeżeń © IMGW-PIB | © CARTO © OSM</text>`;

      // Rysuj poligony powiatów
      Object.entries(countyLayers.current).forEach(([countyId, layer]) => {
        try {
          const latlngs = layer.getLatLngs();
          if (!latlngs || !latlngs[0]) return;
          const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;

          // Sprawdź czy powiat należy do ostrzeżenia
          const warn = filtered.find(ww =>
            (ww.counties || []).some(c => String(c.id) === String(countyId))
          );

          const pts = ring.map(ll => {
            const p = map.latLngToContainerPoint(ll);
            return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          }).join(' ');

          if (warn) {
            const col = LEVEL_COLORS[warn.level] || '#facc15';
            const bdr = LEVEL_BORDERS[warn.level] || col;
            svgContent += `<polygon points="${pts}" fill="${col}" fill-opacity="0.38" stroke="${bdr}" stroke-width="1.5"/>`;
          } else {
            svgContent += `<polygon points="${pts}" fill="rgba(59,130,246,0.03)" stroke="rgba(59,130,246,0.2)" stroke-width="0.4"/>`;
          }
        } catch(e) {}
      });

      // Labele ostrzeżeń
      filtered.forEach(warning => {
        const icon = phenomenaConfig[warning.phenomenon]?.icon || '⚠';
        const label = PHENOMENON_LABELS_SHORT[warning.phenomenon] || warning.phenomenon;
        const col = LEVEL_COLORS[warning.level] || '#facc15';
        const counties = warning.counties || [];
        const lats = counties.map(c => c.lat).filter(Boolean);
        const lons = counties.map(c => c.lon).filter(Boolean);
        if (!lats.length) return;
        const clat = lats.reduce((a,b)=>a+b,0)/lats.length;
        const clon = lons.reduce((a,b)=>a+b,0)/lons.length;
        const p = map.latLngToContainerPoint([clat, clon]);
        const x = Math.round(p.x), y = Math.round(p.y);
        svgContent += `<text x="${x}" y="${y+5}" text-anchor="middle" font-size="16">${icon}</text>`;
        svgContent += `<rect x="${x-22}" y="${y+8}" width="44" height="13" rx="3" fill="${col}" fill-opacity="0.9"/>`;
        svgContent += `<text x="${x}" y="${y+18}" text-anchor="middle" font-size="8" font-weight="bold" fill="#000">${label} ${warning.level}°</text>`;
      });

      // Legenda
      const lx = w-155, ly = h-85;
      svgContent += `<rect x="${lx}" y="${ly}" width="150" height="80" rx="5" fill="rgba(6,10,18,0.88)" stroke="rgba(100,140,220,0.3)" stroke-width="1"/>`;
      svgContent += `<text x="${lx+8}" y="${ly+16}" fill="#e4ecf8" font-size="11" font-weight="bold" font-family="sans-serif">Legenda</text>`;
      [[1,'#facc15','Stopień 1'],[2,'#f97316','Stopień 2'],[3,'#ef4444','Stopień 3']].forEach(([lvl,col,lbl],i) => {
        const cy = ly+30+i*18;
        svgContent += `<rect x="${lx+8}" y="${cy-7}" width="14" height="14" rx="2" fill="${col}" fill-opacity="0.4" stroke="${LEVEL_BORDERS[lvl]}" stroke-width="1.5"/>`;
        svgContent += `<text x="${lx+28}" y="${cy+4}" fill="#e4ecf8" font-size="10" font-family="sans-serif">${lbl}</text>`;
      });

      svgContent += '</svg>';

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      const ctx = canvas.getContext('2d');
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(pngBlob => {
          const link = document.createElement('a');
          link.download = `meteocap_${new Date().toISOString().slice(0,10)}.png`;
          link.href = URL.createObjectURL(pngBlob);
          link.click();
          URL.revokeObjectURL(link.href);
          setExporting(false);
        }, 'image/png');
      };
      img.onerror = () => setExporting(false);
      img.src = url;
    } catch (e) {
      console.error('Export error:', e);
      setExporting(false);
    }
  }, [warnings, filterStatus, labelMode, phenomenaConfig]);
  const activeCount  = warnings.filter(w => w.status === 'active').length;
  const pendingCount = warnings.filter(w => w.status === 'pending').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          🔴 {activeCount} aktywne &nbsp; 🔵 {pendingCount} nadchodzące
        </span>

        <div style={{ flex: 1 }} />

        {/* Tryb etykiet */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[['icon','Ikona'],['text','Tekst'],['both','Oba']].map(([m, lbl]) => (
            <button key={m} onClick={() => setLabelMode(m)}
              style={{
                padding: '4px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11,
                border: '1px solid ' + (labelMode === m ? 'var(--accent-blue)' : 'var(--border)'),
                background: labelMode === m ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                color: labelMode === m ? 'var(--text-accent)' : 'var(--text-muted)',
                cursor: 'pointer',
              }}>
              {lbl}
            </button>
          ))}
        </div>

        {/* Filtr statusu */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{
            padding: '4px 8px', background: 'var(--bg-elevated)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)', fontSize: 11, cursor: 'pointer',
          }}>
          <option value="all">Wszystkie</option>
          <option value="active">Aktywne</option>
          <option value="pending">Nadchodzące</option>
        </select>

        <button onClick={onRefresh}
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
          }}>
          ↻ Odśwież
        </button>

        <button onClick={handleExportPNG} disabled={exporting}
          style={{
            padding: '4px 12px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--accent-blue)', background: 'rgba(59,130,246,0.15)',
            color: 'var(--text-accent)', fontSize: 11, cursor: 'pointer',
            opacity: exporting ? 0.5 : 1,
          }}>
          {exporting ? '⏳ Eksport...' : '📥 Eksportuj PNG'}
        </button>
      </div>

      {/* Mapa */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

        {/* Panel boczny — szczegóły wybranego ostrzeżenia */}
        {selectedWarning && (
          <div style={{
            position: 'absolute', top: 8, right: 8, width: 280, zIndex: 1000,
            background: 'var(--bg-surface)', border: '1px solid var(--border-active)',
            borderRadius: 'var(--radius-lg)', padding: 14,
            boxShadow: 'var(--shadow-panel)', maxHeight: 'calc(100% - 20px)',
            overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 22 }}>
                  {phenomenaConfig[selectedWarning.phenomenon]?.icon || '⚠'}
                </span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {PHENOMENON_LABELS_SHORT[selectedWarning.phenomenon]}
                  </div>
                  <div style={{
                    fontSize: 11, fontFamily: 'var(--font-mono)',
                    color: LEVEL_COLORS[selectedWarning.level],
                  }}>
                    Stopień {selectedWarning.level} · {STATUS_COLORS[selectedWarning.status]?.label}
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedWarning(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>✕</button>
            </div>

            {/* Czas ważności */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              Od: {new Date(selectedWarning.onset).toLocaleString('pl-PL')}<br/>
              Do: {new Date(selectedWarning.expires).toLocaleString('pl-PL')}
            </div>

            {/* Obszar */}
            {selectedWarning.counties?.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>Obszar</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                  {selectedWarning.counties.slice(0, 12).map(c => (
                    <span key={c.id} style={{
                      fontSize: 10, padding: '1px 6px', borderRadius: 10,
                      background: 'var(--bg-hover)', color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-mono)',
                    }}>{c.name}</span>
                  ))}
                  {selectedWarning.counties.length > 12 && (
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      +{selectedWarning.counties.length - 12}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Skutki */}
            {phenomenaConfig[selectedWarning.phenomenon]?.impacts?.[selectedWarning.level] && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--warn-2)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>⚡ Spodziewane skutki</div>
                {phenomenaConfig[selectedWarning.phenomenon].impacts[selectedWarning.level].map((imp, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                    paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--warn-2)' }}>·</span>
                    {imp}
                  </div>
                ))}
              </div>
            )}

            {/* Instrukcje */}
            {phenomenaConfig[selectedWarning.phenomenon]?.instructions?.[selectedWarning.level] && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--success)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>✓ Co robić</div>
                {phenomenaConfig[selectedWarning.phenomenon].instructions[selectedWarning.level].map((ins, i) => (
                  <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                    paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>✓</span>
                    {ins}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista ostrzeżeń — kompaktowa */}
      {warnings.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
          Brak ostrzeżeń do wyświetlenia
        </div>
      )}
    </div>
  );
}
