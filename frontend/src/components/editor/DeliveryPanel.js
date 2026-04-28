import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const Section = ({ title, children }) => (
  <div style={{ marginBottom: 24 }}>
    <div className="form-section-label">{title}</div>
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div className="form-input-group" style={{ marginBottom: 10 }}>
    <label className="form-input-label">{label}</label>
    {children}
  </div>
);

export default function DeliveryPanel({ onStatusChange }) {
  const [config, setConfig]     = useState(null);
  const [log, setLog]           = useState([]);
  const [testing, setTesting]   = useState(null);
  const [saving, setSaving]     = useState(false);
  const [activeTab, setActiveTab] = useState('ftp'); // ftp | email | log
  const [newFtp, setNewFtp]     = useState({
    name:'', host:'', port:21, user:'anonymous', password:'',
    remote_dir:'/cap/', use_passive:true, use_tls:false, active:true, min_level:1,
  });
  const [showFtpForm, setShowFtpForm] = useState(false);

  useEffect(() => {
    axios.get(`${API}/delivery/config`).then(r => setConfig(r.data)).catch(()=>{});
    axios.get(`${API}/delivery/log?limit=30`).then(r => setLog(r.data.log||[])).catch(()=>{});
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await axios.put(`${API}/delivery/config`, config);
      onStatusChange({ msg: 'Konfiguracja dystrybucji zapisana', type: 'success' });
    } catch(e) {
      onStatusChange({ msg: `Błąd zapisu: ${e.message}`, type: 'error' });
    } finally { setSaving(false); }
  };

  const testFtp = async (ftpCfg) => {
    setTesting(ftpCfg.host);
    try {
      const res = await axios.post(`${API}/delivery/test-ftp`, ftpCfg);
      onStatusChange({
        msg: res.data.reachable
          ? `✓ FTP ${ftpCfg.host}: połączenie OK`
          : `✗ FTP ${ftpCfg.host}: ${res.data.error}`,
        type: res.data.reachable ? 'success' : 'error'
      });
    } catch(e) { onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' }); }
    finally { setTesting(null); }
  };

  const testSmtp = async () => {
    setTesting('smtp');
    try {
      const res = await axios.post(`${API}/delivery/test-smtp`, config.email);
      onStatusChange({
        msg: res.data.reachable ? '✓ SMTP: połączenie OK' : `✗ SMTP: ${res.data.error}`,
        type: res.data.reachable ? 'success' : 'error'
      });
    } catch(e) { onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' }); }
    finally { setTesting(null); }
  };

  const addFtp = () => {
    if (!newFtp.host) return;
    setConfig(prev => ({ ...prev, ftp: [...(prev.ftp||[]), { ...newFtp }] }));
    setNewFtp({ name:'', host:'', port:21, user:'anonymous', password:'',
      remote_dir:'/cap/', use_passive:true, use_tls:false, active:true, min_level:1 });
    setShowFtpForm(false);
  };

  const removeFtp = (idx) =>
    setConfig(prev => ({ ...prev, ftp: prev.ftp.filter((_,i) => i!==idx) }));

  const toggleFtp = (idx) =>
    setConfig(prev => ({ ...prev, ftp: prev.ftp.map((f,i) =>
      i===idx ? {...f, active:!f.active} : f) }));

  const setEmail = (key, val) =>
    setConfig(prev => ({ ...prev, email: { ...prev.email, [key]: val } }));

  const addRecipient = () => {
    const addr = prompt('Adres email odbiorcy:');
    if (!addr) return;
    const name = prompt('Nazwa odbiorcy (opcjonalnie):') || '';
    setConfig(prev => ({
      ...prev,
      email: {
        ...prev.email,
        recipients: [...(prev.email?.recipients||[]), { address:addr, name, min_level:1, active:true }]
      }
    }));
  };

  const removeRecipient = (idx) =>
    setConfig(prev => ({ ...prev, email: {
      ...prev.email, recipients: prev.email.recipients.filter((_,i)=>i!==idx) } }));

  if (!config) return (
    <div className="editor-panel">
      <div className="editor-header"><div className="editor-title">Dystrybucja</div></div>
      <div style={{padding:20,color:'var(--text-muted)',fontSize:13}}>Ładowanie...</div>
    </div>
  );

  const tabStyle = (t) => ({
    padding:'6px 14px', borderRadius:'var(--radius-sm)', fontSize:12, cursor:'pointer',
    border:'1px solid '+(activeTab===t?'var(--accent-blue)':'var(--border)'),
    background: activeTab===t?'rgba(59,130,246,0.1)':'var(--bg-elevated)',
    color: activeTab===t?'var(--text-accent)':'var(--text-muted)',
  });

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div className="editor-title">Dystrybucja CAP XML</div>
          <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
            {saving?'⏳':'💾'} Zapisz
          </button>
        </div>
        <div style={{marginTop:8,display:'flex',gap:6}}>
          <button style={tabStyle('ftp')}     onClick={()=>setActiveTab('ftp')}>📁 FTP</button>
          <button style={tabStyle('email')}   onClick={()=>setActiveTab('email')}>📧 Email</button>
          <button style={tabStyle('log')}     onClick={()=>setActiveTab('log')}>📋 Log</button>
        </div>
      </div>

      <div className="editor-scroll">

        {/* ── FTP ── */}
        {activeTab === 'ftp' && (
          <>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12,lineHeight:1.6}}>
              Po wydaniu każdego ostrzeżenia plik XML zostanie automatycznie przesłany
              na wskazane serwery FTP. Nazwa pliku: <code style={{fontFamily:'var(--font-mono)'}}>IMGW_zjawisko_stN_YYYYMMDD_HHMMSS.xml</code>
            </div>

            {/* Lista serwerów */}
            {(config.ftp||[]).map((ftp, idx) => (
              <div key={idx} className="warning-card" style={{marginBottom:8,opacity:ftp.active?1:0.6}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div onClick={()=>toggleFtp(idx)} style={{
                    width:32,height:18,borderRadius:9,cursor:'pointer',flexShrink:0,
                    background:ftp.active?'var(--accent-blue)':'var(--bg-hover)',
                    border:'1px solid '+(ftp.active?'var(--accent-blue)':'var(--border)'),
                    position:'relative',transition:'all 0.2s',
                  }}>
                    <div style={{position:'absolute',top:2,left:ftp.active?14:2,width:12,height:12,
                      borderRadius:'50%',background:'white',transition:'left 0.2s'}}/>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>
                      {ftp.name || ftp.host}
                    </div>
                    <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
                      {ftp.use_tls?'ftps':'ftp'}://{ftp.host}:{ftp.port}{ftp.remote_dir}
                      {' · '}St.{ftp.min_level}+
                    </div>
                  </div>
                  <button className="btn btn-secondary btn-sm"
                    onClick={()=>testFtp(ftp)} disabled={testing===ftp.host}>
                    {testing===ftp.host?'⏳':'🔍'} Test
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={()=>removeFtp(idx)}>✕</button>
                </div>
              </div>
            ))}

            <button className="btn btn-secondary" style={{width:'100%',marginBottom:8}}
              onClick={()=>setShowFtpForm(p=>!p)}>
              {showFtpForm?'✕ Anuluj':'+ Dodaj serwer FTP'}
            </button>

            {showFtpForm && (
              <div style={{background:'var(--bg-elevated)',borderRadius:'var(--radius-lg)',
                border:'1px solid var(--border-active)',padding:14,marginBottom:12}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                  <Field label="Nazwa (opis)">
                    <input className="form-input" value={newFtp.name}
                      onChange={e=>setNewFtp(p=>({...p,name:e.target.value}))}
                      placeholder="np. MeteoAlarm FTP"/>
                  </Field>
                  <Field label="Host">
                    <input className="form-input" value={newFtp.host}
                      onChange={e=>setNewFtp(p=>({...p,host:e.target.value}))}
                      placeholder="ftp.meteoalarm.org"/>
                  </Field>
                  <Field label="Port">
                    <input className="form-input" type="number" value={newFtp.port}
                      onChange={e=>setNewFtp(p=>({...p,port:parseInt(e.target.value)}))}/>
                  </Field>
                  <Field label="Katalog docelowy">
                    <input className="form-input" value={newFtp.remote_dir}
                      onChange={e=>setNewFtp(p=>({...p,remote_dir:e.target.value}))}
                      placeholder="/pub/cap/PL/"/>
                  </Field>
                  <Field label="Użytkownik">
                    <input className="form-input" value={newFtp.user}
                      onChange={e=>setNewFtp(p=>({...p,user:e.target.value}))}/>
                  </Field>
                  <Field label="Hasło">
                    <input className="form-input" type="password" value={newFtp.password}
                      onChange={e=>setNewFtp(p=>({...p,password:e.target.value}))}/>
                  </Field>
                  <Field label="Minimalny stopień">
                    <select className="form-select" value={newFtp.min_level}
                      onChange={e=>setNewFtp(p=>({...p,min_level:parseInt(e.target.value)}))}>
                      <option value={1}>Wszystkie (st. 1+)</option>
                      <option value={2}>St. 2+ (pomarańczowy)</option>
                      <option value={3}>Tylko st. 3 (czerwony)</option>
                    </select>
                  </Field>
                  <Field label="Opcje">
                    <div style={{display:'flex',gap:12,paddingTop:8}}>
                      {[['use_tls','FTPS (TLS)'],['use_passive','Tryb pasywny']].map(([k,l])=>(
                        <label key={k} className="checkbox-group"
                          onClick={()=>setNewFtp(p=>({...p,[k]:!p[k]}))}>
                          <div className={`checkbox-custom ${newFtp[k]?'checked':''}`}>
                            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                              <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <span className="checkbox-label">{l}</span>
                        </label>
                      ))}
                    </div>
                  </Field>
                </div>
                <button className="btn btn-primary btn-sm" onClick={addFtp}>
                  Dodaj serwer FTP
                </button>
              </div>
            )}
          </>
        )}

        {/* ── EMAIL ── */}
        {activeTab === 'email' && (
          <>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12,lineHeight:1.6}}>
              Ostrzeżenia będą wysyłane emailem z załączonym plikiem CAP XML.
              Email zawiera czytelny opis zjawiska, zasięg i czas ważności.
            </div>

            <Section title="Serwer SMTP">
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <Field label="Host SMTP">
                  <input className="form-input" value={config.email?.smtp_host||''}
                    onChange={e=>setEmail('smtp_host',e.target.value)}
                    placeholder="smtp.imgw.pl"/>
                </Field>
                <Field label="Port">
                  <input className="form-input" type="number" value={config.email?.smtp_port||587}
                    onChange={e=>setEmail('smtp_port',parseInt(e.target.value))}/>
                </Field>
                <Field label="Użytkownik SMTP">
                  <input className="form-input" value={config.email?.smtp_user||''}
                    onChange={e=>setEmail('smtp_user',e.target.value)}
                    placeholder="ostrzezenia@imgw.pl"/>
                </Field>
                <Field label="Hasło SMTP">
                  <input className="form-input" type="password" value={config.email?.smtp_password||''}
                    onChange={e=>setEmail('smtp_password',e.target.value)}/>
                </Field>
                <Field label="Adres nadawcy">
                  <input className="form-input" value={config.email?.from_address||''}
                    onChange={e=>setEmail('from_address',e.target.value)}/>
                </Field>
                <Field label="Nazwa nadawcy">
                  <input className="form-input" value={config.email?.from_name||''}
                    onChange={e=>setEmail('from_name',e.target.value)}/>
                </Field>
              </div>
              <label className="checkbox-group" style={{marginTop:4}}
                onClick={()=>setEmail('smtp_use_tls',!config.email?.smtp_use_tls)}>
                <div className={`checkbox-custom ${config.email?.smtp_use_tls?'checked':''}`}>
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                </div>
                <span className="checkbox-label">Używaj STARTTLS (port 587)</span>
              </label>
              <button className="btn btn-secondary btn-sm" style={{marginTop:8}}
                onClick={testSmtp} disabled={testing==='smtp'}>
                {testing==='smtp'?'⏳':'🔍'} Testuj połączenie SMTP
              </button>
            </Section>

            <Section title="Odbiorcy">
              {(config.email?.recipients||[]).map((r,idx) => (
                <div key={idx} style={{display:'flex',alignItems:'center',gap:8,marginBottom:6}}>
                  <div style={{flex:1,fontSize:12,color:'var(--text-primary)'}}>
                    {r.name && <span style={{color:'var(--text-secondary)'}}>{r.name} — </span>}
                    <span style={{fontFamily:'var(--font-mono)'}}>{r.address}</span>
                    <span style={{fontSize:10,color:'var(--text-muted)',marginLeft:6}}>
                      st.{r.min_level||1}+
                    </span>
                  </div>
                  <button className="btn btn-danger btn-sm" onClick={()=>removeRecipient(idx)}>✕</button>
                </div>
              ))}
              <button className="btn btn-secondary btn-sm" style={{marginTop:4}}
                onClick={addRecipient}>
                + Dodaj odbiorcę
              </button>
            </Section>
          </>
        )}

        {/* ── LOG ── */}
        {activeTab === 'log' && (
          <>
            <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:12}}>
              Historia dystrybucji (ostatnie 30 wysyłek)
            </div>
            {log.length === 0
              ? <div className="empty-state">
                  <div className="empty-state-icon">📋</div>
                  <div className="empty-state-text">Brak wpisów w logu.</div>
                </div>
              : log.map((entry, idx) => (
                <div key={idx} className="warning-card" style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',marginBottom:4}}>
                    {entry.timestamp} · {entry.filename}
                  </div>
                  {(entry.results?.ftp||[]).map((r,i) => (
                    <div key={i} style={{fontSize:11,
                      color:r.success?'var(--success)':'var(--warn-3)'}}>
                      FTP {r.server_name||r.server}: {r.success?'✓ OK':'✗ '+r.error}
                    </div>
                  ))}
                  {entry.results?.email && (
                    <div style={{fontSize:11,
                      color:entry.results.email.success?'var(--success)':'var(--warn-3)'}}>
                      Email: {entry.results.email.success
                        ? `✓ wysłano do ${entry.results.email.sent?.length} odbiorców`
                        : `✗ ${entry.results.email.error}`}
                    </div>
                  )}
                </div>
              ))
            }
          </>
        )}
      </div>
    </div>
  );
}
