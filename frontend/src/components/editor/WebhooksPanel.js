import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const LEVEL_LABELS = { 1: 'Wszystkie (st. 1+)', 2: 'St. 2+ (pomarańczowy)', 3: 'Tylko st. 3 (czerwony)' };

export default function WebhooksPanel({ onStatusChange }) {
  const [webhooks, setWebhooks]   = useState([]);
  const [showForm, setShowForm]   = useState(false);
  const [testing, setTesting]     = useState(null);
  const [form, setForm] = useState({
    name: '', url: '', active: true, min_level: 1,
    description: '', headers: {},
  });
  const [headerKey, setHeaderKey]   = useState('');
  const [headerVal, setHeaderVal]   = useState('');

  useEffect(() => {
    axios.get(`${API}/webhooks`)
      .then(r => setWebhooks(r.data.webhooks || []))
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!form.name || !form.url) {
      onStatusChange({ msg: 'Podaj nazwę i URL webhooka', type: 'error' });
      return;
    }
    try {
      const res = await axios.post(`${API}/webhooks`, form);
      setWebhooks(prev => [...prev, res.data]);
      setShowForm(false);
      setForm({ name:'', url:'', active:true, min_level:1, description:'', headers:{} });
      onStatusChange({ msg: `Webhook "${res.data.name}" dodany`, type: 'success' });
    } catch(e) { onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' }); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Usunąć webhook?')) return;
    await axios.delete(`${API}/webhooks/${id}`);
    setWebhooks(prev => prev.filter(w => w.id !== id));
    onStatusChange({ msg: 'Webhook usunięty', type: 'info' });
  };

  const handleTest = async (id) => {
    setTesting(id);
    try {
      const res = await axios.post(`${API}/webhooks/${id}/test`);
      const ok = res.data.reachable;
      onStatusChange({
        msg: ok ? `✓ Webhook dostępny (HTTP ${res.data.status_code})` : `✗ Niedostępny: ${res.data.error}`,
        type: ok ? 'success' : 'error'
      });
    } catch(e) { onStatusChange({ msg: `Błąd testu: ${e.message}`, type: 'error' }); }
    finally { setTesting(null); }
  };

  const toggleActive = async (wh) => {
    try {
      const res = await axios.put(`${API}/webhooks/${wh.id}`, { ...wh, active: !wh.active });
      setWebhooks(prev => prev.map(w => w.id === wh.id ? res.data : w));
    } catch(e) { onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' }); }
  };

  const addHeader = () => {
    if (!headerKey) return;
    setForm(prev => ({ ...prev, headers: { ...prev.headers, [headerKey]: headerVal } }));
    setHeaderKey(''); setHeaderVal('');
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div className="editor-title">Webhooki — push CAP XML</div>
          <button className="btn btn-secondary btn-sm"
            onClick={() => setShowForm(p=>!p)}>
            {showForm ? '✕ Anuluj' : '+ Dodaj webhook'}
          </button>
        </div>
      </div>

      <div className="editor-scroll">
        {/* Info */}
        <div style={{ fontSize:11, color:'var(--text-muted)', marginBottom:16, lineHeight:1.6 }}>
          Po zapisaniu każdego ostrzeżenia system automatycznie wyśle plik CAP XML
          (HTTP POST, Content-Type: application/xml) na poniższe adresy.
        </div>

        {/* Formularz dodawania */}
        {showForm && (
          <div style={{ background:'var(--bg-elevated)', borderRadius:'var(--radius-lg)',
            border:'1px solid var(--border-active)', padding:16, marginBottom:16 }}>
            <div className="form-section-label" style={{ marginBottom:12 }}>Nowy webhook</div>

            <div className="form-input-group" style={{ marginBottom:8 }}>
              <label className="form-input-label">Nazwa</label>
              <input className="form-input" value={form.name}
                onChange={e => setForm(p=>({...p,name:e.target.value}))}
                placeholder="np. EDXL Gateway, CAP Aggregator" />
            </div>

            <div className="form-input-group" style={{ marginBottom:8 }}>
              <label className="form-input-label">URL (HTTP/HTTPS)</label>
              <input className="form-input" value={form.url}
                onChange={e => setForm(p=>({...p,url:e.target.value}))}
                placeholder="https://example.com/cap-receiver" />
            </div>

            <div className="form-input-group" style={{ marginBottom:8 }}>
              <label className="form-input-label">Minimalny stopień</label>
              <select className="form-select" value={form.min_level}
                onChange={e => setForm(p=>({...p,min_level:parseInt(e.target.value)}))}>
                {Object.entries(LEVEL_LABELS).map(([k,v]) =>
                  <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div className="form-input-group" style={{ marginBottom:8 }}>
              <label className="form-input-label">Opis (opcjonalnie)</label>
              <input className="form-input" value={form.description}
                onChange={e => setForm(p=>({...p,description:e.target.value}))}
                placeholder="np. System alarmowania RCB" />
            </div>

            {/* Dodatkowe nagłówki HTTP */}
            <div className="form-input-group" style={{ marginBottom:8 }}>
              <label className="form-input-label">Nagłówki HTTP (np. Authorization)</label>
              <div style={{ display:'flex', gap:6, marginBottom:6 }}>
                <input className="form-input" style={{ flex:1 }} value={headerKey}
                  onChange={e => setHeaderKey(e.target.value)} placeholder="Klucz (np. Authorization)" />
                <input className="form-input" style={{ flex:2 }} value={headerVal}
                  onChange={e => setHeaderVal(e.target.value)} placeholder="Wartość (np. Bearer token123)" />
                <button className="btn btn-secondary btn-sm" onClick={addHeader}>+</button>
              </div>
              {Object.entries(form.headers).map(([k,v]) => (
                <div key={k} style={{ fontSize:10, fontFamily:'var(--font-mono)',
                  color:'var(--text-muted)', display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ color:'var(--text-accent)' }}>{k}:</span>
                  <span>{v.slice(0,30)}{v.length>30?'…':''}</span>
                  <button onClick={() => setForm(p => {
                    const h = {...p.headers}; delete h[k]; return {...p,headers:h};
                  })} style={{ background:'none',border:'none',color:'var(--warn-3)',cursor:'pointer',fontSize:11 }}>✕</button>
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={handleSave}>
              Zapisz webhook
            </button>
          </div>
        )}

        {/* Lista webhooków */}
        {webhooks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📡</div>
            <div className="empty-state-text">Brak skonfigurowanych webhooków.<br/>Dodaj endpoint aby automatycznie wysyłać CAP XML.</div>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {webhooks.map(wh => (
              <div key={wh.id} className="warning-card"
                style={{ opacity: wh.active ? 1 : 0.6 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
                  {/* Toggle aktywności */}
                  <div onClick={() => toggleActive(wh)}
                    style={{ width:32, height:18, borderRadius:9, cursor:'pointer',
                      background: wh.active ? 'var(--accent-blue)' : 'var(--bg-hover)',
                      border:'1px solid '+(wh.active?'var(--accent-blue)':'var(--border)'),
                      position:'relative', flexShrink:0, transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:2,
                      left: wh.active ? 14 : 2, width:12, height:12,
                      borderRadius:'50%', background:'white', transition:'left 0.2s' }}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)' }}>{wh.name}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'var(--font-mono)' }}>
                      {wh.url.slice(0,50)}{wh.url.length>50?'…':''}
                    </div>
                  </div>
                  <span style={{ fontSize:10, color:'var(--text-muted)',
                    background:'var(--bg-hover)', padding:'2px 6px', borderRadius:3 }}>
                    St.{wh.min_level}+
                  </span>
                </div>

                {wh.description && (
                  <div style={{ fontSize:11, color:'var(--text-secondary)', marginBottom:6 }}>
                    {wh.description}
                  </div>
                )}

                {wh.last_result && (
                  <div style={{ fontSize:10, fontFamily:'var(--font-mono)',
                    color: wh.last_result.success ? 'var(--success)' : 'var(--warn-3)',
                    marginBottom:6 }}>
                    Ostatnie: {wh.last_result.success ? '✓ sukces' : `✗ ${wh.last_result.error}`}
                    {wh.last_sent && ` · ${wh.last_sent}`}
                  </div>
                )}

                <div style={{ display:'flex', gap:6 }}>
                  <button className="btn btn-secondary btn-sm"
                    onClick={() => handleTest(wh.id)} disabled={testing===wh.id}>
                    {testing===wh.id ? '⏳' : '🔍'} Test
                  </button>
                  <button className="btn btn-danger btn-sm"
                    onClick={() => handleDelete(wh.id)}>
                    Usuń
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
