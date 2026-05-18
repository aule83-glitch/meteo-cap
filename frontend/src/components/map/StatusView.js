import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { WarningTreeView } from '../editor/WarningsList';

const API = import.meta.env.VITE_API_URL || '/api';

const STATUS_COLORS = {
  active:    { bg: '#ef4444', border: '#ef4444', label: 'Aktywne' },
  pending:   { bg: '#3b82f6', border: '#3b82f6', label: 'Nadchodzące' },
  expired:   { bg: '#4a5a78', border: '#4a5a78', label: 'Wygasłe' },
  cancelled: { bg: '#6b7280', border: '#6b7280', label: 'Anulowane' },
  updated:   { bg: '#8b5cf6', border: '#8b5cf6', label: 'Zaktualizowane' },
};

const LEVEL_COLORS  = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
const LEVEL_BORDERS = { 1: '#a16207', 2: '#9a3412', 3: '#7f1d1d' };

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

export default function StatusView({ warnings, onRefresh, onEdit,
  maWarnings = [], maEnabled = false, maLoading = false, maLastFetch = null, onRefreshMa }) {
  const [phenomenaConfig, setPhenomenaConfig] = useState({});
  const [labelMode, setLabelMode] = useState('icon'); // icon | text | both
  const [filterStatus, setFilterStatus] = useState('active_only'); // active_only | all

  // Aktywne = aktywny liść drzewa wersji (nie zastąpione, nie anulowane)
  const isActiveWarning = (w) =>
    w.is_active_leaf !== false &&
    !w.is_cancelled &&
    w.status !== 'updated' &&
    w.status !== 'cancelled' &&
    (w.status === 'active' || w.status === 'pending' || !w.status);
  const [selectedWarning, setSelectedWarning] = useState(null);
  const [treeWarning, setTreeWarning] = useState(null);
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
      filterStatus === 'all' ? true : isActiveWarning(w)
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
          layer.setStyle({
            color: lvlColor, fillColor: lvlColor, fillOpacity: 0.38,
            weight: isDashed ? 1.5 : 2.5, dashArray: isDashed ? '6,4' : null,
          });
          layer.bindTooltip(
            `<b>${icon} ${label}</b> — stopień ${warning.level}<br><span style="opacity:.8">${c.name} (${c.voiv_name})</span>`,
            { className: 'map-county-tooltip' }
          );
          layer.off('click');
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
        zIndexOffset: 500, interactive: true,
      });
      marker.on('click', () => setSelectedWarning(warning));
      marker.addTo(map);
      markersRef.current.push(marker);

    });
  }, [warnings, labelMode, filterStatus, phenomenaConfig, L, layersLoaded]);

  const handleExportPNG = useCallback(async () => {
    setExporting(true);
    try {
      // Backend renderuje metryczkę PNG zgodnie z tym co widać w widoku Status
      const params = new URLSearchParams({
        status_filter: filterStatus === 'all' ? 'active,pending,expired' : 'active,pending',
      });
      const res = await fetch(`${API}/export/png?${params}`);
      if (!res.ok) throw new Error('Backend error: ' + res.status);
      const blob = await res.blob();
      const fallback = res.headers.get('X-Fallback-Format');
      const ext = fallback === 'svg' ? 'svg' : 'png';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `imgw-osmet_${new Date().toISOString().slice(0,10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch(e) {
      console.error('Export PNG error:', e);
    } finally {
      setExporting(false);
    }
  }, [filterStatus]);

  const activeCount  = warnings.filter(w => isActiveWarning(w)).length;
  const pendingCount = warnings.filter(w => w.status === 'pending' && isActiveWarning(w)).length;

  const handleExportPDF = async (lang = 'pl') => {
    try {
      const res = await axios.get(`${API}/export/pdf?lang=${lang}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `meteocap_raport${lang==='en'?'_en':''}_${new Date().toISOString().slice(0,10)}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch(e) { alert(`Błąd PDF: ${e.message}`); }
  };

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
          <option value="active_only">Aktywne (bez zastąpionych)</option>
          <option value="all">Wszystkie (w tym zastąpione i archiwum)</option>
        </select>

        <button onClick={onRefresh}
          style={{
            padding: '4px 10px', borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)', background: 'var(--bg-elevated)',
            color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer',
          }}>
          ↻ Odśwież
        </button>

        {/* PDF eksport — tu gdzie patrzy dyżurny synoptyk */}
        <button onClick={() => handleExportPDF('pl')}
          style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',fontSize:11,cursor:'pointer',
            border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.1)',
            color:'var(--text-accent)'}}>
          📄 PDF PL
        </button>
        <button onClick={() => handleExportPDF('en')}
          style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',fontSize:11,cursor:'pointer',
            border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.1)',
            color:'var(--text-accent)'}}>
          📄 PDF EN
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

            {/* Akcje */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10, paddingBottom: 10,
              borderBottom: '1px solid var(--border)' }}>
              {onEdit && selectedWarning.is_active_leaf !== false && !selectedWarning.is_cancelled && (
                <button onClick={() => onEdit(selectedWarning.id)}
                  style={{ flex: 1, fontSize: 11, padding: '6px 10px',
                    background: 'var(--accent-blue)', color: '#000', border: 'none',
                    borderRadius: 'var(--radius-md)', cursor: 'pointer', fontWeight: 600 }}>
                  ✎ Edytuj (Update)
                </button>
              )}
              <button onClick={() => setTreeWarning(selectedWarning)}
                style={{ flex: 1, fontSize: 11, padding: '6px 10px',
                  background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  cursor: 'pointer' }}>
                🌳 Drzewo wersji
                {selectedWarning.version > 1 && (
                  <span style={{marginLeft:6,padding:'1px 5px',background:'var(--accent-blue)',
                    color:'#000',borderRadius:8,fontSize:9,fontWeight:700}}>
                    v{selectedWarning.version}
                  </span>
                )}
              </button>
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

            {/* Opis przebiegu */}
            {selectedWarning.description && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--accent-blue)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>📋 Przebieg</div>
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.5,
                  fontStyle: 'italic' }}>
                  {selectedWarning.description}
                </div>
              </div>
            )}

            {/* Skutki */}
            {(selectedWarning.impacts || phenomenaConfig[selectedWarning.phenomenon]?.impacts?.[selectedWarning.level]) && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 10, color: 'var(--warn-2)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>⚡ Spodziewane skutki</div>
                {selectedWarning.impacts
                  ? selectedWarning.impacts.split('\n').filter(l => l.trim()).map((imp, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                      paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'var(--warn-2)' }}>·</span>
                      {imp.replace(/^•\s*/, '')}
                    </div>
                  ))
                  : phenomenaConfig[selectedWarning.phenomenon]?.impacts?.[selectedWarning.level]?.map((imp, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                      paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'var(--warn-2)' }}>·</span>
                      {imp}
                    </div>
                  ))
                }
              </div>
            )}

            {/* Instrukcje */}
            {(selectedWarning.instruction || phenomenaConfig[selectedWarning.phenomenon]?.instructions?.[selectedWarning.level]) && (
              <div>
                <div style={{ fontSize: 10, color: 'var(--success)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: 4 }}>✓ Co robić</div>
                {selectedWarning.instruction
                  ? selectedWarning.instruction.split('\n').filter(l => l.trim()).map((ins, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                      paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>✓</span>
                      {ins.replace(/^•\s*/, '')}
                    </div>
                  ))
                  : phenomenaConfig[selectedWarning.phenomenon]?.instructions?.[selectedWarning.level]?.map((ins, i) => (
                    <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)',
                      paddingLeft: 10, marginBottom: 3, position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 0, color: 'var(--success)' }}>✓</span>
                      {ins}
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista ostrzeżeń — kompaktowa */}
      {warnings.length === 0 && (
        <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, flexShrink: 0 }}>
          Brak ostrzeżeń do wyświetlenia
        </div>
      )}

      {/* Sekcja MeteoAlarm — kraje ościenne, stały panel na dole */}
      {maEnabled && (
        <div style={{
          borderTop: '1px solid var(--border)',
          flexShrink: 0,
          maxHeight: 220,
          overflowY: 'auto',
          padding: '8px 14px 8px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
              🌍 METEOALARM — KRAJE OŚCIENNE
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {maLastFetch && (
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  {maLastFetch.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {onRefreshMa && (
                <button onClick={onRefreshMa} disabled={maLoading}
                  style={{ background: 'none', border: 'none', color: 'var(--accent-blue)',
                    cursor: 'pointer', fontSize: 13, padding: '2px 4px' }}
                  title="Odśwież MeteoAlarm">
                  {maLoading ? '⟳' : '↻'}
                </button>
              )}
            </div>
          </div>

          {maWarnings.length === 0 && !maLoading && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 0 8px' }}>
              Brak aktywnych ostrzeżeń w krajach ościennych
            </div>
          )}

          {/* Grupuj per kraj */}
          {(() => {
            const MA_LEVEL_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
            const MA_LEVEL_BORDERS = { 1: '#a16207', 2: '#9a3412', 3: '#7f1d1d' };
            const byCountry = {};
            maWarnings.forEach(w => {
              const k = w.country;
              if (!byCountry[k]) byCountry[k] = { name: w.country_name, flag: w.country_flag || '', warnings: [] };
              byCountry[k].warnings.push(w);
            });
            // Sortuj: najpierw kraje z najwyższym stopniem
            const sorted = Object.entries(byCountry).sort((a, b) => {
              const maxA = Math.max(...a[1].warnings.map(w => w.level));
              const maxB = Math.max(...b[1].warnings.map(w => w.level));
              return maxB - maxA;
            });

            return sorted.map(([code, { name, flag, warnings: cw }]) => {
              // Sortuj ostrzeżenia per kraj: poziom malejąco
              const sorted_cw = [...cw].sort((a, b) => b.level - a.level);
              return (
                <div key={code} style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)',
                    marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span>{flag}</span><span>{name}</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>
                      ({sorted_cw.length} ostrzeż.)
                    </span>
                    {cw[0]?.political_caution && (
                      <span style={{ fontSize: 9, color: '#9ca3af' }} title={cw[0].source_note}>⚠ poza EUMETNET</span>
                    )}
                  </div>
                  {sorted_cw.map((w, i) => {
                    const color  = MA_LEVEL_COLORS[w.level] || '#facc15';
                    const border = MA_LEVEL_BORDERS[w.level] || '#a16207';
                    const fmtTime = iso => iso
                      ? new Date(iso).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—';
                    return (
                      <div key={w.id || i} style={{
                        display: 'flex', gap: 8, alignItems: 'flex-start',
                        padding: '5px 8px', marginBottom: 3,
                        background: 'var(--bg-base)', borderRadius: 5,
                        borderLeft: `3px solid ${color}`,
                      }}>
                        {/* Poziom */}
                        <div style={{
                          background: color, color: w.level >= 3 ? '#fff' : '#111',
                          borderRadius: 4, padding: '1px 5px', fontSize: 10,
                          fontWeight: 700, flexShrink: 0, alignSelf: 'flex-start', marginTop: 1,
                        }}>
                          St.{w.level}
                        </div>
                        {/* Treść */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {w.event || w.headline || w.phenomenon}
                          </div>
                          {w.area_desc && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                              title={w.area_desc}>
                              📍 {w.area_desc}
                            </div>
                          )}
                          {(w.onset || w.expires) && (
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                              {w.onset ? `od ${fmtTime(w.onset)}` : ''}
                              {w.expires ? ` · do ${fmtTime(w.expires)}` : ''}
                            </div>
                          )}
                          {w.severity && (
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1, fontStyle: 'italic' }}>
                              {w.severity}{w.certainty ? ` · ${w.certainty}` : ''}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
      )}

      {/* Modal drzewa wersji */}
      {treeWarning && (
        <div style={{position:'fixed',inset:0,zIndex:9100,background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setTreeWarning(null)}>
          <div style={{width:'min(95vw,800px)',maxHeight:'90vh',overflowY:'auto',
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',boxShadow:'0 8px 64px rgba(0,0,0,0.8)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',
              display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
                🌳 Drzewo wersji ostrzeżenia
              </div>
              <button onClick={()=>setTreeWarning(null)}
                style={{background:'none',border:'none',color:'var(--text-muted)',
                  cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
            </div>
            <div style={{padding:'14px 18px'}}>
              <WarningTreeView warningId={treeWarning.id} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
