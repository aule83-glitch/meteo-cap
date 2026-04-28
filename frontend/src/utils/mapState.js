/**
 * Globalny store stanu mapy — persystuje zoom, center i podkład
 * przy przełączaniu zakładek (edytor ↔ historia ↔ status).
 * 
 * Nie używamy Redux/Zustand — prosty moduł singleton.
 */

const MAP_STATE = {
  zoom: 6,
  center: [52.1, 19.4],
  tileLayerId: 'dark',
};

export function getMapState() {
  return { ...MAP_STATE };
}

export function setMapState(updates) {
  Object.assign(MAP_STATE, updates);
}

export function saveMapPosition(leafletMap) {
  if (!leafletMap) return;
  try {
    const c = leafletMap.getCenter();
    MAP_STATE.center = [c.lat, c.lng];
    MAP_STATE.zoom   = leafletMap.getZoom();
  } catch (e) {}
}

export function restoreMapPosition(leafletMap) {
  if (!leafletMap) return;
  try {
    leafletMap.setView(MAP_STATE.center, MAP_STATE.zoom, { animate: false });
  } catch (e) {}
}
