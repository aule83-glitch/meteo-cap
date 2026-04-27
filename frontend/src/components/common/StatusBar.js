import React, { useState, useEffect } from 'react';

export default function StatusBar({ status }) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const pad = n => String(n).padStart(2, '0');
  const timeStr = `${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())} UTC+${-time.getTimezoneOffset()/60}`;

  return (
    <div className="status-bar">
      <div className={`status-dot ${status.type || 'info'}`} />
      <span className="status-msg">{status.msg}</span>
      <span className="status-time">{timeStr}</span>
    </div>
  );
}
