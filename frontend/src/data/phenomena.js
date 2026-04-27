/**
 * Parameter definitions for each meteorological phenomenon.
 * Drives what controls appear in the editor.
 */

export const PHENOMENA = [
  { id: 'burze', label: 'Burze', maxLevel: 3 },
  { id: 'intensywne_opady_deszczu', label: 'Intensywne opady deszczu', maxLevel: 3 },
  { id: 'intensywne_opady_sniegu', label: 'Intensywne opady śniegu', maxLevel: 3 },
  { id: 'silny_wiatr', label: 'Silny wiatr', maxLevel: 3 },
  { id: 'silny_mroz', label: 'Silny mróz', maxLevel: 3 },
  { id: 'upal', label: 'Upał', maxLevel: 3 },
  { id: 'opady_marzniece', label: 'Opady marznące', maxLevel: 3 },
  { id: 'roztopy', label: 'Roztopy', maxLevel: 3 },
  { id: 'silny_deszcz_z_burzami', label: 'Silny deszcz z burzami', maxLevel: 3 },
  { id: 'zawieje_zamiecie', label: 'Zawieje / zamiecie śnieżne', maxLevel: 2 },
  { id: 'mgla_szadz', label: 'Mgła intensywnie osadzająca szadź', maxLevel: 1 },
  { id: 'gesta_mgla', label: 'Gęsta mgła', maxLevel: 1 },
  { id: 'oblodzenie', label: 'Oblodzenie', maxLevel: 1 },
  { id: 'opady_sniegu', label: 'Opady śniegu (poza sezonem)', maxLevel: 1 },
  { id: 'przymrozki', label: 'Przymrozki', maxLevel: 1 },
];

export const PARAM_DEFS = {
  burze: [
    { key: 'rain_mm', type: 'slider', label: 'Suma opadów', unit: 'mm', min: 0, max: 100, step: 1, default: 25 },
    { key: 'gust_kmh', type: 'slider', label: 'Porywy wiatru', unit: 'km/h', min: 0, max: 150, step: 1, default: 70 },
    { key: 'hail', type: 'checkbox', label: 'Prognozowany grad', default: false },
  ],

  intensywne_opady_deszczu: [
    { key: 'rain_mm', type: 'slider', label: 'Suma opadów', unit: 'mm', min: 0, max: 150, step: 1, default: 40 },
    { key: 'hours', type: 'radio', label: 'Czas trwania', options: [
      { value: 12, label: 'do 12 godzin' },
      { value: 24, label: 'do 24 godzin' },
    ], default: 24 },
  ],

  intensywne_opady_sniegu: [
    { key: 'snow_cm', type: 'slider', label: 'Przyrost pokrywy', unit: 'cm', min: 0, max: 80, step: 1, default: 15 },
    { key: 'hours', type: 'radio', label: 'Czas trwania', options: [
      { value: 12, label: 'do 12 godzin' },
      { value: 24, label: 'do 24 godzin' },
    ], default: 24 },
    { key: 'altitude_m', type: 'radio', label: 'Strefa wysokościowa', options: [
      { value: 0, label: 'Poniżej 600 m n.p.m.' },
      { value: 600, label: 'Powyżej 600 m n.p.m.' },
    ], default: 0 },
  ],

  silny_wiatr: [
    { key: 'gust_kmh', type: 'slider', label: 'Porywy wiatru', unit: 'km/h', min: 0, max: 160, step: 1, default: 75 },
    { key: 'avg_kmh', type: 'slider', label: 'Prędkość średnia', unit: 'km/h', min: 0, max: 120, step: 1, default: 55 },
    { key: 'wind_dir', type: 'wind_dir', label: 'Kierunek wiatru', default: 'SW' },
  ],

  silny_mroz: [
    { key: 'tmin', type: 'slider', label: 'Temperatura minimalna', unit: '°C', min: -50, max: 0, step: 1, default: -20 },
  ],

  upal: [
    { key: 'tmax', type: 'slider', label: 'Temperatura maksymalna', unit: '°C', min: 25, max: 50, step: 1, default: 32 },
    { key: 'tmin_night', type: 'slider', label: 'Temperatura nocna min', unit: '°C', min: 10, max: 30, step: 1, default: 18 },
    { key: 'days', type: 'slider', label: 'Liczba dni', unit: 'dni', min: 1, max: 7, step: 1, default: 2 },
  ],

  opady_marzniece: [
    { key: 'intensity', type: 'radio', label: 'Intensywność opadów', options: [
      { value: 'slabe', label: 'Słabe opady' },
      { value: 'umiarkowane_silne', label: 'Umiarkowane lub silne opady' },
    ], default: 'slabe' },
    { key: 'hours', type: 'slider', label: 'Czas trwania', unit: 'h', min: 1, max: 36, step: 1, default: 6 },
  ],

  roztopy: [
    { key: 'snow_depth_cm', type: 'slider', label: 'Grubość pokrywy śnieżnej', unit: 'cm', min: 0, max: 100, step: 1, default: 20 },
    { key: 'ts', type: 'slider', label: 'Temperatura średnia dobowa', unit: '°C', min: -5, max: 15, step: 0.5, default: 3 },
    { key: 'rain_mm', type: 'slider', label: 'Opady deszczu', unit: 'mm/24h', min: 0, max: 40, step: 1, default: 5 },
  ],

  silny_deszcz_z_burzami: [
    { key: 'rain_mm', type: 'slider', label: 'Łączna suma opadów', unit: 'mm', min: 0, max: 150, step: 1, default: 45 },
    { key: 'hours', type: 'radio', label: 'Czas trwania', options: [
      { value: 12, label: 'do 12 godzin' },
      { value: 24, label: 'do 24 godzin' },
    ], default: 24 },
  ],

  zawieje_zamiecie: [
    { key: 'avg_kmh', type: 'slider', label: 'Prędkość średnia wiatru', unit: 'km/h', min: 0, max: 80, step: 1, default: 35 },
    { key: 'gust_kmh', type: 'slider', label: 'Porywy wiatru', unit: 'km/h', min: 0, max: 100, step: 1, default: 60 },
    { key: 'snow_with_blizzard', type: 'checkbox', label: 'Towarzyszące opady śniegu (zawieja)', default: true },
  ],

  mgla_szadz: [
    { key: 'visibility_m', type: 'slider', label: 'Widzialność (VV)', unit: 'm', min: 0, max: 500, step: 10, default: 150 },
    { key: 'hours', type: 'slider', label: 'Czas trwania', unit: 'h', min: 0, max: 24, step: 1, default: 10 },
  ],

  gesta_mgla: [
    { key: 'visibility_m', type: 'slider', label: 'Widzialność (VV)', unit: 'm', min: 0, max: 500, step: 10, default: 150 },
    { key: 'hours', type: 'slider', label: 'Czas trwania', unit: 'h', min: 0, max: 24, step: 1, default: 10 },
  ],

  oblodzenie: [
    { key: 'icing', type: 'checkbox', label: 'Oblodzenie mokrej nawierzchni po opadach', default: true },
  ],

  opady_sniegu: [
    { key: 'snow_cm', type: 'slider', label: 'Przyrost pokrywy', unit: 'cm', min: 0, max: 20, step: 1, default: 7 },
    { key: 'hours', type: 'radio', label: 'Czas trwania', options: [
      { value: 12, label: 'do 12 godzin' },
      { value: 24, label: 'do 24 godzin' },
    ], default: 12 },
  ],

  przymrozki: [
    { key: 'tmin', type: 'slider', label: 'Temperatura minimalna (2m)', unit: '°C', min: -10, max: 2, step: 0.5, default: -1 },
    { key: 'ts', type: 'slider', label: 'Temperatura średnia dobowa', unit: '°C', min: -5, max: 10, step: 0.5, default: 2 },
  ],
};

export const WIND_DIRECTIONS = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];

export const LEVEL_DESCRIPTIONS = {
  null: { color: 'none', text: 'Brak ostrzeżenia', sub: 'Zmień parametry' },
  1: { color: 'l1', text: 'Stopień 1 — Żółty', sub: 'Zjawisko może być niebezpieczne' },
  2: { color: 'l2', text: 'Stopień 2 — Pomarańczowy', sub: 'Zjawisko jest niebezpieczne' },
  3: { color: 'l3', text: 'Stopień 3 — Czerwony', sub: 'Zjawisko jest bardzo niebezpieczne' },
};
