import React from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || '/api';

const PHENOMENON_LABELS = {
  burze: 'Burze',
  intensywne_opady_deszczu: 'Int. opady deszczu',
  intensywne_opady_sniegu: 'Int. opady śniegu',
  silny_wiatr: 'Silny wiatr',
  silny_mroz: 'Silny mróz',
  upal: 'Upał',
  opady_marzniece: 'Opady marznące',
  roztopy: 'Roztopy',
  silny_deszcz_z_burzami: 'Silny deszcz z burzami',
  zawieje_zamiecie: 'Zawieje/zamiecie śnieżne',
  mgla_szadz: 'Mgła osadzająca szadź',
  gesta_mgla: 'Gęsta mgła',
  oblodzenie: 'Oblodzenie',
  opady_sniegu: 'Opady śniegu',
  przymrozki: 'Przymrozki',
};

export default function WarningsList({ warnings, onDelete, onStatusChange }) {
  const handleDownload = async (id) => {
    try {
      const res = await axios.get(`${API}/warnings/${id}/xml`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `ostrzezenie_${id.slice(0,8)}.xml`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      onStatusChange({ msg: 'Plik XML pobrany', type: 'success' });
    } catch (e) {
      onStatusChange({ msg: `Błąd pobierania XML: ${e.message}`, type: 'error' });
    }
  };

  const handleDelete = async (id) => {
    try {
      await axios.delete(`${API}/warnings/${id}`);
      onDelete(id);
    } catch (e) {
      onStatusChange({ msg: `Błąd usuwania: ${e.message}`, type: 'error' });
    }
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('pl-PL', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  };

  if (warnings.length === 0) {
    return (
      <div className="editor-panel">
        <div className="editor-header">
          <div className="editor-title">Lista ostrzeżeń</div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">🌤</div>
          <div className="empty-state-text">
            Brak zapisanych ostrzeżeń.<br/>
            Przejdź do Edytora, aby stworzyć pierwsze.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div className="editor-title">Lista ostrzeżeń ({warnings.length})</div>
      </div>
      <div className="warnings-list">
        {warnings.map(w => {
          const lvlClass = w.level ? `l${w.level}` : '';
          const countyNames = (w.counties || []).slice(0, 5).map(c => c.name).join(', ');
          const moreCounties = (w.counties || []).length > 5
            ? ` +${w.counties.length - 5} więcej` : '';

          return (
            <div key={w.id} className="warning-card">
              <div className="warning-card-header">
                <div className={`warning-card-level ${lvlClass}`}>
                  {w.level || '?'}
                </div>
                <div className="warning-card-info">
                  <div className="warning-card-name">
                    {PHENOMENON_LABELS[w.phenomenon] || w.phenomenon}
                  </div>
                  <div className="warning-card-meta">
                    {formatDate(w.onset)} → {formatDate(w.expires)}
                  </div>
                </div>
              </div>

              {(w.counties || []).length > 0 && (
                <div className="warning-card-counties">
                  {countyNames}{moreCounties}
                </div>
              )}

              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                ID: {w.id?.slice(0, 16)}… · {formatDate(w.created_at)}
              </div>

              <div className="warning-card-actions">
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => handleDownload(w.id)}
                  title="Pobierz CAP 1.2 XML"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M1 9v1.5a.5.5 0 00.5.5h9a.5.5 0 00.5-.5V9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                  Pobierz XML
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => handleDelete(w.id)}
                  title="Usuń ostrzeżenie"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 3h8M5 3V2h2v1M4 3v7h4V3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Usuń
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
