import React, { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import MapPanel from './components/map/MapPanel';
import EditorPanel from './components/editor/EditorPanel';
import WarningsList from './components/editor/WarningsList';
import StatusView from './components/map/StatusView';
import Header from './components/common/Header';
import StatusBar from './components/common/StatusBar';
import './App.css';

const API = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [drawnPolygon, setDrawnPolygon]         = useState(null);
  const [warnings, setWarnings]                 = useState([]);
  const [view, setView]                         = useState('editor'); // editor | list | status
  const [status, setStatus]                     = useState({ msg: 'Gotowy do pracy', type: 'info' });

  // Ładuj ostrzeżenia przy starcie i odśwież co 30s
  const loadWarnings = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/warnings?include_expired=false`);
      setWarnings(res.data.warnings || []);
    } catch (e) {
      console.warn('Błąd ładowania ostrzeżeń:', e);
    }
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
      msg: `Zaznaczono ${counties.length} powiat${counties.length === 1 ? '' : counties.length < 5 ? 'y' : 'ów'} — kliknij na powiat aby dodać/usunąć`,
      type: 'success'
    });
  }, []);

  // Toggle pojedynczego powiatu przez kliknięcie na mapie
  const handleCountyToggle = useCallback((countyProps) => {
    setSelectedCounties(prev => {
      const exists = prev.find(c => c.id === countyProps.id);
      if (exists) {
        setStatus({ msg: `Usunięto powiat ${countyProps.name}`, type: 'info' });
        return prev.filter(c => c.id !== countyProps.id);
      } else {
        // Pobierz pełne dane powiatu z allCounties (props ma tylko id/name/voiv)
        const full = {
          id: countyProps.id,
          name: countyProps.name,
          voiv_id: countyProps.voiv_id,
          voiv_name: countyProps.voiv_name,
          lat: countyProps.lat || 0,
          lon: countyProps.lon || 0,
        };
        setStatus({ msg: `Dodano powiat ${countyProps.name}`, type: 'success' });
        return [...prev, full];
      }
    });
  }, []);

  const handleWarningCreated = useCallback((warning) => {
    setWarnings(prev => [warning, ...prev]);
    setStatus({ msg: `Ostrzeżenie stopień ${warning.level} — ${warning.phenomenon?.replace(/_/g,' ')} wydane`, type: 'success' });
  }, []);

  const handleWarningDeleted = useCallback((id) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
    setStatus({ msg: 'Ostrzeżenie usunięte', type: 'info' });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCounties([]);
    setDrawnPolygon(null);
    setStatus({ msg: 'Wyczyszczono zaznaczenie', type: 'info' });
  }, []);

  const activeCount  = warnings.filter(w => w.status === 'active').length;
  const pendingCount = warnings.filter(w => w.status === 'pending').length;

  return (
    <div className="app-root">
      <Header
        view={view}
        onViewChange={setView}
        warningsCount={warnings.length}
        activeCount={activeCount}
        pendingCount={pendingCount}
      />
      <div className="app-body">
        {/* Mapa — zawsze widoczna, chyba że jesteśmy w widoku Status */}
        {view !== 'status' && (
          <div className="map-col">
            <MapPanel
              onPolygonDrawn={handlePolygonDrawn}
              selectedCounties={selectedCounties}
              warnings={warnings}
              onClear={handleClearSelection}
              onCountyToggle={handleCountyToggle}
            />
          </div>
        )}

        <div className={view === 'status' ? 'panel-col' : 'panel-col'}
          style={view === 'status' ? { width: '100%' } : {}}>
          {view === 'editor' && (
            <EditorPanel
              selectedCounties={selectedCounties}
              drawnPolygon={drawnPolygon}
              onWarningCreated={handleWarningCreated}
              onStatusChange={setStatus}
            />
          )}
          {view === 'list' && (
            <WarningsList
              warnings={warnings}
              onDelete={handleWarningDeleted}
              onStatusChange={setStatus}
            />
          )}
          {view === 'status' && (
            <StatusView
              warnings={warnings}
              onRefresh={loadWarnings}
            />
          )}
        </div>
      </div>
      <StatusBar status={status} />
    </div>
  );
}
