import React, { useEffect, useRef, useState, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

// Voivodeship colors for map
const VOIV_COLOR = 'rgba(59,130,246,0.08)';
const VOIV_BORDER = 'rgba(59,130,246,0.35)';
const COUNTY_SELECTED = 'rgba(250,204,21,0.25)';
const COUNTY_SELECTED_BORDER = '#facc15';
const POLYGON_COLOR = 'rgba(6,182,212,0.15)';
const POLYGON_BORDER = '#06b6d4';

// Warning level colors for map overlay
const WARN_COLORS = { 1: '#facc15', 2: '#f97316', 3: '#ef4444' };

export default function MapPanel({ onPolygonDrawn, selectedCounties, warnings, onClear }) {
  const mapRef = useRef(null);
  const leafletMap = useRef(null);
  const drawControl = useRef(null);
  const voivLayer = useRef(null);
  const countyMarkers = useRef([]);
  const selectedLayer = useRef(null);
  const drawnItems = useRef(null);
  const warningLayers = useRef([]);
  const allCounties = useRef([]);
  const [drawMode, setDrawMode] = useState(false);
  const [L, setL] = useState(null);

  // Dynamically load Leaflet + leaflet-draw after mount
  useEffect(() => {
    let mounted = true;
    const loadLeaflet = async () => {
      const leaflet = await import('leaflet');
      await import('leaflet-draw');
      if (mounted) setL(leaflet.default || leaflet);
    };
    loadLeaflet();
    return () => { mounted = false; };
  }, []);

  // Initialize map once L is ready
  useEffect(() => {
    if (!L || !mapRef.current || leafletMap.current) return;

    const map = L.map(mapRef.current, {
      center: [52.1, 19.4],
      zoom: 6,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark OSM tile layer
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { maxZoom: 19 }
    ).addTo(map);

    // Attribution small
    L.control.attribution({ prefix: false })
      .addAttribution('© <a href="https://carto.com">CARTO</a> © <a href="https://osm.org">OSM</a>')
      .addTo(map);

    // Drawn items layer
    drawnItems.current = new L.FeatureGroup();
    map.addLayer(drawnItems.current);

    // Draw control
    const dc = new L.Control.Draw({
      draw: {
        polygon: {
          allowIntersection: false,
          shapeOptions: {
            color: POLYGON_BORDER,
            fillColor: POLYGON_COLOR,
            fillOpacity: 0.5,
            weight: 2,
          },
        },
        rectangle: {
          shapeOptions: {
            color: POLYGON_BORDER,
            fillColor: POLYGON_COLOR,
            fillOpacity: 0.5,
            weight: 2,
          },
        },
        circle: false,
        circlemarker: false,
        marker: false,
        polyline: false,
      },
      edit: {
        featureGroup: drawnItems.current,
      },
    });
    map.addControl(dc);
    drawControl.current = dc;

    // Hide default draw toolbar (we use custom buttons)
    setTimeout(() => {
      const toolbar = document.querySelector('.leaflet-draw');
      if (toolbar) toolbar.style.display = 'none';
    }, 100);

    leafletMap.current = map;

    // Load voivodeships
    loadVoivodeships(map, L);
    // Load counties
    loadCounties();

    return () => {
      map.remove();
      leafletMap.current = null;
    };
  }, [L]);

  const loadVoivodeships = async (map, L) => {
    try {
      const res = await axios.get(`${API}/voivodeships`);
      const geojson = res.data;

      voivLayer.current = L.geoJSON(geojson, {
        style: {
          color: VOIV_BORDER,
          fillColor: VOIV_COLOR,
          fillOpacity: 1,
          weight: 1.5,
        },
        onEachFeature: (feature, layer) => {
          layer.bindTooltip(feature.properties.name, {
            className: 'map-county-tooltip',
            sticky: true,
          });
        },
      }).addTo(map);
    } catch (e) {
      console.warn('Could not load voivodeships:', e);
    }
  };

  const loadCounties = async () => {
    try {
      const res = await axios.get(`${API}/counties`);
      allCounties.current = res.data.counties || [];
    } catch (e) {
      console.warn('Could not load counties:', e);
    }
  };

  // Handle draw events
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    const onDrawCreated = async (e) => {
      drawnItems.current.clearLayers();
      drawnItems.current.addLayer(e.layer);
      setDrawMode(false);

      // Get polygon coordinates
      const latlngs = e.layer.getLatLngs()[0];
      const polygon = latlngs.map(ll => [ll.lat, ll.lng]);
      // Close polygon
      if (polygon.length > 0) polygon.push(polygon[0]);

      // Query backend for counties in polygon
      try {
        const res = await axios.post(`${API}/spatial/counties-in-polygon`, {
          polygon,
        });
        const counties = res.data.counties || [];
        onPolygonDrawn(polygon, counties);
        renderSelectedCounties(counties);
      } catch (e) {
        console.warn('Spatial query failed:', e);
        onPolygonDrawn(polygon, []);
      }
    };

    map.on(L.Draw.Event.CREATED, onDrawCreated);
    return () => map.off(L.Draw.Event.CREATED, onDrawCreated);
  }, [L, onPolygonDrawn]);

  const renderSelectedCounties = useCallback((counties) => {
    const map = leafletMap.current;
    if (!map || !L) return;

    // Remove previous selected markers
    countyMarkers.current.forEach(m => map.removeLayer(m));
    countyMarkers.current = [];

    counties.forEach(c => {
      const circle = L.circleMarker([c.lat, c.lon], {
        radius: 5,
        color: COUNTY_SELECTED_BORDER,
        fillColor: COUNTY_SELECTED_BORDER,
        fillOpacity: 0.8,
        weight: 1.5,
      });
      circle.bindTooltip(`${c.name} (${c.voiv_name})`, {
        className: 'map-county-tooltip',
      });
      circle.addTo(map);
      countyMarkers.current.push(circle);
    });
  }, [L]);

  // Re-render when selectedCounties changes
  useEffect(() => {
    renderSelectedCounties(selectedCounties);
  }, [selectedCounties, renderSelectedCounties]);

  // Render warning overlays
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !L) return;

    // Remove old warning layers
    warningLayers.current.forEach(l => map.removeLayer(l));
    warningLayers.current = [];

    warnings.forEach(w => {
      if (!w.counties || w.counties.length === 0) return;
      const color = WARN_COLORS[w.level] || '#4a5a78';
      w.counties.forEach(c => {
        const circle = L.circleMarker([c.lat, c.lon], {
          radius: 7,
          color,
          fillColor: color,
          fillOpacity: 0.4,
          weight: 2,
        });
        const phenomenon = w.phenomenon?.replace(/_/g, ' ') || '';
        circle.bindTooltip(
          `<b>Stopień ${w.level}</b><br>${phenomenon}<br>${c.name}`,
          { className: 'map-county-tooltip' }
        );
        circle.addTo(map);
        warningLayers.current.push(circle);
      });
    });
  }, [warnings, L]);

  const startDrawPolygon = useCallback(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    setDrawMode(true);
    new L.Draw.Polygon(map, drawControl.current.options.draw.polygon).enable();
  }, [L]);

  const startDrawRectangle = useCallback(() => {
    const map = leafletMap.current;
    if (!map || !L) return;
    setDrawMode(true);
    new L.Draw.Rectangle(map, drawControl.current.options.draw.rectangle).enable();
  }, [L]);

  const clearAll = useCallback(() => {
    const map = leafletMap.current;
    if (!map) return;
    drawnItems.current?.clearLayers();
    countyMarkers.current.forEach(m => map.removeLayer(m));
    countyMarkers.current = [];
    setDrawMode(false);
    onClear();
  }, [onClear]);

  const selectAllPoland = useCallback(async () => {
    const map = leafletMap.current;
    if (!map || !L) return;

    // Approximate Poland bounding box polygon
    const polygon = [
      [54.9, 14.1], [54.9, 24.2],
      [49.0, 24.2], [49.0, 14.1],
      [54.9, 14.1],
    ];
    try {
      const res = await axios.post(`${API}/spatial/counties-in-polygon`, { polygon });
      const counties = res.data.counties || [];
      onPolygonDrawn(polygon, counties);
      renderSelectedCounties(counties);
    } catch (e) {
      console.warn('Select all failed:', e);
    }
  }, [L, onPolygonDrawn, renderSelectedCounties]);

  return (
    <div className="map-container">
      <div ref={mapRef} className="map-leaflet" />

      <div className="map-toolbar">
        <button
          className={`map-btn ${drawMode ? 'active' : ''}`}
          onClick={startDrawPolygon}
          title="Rysuj dowolny poligon"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 12 L5 3 L9 8 L12 2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <circle cx="2" cy="12" r="1.2" fill="currentColor"/>
            <circle cx="5" cy="3" r="1.2" fill="currentColor"/>
            <circle cx="9" cy="8" r="1.2" fill="currentColor"/>
            <circle cx="12" cy="2" r="1.2" fill="currentColor"/>
          </svg>
          Rysuj poligon
        </button>

        <button
          className={`map-btn ${drawMode ? 'active' : ''}`}
          onClick={startDrawRectangle}
          title="Rysuj prostokąt"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="2" y="3" width="10" height="8" rx="1" stroke="currentColor" strokeWidth="1.4"/>
          </svg>
          Rysuj prostokąt
        </button>

        <button className="map-btn" onClick={selectAllPoland} title="Zaznacz całą Polskę">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M2 7h10M7 2v10" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5"/>
          </svg>
          Cała Polska
        </button>

        {selectedCounties.length > 0 && (
          <button className="map-btn danger" onClick={clearAll}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Wyczyść ({selectedCounties.length})
          </button>
        )}
      </div>
    </div>
  );
}
