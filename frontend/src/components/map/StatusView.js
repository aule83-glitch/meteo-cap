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

const LEVEL_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };

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
  const [L, setL] = useState(null);
  const [exporting, setExporting] = useState(false);

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
  }, [L]);

  // Renderuj markery przy zmianie warnings lub trybu etykiet
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    const filtered = warnings.filter(w => {
      if (filterStatus === 'all') return true;
      return w.status === filterStatus;
    });

    filtered.forEach(warning => {
      const lvlColor = LEVEL_COLORS[warning.level] || '#facc15';
      const statusCol = STATUS_COLORS[warning.status] || STATUS_COLORS.active;
      const icon = phenomenaConfig[warning.phenomenon]?.icon || '⚠';
      const label = PHENOMENON_LABELS_SHORT[warning.phenomenon] || warning.phenomenon;
      const counties = warning.counties || [];

      // Dla każdego powiatu — marker z ikoną/etykietą
      const rendered = new Set();
      counties.forEach(c => {
        const key = `${c.lat},${c.lon}`;
        if (rendered.has(key)) return;
        rendered.add(key);

        let iconHtml = '';
        if (labelMode === 'icon') {
          iconHtml = `<div style="font-size:18px;line-height:1;filter:drop-shadow(0 0 4px ${lvlColor})">${icon}</div>`;
        } else if (labelMode === 'text') {
          iconHtml = `<div style="background:${lvlColor};color:#000;font-size:9px;font-weight:700;padding:2px 5px;border-radius:3px;white-space:nowrap;box-shadow:0 0 6px ${lvlColor}66">${label} ${warning.level}°</div>`;
        } else {
          iconHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
            <div style="font-size:16px;filter:drop-shadow(0 0 4px ${lvlColor})">${icon}</div>
            <div style="background:${lvlColor};color:#000;font-size:8px;font-weight:700;padding:1px 4px;border-radius:2px;white-space:nowrap">${label}</div>
          </div>`;
        }

        const divIcon = L.divIcon({
          html: iconHtml,
          iconSize: null,
          className: '',
          iconAnchor: [0, 0],
        });

        const marker = L.marker([c.lat, c.lon], { icon: divIcon });

        // Tło powiatu
        const circle = L.circleMarker([c.lat, c.lon], {
          radius: 10,
          color: lvlColor,
          fillColor: lvlColor,
          fillOpacity: 0.15,
          weight: warning.status === 'active' ? 1.5 : 0.5,
          dashArray: warning.status === 'pending' ? '4,3' : null,
        });

        const tooltipHtml = `
          <b>${icon} ${label}</b> — stopień ${warning.level}<br>
          <span style="opacity:.8">${c.name} (${c.voiv_name})</span><br>
          <span style="opacity:.6;font-size:10px">Status: ${statusCol.label}</span>
        `;
        circle.bindTooltip(tooltipHtml, { className: 'map-county-tooltip' });
        circle.on('click', () => setSelectedWarning(warning));

        circle.addTo(map);
        marker.addTo(map);
        markersRef.current.push(circle, marker);
      });
    });
  }, [warnings, labelMode, filterStatus, phenomenaConfig, L]);

  const handleExportPNG = useCallback(async () => {
    setExporting(true);
    try {
      // Użyj Leaflet getRenderer/getPane — generujemy SVG overlay
      const map = leafletMap.current;
      if (!map) return;

      // Pobierz rozmiary mapy
      const container = map.getContainer();
      const w = container.offsetWidth;
      const h = container.offsetHeight;

      // Zbuduj SVG z markerami
      const filtered = warnings.filter(w =>
        filterStatus === 'all' || w.status === filterStatus
      );

      let svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">`;
      svgContent += `<rect width="${w}" height="${h}" fill="rgba(6,10,18,0.85)"/>`;
      svgContent += `<text x="10" y="20" fill="#8ca0c0" font-size="11" font-family="monospace">MeteoCAP — Mapa ostrzeżeń © IMGW-PIB | © CARTO © OSM</text>`;

      filtered.forEach(warning => {
        const lvlColor = LEVEL_COLORS[warning.level] || '#facc15';
        const icon = phenomenaConfig[warning.phenomenon]?.icon || '⚠';
        const label = PHENOMENON_LABELS_SHORT[warning.phenomenon] || warning.phenomenon;
        const counties = warning.counties || [];

        counties.forEach(c => {
          try {
            const point = map.latLngToContainerPoint([c.lat, c.lon]);
            const x = point.x;
            const y = point.y;
            if (x < 0 || y < 0 || x > w || y > h) return;

            // Kółko
            svgContent += `<circle cx="${x}" cy="${y}" r="12" fill="${lvlColor}" fill-opacity="0.25" stroke="${lvlColor}" stroke-width="1.5"/>`;
            // Emoji/ikona
            svgContent += `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="14">${icon}</text>`;
            // Etykieta pod spodem
            if (labelMode !== 'icon') {
              svgContent += `<rect x="${x - 28}" y="${y + 14}" width="56" height="12" rx="2" fill="${lvlColor}" fill-opacity="0.9"/>`;
              svgContent += `<text x="${x}" y="${y + 23}" text-anchor="middle" font-size="8" font-weight="bold" fill="#000">${label} ${warning.level}°</text>`;
            }
          } catch (e) {}
        });
      });

      // Legenda
      svgContent += `<rect x="${w-160}" y="${h-100}" width="155" height="90" rx="6" fill="rgba(6,10,18,0.85)" stroke="rgba(100,140,220,0.3)" stroke-width="1"/>`;
      svgContent += `<text x="${w-150}" y="${h-82}" fill="#e4ecf8" font-size="11" font-weight="bold" font-family="sans-serif">Legenda</text>`;
      [[1,'#facc15','Stopień 1'],[2,'#f97316','Stopień 2'],[3,'#ef4444','Stopień 3']].forEach(([lvl,col,lbl], i) => {
        const y = h - 64 + i * 18;
        svgContent += `<circle cx="${w-147}" cy="${y}" r="6" fill="${col}" fill-opacity="0.3" stroke="${col}" stroke-width="1.5"/>`;
        svgContent += `<text x="${w-137}" y="${y+4}" fill="#e4ecf8" font-size="10" font-family="sans-serif">${lbl}</text>`;
      });

      svgContent += '</svg>';

      // Pobierz jako PNG przez canvas
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const blob = new Blob([svgContent], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(pngBlob => {
          const link = document.createElement('a');
          link.download = `meteocap_mapa_${new Date().toISOString().slice(0,10)}.png`;
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
