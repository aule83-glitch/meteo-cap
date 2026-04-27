import React from 'react';

export default function ParamCheckbox({ def, value, onChange }) {
  return (
    <div className="slider-group">
      <label
        className="checkbox-group"
        onClick={() => onChange(!value)}
        style={{ cursor: 'pointer', userSelect: 'none' }}
      >
        <div className={`checkbox-custom ${value ? 'checked' : ''}`}>
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <span className="checkbox-label">{def.label}</span>
      </label>
    </div>
  );
}
