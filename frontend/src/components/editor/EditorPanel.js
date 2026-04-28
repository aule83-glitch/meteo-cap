import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { PHENOMENA, PARAM_DEFS } from '../../data/phenomena';
import ParamSlider from './ParamSlider';
import ParamRadio from './ParamRadio';
import ParamCheckbox from './ParamCheckbox';
import WindDirectionPicker from './WindDirectionPicker';
import LevelBadge from './LevelBadge';

const API = import.meta.env.VITE_API_URL || '/api';

function getDefaultParams(phenomenon) {
  const defs = PARAM_DEFS[phenomenon] || [];
  const params = {};
  defs.forEach(d => { params[d.key] = d.default; });
  return params;
}

function getISOLocal(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  // Format as local datetime-local input value
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function XmlPreviewModal({ xml, onClose }) {
  if (!xml) return null;

  // Prosta koloryzacja składni XML
  const colorize = (raw) => {
    return raw
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/&lt;(\/?[\w:]+)/g, '<span style="color:#60a0ff">&lt;$1</span>')
      .replace(/&gt;/g, '<span style="color:#60a0ff">&gt;</span>')
      .replace(/(\w+)="([^"]*)"/g, '<span style="color:#facc15">$1</span>=<span style="color:#22c55e">"$2"</span>')
      .replace(/&gt;([^&<]+)&lt;/g, '&gt;<span style="color:#e4ecf8">$1</span>&lt;');
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9000,
      background:'rgba(0,0,0,0.75)', display:'flex',
      alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div style={{
        width:'80vw', maxWidth:900, maxHeight:'85vh',
        background:'var(--bg-surface)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', display:'flex', flexDirection:'column',
        boxShadow:'0 8px 64px rgba(0,0,0,0.8)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding:'12px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <span style={{fontSize:13, fontWeight:700, color:'var(--text-primary)'}}>
            Podgląd CAP 1.2 XML
          </span>
          <div style={{display:'flex', gap:8}}>
            <button onClick={() => { navigator.clipboard.writeText(xml); }}
              style={{padding:'4px 10px', borderRadius:'var(--radius-sm)',
                border:'1px solid var(--border)', background:'var(--bg-elevated)',
                color:'var(--text-secondary)', fontSize:11, cursor:'pointer'}}>
              📋 Kopiuj
            </button>
            <button onClick={onClose}
              style={{padding:'4px 10px', borderRadius:'var(--radius-sm)',
                border:'1px solid var(--border)', background:'var(--bg-elevated)',
                color:'var(--text-secondary)', fontSize:11, cursor:'pointer'}}>
              ✕ Zamknij
            </button>
          </div>
        </div>
        <pre style={{
          flex:1, overflowY:'auto', margin:0,
          padding:'16px 20px', fontSize:11.5,
          fontFamily:'var(--font-mono)', lineHeight:1.6,
          color:'var(--text-secondary)',
          scrollbarWidth:'thin',
        }} dangerouslySetInnerHTML={{ __html: colorize(xml) }} />
      </div>
    </div>
  );
}

export default function EditorPanel({ selectedCounties, drawnPolygon, onWarningCreated, onStatusChange, warnings = [] }) {
  const [phenomenon, setPhenomenon] = useState('silny_wiatr');
  const [params, setParams] = useState(() => getDefaultParams('silny_wiatr'));
  const [level, setLevel] = useState(null);
  const [onset, setOnset] = useState(() => getISOLocal(0));
  const [expires, setExpires] = useState(() => getISOLocal(24 * 60));
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [msgType, setMsgType] = useState('Alert');       // Alert | Update | Cancel
  const [referencesId, setReferencesId] = useState('');
  const [previewXml, setPreviewXml]       = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [templates, setTemplates]         = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [altFrom, setAltFrom]             = useState('');  // elewacja od (m)
  const [altTo, setAltTo]                 = useState('');  // elewacja do (m)
  const fileInputRef                       = useRef(null); // ID ostrzeżenia do aktualizacji
  const [saving, setSaving] = useState(false);
  const levelTimer = useRef(null);

  // Wczytaj szablony
  useEffect(() => {
    axios.get(`${API}/templates`)
      .then(r => setTemplates(r.data.templates || []))
      .catch(() => {});
  }, []);

  const defs = PARAM_DEFS[phenomenon] || [];

  // When phenomenon changes, reset params
  useEffect(() => {
    const newParams = getDefaultParams(phenomenon);
    setParams(newParams);
  }, [phenomenon]);

  // Debounced level check
  useEffect(() => {
    if (levelTimer.current) clearTimeout(levelTimer.current);
    levelTimer.current = setTimeout(async () => {
      try {
        const res = await axios.post(`${API}/warnings/check-level`, {
          phenomenon,
          params,
        });
        setLevel(res.data.level);
      } catch (e) {
        setLevel(null);
      }
    }, 300);
    return () => clearTimeout(levelTimer.current);
  }, [phenomenon, params]);

  const handleParamChange = useCallback((key, value) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handlePreviewXML = async () => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów ostrzeżenia', type: 'error' });
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await axios.post(`${API}/warnings`, buildPayload());
      onWarningCreated(res.data);
      const xmlRes = await axios.get(`${API}/warnings/${res.data.id}/xml?mode=collective`);
      setPreviewXml(xmlRes.data);
      onStatusChange({ msg: 'Podgląd XML wygenerowany', type: 'success' });
    } catch (e) {
      onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setHeadline('');
    setDescription('');
    setInstruction('');
    setOnset(getISOLocal(0));
    setExpires(getISOLocal(24 * 60));
    setMsgType('Alert');
    setReferencesId('');
    setAltFrom('');
    setAltTo('');
  };

  const handleSave = async () => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów żadnego stopnia ostrzeżenia', type: 'error' });
      return;
    }
    setSaving(true);
    onStatusChange({ msg: 'Zapisywanie ostrzeżenia...', type: 'info' });
    try {
      const res = await axios.post(`${API}/warnings`, buildPayload());
      onWarningCreated(res.data);
      onStatusChange({ msg: `Ostrzeżenie stopień ${res.data.level} — ${phenomenon.replace(/_/g, ' ')} zapisane`, type: 'success' });
      resetForm();
    } catch (e) {
      onStatusChange({ msg: `Błąd zapisu: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!phenomenon) return;
    const name = prompt('Nazwa szablonu:');
    if (!name) return;
    try {
      const res = await axios.post(`${API}/templates`, {
        name, phenomenon, params,
        headline, instruction,
        altitude_from_m: altFrom ? parseFloat(altFrom) : null,
        altitude_to_m:   altTo   ? parseFloat(altTo)   : null,
      });
      setTemplates(prev => [...prev, res.data]);
      onStatusChange({ msg: `Szablon "${name}" zapisany`, type: 'success' });
    } catch(e) { onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' }); }
  };

  const handleLoadTemplate = (tpl) => {
    setPhenomenon(tpl.phenomenon);
    setParams(tpl.params || {});
    setHeadline(tpl.headline || '');
    setInstruction(tpl.instruction || '');
    setAltFrom(tpl.altitude_from_m != null ? String(tpl.altitude_from_m) : '');
    setAltTo(tpl.altitude_to_m != null ? String(tpl.altitude_to_m) : '');
    setShowTemplates(false);
    onStatusChange({ msg: `Wczytano szablon "${tpl.name}"`, type: 'success' });
  };

  const handleDeleteTemplate = async (id) => {
    await axios.delete(`${API}/templates/${id}`);
    setTemplates(prev => prev.filter(t => t.id !== id));
    onStatusChange({ msg: 'Szablon usunięty', type: 'info' });
  };

  const handleImportXML = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/import/cap-xml`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const d = res.data;
      if (d.phenomenon) setPhenomenon(d.phenomenon);
      if (d.params) setParams(d.params);
      if (d.onset)   setOnset(d.onset.slice(0,16));
      if (d.expires) setExpires(d.expires.slice(0,16));
      if (d.headline) setHeadline(d.headline);
      if (d.description) setDescription(d.description);
      if (d.instruction) setInstruction(d.instruction);
      if (d.altitude_from_m != null) setAltFrom(String(d.altitude_from_m));
      if (d.altitude_to_m != null)   setAltTo(String(d.altitude_to_m));
      onStatusChange({ msg: `Zaimportowano CAP XML: ${file.name}`, type: 'success' });
    } catch(e) { onStatusChange({ msg: `Błąd importu: ${e.message}`, type: 'error' }); }
    e.target.value = '';
  };

  const buildPayload = () => ({
    phenomenon, params,
    counties: selectedCounties,
    polygon: drawnPolygon,
    onset: new Date(onset).toISOString(),
    expires: new Date(expires).toISOString(),
    headline: headline || undefined,
    description: description || undefined,
    instruction: instruction || undefined,
    msg_type: msgType,
    references_id: referencesId || undefined,
    altitude_from_m: altFrom ? parseFloat(altFrom) : undefined,
    altitude_to_m:   altTo   ? parseFloat(altTo)   : undefined,
  });

  const downloadFile = (blob, filename, type) => {
    const url = window.URL.createObjectURL(new Blob([blob], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadXML = async (mode = 'collective') => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów ostrzeżenia', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post(`${API}/warnings`, buildPayload());
      onWarningCreated(res.data);
      const { id, level: lvl } = res.data;
      const ph = phenomenon;
      if (mode === 'per_county') {
        const zipRes = await axios.get(`${API}/warnings/${id}/xml?mode=per_county`, { responseType: 'blob' });
        downloadFile(zipRes.data, `ostrzezenia_${ph}_st${lvl}_${id.slice(0,8)}.zip`, 'application/zip');
        onStatusChange({ msg: `ZIP z ${selectedCounties.length} plikami CAP pobrany`, type: 'success' });
      } else {
        const xmlRes = await axios.get(`${API}/warnings/${id}/xml?mode=collective`, { responseType: 'blob' });
        downloadFile(xmlRes.data, `ostrzezenie_${ph}_st${lvl}_${id.slice(0,8)}.xml`, 'application/xml');
        onStatusChange({ msg: 'Plik XML CAP 1.2 pobrany pomyślnie', type: 'success' });
      }
    } catch (e) {
      onStatusChange({ msg: `Błąd generowania XML: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div className="editor-title">Edytor ostrzeżenia</div>
      </div>

      <div className="editor-scroll">

        {/* Level badge */}
        <LevelBadge level={level} />

        {/* Counties summary */}
        <div className="form-section">
          <div className="form-section-label">Obszar ostrzeżenia</div>
          {selectedCounties.length > 0 ? (
            <div className="counties-summary">
              <div className="counties-count">
                Zaznaczono <span>{selectedCounties.length}</span> powiat{selectedCounties.length === 1 ? '' : selectedCounties.length < 5 ? 'y' : 'ów'}
              </div>
              <div className="counties-chips">
                {selectedCounties.slice(0, 30).map(c => (
                  <span key={c.id} className="county-chip">{c.name}</span>
                ))}
                {selectedCounties.length > 30 && (
                  <span className="county-chip">+{selectedCounties.length - 30} więcej</span>
                )}
              </div>
            </div>
          ) : (
            <div className="counties-summary">
              <div className="counties-placeholder">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Narysuj obszar na mapie aby wybrać powiaty
              </div>
            </div>
          )}
        </div>

        {/* Phenomenon selector */}
        <div className="form-section">
          <div className="form-section-label">Zjawisko meteorologiczne</div>
          <select
            className="form-select"
            value={phenomenon}
            onChange={e => setPhenomenon(e.target.value)}
          >
            {PHENOMENA.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Dynamic parameters */}
        <div className="form-section">
          <div className="form-section-label">Parametry meteorologiczne</div>
          {defs.map(def => {
            const value = params[def.key] ?? def.default;
            if (def.type === 'slider') {
              return (
                <ParamSlider
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'radio') {
              return (
                <ParamRadio
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'checkbox') {
              return (
                <ParamCheckbox
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'wind_dir') {
              return (
                <WindDirectionPicker
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Typ wiadomości */}
        <div className="form-section">
          <div className="form-section-label">Typ komunikatu CAP</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: msgType !== 'Alert' ? 10 : 0 }}>
            {['Alert', 'Update', 'Cancel'].map(t => (
              <button key={t} onClick={() => { setMsgType(t); setReferencesId(''); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 'var(--radius-md)',
                  border: '1px solid ' + (msgType === t ? 'var(--accent-blue)' : 'var(--border)'),
                  background: msgType === t ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                  color: msgType === t ? 'var(--text-accent)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                }}>
                {t === 'Alert' ? '🆕 Alert' : t === 'Update' ? '🔄 Update' : '❌ Cancel'}
              </button>
            ))}
          </div>
          {msgType !== 'Alert' && (
            <div className="form-input-group">
              <label className="form-input-label">
                Ostrzeżenie do {msgType === 'Update' ? 'aktualizacji' : 'anulowania'}
              </label>
              {/* Lista rozwijana zamiast wpisywania ID */}
              {warnings && warnings.filter(w => w.status === 'active' || w.status === 'pending').length > 0 ? (
                <select className="form-select" value={referencesId}
                  onChange={e => setReferencesId(e.target.value)}>
                  <option value="">— wybierz ostrzeżenie —</option>
                  {warnings
                    .filter(w => w.status === 'active' || w.status === 'pending')
                    .map(w => {
                      const ph = w.phenomenon?.replace(/_/g,' ') || '';
                      const status = w.status === 'active' ? '● Aktywne' : '○ Nadch.';
                      return (
                        <option key={w.id} value={w.id}>
                          {status} | St.{w.level} {ph} | {w.id?.slice(0,8)}
                        </option>
                      );
                    })
                  }
                </select>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px',
                  background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)' }}>
                  Brak aktywnych/nadchodzących ostrzeżeń do {msgType === 'Update' ? 'aktualizacji' : 'anulowania'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pasek narzędzi — szablony i import */}
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap' }}>
          <div style={{ position:'relative' }}>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setShowTemplates(p=>!p)}
              style={{ fontSize:11 }}>
              📋 Szablony ({templates.length})
            </button>
            {showTemplates && (
              <div style={{
                position:'absolute', top:'100%', left:0, marginTop:4, zIndex:200,
                background:'var(--bg-surface)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-lg)', padding:8, minWidth:220,
                boxShadow:'var(--shadow-panel)', maxHeight:200, overflowY:'auto',
              }}>
                {templates.length === 0
                  ? <div style={{fontSize:11,color:'var(--text-muted)',padding:'4px 8px'}}>Brak szablonów</div>
                  : templates.map(t => (
                    <div key={t.id} style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                      <button onClick={() => handleLoadTemplate(t)}
                        style={{flex:1,textAlign:'left',padding:'4px 8px',borderRadius:'var(--radius-sm)',
                          border:'1px solid var(--border)',background:'var(--bg-elevated)',
                          color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>
                        {t.name}
                      </button>
                      <button onClick={() => handleDeleteTemplate(t.id)}
                        style={{padding:'2px 6px',borderRadius:'var(--radius-sm)',
                          border:'1px solid transparent',background:'transparent',
                          color:'var(--warn-3)',fontSize:11,cursor:'pointer'}}>✕</button>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <button className="btn btn-secondary btn-sm"
            onClick={handleSaveAsTemplate} disabled={!phenomenon}
            style={{ fontSize:11 }}>
            💾 Zapisz jako szablon
          </button>
          <button className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            style={{ fontSize:11 }}>
            📥 Importuj XML
          </button>
          <input ref={fileInputRef} type="file" accept=".xml"
            onChange={handleImportXML} style={{ display:'none' }} />
        </div>

        {/* Elewacja n.p.m. */}
        <div className="form-section">
          <div className="form-section-label">Zakres elewacji (opcjonalnie)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:6 }}>
            <div className="form-input-group">
              <label className="form-input-label">Od (m n.p.m.)</label>
              <input type="number" className="form-input" min="0" max="2500" step="50"
                placeholder="np. 600"
                value={altFrom} onChange={e => setAltFrom(e.target.value)} />
            </div>
            <div className="form-input-group">
              <label className="form-input-label">Do (m n.p.m.)</label>
              <input type="number" className="form-input" min="0" max="2500" step="50"
                placeholder="np. 2500"
                value={altTo} onChange={e => setAltTo(e.target.value)} />
            </div>
          </div>
          {(altFrom || altTo) && (
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              Ostrzeżenie ważne dla terenu {altFrom||'0'}–{altTo||'2500'} m n.p.m.
              · W CAP: altitude={altFrom ? Math.round(altFrom*3.28) : 0} ft,
              ceiling={altTo ? Math.round(altTo*3.28) : 8202} ft
            </div>
          )}
        </div>

        {/* Time range */}
        <div className="form-section">
          <div className="form-section-label">Okres ważności</div>
          <div className="datetime-grid">
            <div className="form-input-group">
              <label className="form-input-label">Od</label>
              <input
                type="datetime-local"
                className="form-input"
                value={onset}
                onChange={e => setOnset(e.target.value)}
              />
            </div>
            <div className="form-input-group">
              <label className="form-input-label">Do</label>
              <input
                type="datetime-local"
                className="form-input"
                value={expires}
                onChange={e => setExpires(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Optional text */}
        <div className="form-section">
          <div className="form-section-label">Treść ostrzeżenia</div>
          <div className="form-input-group" style={{ marginBottom: 10 }}>
            <label className="form-input-label">Nagłówek (opcjonalnie)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Np. Ostrzeżenie meteorologiczne 2° — Silny wiatr"
              value={headline}
              onChange={e => setHeadline(e.target.value)}
            />
          </div>
          <div className="form-input-group" style={{ marginBottom: 10 }}>
            <label className="form-input-label">Opis (opcjonalnie)</label>
            <textarea
              className="form-textarea"
              placeholder="Szczegółowy opis zjawiska..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className="form-input-group">
            <label className="form-input-label">Zalecenia (opcjonalnie)</label>
            <textarea
              className="form-textarea"
              placeholder="Zalecane działania dla służb i ludności..."
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              rows={2}
            />
          </div>
        </div>

      </div>

      {/* Footer actions */}
      <div className="editor-footer">
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }}
            onClick={handleSave} disabled={saving || !level}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h8l2 2v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="8" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="2" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Zapisz
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => handleDownloadXML('collective')} disabled={saving || !level}
            title="Jeden plik XML dla całego obszaru">
            {saving
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{animation:'spin 1s linear infinite'}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="5"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            }
            Zbiorczy XML
          </button>
        </div>
        <button className="btn btn-secondary" style={{ width:'100%', marginBottom: 6 }}
          onClick={() => handleDownloadXML('per_county')} disabled={saving || !level || selectedCounties.length === 0}
          title="Osobny plik XML dla każdego powiatu — format IMGW">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1h5l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 7h4M5 9.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          ZIP — per powiat ({selectedCounties.length} plików)
        </button>
        <button className="btn btn-secondary" style={{ width:'100%', marginBottom: 6 }}
          onClick={handlePreviewXML} disabled={previewLoading || !level}
          title="Podgląd CAP XML przed pobraniem">
          {previewLoading ? '⏳' : '👁'} Podgląd XML
        </button>
      {!level && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            ↑ Dostosuj parametry aby aktywować ostrzeżenie
          </div>
        )}
      </div>
      {previewXml && <XmlPreviewModal xml={previewXml} onClose={() => setPreviewXml(null)} />}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
