import React from 'react';
import { WIND_DIRECTIONS } from '../../data/phenomena';

const DIR_ANGLES = {
  N: 0, NNE: 22.5, NE: 45, ENE: 67.5,
  E: 90, ESE: 112.5, SE: 135, SSE: 157.5,
  S: 180, SSW: 202.5, SW: 225, WSW: 247.5,
  W: 270, WNW: 292.5, NW: 315, NNW: 337.5,
};

export default function WindDirectionPicker({ def, value, onChange }) {
  const angle = DIR_ANGLES[value] || 0;

  return (
    <div className="slider-group">
      <div className="slider-header" style={{ marginBottom: 8 }}>
        <span className="slider-label">{def.label}</span>
        <span className="slider-value">{value}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Compass rose */}
        <div style={{ position: 'relative', width: 80, height: 80, flexShrink: 0 }}>
          <svg viewBox="0 0 80 80" width="80" height="80">
            <circle cx="40" cy="40" r="38" stroke="rgba(100,140,220,0.2)" strokeWidth="1" fill="rgba(11,18,32,0.8)"/>
            {[0, 45, 90, 135, 180, 225, 270, 315].map(a => {
              const rad = (a - 90) * Math.PI / 180;
              const x1 = 40 + 28 * Math.cos(rad);
              const y1 = 40 + 28 * Math.sin(rad);
              const x2 = 40 + 36 * Math.cos(rad);
              const y2 = 40 + 36 * Math.sin(rad);
              return <line key={a} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(100,140,220,0.3)" strokeWidth="1"/>;
            })}
            {/* N label */}
            <text x="40" y="10" textAnchor="middle" fill="rgba(100,140,220,0.7)" fontSize="8" fontFamily="JetBrains Mono">N</text>
            <text x="40" y="76" textAnchor="middle" fill="rgba(100,140,220,0.4)" fontSize="7" fontFamily="JetBrains Mono">S</text>
            <text x="74" y="43" textAnchor="middle" fill="rgba(100,140,220,0.4)" fontSize="7" fontFamily="JetBrains Mono">E</text>
            <text x="6" y="43" textAnchor="middle" fill="rgba(100,140,220,0.4)" fontSize="7" fontFamily="JetBrains Mono">W</text>
            {/* Arrow */}
            <g transform={`rotate(${angle}, 40, 40)`}>
              <polygon
                points="40,14 43,40 40,46 37,40"
                fill="#3b82f6"
                opacity="0.9"
              />
              <polygon
                points="40,46 43,40 40,64 37,40"
                fill="rgba(59,130,246,0.3)"
              />
            </g>
            <circle cx="40" cy="40" r="3" fill="#06b6d4"/>
          </svg>
        </div>

        {/* Direction selector */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
          {WIND_DIRECTIONS.map(dir => (
            <button
              key={dir}
              onClick={() => onChange(dir)}
              style={{
                padding: '3px 6px',
                borderRadius: 4,
                border: `1px solid ${value === dir ? 'var(--accent-blue)' : 'var(--border)'}`,
                background: value === dir ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                color: value === dir ? 'var(--text-accent)' : 'var(--text-muted)',
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {dir}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
