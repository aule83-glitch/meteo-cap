import React, { useState } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

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

export default function WarningsList({ warnings, onDelete, onStatusChange, onHighlight, highlightedId }) {
  const [exporting, setExporting] = useState(false);

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
    if (!window.confirm('Wydać komunikat CAP Cancel dla tego ostrzeżenia?\n\nOstrzeżenie zostanie oznaczone jako Anulowane i zachowane w archiwum.')) return;
    try {
      await axios.post(`${API}/warnings/${id}/cancel`);
      onStatusChange({msg:'CAP Cancel wydany — ostrzeżenie zachowane w archiwum',type:'success'});
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

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const res=await axios.get(`${API}/export/pdf`,{responseType:'blob'});
      downloadBlob(res.data,`meteocap_raport_${new Date().toISOString().slice(0,10)}.pdf`,'application/pdf');
      onStatusChange({msg:'Raport PDF pobrany',type:'success'});
    } catch(e){onStatusChange({msg:`Błąd PDF: ${e.message}`,type:'error'});}
    finally{setExporting(false);}
  };

  const handleExportSVG = async () => {
    setExporting(true);
    try {
      const res=await axios.get(`${API}/export/svg`,{responseType:'blob'});
      downloadBlob(res.data,'meteocap_mapa.svg','image/svg+xml');
      onStatusChange({msg:'Mapa SVG pobrana',type:'success'});
    } catch(e){onStatusChange({msg:`Błąd SVG: ${e.message}`,type:'error'});}
    finally{setExporting(false);}
  };

  const renderCard = (w, isArchived=false) => {
    const statusStyle = STATUS_STYLES[w.status]||STATUS_STYLES.unknown;
    const isHighlighted = highlightedId===w.id;
    const counties = w.counties||[];
    const isActive = w.status==='active'||w.status==='pending';
    const linkedLabel = w.superseded_by
      ? `↑ zastąpione …${w.superseded_by.slice(0,8)}`
      : w.cancelled_by ? `✕ anulowane …${w.cancelled_by.slice(0,8)}`
      : w.references_id ? `↗ ref …${w.references_id.slice(0,8)}` : null;

    return (
      <div key={w.id} className="warning-card" style={{
        border: isHighlighted?'1px solid var(--accent-blue)':undefined,
        boxShadow: isHighlighted?'0 0 0 2px var(--accent-glow)':undefined,
        opacity: isArchived?0.72:1, transition:'opacity 0.15s',
      }}>
        <div className="warning-card-header">
          <div className={`warning-card-level${w.level?' l'+w.level:''}`}
            style={isArchived?{filter:'grayscale(0.5)'}:undefined}>{w.level||'?'}</div>
          <div className="warning-card-info">
            <div className="warning-card-name">{PHENOMENON_LABELS[w.phenomenon]||w.phenomenon}</div>
            <div className="warning-card-meta">{formatDate(w.onset)} → {formatDate(w.expires)}</div>
          </div>
          <button onClick={()=>onHighlight?.(w.id)}
            title={isHighlighted?'Ukryj na mapie':'Pokaż na mapie'}
            style={{background:isHighlighted?'rgba(59,130,246,0.2)':'transparent',
              border:'1px solid '+(isHighlighted?'var(--accent-blue)':'var(--border)'),
              borderRadius:'var(--radius-sm)',padding:'3px 8px',
              color:isHighlighted?'var(--text-accent)':'var(--text-muted)',
              fontSize:11,cursor:'pointer',flexShrink:0}}>
            {isHighlighted?'📍':'🗺'}
          </button>
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
          {isActive&&(
            <button className="btn btn-danger btn-sm" onClick={()=>handleCancel(w.id)}
              title="Wydaj CAP Cancel — ostrzeżenie trafia do archiwum">
              ✕ Anuluj
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
            <button onClick={handleExportSVG} disabled={exporting}
              title="Eksport mapy SVG" style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',
                border:'1px solid var(--border)',background:'var(--bg-elevated)',
                color:'var(--text-secondary)',fontSize:11,cursor:'pointer',opacity:exporting?0.5:1}}>
              🗺 SVG
            </button>
            <button onClick={handleExportPDF} disabled={exporting}
              title="Raport PDF" style={{padding:'4px 10px',borderRadius:'var(--radius-sm)',
                border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.1)',
                color:'var(--text-accent)',fontSize:11,cursor:'pointer',opacity:exporting?0.5:1}}>
              {exporting?'⏳':'📄'} PDF
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
    </div>
  );
}
