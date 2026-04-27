import React from 'react';

export default function ParamRadio({ def, value, onChange }) {
  return (
    <div className="slider-group">
      <div className="slider-header" style={{ marginBottom: 8 }}>
        <span className="slider-label">{def.label}</span>
      </div>
      <div className="radio-group">
        {def.options.map(opt => (
          <label
            key={opt.value}
            className={`radio-option ${value === opt.value ? 'selected' : ''}`}
            onClick={() => onChange(opt.value)}
          >
            <div className="radio-dot">
              <div className="radio-dot-inner" />
            </div>
            <span className="radio-label">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
