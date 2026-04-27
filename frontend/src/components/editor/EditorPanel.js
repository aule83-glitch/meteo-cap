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

export default function EditorPanel({ selectedCounties, drawnPolygon, onWarningCreated, onStatusChange }) {
  const [phenomenon, setPhenomenon] = useState('silny_wiatr');
  const [params, setParams] = useState(() => getDefaultParams('silny_wiatr'));
  const [level, setLevel] = useState(null);
  const [onset, setOnset] = useState(() => getISOLocal(0));
  const [expires, setExpires] = useState(() => getISOLocal(24 * 60));
  const [headline, setHeadline] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [saving, setSaving] = useState(false);
  const levelTimer = useRef(null);

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

  const handleSave = async () => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów żadnego stopnia ostrzeżenia', type: 'error' });
      return;
    }

    setSaving(true);
    onStatusChange({ msg: 'Zapisywanie ostrzeżenia...', type: 'info' });

    try {
      const payload = {
        phenomenon,
        params,
        counties: selectedCounties,
        polygon: drawnPolygon,
        onset: new Date(onset).toISOString(),
        expires: new Date(expires).toISOString(),
        headline: headline || undefined,
        description: description || undefined,
        instruction: instruction || undefined,
      };

      const res = await axios.post(`${API}/warnings`, payload);
      onWarningCreated(res.data);
      onStatusChange({ msg: `Ostrzeżenie stopień ${res.data.level} — ${phenomenon.replace(/_/g, ' ')} zapisane`, type: 'success' });
    } catch (e) {
      onStatusChange({ msg: `Błąd zapisu: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadXML = async () => {
    if (!level) {
      onStatusChange({ msg: 'Najpierw zapisz ostrzeżenie', type: 'error' });
      return;
    }

    // First save, then download
    setSaving(true);
    try {
      const payload = {
        phenomenon,
        params,
        counties: selectedCounties,
        polygon: drawnPolygon,
        onset: new Date(onset).toISOString(),
        expires: new Date(expires).toISOString(),
        headline: headline || undefined,
        description: description || undefined,
        instruction: instruction || undefined,
      };

      const res = await axios.post(`${API}/warnings`, payload);
      onWarningCreated(res.data);

      // Download XML
      const xmlRes = await axios.get(`${API}/warnings/${res.data.id}/xml`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([xmlRes.data], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      const ph = phenomenon;
      const lvl = res.data.level;
      link.setAttribute('download', `ostrzezenie_${ph}_st${lvl}_${res.data.id.slice(0,8)}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      onStatusChange({ msg: `Plik XML CAP 1.2 pobrany pomyślnie`, type: 'success' });
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
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <button
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={handleSave}
            disabled={saving || !level}
            title={!level ? 'Parametry nie spełniają kryteriów ostrzeżenia' : 'Zapisz ostrzeżenie'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h8l2 2v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="8" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="2" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Zapisz
          </button>
          <button
            className="btn btn-primary"
            style={{ flex: 2 }}
            onClick={handleDownloadXML}
            disabled={saving || !level}
            title={!level ? 'Parametry nie spełniają kryteriów ostrzeżenia' : 'Zapisz i pobierz CAP 1.2 XML'}
          >
            {saving ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="5"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
            )}
            Zapisz i pobierz CAP XML
          </button>
        </div>
        {!level && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            ↑ Dostosuj parametry aby aktywować ostrzeżenie
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
