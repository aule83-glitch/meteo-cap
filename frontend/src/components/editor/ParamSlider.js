import React, { useCallback } from 'react';

export default function ParamSlider({ def, value, onChange }) {
  const { min, max, step, label, unit } = def;

  const pct = ((value - min) / (max - min)) * 100;

  const handleChange = useCallback((e) => {
    const v = parseFloat(e.target.value);
    onChange(v);
  }, [onChange]);

  const fmt = (v) => {
    if (step < 1) return Number(v).toFixed(1);
    return Math.round(v);
  };

  return (
    <div className="slider-group">
      <div className="slider-header">
        <span className="slider-label">{label}</span>
        <span className="slider-value">{fmt(value)} {unit}</span>
      </div>
      <div className="slider-row">
        <div className="slider-track" style={{ position: 'relative' }}>
          <div
            className="slider-fill"
            style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={handleChange}
            style={{ position: 'absolute', top: '-6px', left: 0, width: '100%', background: 'transparent' }}
          />
        </div>
      </div>
      <div className="slider-bounds">
        <span className="slider-bound-label">{fmt(min)} {unit}</span>
        <span className="slider-bound-label">{fmt(max)} {unit}</span>
      </div>
    </div>
  );
}
