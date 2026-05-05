import React, { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const LEVEL_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };

const OP_LABEL = {
  create: 'Wydanie', amend: 'Korekta', escalate: 'Eskalacja ⬆', deescalate: 'Deeskalacja ⬇',
  extend: 'Przedłużenie', shorten: 'Skrócenie', expand_area: 'Powiększenie obszaru',
  cut_area: 'Wycięcie obszaru ✂', partial_cancel: 'Cancel (część obszaru)', full_cancel: 'Cancel',
};

const PHENOMENON_LABELS = {
  burze:'Burze', intensywne_opady_deszczu:'Int. opady deszczu',
  intensywne_opady_sniegu:'Int. opady śniegu', silny_wiatr:'Silny wiatr',
  silny_mroz:'Silny mróz', upal:'Upał', opady_marzniece:'Opady marznące',
  roztopy:'Roztopy', silny_deszcz_z_burzami:'Deszcz z burzami',
  zawieje_zamiecie:'Zawieje śnieżne', mgla_szadz:'Mgła+szadź',
  gesta_mgla:'Gęsta mgła', oblodzenie:'Oblodzenie',
  opady_sniegu:'Opady śniegu', przymrozki:'Przymrozki',
};

const STATUS_STYLES = {
  active:    { color:'var(--warn-3)',      bg:'rgba(239,68,68,0.15)',   label:'● Aktywne',     archive: false },
  pending:   { color:'var(--accent-blue)', bg:'rgba(59,130,246,0.15)', label:'○ Nadchodzące', archive: false },
  expired:   { color:'var(--text-muted)',  bg:'var(--bg-hover)',        label:'✓ Wygasłe',     archive: true  },
  cancelled: { color:'#94a3b8',           bg:'rgba(148,163,184,0.12)', label:'✕ Anulowane',   archive: true  },
  updated:   { color:'#8b5cf6',           bg:'rgba(139,92,246,0.12)',  label:'↺ Zastąpione',  archive: true  },
  unknown:   { color:'var(--text-muted)',  bg:'var(--bg-hover)',        label:'? Nieznany',    archive: true  },
};

export default function WarningsList({ warnings, onDelete, onStatusChange, onEdit }) {
  // onEdit(warningId) — przejdź do edytora z wczytanym ostrzeżeniem
  const [exporting, setExporting] = useState(false);
  const [previewWarning, setPreviewWarning] = useState(null);
  const [treeWarning, setTreeWarning] = useState(null);
  const [partialCancelWarning, setPartialCancelWarning] = useState(null);
  const [cancelWarning, setCancelWarning] = useState(null);

  const formatDate = iso => {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
    catch { return iso; }
  };

  const downloadBlob = (data, filename, type) => {
    const url = window.URL.createObjectURL(new Blob([data],{type}));
    const a = document.createElement('a'); a.href=url; a.download=filename;
    document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
  };

  const handleDownload = async (id, mode='collective') => {
    try {
      const res = await axios.get(`${API}/warnings/${id}/xml?mode=${mode}`,{responseType:'blob'});
      const ext=mode==='per_county'?'zip':'xml', mime=mode==='per_county'?'application/zip':'application/xml';
      downloadBlob(res.data,`ostrzezenie_${id.slice(0,8)}.${ext}`,mime);
      onStatusChange({msg:`Plik ${ext.toUpperCase()} pobrany`,type:'success'});
    } catch(e){onStatusChange({msg:`Błąd: ${e.message}`,type:'error'});}
  };

  const handleCancel = async (id) => {
    // Otwórz modal z wyborem przyczyny
    const w = warnings.find(x => x.id === id);
    if (w) setCancelWarning(w);
  };

  const performCancel = async (id, reason_code, reason_text) => {
    try {
      await axios.post(`${API}/warnings/${id}/cancel`, { reason_code, reason_text });
      onStatusChange({msg:'CAP Cancel wydany — ostrzeżenie zachowane w archiwum',type:'success'});
      setCancelWarning(null);
      onDelete('__refresh__');
    } catch(e){onStatusChange({msg:`Błąd anulowania: ${e.message}`,type:'error'});}
  };

  const handleDelete = async (id, status) => {
    if (status==='active'||status==='pending') {
      onStatusChange({msg:'Nie można usunąć aktywnego ostrzeżenia. Najpierw wydaj CAP Cancel.',type:'error'});
      return;
    }
    const label={cancelled:'anulowane',updated:'zastąpione',expired:'wygasłe'}[status]||status;
    if (!window.confirm(`Usunąć to ${label} ostrzeżenie z archiwum?\n\nTej operacji nie można cofnąć.`)) return;
    try {
      await axios.delete(`${API}/warnings/${id}`);
      onDelete(id);
      onStatusChange({msg:'Ostrzeżenie usunięte z archiwum',type:'info'});
    } catch(e){
      onStatusChange({msg:`Błąd: ${e.response?.data?.detail||e.message}`,type:'error'});
    }
  };

  const handleExportPDF = async (lang = 'pl') => {
    setExporting(true);
    try {
      const res = await axios.get(`${API}/export/pdf?lang=${lang}`, { responseType:'blob' });
      const suffix = lang === 'en' ? '_en' : '';
      downloadBlob(res.data, `meteocap_raport${suffix}_${new Date().toISOString().slice(0,10)}.pdf`, 'application/pdf');
      onStatusChange({msg: lang === 'en' ? 'Raport PDF (EN) pobrany' : 'Raport PDF pobrany', type:'success'});
    } catch(e){onStatusChange({msg:`Błąd PDF: ${e.message}`,type:'error'});}
    finally{setExporting(false);}
  };

  const handleExportPDFBoth = async () => {
    // Pobierz oba pliki PDF jednym kliknięciem
    setExporting(true);
    try {
      const [pl, en] = await Promise.all([
        axios.get(`${API}/export/pdf?lang=pl`, { responseType:'blob' }),
        axios.get(`${API}/export/pdf?lang=en`, { responseType:'blob' }),
      ]);
      const dt = new Date().toISOString().slice(0,10);
      downloadBlob(pl.data, `meteocap_raport_${dt}.pdf`, 'application/pdf');
      // Małe opóźnienie, żeby przeglądarka zdążyła pobrać oba
      setTimeout(() => downloadBlob(en.data, `meteocap_raport_en_${dt}.pdf`, 'application/pdf'), 300);
      onStatusChange({msg:'Pobrano oba raporty PDF (PL + EN)', type:'success'});
    } catch(e){onStatusChange({msg:`Błąd PDF: ${e.message}`,type:'error'});}
    finally{setExporting(false);}
  };

  const renderCard = (w, isArchived=false) => {
    const statusStyle = STATUS_STYLES[w.status]||STATUS_STYLES.unknown;
    const counties = w.counties||[];
    const isActive = w.status==='active'||w.status==='pending';
    const linkedLabel = w.superseded_by
      ? `↑ zastąpione …${w.superseded_by.slice(0,8)}`
      : w.cancelled_by ? `✕ anulowane …${w.cancelled_by.slice(0,8)}`
      : w.references_id ? `↗ ref …${w.references_id.slice(0,8)}` : null;

    return (
      <div key={w.id} className="warning-card" style={{
        border: '1px solid var(--border)',
        opacity: isArchived?0.72:1, transition:'opacity 0.15s',
      }}>
        <div className="warning-card-header">
          <div className={`warning-card-level${w.level?' l'+w.level:''}`}
            style={isArchived?{filter:'grayscale(0.5)'}:undefined}>{w.level||'?'}</div>
          <div className="warning-card-info">
            <div className="warning-card-name">{PHENOMENON_LABELS[w.phenomenon]||w.phenomenon}</div>
            <div className="warning-card-meta">{formatDate(w.onset)} → {formatDate(w.expires)}</div>
          </div>
        </div>

        <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:6,flexWrap:'wrap'}}>
          <span style={{background:statusStyle.bg,color:statusStyle.color,
            padding:'1px 6px',borderRadius:4,fontSize:10,fontWeight:600}}>
            {statusStyle.label}
          </span>
          <span title="Kliknij aby skopiować ID"
            style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',
              cursor:'pointer',textDecoration:'underline dotted'}}
            onClick={()=>{navigator.clipboard.writeText(w.id);onStatusChange({msg:'ID skopiowane',type:'success'});}}>
            {w.id?.slice(0,8)}…
          </span>
          {linkedLabel&&(
            <span style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)',opacity:0.7,fontStyle:'italic'}}>
              {linkedLabel}
            </span>
          )}
        </div>

        {counties.length>0&&(
          <div className="warning-card-counties">
            {counties.slice(0,4).map(c=>c.name).join(', ')}{counties.length>4?` +${counties.length-4}`:''}
          </div>
        )}

        <div className="warning-card-actions" style={{flexWrap:'wrap',gap:5}}>
          <button className="btn btn-secondary btn-sm" onClick={()=>handleDownload(w.id,'collective')} title="Zbiorczy CAP XML">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M1 9v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg> XML
          </button>
          <button className="btn btn-secondary btn-sm" onClick={()=>handleDownload(w.id,'per_county')} title="ZIP per-powiat">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M3 1h4l3 3v7H3V1z" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M7 1v3h3" stroke="currentColor" strokeWidth="1.2"/>
            </svg> ZIP
          </button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setPreviewWarning(w)}
            title="Podgląd treści ostrzeżenia">
            👁
          </button>
          <button className="btn btn-secondary btn-sm" onClick={()=>setTreeWarning(w)}
            title="Pokaż drzewo wersji">
            🌳
          </button>
          {isActive&&(
            <button className="btn btn-secondary btn-sm"
              onClick={() => onEdit && onEdit(w.id)}
              title="Otwórz w edytorze jako aktualizacja">
              🔄 Aktualizacja
            </button>
          )}
          {isActive&&(
            <button className="btn btn-danger btn-sm" onClick={()=>handleCancel(w.id)}
              title="Odwołaj ostrzeżenie — wyśle CAP Cancel, ostrzeżenie trafia do archiwum">
              ✕ Odwołaj
            </button>
          )}
          <button className="btn btn-sm" onClick={()=>handleDelete(w.id,w.status)}
            title={isActive?'Nie można usunąć aktywnego — najpierw Anuluj':'Usuń z archiwum (trwałe)'}
            style={{padding:'3px 8px',fontSize:11,cursor:isActive?'not-allowed':'pointer',
              borderRadius:'var(--radius-sm)',
              border:'1px solid '+(isActive?'var(--border)':'rgba(239,68,68,0.4)'),
              background:'transparent',
              color:isActive?'var(--text-muted)':'var(--warn-3)',
              opacity:isActive?0.3:1}}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{verticalAlign:'middle',marginRight:2}}>
              <path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg> Usuń
          </button>
        </div>
      </div>
    );
  };

  const activeWarnings   = warnings.filter(w=>!STATUS_STYLES[w.status]?.archive);
  const archivedWarnings = warnings.filter(w=>STATUS_STYLES[w.status]?.archive);

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
          <div className="editor-title">Historia ostrzeżeń ({warnings.length})</div>
          <div style={{display:'flex',gap:6}}>
            <button onClick={() => handleExportPDF('pl')} disabled={exporting}
              title="Raport PDF po polsku" style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',
                border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.1)',
                color:'var(--text-accent)',fontSize:11,cursor:'pointer',opacity:exporting?0.5:1}}>
              {exporting?'⏳':'📄'} PDF PL
            </button>
            <button onClick={() => handleExportPDF('en')} disabled={exporting}
              title="Raport PDF po angielsku (dla MeteoAlarm i odbiorców międzynarodowych)"
              style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',
                border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.1)',
                color:'var(--text-accent)',fontSize:11,cursor:'pointer',opacity:exporting?0.5:1}}>
              {exporting?'⏳':'📄'} PDF EN
            </button>
            <button onClick={handleExportPDFBoth} disabled={exporting}
              title="Pobierz oba raporty PDF (PL + EN) jednocześnie"
              style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',
                border:'1px solid var(--success)',background:'rgba(34,197,94,0.1)',
                color:'var(--success)',fontSize:11,cursor:'pointer',opacity:exporting?0.5:1,
                fontWeight:600}}>
              {exporting?'⏳':'📄📄'} PL + EN
            </button>
          </div>
        </div>
      </div>

      {warnings.length===0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🌤</div>
          <div className="empty-state-text">Brak ostrzeżeń.<br/>Przejdź do Edytora aby wydać pierwsze.</div>
        </div>
      ) : (
        <div className="warnings-list">
          {activeWarnings.map(w=>renderCard(w,false))}

          {archivedWarnings.length>0&&(
            <>
              <div style={{display:'flex',alignItems:'center',gap:8,margin:'14px 0 8px',opacity:0.5}}>
                <div style={{flex:1,height:1,background:'var(--border)'}}/>
                <span style={{fontSize:10,color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                  📦 Archiwum ({archivedWarnings.length})
                </span>
                <div style={{flex:1,height:1,background:'var(--border)'}}/>
              </div>
              {archivedWarnings.map(w=>renderCard(w,true))}
            </>
          )}
        </div>
      )}

      {/* Modal podglądu treści ostrzeżenia */}
      {previewWarning && (
        <div style={{position:'fixed',inset:0,zIndex:9000,background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setPreviewWarning(null)}>
          <div style={{width:'min(90vw,600px)',maxHeight:'85vh',overflowY:'auto',
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',boxShadow:'0 8px 64px rgba(0,0,0,0.8)'}}
            onClick={e=>e.stopPropagation()}>

            {/* Nagłówek */}
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',
              display:'flex',alignItems:'center',justifyContent:'space-between',
              background:`${LEVEL_COLORS[previewWarning.level]}22`}}>
              <div style={{display:'flex',alignItems:'center',gap:10}}>
                <div style={{width:32,height:32,borderRadius:6,
                  background:LEVEL_COLORS[previewWarning.level],
                  display:'flex',alignItems:'center',justifyContent:'center',
                  fontSize:16,fontWeight:900,color:'#000'}}>
                  {previewWarning.level}
                </div>
                <div>
                  <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)',display:'flex',alignItems:'center',gap:8}}>
                    {previewWarning.headline || (PHENOMENON_LABELS[previewWarning.phenomenon] || previewWarning.phenomenon)}
                    {previewWarning.version && (
                      <span style={{fontSize:10,padding:'2px 7px',background:'var(--accent-blue)',
                        color:'#000',borderRadius:10,fontWeight:700,fontFamily:'var(--font-mono)'}}>
                        v{previewWarning.version}
                      </span>
                    )}
                    {previewWarning.operation_hint && previewWarning.operation_hint !== 'create' && (
                      <span style={{fontSize:10,padding:'2px 7px',background:'var(--bg-elevated)',
                        color:'var(--text-secondary)',borderRadius:10,border:'1px solid var(--border)'}}>
                        {OP_LABEL[previewWarning.operation_hint] || previewWarning.operation_hint}
                      </span>
                    )}
                  </div>
                  <div style={{fontSize:11,color:'var(--text-muted)'}}>
                    {new Date(previewWarning.onset).toLocaleString('pl-PL')} → {new Date(previewWarning.expires).toLocaleString('pl-PL')}
                    {previewWarning.source === 'IMGW-API' && <span style={{marginLeft:8,color:'var(--accent-blue)'}}>🌩 IMGW API</span>}
                    {previewWarning.is_cancelled && <span style={{marginLeft:8,color:'var(--warn-3)'}}>✕ Anulowane</span>}
                  </div>
                </div>
              </div>
              <button onClick={()=>setPreviewWarning(null)}
                style={{background:'none',border:'none',color:'var(--text-muted)',
                  cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
            </div>

            {/* Treść */}
            <div style={{padding:'14px 18px'}}>
              {previewWarning.description && (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:'var(--accent-blue)',textTransform:'uppercase',
                    letterSpacing:'0.08em',marginBottom:6}}>📋 Przebieg</div>
                  <div style={{fontSize:12,color:'var(--text-secondary)',lineHeight:1.6,
                    fontStyle:'italic',padding:'8px 12px',background:'var(--bg-elevated)',
                    borderRadius:'var(--radius-md)',borderLeft:`3px solid ${LEVEL_COLORS[previewWarning.level]}`}}>
                    {previewWarning.description}
                  </div>
                </div>
              )}

              {previewWarning.impacts && (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:'var(--warn-2)',textTransform:'uppercase',
                    letterSpacing:'0.08em',marginBottom:6}}>⚡ Spodziewane skutki</div>
                  {previewWarning.impacts.split('\n').filter(l=>l.trim()).map((imp,i)=>(
                    <div key={i} style={{fontSize:12,color:'var(--text-secondary)',
                      paddingLeft:14,marginBottom:4,position:'relative'}}>
                      <span style={{position:'absolute',left:0,color:'var(--warn-2)'}}>·</span>
                      {imp.replace(/^•\s*/,'')}
                    </div>
                  ))}
                </div>
              )}

              {previewWarning.instruction && (
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:10,color:'var(--success)',textTransform:'uppercase',
                    letterSpacing:'0.08em',marginBottom:6}}>✓ Co robić</div>
                  {previewWarning.instruction.split('\n').filter(l=>l.trim()).map((ins,i)=>(
                    <div key={i} style={{fontSize:12,color:'var(--text-secondary)',
                      paddingLeft:14,marginBottom:4,position:'relative'}}>
                      <span style={{position:'absolute',left:0,color:'var(--success)'}}>✓</span>
                      {ins.replace(/^•\s*/,'')}
                    </div>
                  ))}
                </div>
              )}

              {previewWarning.counties?.length > 0 && (() => {
                // Grupuj powiaty wg województwa
                const byVoiv = {};
                (previewWarning.counties || []).forEach(c => {
                  const v = c.voiv_name || 'inne';
                  if (!byVoiv[v]) byVoiv[v] = [];
                  byVoiv[v].push(c);
                });
                return (
                  <div>
                    <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',
                      letterSpacing:'0.08em',marginBottom:6}}>
                      Obszar ({previewWarning.counties.length} powiat{previewWarning.counties.length===1?'':previewWarning.counties.length<5?'y':'ów'})
                    </div>
                    {Object.entries(byVoiv).map(([voiv, list]) => (
                      <div key={voiv} style={{marginBottom:4,fontSize:11,lineHeight:1.5}}>
                        <strong style={{color:'var(--text-primary)',fontWeight:700}}>
                          {voiv.toLowerCase()}:
                        </strong>
                        {' '}<span style={{color:'var(--text-secondary)'}}>
                          {list.map(c => c.name.toLowerCase()).join(', ')}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: CANCEL Z PRZYCZYNĄ === */}
      {cancelWarning && (
        <div style={{position:'fixed',inset:0,zIndex:9100,background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setCancelWarning(null)}>
          <div style={{width:'min(90vw,500px)',background:'var(--bg-surface)',
            border:'1px solid var(--border)',borderRadius:'var(--radius-lg)',
            boxShadow:'0 8px 64px rgba(0,0,0,0.8)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
                ✕ Odwołaj ostrzeżenie
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                {PHENOMENON_LABELS[cancelWarning.phenomenon] || cancelWarning.phenomenon} · St.{cancelWarning.level}
              </div>
            </div>
            <div style={{padding:'14px 18px'}}>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:10}}>
                Wybierz przyczynę odwołania (wpisana zostanie w pole opisu CAP Cancel):
              </div>
              <CancelReasonForm warning={cancelWarning} onCancel={performCancel}
                onClose={()=>setCancelWarning(null)} />
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: PARTIAL CANCEL === */}
      {partialCancelWarning && (
        <div style={{position:'fixed',inset:0,zIndex:9100,background:'rgba(0,0,0,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setPartialCancelWarning(null)}>
          <div style={{width:'min(95vw,720px)',maxHeight:'90vh',overflowY:'auto',
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',boxShadow:'0 8px 64px rgba(0,0,0,0.8)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
                ✂ Wytnij część obszaru
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                {PHENOMENON_LABELS[partialCancelWarning.phenomenon] || partialCancelWarning.phenomenon} · St.{partialCancelWarning.level}
                {' · '}{partialCancelWarning.counties?.length || 0} powiatów
              </div>
            </div>
            <div style={{padding:'14px 18px'}}>
              <PartialCancelForm warning={partialCancelWarning}
                onSubmit={async (countyIds, reason_code, reason_text) => {
                  try {
                    await axios.post(`${API}/warnings/${partialCancelWarning.id}/partial-cancel`, {
                      counties_to_cancel: countyIds,
                      reason_code, reason_text,
                    });
                    onStatusChange({msg:'Wycięto obszar — wydano CAP Update + CAP Cancel', type:'success'});
                    setPartialCancelWarning(null);
                    onDelete('__refresh__');
                  } catch(e) {
                    onStatusChange({msg:`Błąd: ${e.response?.data?.detail || e.message}`, type:'error'});
                  }
                }}
                onClose={()=>setPartialCancelWarning(null)} />
            </div>
          </div>
        </div>
      )}

      {/* === MODAL: DRZEWO WERSJI === */}
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
              <div>
                <div style={{fontSize:14,fontWeight:700,color:'var(--text-primary)'}}>
                  🌳 Drzewo wersji ostrzeżenia
                </div>
                <div style={{fontSize:11,color:'var(--text-muted)',marginTop:4}}>
                  {PHENOMENON_LABELS[treeWarning.phenomenon] || treeWarning.phenomenon}
                </div>
              </div>
              <button onClick={()=>setTreeWarning(null)}
                style={{background:'none',border:'none',color:'var(--text-muted)',
                  cursor:'pointer',fontSize:20,lineHeight:1}}>✕</button>
            </div>
            <div style={{padding:'14px 18px'}}>
              <WarningTreeView warningId={treeWarning.id} />
            </div>
            {/* Partial cancel — wytnij część obszaru z aktywnego liścia */}
            {treeWarning.is_active_leaf !== false && !treeWarning.is_cancelled && (
              <div style={{padding:'10px 18px',borderTop:'1px solid var(--border)',
                display:'flex',justifyContent:'flex-end'}}>
                <button onClick={() => { setTreeWarning(null); setPartialCancelWarning(treeWarning); }}
                  style={{fontSize:11,padding:'5px 12px',background:'transparent',
                    border:'1px solid var(--border)',borderRadius:'var(--radius-md)',
                    color:'var(--text-muted)',cursor:'pointer'}}>
                  ✂ Wytnij część obszaru…
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============= HELPER COMPONENTS =============

function CancelReasonForm({ warning, onCancel, onClose }) {
  const [reasonCode, setReasonCode] = useState('ended');
  const [customText, setCustomText] = useState('');
  const presets = {
    ended:        'Zjawisko ustąpiło.',
    not_occurred: 'Zjawisko nie wystąpiło.',
    downgrade:    'Zagrożenie zmalało poniżej poziomu ostrzeżenia.',
  };
  return (
    <div>
      <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:12}}>
        {Object.entries(presets).map(([code, txt]) => (
          <label key={code} style={{display:'flex',gap:8,alignItems:'flex-start',cursor:'pointer',
            padding:'8px 10px',background:reasonCode===code?'var(--bg-elevated)':'transparent',
            border:`1px solid ${reasonCode===code?'var(--accent-blue)':'var(--border)'}`,
            borderRadius:'var(--radius-md)'}}>
            <input type="radio" checked={reasonCode===code} onChange={()=>setReasonCode(code)}/>
            <div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)'}}>{txt}</div>
            </div>
          </label>
        ))}
        <label style={{display:'flex',gap:8,alignItems:'flex-start',cursor:'pointer',
          padding:'8px 10px',background:reasonCode==='custom'?'var(--bg-elevated)':'transparent',
          border:`1px solid ${reasonCode==='custom'?'var(--accent-blue)':'var(--border)'}`,
          borderRadius:'var(--radius-md)'}}>
          <input type="radio" checked={reasonCode==='custom'} onChange={()=>setReasonCode('custom')}/>
          <div style={{flex:1}}>
            <div style={{fontSize:11,fontWeight:600,color:'var(--text-primary)',marginBottom:4}}>
              Inny powód:
            </div>
            <input type="text" className="form-input" value={customText}
              onChange={e=>setCustomText(e.target.value)} placeholder="Opisz przyczynę..."
              style={{fontSize:11}} disabled={reasonCode!=='custom'}/>
          </div>
        </label>
      </div>
      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Anuluj</button>
        <button className="btn btn-danger btn-sm"
          disabled={reasonCode==='custom' && !customText.trim()}
          onClick={()=>onCancel(warning.id, reasonCode, reasonCode==='custom'?customText:undefined)}>
          ✕ Wydaj CAP Cancel
        </button>
      </div>
    </div>
  );
}

function PartialCancelForm({ warning, onSubmit, onClose }) {
  const [selectedToCancel, setSelectedToCancel] = useState(new Set());
  const [reasonCode, setReasonCode] = useState('ended');
  const [customText, setCustomText] = useState('');
  const counties = warning.counties || [];
  const presets = {
    ended:        'Zjawisko ustąpiło dla wskazanego obszaru.',
    not_occurred: 'Zjawisko nie wystąpiło dla wskazanego obszaru.',
    downgrade:    'Zagrożenie zmalało dla wskazanego obszaru.',
  };
  const toggle = (id) => {
    const s = new Set(selectedToCancel);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedToCancel(s);
  };
  const selectAll = () => setSelectedToCancel(new Set(counties.map(c => c.id)));
  const clearAll = () => setSelectedToCancel(new Set());
  const invertAll = () => {
    const all = new Set(counties.map(c => c.id));
    const inv = new Set();
    all.forEach(id => { if (!selectedToCancel.has(id)) inv.add(id); });
    setSelectedToCancel(inv);
  };
  const toggleVoiv = (voivCounties, mode) => {
    const s = new Set(selectedToCancel);
    if (mode === 'select') voivCounties.forEach(c => s.add(c.id));
    else voivCounties.forEach(c => s.delete(c.id));
    setSelectedToCancel(s);
  };
  // Grupuj powiaty po województwie
  const byVoiv = {};
  counties.forEach(c => {
    const v = c.voiv_name || 'Inne';
    if (!byVoiv[v]) byVoiv[v] = [];
    byVoiv[v].push(c);
  });
  const remainCount = counties.length - selectedToCancel.size;
  return (
    <div>
      <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:10}}>
        Zaznacz powiaty które chcesz wyciąć z ostrzeżenia. Pozostała część zostanie zaktualizowana
        (CAP Update), a wycięte powiaty otrzymają CAP Cancel — oba zostaną wysłane automatycznie.
      </div>
      <div style={{padding:'8px 10px',background:'var(--bg-elevated)',
        borderRadius:'var(--radius-md)',marginBottom:10,fontSize:11}}>
        <b style={{color:'var(--warn-2)'}}>Wycinasz: {selectedToCancel.size}</b>
        {' · '}
        <b style={{color:'var(--success)'}}>Pozostaje: {remainCount}</b>
        {remainCount === 0 && (
          <span style={{color:'var(--warn-3)',marginLeft:8}}>
            ⚠ Wszystkie wycięte — użyj zwykłego anulowania
          </span>
        )}
      </div>

      {/* Akcje masowe */}
      <div style={{display:'flex',gap:6,marginBottom:8}}>
        <button onClick={selectAll}
          style={{fontSize:10,padding:'4px 8px',background:'var(--bg-elevated)',
            color:'var(--text-secondary)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-md)',cursor:'pointer'}}>
          ☑ Zaznacz wszystkie
        </button>
        <button onClick={clearAll}
          style={{fontSize:10,padding:'4px 8px',background:'var(--bg-elevated)',
            color:'var(--text-secondary)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-md)',cursor:'pointer'}}>
          ☐ Odznacz wszystkie
        </button>
        <button onClick={invertAll}
          style={{fontSize:10,padding:'4px 8px',background:'var(--bg-elevated)',
            color:'var(--text-secondary)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-md)',cursor:'pointer'}}>
          ⇄ Odwróć zaznaczenie
        </button>
      </div>

      <div style={{maxHeight:300,overflowY:'auto',padding:8,background:'var(--bg-elevated)',
        borderRadius:'var(--radius-md)',marginBottom:12}}>
        {Object.entries(byVoiv).map(([voiv, list]) => {
          const allSelected = list.every(c => selectedToCancel.has(c.id));
          const noneSelected = list.every(c => !selectedToCancel.has(c.id));
          return (
            <div key={voiv} style={{marginBottom:8}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:4}}>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',
                  letterSpacing:'0.06em',flex:1}}>
                  {voiv} <span style={{opacity:0.6}}>({list.length})</span>
                </div>
                <button onClick={() => toggleVoiv(list, 'select')} disabled={allSelected}
                  title={`Zaznacz wszystkie powiaty z: ${voiv}`}
                  style={{fontSize:9,padding:'2px 6px',background:'transparent',
                    color:allSelected?'var(--text-muted)':'var(--warn-2)',
                    border:`1px solid ${allSelected?'var(--border)':'var(--warn-2)'}`,
                    borderRadius:3,cursor:allSelected?'default':'pointer',
                    opacity:allSelected?0.4:1}}>
                  ☑ całe
                </button>
                <button onClick={() => toggleVoiv(list, 'clear')} disabled={noneSelected}
                  title={`Odznacz wszystkie powiaty z: ${voiv}`}
                  style={{fontSize:9,padding:'2px 6px',background:'transparent',
                    color:noneSelected?'var(--text-muted)':'var(--text-secondary)',
                    border:`1px solid ${noneSelected?'var(--border)':'var(--border-active)'}`,
                    borderRadius:3,cursor:noneSelected?'default':'pointer',
                    opacity:noneSelected?0.4:1}}>
                  ☐ żadne
                </button>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {list.map(c => {
                  const checked = selectedToCancel.has(c.id);
                  return (
                    <label key={c.id} style={{display:'inline-flex',alignItems:'center',gap:4,
                      padding:'3px 6px',fontSize:10,cursor:'pointer',
                      background:checked?'var(--warn-2)':'var(--bg-surface)',
                      color:checked?'#000':'var(--text-secondary)',
                      border:`1px solid ${checked?'var(--warn-2)':'var(--border)'}`,
                      borderRadius:3, fontFamily:'var(--font-mono)'}}>
                      <input type="checkbox" checked={checked} onChange={()=>toggle(c.id)}
                        style={{margin:0,width:10,height:10}}/>
                      {c.name}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',
        letterSpacing:'0.06em',marginBottom:6}}>Powód wycięcia (CAP Cancel)</div>
      <select className="form-select" value={reasonCode}
        onChange={e=>setReasonCode(e.target.value)} style={{marginBottom:8}}>
        {Object.entries(presets).map(([code, txt]) => (
          <option key={code} value={code}>{txt}</option>
        ))}
        <option value="custom">Inny powód…</option>
      </select>
      {reasonCode==='custom' && (
        <input type="text" className="form-input" value={customText}
          onChange={e=>setCustomText(e.target.value)} placeholder="Wpisz powód..."
          style={{fontSize:11,marginBottom:12}}/>
      )}

      <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
        <button className="btn btn-secondary btn-sm" onClick={onClose}>Anuluj</button>
        <button className="btn btn-primary btn-sm"
          disabled={selectedToCancel.size===0 || remainCount===0 || (reasonCode==='custom' && !customText.trim())}
          onClick={()=>onSubmit([...selectedToCancel], reasonCode, reasonCode==='custom'?customText:undefined)}>
          ✂ Wytnij {selectedToCancel.size} powiat{selectedToCancel.size===1?'':'ów'}
        </button>
      </div>
    </div>
  );
}

function WarningTreeView({ warningId }) {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  React.useEffect(() => {
    setLoading(true);
    axios.get(`${API}/warnings/${warningId}/tree`)
      .then(r => { setTree(r.data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [warningId]);

  const downloadChain = async () => {
    try {
      const res = await axios.get(`${API}/warnings/${warningId}/chain-zip`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const cd = res.headers['content-disposition'] || '';
      const m = cd.match(/filename="?([^"]+)"?/);
      link.download = m ? m[1] : `meteocap_chain_${warningId.slice(0,8)}.zip`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch(e) {
      alert(`Błąd pobierania: ${e.message}`);
    }
  };

  if (loading) return <div style={{color:'var(--text-muted)'}}>Ładowanie…</div>;
  if (error) return <div style={{color:'var(--warn-3)'}}>Błąd: {error}</div>;
  if (!tree || !tree.nodes?.length) return <div style={{color:'var(--text-muted)'}}>Brak danych drzewa</div>;

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:11,color:'var(--text-muted)'}}>
          {tree.nodes.length} wersj{tree.nodes.length === 1 ? 'a' : tree.nodes.length < 5 ? 'e' : 'i'} w grupie
        </div>
        <button onClick={downloadChain} className="btn btn-secondary btn-sm"
          title="Pobierz wszystkie CAP XML z grupy + manifest jako ZIP (audyt, prokuratura)">
          📦 Pobierz łańcuch CAP (ZIP)
        </button>
      </div>
      <TreeSVG nodes={tree.nodes} edges={tree.edges} />
    </div>
  );
}

// === SVG drzewo wersji ===
function TreeSVG({ nodes, edges }) {
  // Layout: nodes mają parent_id (z edges). Pozycjonujemy jako drzewo z poziomami.
  const byParent = {};
  edges.forEach(e => {
    if (!byParent[e.from]) byParent[e.from] = [];
    byParent[e.from].push(e.to);
  });
  const childrenOf = id => byParent[id] || [];
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));
  const roots = nodes.filter(n => !edges.some(e => e.to === n.id));

  // BFS pozycjonowanie
  const positions = {};
  let maxY = 0;
  function place(id, depth, xSlot) {
    positions[id] = { depth, xSlot };
    maxY = Math.max(maxY, depth);
    const ch = childrenOf(id);
    ch.forEach((cid, i) => place(cid, depth + 1, xSlot + i));
  }
  let xCounter = 0;
  roots.forEach(r => { place(r.id, 0, xCounter); xCounter += Math.max(1, countLeaves(r.id, byParent)); });

  function countLeaves(id, byParent) {
    const ch = byParent[id] || [];
    if (!ch.length) return 1;
    return ch.reduce((sum, c) => sum + countLeaves(c, byParent), 0);
  }

  // Wymiary
  const NODE_W = 140;
  const NODE_H = 65;
  const H_GAP  = 30;
  const V_GAP  = 30;
  const PAD    = 20;
  const LEGEND_H = 65;  // miejsce na legendę pod drzewem

  const xCount = Math.max(1, ...Object.values(positions).map(p => p.xSlot + 1));
  const yCount = maxY + 1;
  const totalW = PAD*2 + xCount * NODE_W + (xCount-1) * H_GAP;
  const totalH = PAD*2 + yCount * NODE_H + (yCount-1) * V_GAP + LEGEND_H;

  const xy = (id) => {
    const p = positions[id];
    if (!p) return { x: PAD, y: PAD };  // fallback — węzeł nie dotarty przez place()
    return {
      x: PAD + p.xSlot * (NODE_W + H_GAP),
      y: PAD + p.depth * (NODE_H + V_GAP),
    };
  };

  const LEVEL_COL = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };
  const STATUS_COL = {
    active:     '#22c55e',
    superseded: '#64748b',
    cancelled:  '#ef4444',
  };

  return (
    <div style={{overflowX:'auto',overflowY:'auto',maxHeight:'60vh',WebkitOverflowScrolling:'touch'}}>
    <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}
      style={{display:'block',minWidth:totalW}}>
      {/* Edges */}
      {edges.map((e, i) => {
        const from = xy(e.from);
        const to = xy(e.to);
        const x1 = from.x + NODE_W/2;
        const y1 = from.y + NODE_H;
        const x2 = to.x + NODE_W/2;
        const y2 = to.y;
        const ymid = (y1 + y2) / 2;
        const path = `M${x1} ${y1} C${x1} ${ymid}, ${x2} ${ymid}, ${x2} ${y2}`;
        return <path key={i} d={path} fill="none" stroke="#64748b" strokeWidth="1.5" strokeDasharray={nodeMap[e.to]?.status==='cancelled'?'5,3':'none'}/>;
      })}
      {/* Nodes */}
      {nodes.map(n => {
        const p = xy(n.id);
        const lvlCol = LEVEL_COL[n.level] || '#94a3b8';
        const statCol = STATUS_COL[n.status] || '#64748b';
        const isLeaf = n.is_active_leaf;
        return (
          <g key={n.id} transform={`translate(${p.x}, ${p.y})`} style={{cursor:'help'}}>
            <title>{`Wersja ${n.version}\nStopień ${n.level || '?'}\nOperacja: ${OP_LABEL[n.operation] || n.operation}\nStatus: ${n.status === 'active' ? 'Aktywny liść' : n.status === 'cancelled' ? 'Anulowane' : 'Zastąpione'}\nPowiatów: ${n.counties_count}\n${n.headline || ''}\nUtworzone: ${n.created_at ? new Date(n.created_at).toLocaleString('pl-PL') : '?'}\nID: ${n.id}`}</title>
            <rect width={NODE_W} height={NODE_H} rx="6"
              fill="rgba(20,28,46,0.95)"
              stroke={isLeaf ? statCol : '#3b4868'}
              strokeWidth={isLeaf ? "2.5" : "1"} />
            {/* Lewa kreska — kolor stopnia */}
            <rect x="0" y="0" width="4" height={NODE_H} rx="2" fill={lvlCol}/>
            {/* Wersja + status */}
            <text x="10" y="14" fontSize="10" fontWeight="700" fill="#e4ecf8">
              v{n.version} · St.{n.level || '?'}
            </text>
            <circle cx={NODE_W-12} cy="12" r="4" fill={statCol}/>
            {/* Operacja */}
            <text x="10" y="29" fontSize="9" fill="#94a3b8">
              {OP_LABEL[n.operation] || n.operation}
            </text>
            {/* Liczba powiatów */}
            <text x="10" y="42" fontSize="9" fill="#64748b">
              {n.counties_count} powiatów
            </text>
            {/* Czas */}
            <text x="10" y="56" fontSize="8" fill="#475569" fontFamily="monospace">
              {n.created_at ? new Date(n.created_at).toLocaleString('pl-PL', {
                day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
              }) : ''}
            </text>
          </g>
        );
      })}
      {/* Legenda — pod drzewem */}
      <g transform={`translate(${PAD}, ${totalH - LEGEND_H})`}>
        <rect width="160" height="55" rx="4" fill="rgba(20,28,46,0.9)" stroke="#3b4868"/>
        <text x="8" y="13" fontSize="9" fill="#94a3b8" fontWeight="600">Status</text>
        <circle cx="14" cy="26" r="4" fill="#22c55e"/>
        <text x="22" y="29" fontSize="9" fill="#cbd5e1">Aktywny liść</text>
        <circle cx="14" cy="40" r="4" fill="#64748b"/>
        <text x="22" y="43" fontSize="9" fill="#cbd5e1">Zastąpione</text>
        <circle cx="90" cy="26" r="4" fill="#ef4444"/>
        <text x="98" y="29" fontSize="9" fill="#cbd5e1">Anulowane</text>
      </g>
    </svg>
    </div>
  );
}

export { WarningTreeView, TreeSVG };
