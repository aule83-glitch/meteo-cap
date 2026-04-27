import React from 'react';
import { LEVEL_DESCRIPTIONS } from '../../data/phenomena';

export default function LevelBadge({ level }) {
  const key = level == null ? null : level;
  const info = LEVEL_DESCRIPTIONS[key] || LEVEL_DESCRIPTIONS[null];

  return (
    <div className="level-badge-container">
      <div className="level-badge">
        <div className={`level-badge-dot ${info.color}`}>
          {level != null ? level : '–'}
        </div>
        <div className="level-badge-text">Stopień</div>
      </div>
      <div className="level-badge-info">
        <div className="level-badge-title">{info.text}</div>
        <div className="level-badge-desc">{info.sub}</div>
      </div>
    </div>
  );
}
