import React, { useState, useEffect } from 'react';

// Adres API względem BASE_URL — dzięki temu aplikacja działa i pod /osmet-dev/,
// i bezpośrednio po porcie, bez zmiany kodu.
const API = import.meta.env.VITE_API_URL || ((import.meta.env.BASE_URL || '/') + 'api');

export default function Header({ view, onViewChange, warningsCount, activeCount, pendingCount }) {
  // Wersja pobierana z backendu (plik VERSION) — jedno źródło prawdy.
  // Wcześniej numer był wpisany na sztywno i rozjeżdżał się z rzeczywistym buildem.
  const [appVersion, setAppVersion] = useState(null);
  useEffect(() => {
    fetch(`${API}/version`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && d.version) setAppVersion(d.version); })
      .catch(() => {});
  }, []);

  return (
    <header className="header">
      <div className="header-logo">
        {/* IMGW-PIB logo — wersja alternatywna (ikona kółka) inline SVG */}
        <img
          src={(import.meta.env.BASE_URL || '/') + 'assets/imgw_logo_pl.svg'}
          alt="IMGW-PIB"
          style={{ height: 32, width: 'auto', marginRight: 10, flexShrink: 0 }}
        />
        <div>
          <div className="header-title">
            IMGW-OSMET
            <span style={{
              fontSize: 10, fontWeight: 600, padding: '2px 6px', marginLeft: 6,
              background: 'rgba(59,130,246,0.15)', color: 'var(--accent-blue)',
              borderRadius: 4, verticalAlign: 'middle'
            }} title={appVersion ? 'Wersja z pliku VERSION (backend)' : 'Pobieranie wersji…'}>
              {appVersion ? `v${appVersion}` : '…'}</span>
            <span
              title="Narzędzie deweloperskie: służy do rozwijania i testowania nowych koncepcji ostrzeżeń. Nie jest operacyjnym systemem wydawania ostrzeżeń IMGW-PIB."
              style={{
                marginLeft: 8, padding: '2px 8px', borderRadius: 999,
                border: '1px solid var(--warn-2, #f97316)', color: 'var(--warn-2, #f97316)',
                fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', cursor: 'help',
              }}>
              WERSJA DEWELOPERSKA
            </span>
          </div>
          <div className="header-subtitle">IMGW-PIB · CAP 1.2</div>
        </div>
      </div>

      <div className="header-spacer" />

      <nav className="header-nav">
        <button className={`header-nav-btn ${view === 'editor' ? 'active' : ''}`}
          onClick={() => onViewChange('editor')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Edytor
        </button>
        <button className={`header-nav-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => onViewChange('list')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Historia
          {warningsCount > 0 && <span className="nav-badge">{warningsCount}</span>}
        </button>
        <button className={`header-nav-btn ${view === 'status' ? 'active' : ''}`}
          onClick={() => onViewChange('status')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3"/>
            <circle cx="7" cy="7" r="2" fill="currentColor" opacity={activeCount > 0 ? 1 : 0.3}/>
          </svg>
          Status
          {activeCount > 0 && (
            <span className="nav-badge" style={{background:'var(--warn-3)'}}>{activeCount}</span>
          )}
          {pendingCount > 0 && (
            <span className="nav-badge" style={{background:'var(--accent-blue)',marginLeft:2}}>{pendingCount}</span>
          )}
        </button>
        <button className={`header-nav-btn ${view === 'settings' ? 'active' : ''}`}
          onClick={() => onViewChange('settings')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M7 1v2M7 11v2M1 7h2M11 7h2M2.9 2.9l1.4 1.4M9.7 9.7l1.4 1.4M2.9 11.1l1.4-1.4M9.7 4.3l1.4-1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Ustawienia
        </button>
      </nav>
    </header>
  );
}
