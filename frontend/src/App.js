import React, { useState, useCallback, useEffect, useRef } from 'react';
import axios from 'axios';
import MapPanel from './components/map/MapPanel';
import EditorPanel from './components/editor/EditorPanel';
import WarningsList from './components/editor/WarningsList';
import StatusView from './components/map/StatusView';
import WebhooksPanel from './components/editor/WebhooksPanel';
import DeliveryPanel from './components/editor/DeliveryPanel';
import Header from './components/common/Header';
import StatusBar from './components/common/StatusBar';
import './App.css';

// Adres API względem BASE_URL — dzięki temu aplikacja działa i pod /osmet-dev/,
// i bezpośrednio po porcie, bez zmiany kodu.
const API = import.meta.env.VITE_API_URL || ((import.meta.env.BASE_URL || '/') + 'api');

export default function App() {
  const [selectedCounties,   setSelectedCounties]   = useState([]);
  const [drawnPolygon,       setDrawnPolygon]        = useState(null);
  const [warnings,           setWarnings]            = useState([]);
  const [view,               setView]                = useState('editor');
  const [status,             setStatus]              = useState({ msg: 'Gotowy do pracy', type: 'info' });
  const [highlightedWarning, setHighlightedWarning] = useState(null);
  const [pendingEditId,      setPendingEditId]      = useState(null);  // deterministyczne „edytuj z listy/statusu"
  const [pendingCopyId,      setPendingCopyId]      = useState(null);  // „kopiuj ostrzeżenie" → edytor wypełnia się jako NOWE
  const [editingWarningId,   setEditingWarningId]   = useState(null);  // trwający tryb Update → mapa przygasza resztę
  const [warnOrder,          setWarnOrder]          = useState([]);    // ręczna kolejność ostrzeżeń (lista boczna; góra listy = wierzch mapy)
  // Telefon/tablet: pokazujemy NA PEŁNYM EKRANIE albo mapę, albo panel.
  // (Dzielenie ekranu na pół dawało nieczytelny edytor i zerową wysokość mapy w Statusie.)
  const [mobilePane, setMobilePane] = useState('map');   // 'map' | 'panel'
  const [devNoteOpen, setDevNoteOpen] = useState(true);  // pasek „narzędzie deweloperskie"
  const [conflictCounties, setConflictCounties] = useState([]);   // B3: powiaty do podświetlenia
  const [draftContext, setDraftContext] = useState(null);         // B2: {phenomenon, onset, expires, excludeId}
  // B1: historia zaznaczenia — „Cała Polska" / „Wyczyść" kasowały kwadrans pracy bezpowrotnie
  const selHistory = useRef({ past: [], future: [] });
  const pushSelHistory = useCallback((prev) => {
    selHistory.current.past.push(prev);
    if (selHistory.current.past.length > 30) selHistory.current.past.shift();
    selHistory.current.future = [];
  }, []);
  const undoSelection = useCallback(() => {
    const h = selHistory.current;
    if (!h.past.length) return;
    setSelectedCounties(cur => { h.future.push(cur); return h.past.pop(); });
  }, []);
  const redoSelection = useCallback(() => {
    const h = selHistory.current;
    if (!h.future.length) return;
    setSelectedCounties(cur => { h.past.push(cur); return h.future.pop(); });
  }, []);

  // Skróty klawiszowe: Ctrl+Z cofnij, Ctrl+Shift+Z / Ctrl+Y ponów
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undoSelection(); }
      else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redoSelection(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undoSelection, redoSelection]);
  const [settingsTab, setSettingsTab]                 = useState('delivery');

  // MeteoAlarm — stan współdzielony między MapPanel a StatusView
  const [maEnabled, setMaEnabled] = useState(() => {
    try { return localStorage.getItem('meteocap_ma_enabled') === 'true'; } catch { return false; }
  });
  const [maCountries, setMaCountries] = useState(() => {
    try {
      const s = localStorage.getItem('meteocap_ma_countries');
      return s ? JSON.parse(s) : ['DE','CZ','SK','UA','LT'];
    } catch { return ['DE','CZ','SK','UA','LT']; }
  });
  const [maWarnings, setMaWarnings] = useState([]);
  const [maLoading,  setMaLoading]  = useState(false);
  const [maLastFetch, setMaLastFetch] = useState(null);

  const loadMaWarnings = useCallback(async () => {
    if (!maEnabled || !maCountries.length) { setMaWarnings([]); return; }
    setMaLoading(true);
    try {
      const res = await axios.get(`${API}/meteoalarm/warnings?countries=${maCountries.join(',')}`);
      setMaWarnings(res.data.warnings || []);
      setMaLastFetch(new Date());
    } catch (e) { console.warn('MeteoAlarm error:', e); }
    finally { setMaLoading(false); }
  }, [maEnabled, maCountries]);

  useEffect(() => {
    loadMaWarnings();
    const interval = setInterval(loadMaWarnings, 600000); // co 10 min
    return () => clearInterval(interval);
  }, [loadMaWarnings]);

  const loadWarnings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/warnings?include_expired=false`);
      setWarnings(res.data.warnings || []);
    } catch (e) { console.warn('Błąd ładowania ostrzeżeń:', e); }
  }, []);

  useEffect(() => {
    // zmiana widoku mobilnego zmienia wymiary kontenera mapy
    const t = setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
    return () => clearTimeout(t);
  }, [mobilePane, view]);

  useEffect(() => {
    loadWarnings();
    const interval = setInterval(loadWarnings, 30000);
    return () => clearInterval(interval);
  }, [loadWarnings]);

  const handlePolygonDrawn = useCallback((polygon, counties) => {
    setDrawnPolygon(polygon);
    setSelectedCounties(prev => { pushSelHistory(prev); return counties; });
    setStatus({
      msg: `Zaznaczono ${counties.length} powiat${counties.length===1?'':counties.length<5?'y':'ów'} — kliknij na powiat aby dodać/usunąć`,
      type: 'success',
    });
  }, [pushSelHistory]);

  const handleCountyToggle = useCallback((countyProps) => {
    setSelectedCounties(prev => {
      pushSelHistory(prev);
      const exists = prev.find(c => c.id === countyProps.id);
      if (exists) {
        setStatus({ msg: `Usunięto powiat ${countyProps.name}`, type: 'info' });
        return prev.filter(c => c.id !== countyProps.id);
      }
      setStatus({ msg: `Dodano powiat ${countyProps.name}`, type: 'success' });
      return [...prev, {
        id: countyProps.id, name: countyProps.name,
        voiv_id: countyProps.voiv_id, voiv_name: countyProps.voiv_name,
        lat: countyProps.lat || 0, lon: countyProps.lon || 0,
      }];
    });
  }, []);

  // Podświetl ostrzeżenie na mapie i przełącz do widoku edytora (gdzie mapa jest widoczna)
  const handleHighlightWarning = useCallback((warningId) => {
    setHighlightedWarning(prev => prev === warningId ? null : warningId);
    if (view === 'list') setView('editor'); // pokaż mapę
  }, [view]);

  const handleWarningCreated = useCallback((warning) => {
    setWarnings(prev => [warning, ...prev]);
    setHighlightedWarning(null);   // po zapisie edycji wyróżnienie się czyści
    setEditingWarningId(null);
    setStatus({ msg: `Ostrzeżenie stopień ${warning.level} — ${warning.phenomenon?.replace(/_/g,' ')} wydane`, type: 'success' });
  }, []);

  // Wczytaj powiaty z istniejącego ostrzeżenia na mapę (przy Update)
  const handleLoadCountiesToMap = useCallback((counties) => {
    setSelectedCounties(prev => { pushSelHistory(prev); return counties || []; });
    setDrawnPolygon(null);
    if (counties?.length) {
      setStatus({ msg: `Załadowano zasięg oryginału: ${counties.length} powiat${counties.length===1?'':counties.length<5?'y':'ów'} — możesz go edytować`, type: 'info' });
    }
  }, []);

  const handleWarningDeleted = useCallback((id) => {
    if (id === '__refresh__') { loadWarnings(); return; }
    setWarnings(prev => prev.filter(w => w.id !== id));
    if (highlightedWarning === id) setHighlightedWarning(null);
    setStatus({ msg: 'Ostrzeżenie usunięte', type: 'info' });
  }, [highlightedWarning, loadWarnings]);

  const handleClearSelection = useCallback(() => {
    // B1: przy większym zaznaczeniu pytamy — wcześniej jedno kliknięcie kasowało kwadrans pracy
    setSelectedCounties(prev => {
      if (prev.length > 5 &&
          !window.confirm(`Wyczyścić zaznaczenie ${prev.length} powiatów?\n\n` +
                          `Możesz też cofnąć zmianę skrótem Ctrl+Z.`)) {
        return prev;
      }
      pushSelHistory(prev);
      setDrawnPolygon(null);
      setHighlightedWarning(null);
      setStatus({ msg: 'Wyczyszczono zaznaczenie (Ctrl+Z cofa)', type: 'info' });
      return [];
    });
  }, [pushSelHistory]);

  const activeCount  = warnings.filter(w => w.status === 'active').length;
  const pendingCount = warnings.filter(w => w.status === 'pending').length;

  // Mapa widoczna w widoku edytora i listy (nie w statusie)
  const showMap = view !== 'status' && view !== 'settings';

  return (
    <div className="app-root">
      <Header
        view={view} onViewChange={setView}
        warningsCount={warnings.length}
        activeCount={activeCount} pendingCount={pendingCount}
      />
      {/* Wyjaśnienie charakteru narzędzia — widoczne do czasu zamknięcia przez użytkownika */}
      {devNoteOpen && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
          padding: '7px 14px', fontSize: 12, lineHeight: 1.45,
          background: 'rgba(249,115,22,0.10)', borderBottom: '1px solid rgba(249,115,22,0.35)',
          color: 'var(--text-secondary)',
        }}>
          <b style={{ color: 'var(--warn-2, #f97316)' }}>Narzędzie deweloperskie.</b>
          <span>
            IMGW-OSMET służy do <b>rozwijania i testowania nowych koncepcji ostrzeżeń</b>
            {' '}(edytor CAP, ostrzeżenia oparte na skutkach, prezentacja stanu).
            Ostrzeżenia tworzone tutaj <b>nie są oficjalnymi ostrzeżeniami IMGW-PIB</b> i nie podlegają dystrybucji operacyjnej.
          </span>
          <button onClick={() => setDevNoteOpen(false)}
            title="Ukryj do końca sesji"
            style={{
              marginLeft: 'auto', background: 'transparent', border: '1px solid var(--border)',
              color: 'var(--text-muted)', borderRadius: 6, padding: '2px 9px',
              fontSize: 11, cursor: 'pointer',
            }}>Rozumiem</button>
        </div>
      )}

      {/* Przełącznik tylko gdy są dwie kolumny (w Statusie mapa jest WEWNĄTRZ panelu) */}
      {showMap && (
      <div className="mobile-pane-switch">
        <button className={mobilePane === 'map' ? 'active' : ''}
          onClick={() => setMobilePane('map')}>🗺 Mapa</button>
        <button className={mobilePane === 'panel' ? 'active' : ''}
          onClick={() => setMobilePane('panel')}>
          {view === 'editor' ? '✎ Edytor' : '☰ Panel'}
        </button>
      </div>
      )}

      <div className={'app-body ' + (!showMap || mobilePane === 'panel' ? 'mobile-show-panel' : 'mobile-show-map')}>
        {showMap && (
          <div className="map-col">
            <MapPanel
              onPolygonDrawn={handlePolygonDrawn}
              selectedCounties={selectedCounties}
              warnings={warnings}
              onClear={handleClearSelection}
              onCountyToggle={handleCountyToggle}
              highlightedWarningId={highlightedWarning}
              onHighlightWarning={setHighlightedWarning}
              editingWarningId={editingWarningId}
              warnOrder={warnOrder}
              onWarnOrderChange={setWarnOrder}
              onUndoSelection={undoSelection}
              onRedoSelection={redoSelection}
              conflictCounties={conflictCounties}
              draftContext={draftContext}
              onRequestEdit={(id) => setPendingEditId(id)}
              onRequestCopy={(id) => setPendingCopyId(id)}
              showWarningLabels={true}
              maWarningsProp={maWarnings}
              maEnabledProp={maEnabled}
              maLoadingProp={maLoading}
              onMaStateChange={(enabled, countries) => {
                setMaEnabled(enabled);
                setMaCountries(countries);
              }}
            />
          </div>
        )}

        <div className="panel-col" style={view === 'status' ? { width: '100%' } : {}}>
          {view === 'editor' && (
            <EditorPanel
              selectedCounties={selectedCounties}
              drawnPolygon={drawnPolygon}
              onWarningCreated={handleWarningCreated}
              onStatusChange={setStatus}
              warnings={warnings}
              onLoadCounties={handleLoadCountiesToMap}
              highlightedWarningId={highlightedWarning}
              pendingEditId={pendingEditId}
              onPendingEditConsumed={() => setPendingEditId(null)}
              pendingCopyId={pendingCopyId}
              onPendingCopyConsumed={() => setPendingCopyId(null)}
              onEditingChange={setEditingWarningId}
              onConflictCounties={setConflictCounties}
              onDraftContextChange={setDraftContext}
            />
          )}
          {view === 'list' && (
            <WarningsList
              warnings={warnings}
              onDelete={handleWarningDeleted}
              onStatusChange={setStatus}
              onEdit={(warningId) => {
                setPendingEditId(warningId);   // deterministycznie — EditorPanel odbierze po zamontowaniu
                setView('editor');
              }}
            />
          )}
          {view === 'status' && (
            <StatusView
              warnings={warnings}
              onRefresh={loadWarnings}
              maWarnings={maWarnings}
              maEnabled={maEnabled}
              maLoading={maLoading}
              maLastFetch={maLastFetch}
              onRefreshMa={loadMaWarnings}
              onEdit={(warningId) => {
                setPendingEditId(warningId);   // deterministycznie — EditorPanel odbierze po zamontowaniu
                setView('editor');
              }}
            />
          )}
          {view === 'settings' && (
            <div style={{display:'flex',flexDirection:'column',height:'100%',overflow:'hidden'}}>
              <div style={{display:'flex',borderBottom:'1px solid var(--border)',flexShrink:0}}>
                {[['webhooks','📡 Webhooki'],['delivery','📦 FTP / Email']].map(([k,l])=>(
                  <button key={k}
                    onClick={()=>setSettingsTab(k)}
                    style={{padding:'10px 16px',border:'none',borderBottom:'2px solid '+(settingsTab===k?'var(--accent-blue)':'transparent'),
                      background:'transparent',color:settingsTab===k?'var(--text-accent)':'var(--text-secondary)',
                      fontSize:12,cursor:'pointer',fontWeight:settingsTab===k?700:400}}>
                    {l}
                  </button>
                ))}
              </div>
              {settingsTab==='webhooks' && <WebhooksPanel onStatusChange={setStatus}/>}
              {settingsTab==='delivery' && <DeliveryPanel onStatusChange={setStatus}/>}
            </div>
          )}
        </div>
      </div>
      <StatusBar status={status} />
    </div>
  );
}
