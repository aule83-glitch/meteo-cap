import React, { useState, useCallback, useEffect } from 'react';
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

const API = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [selectedCounties,   setSelectedCounties]   = useState([]);
  const [drawnPolygon,       setDrawnPolygon]        = useState(null);
  const [warnings,           setWarnings]            = useState([]);
  const [view,               setView]                = useState('editor');
  const [status,             setStatus]              = useState({ msg: 'Gotowy do pracy', type: 'info' });
  const [highlightedWarning, setHighlightedWarning]  = useState(null);
  const [settingsTab, setSettingsTab]                 = useState('delivery'); // ID podświetlonego ostrzeżenia na mapie

  const loadWarnings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/warnings?include_expired=false`);
      setWarnings(res.data.warnings || []);
    } catch (e) { console.warn('Błąd ładowania ostrzeżeń:', e); }
  }, []);

  useEffect(() => {
    loadWarnings();
    const interval = setInterval(loadWarnings, 30000);
    return () => clearInterval(interval);
  }, [loadWarnings]);

  const handlePolygonDrawn = useCallback((polygon, counties) => {
    setDrawnPolygon(polygon);
    setSelectedCounties(counties);
    setStatus({
      msg: `Zaznaczono ${counties.length} powiat${counties.length===1?'':counties.length<5?'y':'ów'} — kliknij na powiat aby dodać/usunąć`,
      type: 'success',
    });
  }, []);

  const handleCountyToggle = useCallback((countyProps) => {
    setSelectedCounties(prev => {
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
    setStatus({ msg: `Ostrzeżenie stopień ${warning.level} — ${warning.phenomenon?.replace(/_/g,' ')} wydane`, type: 'success' });
  }, []);

  // Wczytaj powiaty z istniejącego ostrzeżenia na mapę (przy Update)
  const handleLoadCountiesToMap = useCallback((counties) => {
    setSelectedCounties(counties || []);
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
    setSelectedCounties([]);
    setDrawnPolygon(null);
    setHighlightedWarning(null);
    setStatus({ msg: 'Wyczyszczono zaznaczenie', type: 'info' });
  }, []);

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
      <div className="app-body">
        {showMap && (
          <div className="map-col">
            <MapPanel
              onPolygonDrawn={handlePolygonDrawn}
              selectedCounties={selectedCounties}
              warnings={warnings}
              onClear={handleClearSelection}
              onCountyToggle={handleCountyToggle}
              highlightedWarningId={highlightedWarning}
              showWarningLabels={true}
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
            />
          )}
          {view === 'list' && (
            <WarningsList
              warnings={warnings}
              onDelete={handleWarningDeleted}
              onStatusChange={setStatus}
              onHighlight={handleHighlightWarning}
              highlightedId={highlightedWarning}
            />
          )}
          {view === 'status' && (
            <StatusView
              warnings={warnings}
              onRefresh={loadWarnings}
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
