import React, { useState, useCallback, useEffect } from 'react';
import MapPanel from './components/map/MapPanel';
import EditorPanel from './components/editor/EditorPanel';
import WarningsList from './components/editor/WarningsList';
import Header from './components/common/Header';
import StatusBar from './components/common/StatusBar';
import './App.css';

export default function App() {
  const [selectedCounties, setSelectedCounties] = useState([]);
  const [drawnPolygon, setDrawnPolygon] = useState(null);
  const [activeWarning, setActiveWarning] = useState(null);
  const [warnings, setWarnings] = useState([]);
  const [view, setView] = useState('editor'); // 'editor' | 'list'
  const [status, setStatus] = useState({ msg: 'Gotowy do pracy', type: 'info' });

  const handlePolygonDrawn = useCallback((polygon, counties) => {
    setDrawnPolygon(polygon);
    setSelectedCounties(counties);
    setStatus({
      msg: `Zaznaczono ${counties.length} powiat${counties.length === 1 ? '' : counties.length < 5 ? 'y' : 'ów'}`,
      type: 'success'
    });
  }, []);

  const handleWarningCreated = useCallback((warning) => {
    setWarnings(prev => [warning, ...prev]);
    setStatus({ msg: `Ostrzeżenie ${warning.id?.slice(0,8)} zapisane pomyślnie`, type: 'success' });
  }, []);

  const handleWarningDeleted = useCallback((id) => {
    setWarnings(prev => prev.filter(w => w.id !== id));
    setStatus({ msg: 'Ostrzeżenie usunięte', type: 'info' });
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedCounties([]);
    setDrawnPolygon(null);
  }, []);

  return (
    <div className="app-root">
      <Header view={view} onViewChange={setView} warningsCount={warnings.length} />
      <div className="app-body">
        <div className="map-col">
          <MapPanel
            onPolygonDrawn={handlePolygonDrawn}
            selectedCounties={selectedCounties}
            warnings={warnings}
            onClear={handleClearSelection}
          />
        </div>
        <div className="panel-col">
          {view === 'editor' ? (
            <EditorPanel
              selectedCounties={selectedCounties}
              drawnPolygon={drawnPolygon}
              onWarningCreated={handleWarningCreated}
              onStatusChange={setStatus}
            />
          ) : (
            <WarningsList
              warnings={warnings}
              onDelete={handleWarningDeleted}
              onStatusChange={setStatus}
            />
          )}
        </div>
      </div>
      <StatusBar status={status} />
    </div>
  );
}
