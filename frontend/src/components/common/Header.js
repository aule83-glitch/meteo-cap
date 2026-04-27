import React from 'react';

export default function Header({ view, onViewChange, warningsCount }) {
  return (
    <header className="header">
      <div className="header-logo">
        <svg className="header-logo-icon" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="14" cy="14" r="13" stroke="#3b82f6" strokeWidth="1.5"/>
          <path d="M7 14 C7 10 10 7 14 7 C18 7 21 10 21 14" stroke="#06b6d4" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M5 17 C7 13 10 11 14 11 C18 11 21 13 23 17" stroke="#3b82f6" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="14" cy="20" r="3" fill="#facc15"/>
          <path d="M14 17 L14 9" stroke="#facc15" strokeWidth="1" strokeDasharray="1.5 2" strokeLinecap="round"/>
        </svg>
        <div>
          <div className="header-title">MeteoCAP Editor</div>
          <div className="header-subtitle">IMGW-PIB · CAP 1.2</div>
        </div>
      </div>

      <div className="header-spacer" />

      <nav className="header-nav">
        <button
          className={`header-nav-btn ${view === 'editor' ? 'active' : ''}`}
          onClick={() => onViewChange('editor')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
          Edytor
        </button>
        <button
          className={`header-nav-btn ${view === 'list' ? 'active' : ''}`}
          onClick={() => onViewChange('list')}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4h10M2 7h10M2 10h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          Ostrzeżenia
          {warningsCount > 0 && (
            <span className="nav-badge">{warningsCount}</span>
          )}
        </button>
      </nav>
    </header>
  );
}
