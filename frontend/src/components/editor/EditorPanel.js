import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { PHENOMENA, PARAM_DEFS } from '../../data/phenomena';
import ParamSlider from './ParamSlider';
import ParamRadio from './ParamRadio';
import ParamCheckbox from './ParamCheckbox';
import WindDirectionPicker from './WindDirectionPicker';
import LevelBadge from './LevelBadge';
import { getDraft, setDraft, resetDraft } from '../../utils/editorDraft';

const API = import.meta.env.VITE_API_URL || '/api';

// Zjawiska kumulacyjne — przy escalate/deescalate pokazujemy pola "zaobserwowano dotychczas" / "prognoza pozostała"
const CUMULATIVE_PHENOMENA = new Set([
  'intensywne_opady_deszczu', 'intensywne_opady_sniegu', 'opady_sniegu',
  'silny_deszcz_z_burzami', 'burze',
]);
const PHENOMENON_UNITS = {
  intensywne_opady_deszczu: 'mm',
  intensywne_opady_sniegu:  'cm',
  opady_sniegu:             'cm',
  silny_deszcz_z_burzami:   'mm',
  burze:                    'mm',
};

function getDefaultParams(phenomenon) {
  const defs = PARAM_DEFS[phenomenon] || [];
  const params = {};
  defs.forEach(d => { params[d.key] = d.default; });
  return params;
}

function getISOLocal(offsetMinutes = 0) {
  const d = new Date(Date.now() + offsetMinutes * 60000);
  // Format as local datetime-local input value
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


function XmlPreviewModal({ xml, onClose }) {
  if (!xml) return null;

  // Prosta koloryzacja składni XML
  const colorize = (raw) => {
    return raw
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/&lt;(\/?[\w:]+)/g, '<span style="color:#60a0ff">&lt;$1</span>')
      .replace(/&gt;/g, '<span style="color:#60a0ff">&gt;</span>')
      .replace(/(\w+)="([^"]*)"/g, '<span style="color:#facc15">$1</span>=<span style="color:#22c55e">"$2"</span>')
      .replace(/&gt;([^&<]+)&lt;/g, '&gt;<span style="color:#e4ecf8">$1</span>&lt;');
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9000,
      background:'rgba(0,0,0,0.75)', display:'flex',
      alignItems:'center', justifyContent:'center',
    }} onClick={onClose}>
      <div style={{
        width:'80vw', maxWidth:900, maxHeight:'85vh',
        background:'var(--bg-surface)', border:'1px solid var(--border)',
        borderRadius:'var(--radius-lg)', display:'flex', flexDirection:'column',
        boxShadow:'0 8px 64px rgba(0,0,0,0.8)',
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding:'12px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', justifyContent:'space-between',
        }}>
          <span style={{fontSize:13, fontWeight:700, color:'var(--text-primary)'}}>
            Podgląd CAP 1.2 XML
          </span>
          <div style={{display:'flex', gap:8}}>
            <button onClick={() => { navigator.clipboard.writeText(xml); }}
              style={{padding:'4px 10px', borderRadius:'var(--radius-sm)',
                border:'1px solid var(--border)', background:'var(--bg-elevated)',
                color:'var(--text-secondary)', fontSize:11, cursor:'pointer'}}>
              📋 Kopiuj
            </button>
            <button onClick={onClose}
              style={{padding:'4px 10px', borderRadius:'var(--radius-sm)',
                border:'1px solid var(--border)', background:'var(--bg-elevated)',
                color:'var(--text-secondary)', fontSize:11, cursor:'pointer'}}>
              ✕ Zamknij
            </button>
          </div>
        </div>
        <pre style={{
          flex:1, overflowY:'auto', margin:0,
          padding:'16px 20px', fontSize:11.5,
          fontFamily:'var(--font-mono)', lineHeight:1.6,
          color:'var(--text-secondary)',
          scrollbarWidth:'thin',
        }} dangerouslySetInnerHTML={{ __html: colorize(xml) }} />
      </div>
    </div>
  );
}

export default function EditorPanel({ selectedCounties, drawnPolygon, onWarningCreated, onStatusChange, warnings = [], onLoadCounties }) {
  // Inicjalizacja ze zapisanego draftu (persystencja przy zmianie zakładki)
  const _d = getDraft();

  const [phenomenon, setPhenomenon] = useState(_d.phenomenon || 'silny_wiatr');
  const [params, setParams] = useState(() => {
    if (_d.params) return _d.params;
    return getDefaultParams(_d.phenomenon || 'silny_wiatr');
  });
  const [level, setLevel] = useState(null);
  const [onset, setOnset] = useState(() => _d.onset || getISOLocal(0));
  const [expires, setExpires] = useState(() => _d.expires || getISOLocal(24 * 60));
  const [headline, setHeadline] = useState(_d.headline || '');
  const [description, setDescription] = useState(_d.description || '');
  const [impacts, setImpacts]         = useState(_d.impacts || '');
  const [instruction, setInstruction] = useState(_d.instruction || '');
  // Wersje angielskie (dla MeteoAlarm i exportu EN)
  const [descriptionEn, setDescriptionEn] = useState(_d.descriptionEn || '');
  const [impactsEn, setImpactsEn]         = useState(_d.impactsEn || '');
  const [instructionEn, setInstructionEn] = useState(_d.instructionEn || '');
  // Aktywny język w textarea (per-pole, ale dla prostoty jeden globalny toggle)
  const [textLang, setTextLang] = useState('pl');  // 'pl' | 'en'
  const [msgType, setMsgType] = useState(_d.msgType || 'Alert');
  const [referencesId, setReferencesId] = useState(_d.referencesId || '');
  const [operationHint, setOperationHint] = useState(_d.operationHint || 'create');
  // Dialog "powiat poza pierwotnym obszarem"
  const [expandDialog, setExpandDialog] = useState(null);   // null | { newCounties, oldCounties } 
  // Kontekst eskalacji/deeskalacji — dla zjawisk kumulacyjnych (opady)
  const [observedValue, setObservedValue] = useState('');
  const [forecastValue, setForecastValue] = useState('');
  const originalForUpdate = useRef(null);
  const loadingFromHistory = useRef(false);  // zapobiega reset params/texts przez useEffect([phenomenon]) podczas ładowania
  const [previewXml, setPreviewXml]       = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [presets, setPresets]             = useState(() => {
    try { return JSON.parse(localStorage.getItem('meteocap_presets') || '[]'); }
    catch { return []; }
  });
  const [showPresets, setShowPresets]     = useState(false);
  const [presetName, setPresetName]       = useState('');
  const [altFrom, setAltFrom]             = useState(_d.altFrom || '');
  const [altTo, setAltTo]                 = useState(_d.altTo || '');
  const fileInputRef                       = useRef(null);
  const [saving, setSaving] = useState(false);
  const saveInProgress = useRef(false);  // mutex — blokuje duplikaty przy wielokrotnym kliknięciu
  const [imgwImporting, setImgwImporting] = useState(false);
  const [imgwPreview, setImgwPreview]     = useState(null); // null | {warnings, count, skipped}
  const levelTimer = useRef(null);

  // Śledź czy użytkownik ręcznie edytował pola treści
  const descriptionUserEdited = useRef(false);
  const instructionUserEdited = useRef(false);
  const impactsUserEdited     = useRef(false);
  const descriptionEnUserEdited = useRef(false);
  const instructionEnUserEdited = useRef(false);
  const impactsEnUserEdited     = useRef(false);
  const lastDefaultDescription = useRef('');
  const lastDefaultInstruction = useRef('');
  const lastDefaultImpacts     = useRef('');

  // Wczytaj szablony
  useEffect(() => {
    // Presety są w localStorage — nie potrzeba API
  }, []);

  // Zapisuj draft przy każdej zmianie — persystencja przy przełączaniu zakładek
  useEffect(() => {
    setDraft({
      phenomenon, params, onset, expires,
      headline, description, impacts, instruction,
      msgType, referencesId, altFrom, altTo,
    });
  }, [phenomenon, params, onset, expires, headline, description, instruction, msgType, referencesId, altFrom, altTo]);

  const defs = PARAM_DEFS[phenomenon] || [];

  // When phenomenon changes, reset params AND oznacz pola jako nie-edytowane
  // WYJĄTEK: gdy ładujemy ostrzeżenie z historii (loadingFromHistory.current = true)
  useEffect(() => {
    if (loadingFromHistory.current) {
      // Nie resetuj — params i texty już zostały ustawione przez handleLoadForUpdate
      loadingFromHistory.current = false;
      return;
    }
    const newParams = getDefaultParams(phenomenon);
    setParams(newParams);
    // Reset flag edycji przy zmianie zjawiska
    descriptionUserEdited.current = false;
    impactsUserEdited.current = false;
    instructionUserEdited.current = false;
    descriptionEnUserEdited.current = false;
    impactsEnUserEdited.current = false;
    instructionEnUserEdited.current = false;
  }, [phenomenon]);

  // Debounced level check
  useEffect(() => {
    if (levelTimer.current) clearTimeout(levelTimer.current);
    levelTimer.current = setTimeout(async () => {
      try {
        const res = await axios.post(`${API}/warnings/check-level`, {
          phenomenon,
          params,
        });
        setLevel(res.data.level);
      } catch (e) {
        setLevel(null);
      }
    }, 300);
    return () => clearTimeout(levelTimer.current);
  }, [phenomenon, params]);

  // Pobierz domyślne teksty gdy zmienia się zjawisko, stopień lub parametry (suwaki)
  // Nie nadpisuj jeśli użytkownik ręcznie edytował pole
  // Debounce 250ms żeby nie zalewać backendu przy przeciąganiu suwaka
  useEffect(() => {
    if (!level || !phenomenon) return;
    const timer = setTimeout(() => {
      axios.get(`${API}/warnings/default-texts`, {
        params: { phenomenon, level, params: JSON.stringify(params) }
      })
        .then(r => {
          const d = r.data || {};
          // Pola PL
          if (!descriptionUserEdited.current) {
            setDescription(d.description_pl || d.description || '');
            lastDefaultDescription.current = d.description_pl || d.description || '';
          }
          if (!impactsUserEdited.current) {
            setImpacts(d.impacts_pl || d.impacts || '');
            lastDefaultImpacts.current = d.impacts_pl || d.impacts || '';
          }
          if (!instructionUserEdited.current) {
            setInstruction(d.instruction_pl || d.instruction || '');
            lastDefaultInstruction.current = d.instruction_pl || d.instruction || '';
          }
          // Pola EN — analogicznie
          if (!descriptionEnUserEdited.current) {
            setDescriptionEn(d.description_en || '');
          }
          if (!impactsEnUserEdited.current) {
            setImpactsEn(d.impacts_en || '');
          }
          if (!instructionEnUserEdited.current) {
            setInstructionEn(d.instruction_en || '');
          }
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phenomenon, level, JSON.stringify(params)]);

  // Auto-zgadywanie operation_hint na podstawie diff oryginału vs aktualnych wartości (tryb Update)
  useEffect(() => {
    if (msgType !== 'Update') return;
    const orig = originalForUpdate.current;
    if (!orig) return;

    // Liczymy diff
    const newCountiesIds = (selectedCounties || []).map(c => String(c.id));
    const origIds = orig.counties_ids || [];
    const sameCounties = newCountiesIds.length === origIds.length &&
      newCountiesIds.every(id => origIds.includes(id));
    const expanded = newCountiesIds.length > origIds.length;
    const shrunk   = newCountiesIds.length < origIds.length;
    const expiresChanged = orig.expires && expires && new Date(orig.expires).getTime() !== new Date(expires).getTime();
    const expiresExtended = orig.expires && expires && new Date(expires) > new Date(orig.expires);
    const expiresShortened = orig.expires && expires && new Date(expires) < new Date(orig.expires);
    const levelChanged = orig.level !== level;
    const escalation   = level > orig.level;
    const deescalation = level < orig.level;

    // Logika priorytetowa
    let guess = 'amend';
    if (escalation)         guess = 'escalate';
    else if (deescalation)  guess = 'deescalate';
    else if (expanded && sameCounties === false) guess = 'expand_area';
    else if (shrunk)        guess = 'cut_area';
    else if (expiresExtended && sameCounties && !levelChanged)  guess = 'extend';
    else if (expiresShortened && sameCounties && !levelChanged) guess = 'shorten';

    setOperationHint(guess);
    // Resetuj kontekst eskalacji jeśli zmiana na operację która tego nie używa
    if (guess !== 'escalate' && guess !== 'deescalate') {
      setObservedValue(''); setForecastValue('');
    }
  }, [msgType, selectedCounties, expires, level, onset]);

  // Wykryj powiaty które NIGDY nie były w grupie ostrzeżenia (tryb Update)
  // Trigger TYLKO gdy zaznaczamy WIĘCEJ powiatów niż miał oryginał — nie przy zmniejszaniu obszaru
  const newCountiesOutsideGroup = (() => {
    if (msgType !== 'Update' || !originalForUpdate.current) return [];
    const orig = originalForUpdate.current;
    const origCount = orig.counties_ids?.length || 0;
    // Jeśli zaznaczono mniej lub tyle samo co oryginał — to redukcja obszaru, nie rozszerzenie
    if ((selectedCounties || []).length <= origCount) return [];
    const ever = orig.counties_in_group_ever;
    if (!ever || !(ever instanceof Set)) return [];
    return (selectedCounties || []).filter(c => !ever.has(String(c.id)));
  })();

  // Wczytaj szablon opisu dla wybranej operacji Update
  useEffect(() => {
    if (msgType !== 'Update' || !operationHint || operationHint === 'create') return;
    if (!originalForUpdate.current) return;
    const orig = originalForUpdate.current;
    // Kontekst dla szablonu
    const obs = parseFloat(observedValue) || 0;
    const fc  = parseFloat(forecastValue) || 0;
    const total = obs + fc;
    const context = {
      old_level: orig.level,
      new_level: level,
      old_param_value: '',
      expires: expires ? new Date(expires).toLocaleString('pl-PL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '',
      observed_value: observedValue || '',
      forecast_value: forecastValue || '',
      total_value:    obs || fc ? String(total) : '',
    };
    // Debounce 300ms żeby nie spamować przy wpisywaniu w pola observed/forecast
    const timer = setTimeout(() => {
      axios.get(`${API}/warnings/update-template`, {
        params: {
          phenomenon,
          operation: operationHint,
          params:    JSON.stringify(params),
          context:   JSON.stringify(context),
        }
      }).then(r => {
        const tmpl = r.data?.rendered;
        if (tmpl) {
          setDescription(tmpl);
          descriptionUserEdited.current = false;
        }
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operationHint, msgType, JSON.stringify(params), level, observedValue, forecastValue]);

  // Wczytaj dane ostrzeżenia do formularza przy wyborze Update
  const handleLoadForUpdate = useCallback((warningId) => {
    setReferencesId(warningId);
    if (!warningId) return;
    const orig = warnings.find(w => w.id === warningId);
    if (!orig) return;
    // Ustaw flagę — zapobiega nadpisaniu params/texts przez useEffect([phenomenon])
    loadingFromHistory.current = true;
    // Wypełnij formularz danymi oryginału — synoptyk może je zmodyfikować
    setPhenomenon(orig.phenomenon || 'silny_wiatr');
    setParams(orig.params || {});
    setOnset(orig.onset ? orig.onset.slice(0, 16) : getISOLocal(0));
    setExpires(orig.expires ? orig.expires.slice(0, 16) : getISOLocal(24 * 60));
    setHeadline(orig.headline || '');
    setDescription(orig.description || '');
    setDescriptionEn(orig.description_en || '');
    setImpacts(orig.impacts || '');
    setImpactsEn(orig.impacts_en || '');
    setInstruction(orig.instruction || '');
    setInstructionEn(orig.instruction_en || '');
    setAltFrom(orig.altitude_from_m != null ? String(orig.altitude_from_m) : '');
    setAltTo(orig.altitude_to_m != null ? String(orig.altitude_to_m) : '');
    // Traktuj załadowane teksty jako ręcznie edytowane (nie zastępuj defaultami)
    descriptionUserEdited.current = true;
    impactsUserEdited.current = true;
    instructionUserEdited.current = true;
    lastDefaultDescription.current = orig.description || '';
    lastDefaultImpacts.current = orig.impacts || '';
    lastDefaultInstruction.current = orig.instruction || '';
    // Wczytaj zasięg oryginału na mapę
    if (onLoadCounties && orig.counties?.length) {
      onLoadCounties(orig.counties);
    }
    // Snapshot oryginału — do auto-zgadywania operacji przy diff
    originalForUpdate.current = {
      level: orig.level,
      phenomenon: orig.phenomenon,
      params: { ...orig.params },
      counties_ids: (orig.counties || []).map(c => String(c.id)),
      counties_in_group_ever: new Set((orig.counties || []).map(c => String(c.id))),  // wypełnione async
      expires: orig.expires,
      onset: orig.onset,
      group_id: orig.warning_group_id || orig.id,
    };
    // Asynchronicznie pobierz pełną historię grupy żeby znać wszystkie powiaty kiedykolwiek obecne
    axios.get(`${API}/warnings/${warningId}/group`)
      .then(r => {
        const allEver = new Set();
        (r.data?.versions || []).forEach(v => {
          (v.counties || []).forEach(c => allEver.add(String(c.id)));
        });
        if (originalForUpdate.current && originalForUpdate.current.group_id === (orig.warning_group_id || orig.id)) {
          originalForUpdate.current.counties_in_group_ever = allEver;
        }
      })
      .catch(() => {});
    setOperationHint('amend');  // domyślnie korekta — autoguess zaktualizuje
    onStatusChange({ msg: `Wczytano ostrzeżenie do aktualizacji: ${orig.phenomenon?.replace(/_/g,' ')} St.${orig.level}`, type: 'info' });
  }, [warnings, onStatusChange, onLoadCounties]);

  // Nasłuch na event z Status (przycisk "Edytuj" w panelu szczegółów)
  useEffect(() => {
    const handler = (e) => {
      const wid = e.detail?.warningId;
      if (!wid) return;
      setMsgType('Update');
      handleLoadForUpdate(wid);  // bez setTimeout — handleLoadForUpdate już nie zależy od msgType
    };
    window.addEventListener('meteocap:loadForUpdate', handler);
    return () => window.removeEventListener('meteocap:loadForUpdate', handler);
  }, [handleLoadForUpdate]);

  const handleParamChange = useCallback((key, value) => {
    setParams(prev => ({ ...prev, [key]: value }));
  }, []);

  const handlePreviewXML = async () => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów ostrzeżenia', type: 'error' });
      return;
    }
    setPreviewLoading(true);
    try {
      const res = await axios.post(`${API}/warnings`, buildPayload());
      onWarningCreated(res.data);
      const xmlRes = await axios.get(`${API}/warnings/${res.data.id}/xml?mode=collective`);
      setPreviewXml(xmlRes.data);
      onStatusChange({ msg: 'Podgląd XML wygenerowany', type: 'success' });
    } catch (e) {
      onStatusChange({ msg: `Błąd: ${e.message}`, type: 'error' });
    } finally {
      setPreviewLoading(false);
    }
  };

  const resetForm = () => {
    setHeadline('');
    setDescription('');
    setImpacts('');
    setInstruction('');
    setOnset(getISOLocal(0));
    setExpires(getISOLocal(24 * 60));
    setMsgType('Alert');
    setReferencesId('');
    setAltFrom('');
    setAltTo('');
    // Reset flag ręcznej edycji — przy nowym ostrzeżeniu defaulty znów mogą się załadować
    descriptionUserEdited.current = false;
    impactsUserEdited.current = false;
    instructionUserEdited.current = false;
    lastDefaultDescription.current = '';
    lastDefaultImpacts.current = '';
    lastDefaultInstruction.current = '';
    resetDraft(); // wyczyść persist store
  };

  const handleSave = async () => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów żadnego stopnia ostrzeżenia', type: 'error' });
      return;
    }
    if (saveInProgress.current) return;  // blokuj duplikaty
    if (msgType === 'Update' && referencesId && newCountiesOutsideGroup.length > 0) {
      setExpandDialog({
        newCounties:  newCountiesOutsideGroup,
        oldCounties: (selectedCounties || []).filter(c => !newCountiesOutsideGroup.find(nc => nc.id === c.id)),
      });
      return;
    }
    await performSave('normal');
  };

  const performSave = async (mode = 'normal') => {
    if (saveInProgress.current) return;
    saveInProgress.current = true;
    setSaving(true);
    onStatusChange({ msg: 'Zapisywanie ostrzeżenia...', type: 'info' });
    try {
      let res;
      if (mode === 'split' || mode === 'replace') {
        // Wywołaj endpoint expand-area
        const allC = selectedCounties || [];
        res = await axios.post(`${API}/warnings/${referencesId}/expand-area`, {
          all_counties: allC,
          params,
          onset:       onset ? new Date(onset).toISOString() : undefined,
          expires:     expires ? new Date(expires).toISOString() : undefined,
          headline, description, impacts, instruction,
          mode,
        });
        const a = res.data?.updated_in_group_a || res.data?.cancelled_group_a;
        const b = res.data?.new_alert_group_b;
        if (b) onWarningCreated(b);
        if (a && mode === 'split') onWarningCreated(a);
        onStatusChange({
          msg: mode === 'split'
            ? `✅ Aktualizacja + nowe ostrzeżenie (${b?.counties?.length || 0} nowych powiatów) zapisane`
            : `✅ Stare odwołane, nowe ostrzeżenie z całością (${b?.counties?.length || 0} powiatów) zapisane`,
          type: 'success',
        });
      } else if (msgType === 'Update' && referencesId) {
        res = await axios.put(`${API}/warnings/${referencesId}`, buildPayload());
        onWarningCreated(res.data);
        onStatusChange({ msg: `✅ Aktualizacja St.${res.data.level} — ${phenomenon.replace(/_/g, ' ')} zapisana`, type: 'success' });
      } else {
        res = await axios.post(`${API}/warnings`, buildPayload());
        onWarningCreated(res.data);
        onStatusChange({ msg: `Ostrzeżenie stopień ${res.data.level} — ${phenomenon.replace(/_/g, ' ')} zapisane`, type: 'success' });
      }
      setExpandDialog(null);
      resetForm();
    } catch (e) {
      onStatusChange({ msg: `Błąd zapisu: ${e.response?.data?.detail || e.message}`, type: 'error' });
    } finally {
      setSaving(false);
      saveInProgress.current = false;
    }
  };

  // ── Presety (lokalne w przeglądarce — bez API) ────────────────────────────
  const savePresets = (list) => {
    setPresets(list);
    try { localStorage.setItem('meteocap_presets', JSON.stringify(list)); } catch {}
  };

  const handleSavePreset = () => {
    const name = presetName.trim();
    if (!name || !phenomenon) return;
    const newPreset = { id: Date.now().toString(), name, phenomenon, params: { ...params }, altFrom, altTo };
    savePresets([...presets, newPreset]);
    setPresetName('');
    onStatusChange({ msg: `Preset \u201e${name}\u201c zapisany`, type: 'success' });
  };

  const handleLoadPreset = (preset) => {
    setPhenomenon(preset.phenomenon);
    setParams(preset.params || {});
    setAltFrom(preset.altFrom || '');
    setAltTo(preset.altTo || '');
    setShowPresets(false);
    descriptionUserEdited.current = false;
    instructionUserEdited.current = false;
    onStatusChange({ msg: `Wczytano preset \u201e${preset.name}\u201c`, type: 'success' });
  };

  const handleDeletePreset = (id) => {
    savePresets(presets.filter(p => p.id !== id));
  };

    const handleImportXML = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await axios.post(`${API}/import/cap-xml`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const d = res.data;
      if (d.phenomenon) setPhenomenon(d.phenomenon);
      if (d.params) setParams(d.params);
      if (d.onset)   setOnset(d.onset.slice(0,16));
      if (d.expires) setExpires(d.expires.slice(0,16));
      if (d.headline) setHeadline(d.headline);
      if (d.description) setDescription(d.description);
      if (d.instruction) setInstruction(d.instruction);
      if (d.altitude_from_m != null) setAltFrom(String(d.altitude_from_m));
      if (d.altitude_to_m != null)   setAltTo(String(d.altitude_to_m));
      onStatusChange({ msg: `Zaimportowano CAP XML: ${file.name}`, type: 'success' });
    } catch(e) { onStatusChange({ msg: `Błąd importu: ${e.message}`, type: 'error' }); }
    e.target.value = '';
  };

  const buildPayload = () => ({
    phenomenon, params,
    counties: selectedCounties,
    polygon: drawnPolygon,
    onset: new Date(onset).toISOString(),
    expires: new Date(expires).toISOString(),
    headline: headline || undefined,
    description: description || undefined,
    impacts: impacts || undefined,
    instruction: instruction || undefined,
    description_en: descriptionEn || undefined,
    impacts_en:     impactsEn || undefined,
    instruction_en: instructionEn || undefined,
    msg_type: msgType,
    references_id: referencesId || undefined,
    operation_hint: operationHint || undefined,
    altitude_from_m: altFrom ? parseFloat(altFrom) : undefined,
    altitude_to_m:   altTo   ? parseFloat(altTo)   : undefined,
  });

  const downloadFile = (blob, filename, type) => {
    const url = window.URL.createObjectURL(new Blob([blob], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadXML = async (mode = 'collective') => {
    if (!level) {
      onStatusChange({ msg: 'Parametry nie spełniają kryteriów ostrzeżenia', type: 'error' });
      return;
    }
    setSaving(true);
    try {
      let res;
      if (msgType === 'Update' && referencesId) {
        res = await axios.put(`${API}/warnings/${referencesId}`, buildPayload());
      } else {
        res = await axios.post(`${API}/warnings`, buildPayload());
      }
      onWarningCreated(res.data);
      const { id, level: lvl } = res.data;
      const ph = phenomenon;
      if (mode === 'per_county') {
        const zipRes = await axios.get(`${API}/warnings/${id}/xml?mode=per_county`, { responseType: 'blob' });
        downloadFile(zipRes.data, `ostrzezenia_${ph}_st${lvl}_${id.slice(0,8)}.zip`, 'application/zip');
        onStatusChange({ msg: `ZIP z ${selectedCounties.length} plikami CAP pobrany`, type: 'success' });
      } else {
        const xmlRes = await axios.get(`${API}/warnings/${id}/xml?mode=collective`, { responseType: 'blob' });
        downloadFile(xmlRes.data, `ostrzezenie_${ph}_st${lvl}_${id.slice(0,8)}.xml`, 'application/xml');
        onStatusChange({ msg: 'Plik XML CAP 1.2 pobrany pomyślnie', type: 'success' });
      }
    } catch (e) {
      onStatusChange({ msg: `Błąd generowania XML: ${e.message}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // ── Import z API IMGW ──────────────────────────────────────────────────────
  const handleImportIMGW = async () => {
    setImgwImporting(true);
    try {
      const res = await axios.get(`${API}/import/imgw`);
      setImgwPreview(res.data);
    } catch(e) {
      onStatusChange({ msg: `Błąd pobierania z API IMGW: ${e.message}`, type: 'error' });
    } finally {
      setImgwImporting(false);
    }
  };

  const handleSaveIMGW = async (warningsToSave) => {
    try {
      const res = await axios.post(`${API}/import/imgw/save`, { warnings: warningsToSave });
      res.data.warnings.forEach(w => onWarningCreated(w));
      onStatusChange({ msg: `Zaimportowano ${res.data.saved} ostrzeżeń z IMGW`, type: 'success' });
      setImgwPreview(null);
    } catch(e) {
      onStatusChange({ msg: `Błąd zapisu: ${e.message}`, type: 'error' });
    }
  };

  return (
    <div className="editor-panel">
      <div className="editor-header">
        <div className="editor-title">Edytor ostrzeżenia</div>
      </div>

      <div className="editor-scroll">

        {/* Level badge */}
        <LevelBadge level={level} />

        {/* Counties summary */}
        <div className="form-section">
          <div className="form-section-label">Obszar ostrzeżenia</div>
          {selectedCounties.length > 0 ? (
            <div className="counties-summary">
              <div className="counties-count">
                Zaznaczono <span>{selectedCounties.length}</span> powiat{selectedCounties.length === 1 ? '' : selectedCounties.length < 5 ? 'y' : 'ów'}
              </div>
              <div className="counties-chips">
                {selectedCounties.slice(0, 30).map(c => (
                  <span key={c.id} className="county-chip">{c.name}</span>
                ))}
                {selectedCounties.length > 30 && (
                  <span className="county-chip">+{selectedCounties.length - 30} więcej</span>
                )}
              </div>
            </div>
          ) : (
            <div className="counties-summary">
              <div className="counties-placeholder">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.2"/>
                  <path d="M8 5v3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                </svg>
                Narysuj obszar na mapie aby wybrać powiaty
              </div>
            </div>
          )}
        </div>

        {/* Phenomenon selector */}
        <div className="form-section">
          <div className="form-section-label">Zjawisko meteorologiczne</div>
          <select
            className="form-select"
            value={phenomenon}
            onChange={e => setPhenomenon(e.target.value)}
          >
            {PHENOMENA.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </div>

        {/* Dynamic parameters */}
        <div className="form-section">
          <div className="form-section-label">Parametry meteorologiczne</div>
          {defs.map(def => {
            const value = params[def.key] ?? def.default;
            if (def.type === 'slider') {
              return (
                <ParamSlider
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'radio') {
              return (
                <ParamRadio
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'checkbox') {
              return (
                <ParamCheckbox
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            if (def.type === 'wind_dir') {
              return (
                <WindDirectionPicker
                  key={def.key}
                  def={def}
                  value={value}
                  onChange={v => handleParamChange(def.key, v)}
                />
              );
            }
            return null;
          })}
        </div>

        {/* Typ wiadomości */}
        <div className="form-section">
          <div className="form-section-label">Rodzaj komunikatu</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: msgType !== 'Alert' ? 10 : 0 }}>
            {[
              ['Alert',  '🆕 Ostrzeżenie',  'Pierwsze wydanie nowego ostrzeżenia (CAP Alert)'],
              ['Update', '🔄 Aktualizacja', 'Aktualizacja wcześniejszego ostrzeżenia (CAP Update)'],
              ['Cancel', '❌ Odwołanie',    'Odwołanie obowiązującego ostrzeżenia (CAP Cancel)'],
            ].map(([t, label, hint]) => (
              <button key={t} onClick={() => { setMsgType(t); setReferencesId(''); }}
                title={hint}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 'var(--radius-md)',
                  border: '1px solid ' + (msgType === t ? 'var(--accent-blue)' : 'var(--border)'),
                  background: msgType === t ? 'rgba(59,130,246,0.15)' : 'var(--bg-elevated)',
                  color: msgType === t ? 'var(--text-accent)' : 'var(--text-muted)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-display)',
                }}>
                {label}
              </button>
            ))}
          </div>
          {msgType !== 'Alert' && (
            <div className="form-input-group">
              <label className="form-input-label">
                Ostrzeżenie do {msgType === 'Update' ? 'aktualizacji' : 'anulowania'}
                {msgType === 'Update' && (
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                    — formularz zostanie wypełniony danymi oryginału
                  </span>
                )}
              </label>
              {/* Lista rozwijana zamiast wpisywania ID */}
              {warnings && warnings.filter(w => (w.status === 'active' || w.status === 'pending') && w.is_active_leaf !== false).length > 0 ? (
                <select className="form-select" value={referencesId}
                  onChange={e => {
                    if (msgType === 'Update') {
                      handleLoadForUpdate(e.target.value);
                    } else {
                      setReferencesId(e.target.value);
                    }
                  }}>
                  <option value="">— wybierz ostrzeżenie —</option>
                  {warnings
                    .filter(w => (w.status === 'active' || w.status === 'pending') && w.is_active_leaf !== false)
                    .map(w => {
                      const ph = w.phenomenon?.replace(/_/g,' ') || '';
                      const status = w.status === 'active' ? '● Aktywne' : '○ Nadch.';
                      const ver = w.version > 1 ? ` v${w.version}` : '';
                      return (
                        <option key={w.id} value={w.id}>
                          {status} | St.{w.level} {ph}{ver} | {w.id?.slice(0,8)}
                        </option>
                      );
                    })
                  }
                </select>
              ) : (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '8px 12px',
                  background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)' }}>
                  Brak aktywnych/nadchodzących ostrzeżeń do {msgType === 'Update' ? 'aktualizacji' : 'anulowania'}
                </div>
              )}

              {/* Auto-zgadywany typ operacji — synoptyk może poprawić */}
              {msgType === 'Update' && referencesId && (
                <div style={{marginTop:10, padding:10, background:'var(--bg-elevated)',
                  borderRadius:'var(--radius-md)', border:'1px solid var(--border)'}}>
                  <div style={{fontSize:10, color:'var(--text-muted)', textTransform:'uppercase',
                    letterSpacing:'0.06em', marginBottom:6}}>
                    Co robisz? <span style={{color:'var(--accent-blue)', textTransform:'none'}}>
                    (auto: <b>{operationHint}</b> — popraw jeśli źle)</span>
                  </div>
                  <select className="form-select" value={operationHint}
                    onChange={e => setOperationHint(e.target.value)}>
                    <option value="amend">📝 Korekta detali (parametry, opis)</option>
                    <option value="escalate">⬆ Eskalacja — zjawisko nasila się</option>
                    <option value="deescalate">⬇ Deeskalacja — zjawisko słabnie</option>
                    <option value="extend">⏰ Przedłużenie czasu</option>
                    <option value="shorten">⏰ Skrócenie czasu</option>
                    <option value="expand_area">➕ Powiększenie obszaru</option>
                    <option value="cut_area">✂ Wycięcie części obszaru</option>
                  </select>

                  {/* Ostrzeżenie: nowe powiaty poza pierwotnym obszarem grupy */}
                  {newCountiesOutsideGroup.length > 0 && (
                    <div style={{marginTop:10, padding:10,
                      background:'rgba(251,191,36,0.1)',
                      borderRadius:'var(--radius-md)',
                      border:'1px solid var(--warn-2)'}}>
                      <div style={{fontSize:11,fontWeight:600,color:'var(--warn-2)',marginBottom:5,
                        display:'flex',alignItems:'center',gap:6}}>
                        ⚠ Wykryto {newCountiesOutsideGroup.length} powiat{newCountiesOutsideGroup.length===1?'':newCountiesOutsideGroup.length<5?'y':'ów'} poza pierwotnym obszarem
                      </div>
                      <div style={{fontSize:10,color:'var(--text-secondary)',lineHeight:1.5,marginBottom:8}}>
                        Zaznaczone powiaty (
                        {newCountiesOutsideGroup.slice(0,5).map(c => c.name).join(', ')}
                        {newCountiesOutsideGroup.length > 5 ? ` i ${newCountiesOutsideGroup.length-5} więcej` : ''}
                        ) nigdy nie należały do tego ostrzeżenia. Standard CAP wymaga, by dla nowego obszaru
                        wydać <b>nowe ostrzeżenie</b> (Alert), a nie aktualizację (Update).
                      </div>
                      <div style={{fontSize:10,color:'var(--text-muted)',fontStyle:'italic'}}>
                        💡 Przy zapisie pojawi się okno wyboru — możesz rozszerzyć obszar tworząc dwa komunikaty
                        (zalecane) lub zastąpić całość nowym ostrzeżeniem.
                      </div>
                    </div>
                  )}

                  {/* Kontekst eskalacji/deeskalacji dla zjawisk kumulacyjnych */}
                  {(operationHint === 'escalate' || operationHint === 'deescalate') &&
                   CUMULATIVE_PHENOMENA.has(phenomenon) && (
                    <div style={{marginTop:10, padding:10, background:'var(--bg-surface)',
                      borderRadius:'var(--radius-md)', border:'1px dashed var(--border-active)'}}>
                      <div style={{fontSize:10, color:'var(--accent-blue)', textTransform:'uppercase',
                        letterSpacing:'0.06em', marginBottom:6}}>
                        📊 Kontekst {operationHint === 'escalate' ? 'eskalacji' : 'deeskalacji'} (do opisu)
                      </div>
                      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:6}}>
                        <div>
                          <label style={{fontSize:10, color:'var(--text-muted)', display:'block', marginBottom:3}}>
                            Zaobserwowano dotychczas
                          </label>
                          <div style={{display:'flex', alignItems:'center', gap:4}}>
                            <input type="number" className="form-input" value={observedValue}
                              onChange={e => setObservedValue(e.target.value)}
                              placeholder="np. 35" style={{fontSize:11, flex:1}} step="0.1"/>
                            <span style={{fontSize:10, color:'var(--text-muted)', minWidth:20}}>
                              {PHENOMENON_UNITS[phenomenon] || ''}
                            </span>
                          </div>
                        </div>
                        <div>
                          <label style={{fontSize:10, color:'var(--text-muted)', display:'block', marginBottom:3}}>
                            Prognoza pozostała
                          </label>
                          <div style={{display:'flex', alignItems:'center', gap:4}}>
                            <input type="number" className="form-input" value={forecastValue}
                              onChange={e => setForecastValue(e.target.value)}
                              placeholder="np. 25" style={{fontSize:11, flex:1}} step="0.1"/>
                            <span style={{fontSize:10, color:'var(--text-muted)', minWidth:20}}>
                              {PHENOMENON_UNITS[phenomenon] || ''}
                            </span>
                          </div>
                        </div>
                      </div>
                      {(parseFloat(observedValue) || 0) + (parseFloat(forecastValue) || 0) > 0 && (
                        <div style={{fontSize:11, color:'var(--success)', textAlign:'right',
                          fontFamily:'var(--font-mono)'}}>
                          Suma łącznie: <b>{(parseFloat(observedValue) || 0) + (parseFloat(forecastValue) || 0)} {PHENOMENON_UNITS[phenomenon] || ''}</b>
                        </div>
                      )}
                      <div style={{fontSize:10, color:'var(--text-muted)', marginTop:6, lineHeight:1.4}}>
                        Wartości zostaną podstawione w opisie. Pozostaw puste jeśli nie chcesz ich używać —
                        szablon użyje "—" w miejsce brakujących liczb.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pasek narzędzi — presety i import */}
        <div style={{ display:'flex', gap:6, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>

          {/* Presety — dropdown */}
          <div style={{ position:'relative' }}>
            <button className="btn btn-secondary btn-sm"
              onClick={() => setShowPresets(p=>!p)}
              style={{ fontSize:11 }}>
              ⚡ Presety {presets.length > 0 && `(${presets.length})`}
            </button>
            {showPresets && (
              <div style={{
                position:'absolute', top:'100%', left:0, marginTop:4, zIndex:200,
                background:'var(--bg-surface)', border:'1px solid var(--border)',
                borderRadius:'var(--radius-lg)', padding:8, minWidth:240,
                boxShadow:'var(--shadow-panel)', maxHeight:240, overflowY:'auto',
              }}>
                {presets.length === 0 ? (
                  <div style={{fontSize:11,color:'var(--text-muted)',padding:'4px 8px'}}>
                    Brak presetów — użyj pola poniżej aby zapisać bieżące ustawienia suwaków.
                  </div>
                ) : (
                  presets.map(p => (
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                      <button onClick={() => handleLoadPreset(p)}
                        style={{flex:1,textAlign:'left',padding:'5px 8px',borderRadius:'var(--radius-sm)',
                          border:'1px solid var(--border)',background:'var(--bg-elevated)',
                          color:'var(--text-secondary)',fontSize:11,cursor:'pointer'}}>
                        <span style={{marginRight:6,opacity:0.7}}>
                          {p.phenomenon?.replace(/_/g,' ')}
                        </span>
                        <span style={{fontWeight:600}}>{p.name}</span>
                      </button>
                      <button onClick={() => handleDeletePreset(p.id)}
                        title="Usuń preset"
                        style={{padding:'2px 5px',borderRadius:'var(--radius-sm)',
                          border:'1px solid transparent',background:'transparent',
                          color:'var(--warn-3)',fontSize:11,cursor:'pointer',flexShrink:0}}>✕</button>
                    </div>
                  ))
                )}
                {/* Inline zapis nowego presetu */}
                <div style={{borderTop:'1px solid var(--border)',marginTop:6,paddingTop:6,display:'flex',gap:4}}>
                  <input
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    onKeyDown={e => e.key==='Enter' && handleSavePreset()}
                    placeholder="Nazwa presetu…"
                    style={{flex:1,padding:'4px 6px',fontSize:11,borderRadius:'var(--radius-sm)',
                      border:'1px solid var(--border)',background:'var(--bg-elevated)',
                      color:'var(--text-primary)',outline:'none'}}
                  />
                  <button onClick={handleSavePreset} disabled={!presetName.trim()||!phenomenon}
                    style={{padding:'4px 8px',fontSize:11,borderRadius:'var(--radius-sm)',
                      border:'1px solid var(--accent-blue)',background:'rgba(59,130,246,0.15)',
                      color:'var(--text-accent)',cursor:'pointer',flexShrink:0,
                      opacity:(!presetName.trim()||!phenomenon)?0.4:1}}>
                    Zapisz
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Import XML */}
          <button className="btn btn-secondary btn-sm"
            onClick={() => fileInputRef.current?.click()}
            style={{ fontSize:11 }}>
            📥 Importuj XML
          </button>
          <input ref={fileInputRef} type="file" accept=".xml"
            onChange={handleImportXML} style={{ display:'none' }} />

          {/* Import z API IMGW */}
          <button className="btn btn-secondary btn-sm"
            onClick={handleImportIMGW}
            disabled={imgwImporting}
            title="Pobierz aktualne ostrzeżenia z API IMGW-PIB"
            style={{ fontSize:11, borderColor:'var(--accent-blue)' }}>
            {imgwImporting ? '⏳' : '🌩'} IMGW API
          </button>
        </div>

                {/* Elewacja n.p.m. */}
        <div className="form-section">
          <div className="form-section-label">Zakres elewacji (opcjonalnie)</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:6 }}>
            <div className="form-input-group">
              <label className="form-input-label">Od (m n.p.m.)</label>
              <input type="number" className="form-input" min="0" max="2500" step="50"
                placeholder="np. 600"
                value={altFrom} onChange={e => setAltFrom(e.target.value)} />
            </div>
            <div className="form-input-group">
              <label className="form-input-label">Do (m n.p.m.)</label>
              <input type="number" className="form-input" min="0" max="2500" step="50"
                placeholder="np. 2500"
                value={altTo} onChange={e => setAltTo(e.target.value)} />
            </div>
          </div>
          {(altFrom || altTo) && (
            <div style={{fontSize:10,color:'var(--text-muted)',fontFamily:'var(--font-mono)'}}>
              Ostrzeżenie ważne dla terenu {altFrom||'0'}–{altTo||'2500'} m n.p.m.
              · W CAP: altitude={altFrom ? Math.round(altFrom*3.28) : 0} ft,
              ceiling={altTo ? Math.round(altTo*3.28) : 8202} ft
            </div>
          )}
        </div>

        {/* Time range */}
        <div className="form-section">
          <div className="form-section-label">Okres ważności</div>
          <div className="datetime-grid">
            <div className="form-input-group">
              <label className="form-input-label">Od</label>
              <input
                type="datetime-local"
                className="form-input"
                value={onset}
                onChange={e => setOnset(e.target.value)}
              />
            </div>
            <div className="form-input-group">
              <label className="form-input-label">Do</label>
              <input
                type="datetime-local"
                className="form-input"
                value={expires}
                onChange={e => setExpires(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Optional text */}
        <div className="form-section">
          <div className="form-section-label">Treść ostrzeżenia</div>
          <div className="form-input-group" style={{ marginBottom: 10 }}>
            <label className="form-input-label">Nagłówek (opcjonalnie)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Np. Ostrzeżenie meteorologiczne 2° — Silny wiatr"
              value={headline}
              onChange={e => setHeadline(e.target.value)}
            />
          </div>
          {/* Toggle języka dla wszystkich pól treści */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8,
            padding:'6px 10px', background:'var(--bg-elevated)', borderRadius:'var(--radius-md)' }}>
            <span style={{ fontSize:10, color:'var(--text-muted)', textTransform:'uppercase',
              letterSpacing:'0.06em' }}>Język treści ostrzeżenia:</span>
            <div style={{ display:'flex', gap:4, marginLeft:'auto' }}>
              <button onClick={() => setTextLang('pl')}
                style={{ padding:'3px 10px', fontSize:11, fontWeight:600,
                  background: textLang==='pl' ? 'var(--accent-blue)' : 'transparent',
                  color: textLang==='pl' ? '#000' : 'var(--text-secondary)',
                  border: '1px solid ' + (textLang==='pl' ? 'var(--accent-blue)' : 'var(--border)'),
                  borderRadius:'var(--radius-md)', cursor:'pointer' }}
                title="Polski (pl-PL) — domyślny język ostrzeżeń">
                🇵🇱 PL
              </button>
              <button onClick={() => setTextLang('en')}
                style={{ padding:'3px 10px', fontSize:11, fontWeight:600,
                  background: textLang==='en' ? 'var(--accent-blue)' : 'transparent',
                  color: textLang==='en' ? '#000' : 'var(--text-secondary)',
                  border: '1px solid ' + (textLang==='en' ? 'var(--accent-blue)' : 'var(--border)'),
                  borderRadius:'var(--radius-md)', cursor:'pointer' }}
                title="Angielski (en-GB) — wersja dla MeteoAlarm i odbiorców międzynarodowych">
                🇬🇧 EN
              </button>
            </div>
          </div>

          <div className="form-input-group" style={{ marginBottom: 10 }}>
            <label className="form-input-label">
              {textLang === 'pl' ? 'Opis przebiegu' : 'Course description (EN)'}
              {textLang === 'en' && (
                <span style={{ marginLeft:6, fontSize:9, color:'var(--text-muted)' }}>
                  — wersja angielska dla MeteoAlarm
                </span>
              )}
            </label>
            <textarea
              className="form-textarea"
              placeholder={textLang === 'pl' ? "Prognozowany przebieg zjawiska..." : "Forecast course of the phenomenon..."}
              value={textLang === 'pl' ? description : descriptionEn}
              onChange={e => {
                if (textLang === 'pl') {
                  setDescription(e.target.value);
                  if (e.target.value !== lastDefaultDescription.current) {
                    descriptionUserEdited.current = true;
                  }
                } else {
                  setDescriptionEn(e.target.value);
                  descriptionEnUserEdited.current = true;
                }
              }}
              rows={2}
            />
          </div>
          <div className="form-input-group" style={{ marginBottom: 10 }}>
            <label className="form-input-label">
              {textLang === 'pl' ? 'Spodziewane skutki' : 'Expected impacts (EN)'}
            </label>
            <textarea
              className="form-textarea"
              placeholder={textLang === 'pl' ? "Spodziewane skutki zjawiska..." : "Expected impacts of the phenomenon..."}
              value={textLang === 'pl' ? impacts : impactsEn}
              onChange={e => {
                if (textLang === 'pl') {
                  setImpacts(e.target.value);
                  if (e.target.value !== lastDefaultImpacts.current) {
                    impactsUserEdited.current = true;
                  }
                } else {
                  setImpactsEn(e.target.value);
                  impactsEnUserEdited.current = true;
                }
              }}
              rows={3}
            />
          </div>
          <div className="form-input-group">
            <label className="form-input-label">
              {textLang === 'pl' ? 'Zalecenia — co robić?' : 'Recommendations — what to do (EN)'}
            </label>
            <textarea
              className="form-textarea"
              placeholder={textLang === 'pl' ? "Zalecane działania dla służb i ludności..." : "Recommended actions for services and the public..."}
              value={textLang === 'pl' ? instruction : instructionEn}
              onChange={e => {
                if (textLang === 'pl') {
                  setInstruction(e.target.value);
                  if (e.target.value !== lastDefaultInstruction.current) {
                    instructionUserEdited.current = true;
                  }
                } else {
                  setInstructionEn(e.target.value);
                  instructionEnUserEdited.current = true;
                }
              }}
              rows={3}
            />
          </div>
        </div>

      </div>

      {/* Footer actions */}
      <div className="editor-footer">
        <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
          <button className="btn btn-secondary" style={{ flex: 1 }}
            onClick={handleSave} disabled={saving || !level}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h8l2 2v8a1 1 0 01-1 1H3a1 1 0 01-1-1V2z" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="8" width="6" height="4" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="4" y="2" width="5" height="3" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            Zapisz
          </button>
          <button className="btn btn-primary" style={{ flex: 2 }}
            onClick={() => handleDownloadXML('collective')} disabled={saving || !level}
            title="Jeden plik XML dla całego obszaru">
            {saving
              ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{animation:'spin 1s linear infinite'}}><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="5"/></svg>
              : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 1v8M4 6l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>
            }
            Zbiorczy XML
          </button>
        </div>
        <button className="btn btn-secondary" style={{ width:'100%', marginBottom: 6 }}
          onClick={() => handleDownloadXML('per_county')} disabled={saving || !level || selectedCounties.length === 0}
          title="Osobny plik XML dla każdego powiatu — format IMGW">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 1h5l3 3v9H3V1z" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M8 1v3h3" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 7h4M5 9.5h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/>
          </svg>
          ZIP — per powiat ({selectedCounties.length} plików)
        </button>
        <button className="btn btn-secondary" style={{ width:'100%', marginBottom: 6 }}
          onClick={handlePreviewXML} disabled={previewLoading || !level}
          title="Podgląd CAP XML przed pobraniem">
          {previewLoading ? '⏳' : '👁'} Podgląd XML
        </button>
      {!level && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            ↑ Dostosuj parametry aby aktywować ostrzeżenie
          </div>
        )}
      </div>
      {previewXml && <XmlPreviewModal xml={previewXml} onClose={() => setPreviewXml(null)} />}

      {/* Modal podglądu importu z API IMGW */}
      {imgwPreview && (
        <div style={{
          position:'fixed', inset:0, zIndex:9000,
          background:'rgba(0,0,0,0.75)', display:'flex',
          alignItems:'center', justifyContent:'center',
        }} onClick={() => setImgwPreview(null)}>
          <div style={{
            width:'85vw', maxWidth:900, maxHeight:'85vh',
            background:'var(--bg-surface)', border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)', display:'flex', flexDirection:'column',
            boxShadow:'0 8px 64px rgba(0,0,0,0.8)',
          }} onClick={e => e.stopPropagation()}>
            {/* Nagłówek */}
            <div style={{padding:'14px 20px', borderBottom:'1px solid var(--border)',
              display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div>
                <span style={{fontSize:13, fontWeight:700, color:'var(--text-primary)'}}>
                  🌩 Import z API IMGW-PIB
                </span>
                <span style={{fontSize:11, color:'var(--text-muted)', marginLeft:10}}>
                  {imgwPreview.count} ostrzeżeń · {imgwPreview.skipped} pominięte
                </span>
              </div>
              <button onClick={() => setImgwPreview(null)}
                style={{padding:'4px 10px', borderRadius:'var(--radius-sm)',
                  border:'1px solid var(--border)', background:'var(--bg-elevated)',
                  color:'var(--text-secondary)', fontSize:11, cursor:'pointer'}}>
                ✕ Zamknij
              </button>
            </div>

            {/* Lista ostrzeżeń */}
            <div style={{flex:1, overflowY:'auto', padding:16}}>
              {imgwPreview.warnings.length === 0 ? (
                <div style={{color:'var(--text-muted)', textAlign:'center', padding:32}}>
                  Brak aktualnych ostrzeżeń w API IMGW
                </div>
              ) : (
                imgwPreview.warnings.map((w, i) => {
                  const lvlColor = {1:'#facc15', 2:'#f97316', 3:'#ef4444'}[w.level] || '#facc15';
                  return (
                    <div key={i} style={{
                      border:'1px solid var(--border)', borderRadius:'var(--radius-md)',
                      padding:12, marginBottom:8, background:'var(--bg-elevated)',
                    }}>
                      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:6}}>
                        <span style={{
                          background:lvlColor, color:'#000', fontWeight:700,
                          fontSize:11, padding:'2px 8px', borderRadius:4,
                        }}>St.{w.level}</span>
                        <span style={{fontSize:12, fontWeight:600, color:'var(--text-primary)'}}>
                          {w.headline}
                        </span>
                        <span style={{fontSize:10, color:'var(--text-muted)', marginLeft:'auto'}}>
                          {w.county_count} powiatów
                        </span>
                      </div>
                      <div style={{fontSize:10, color:'var(--text-muted)', marginBottom:4}}>
                        {w.onset   ? new Date(w.onset).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}
                        {' → '}
                        {w.expires ? new Date(w.expires).toLocaleString('pl-PL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—'}
                        {' (czas lokalny)'}
                        {w.prawdopodobienstwo && ` · prawdopodobieństwo: ${w.prawdopodobienstwo}%`}
                      </div>
                      {w.description && (
                        <div style={{fontSize:11, color:'var(--text-secondary)', fontStyle:'italic', marginBottom:4}}>
                          {w.description}
                        </div>
                      )}
                      <div style={{fontSize:10, color:'var(--text-muted)'}}>
                        📋 {w.biuro}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Stopka */}
            {imgwPreview.warnings.length > 0 && (
              <div style={{padding:'12px 16px', borderTop:'1px solid var(--border)',
                display:'flex', gap:8, justifyContent:'flex-end'}}>
                <button onClick={() => setImgwPreview(null)}
                  style={{padding:'7px 16px', borderRadius:'var(--radius-md)',
                    border:'1px solid var(--border)', background:'transparent',
                    color:'var(--text-secondary)', fontSize:12, cursor:'pointer'}}>
                  Anuluj
                </button>
                <button onClick={() => handleSaveIMGW(imgwPreview.warnings)}
                  style={{padding:'7px 18px', borderRadius:'var(--radius-md)',
                    border:'1px solid var(--accent-blue)',
                    background:'rgba(59,130,246,0.15)',
                    color:'var(--text-accent)', fontSize:12, fontWeight:600, cursor:'pointer'}}>
                  ✓ Importuj wszystkie ({imgwPreview.count})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* === MODAL: ROZSZERZENIE OBSZARU (nowe powiaty poza grupą) === */}
      {expandDialog && (
        <div style={{position:'fixed',inset:0,zIndex:9100,background:'rgba(0,0,0,0.78)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:20}}
          onClick={() => !saving && setExpandDialog(null)}>
          <div style={{width:'min(95vw,640px)',maxHeight:'90vh',overflowY:'auto',
            background:'var(--bg-surface)',border:'1px solid var(--border)',
            borderRadius:'var(--radius-lg)',boxShadow:'0 8px 64px rgba(0,0,0,0.85)'}}
            onClick={e=>e.stopPropagation()}>

            <div style={{padding:'16px 20px',borderBottom:'1px solid var(--border)',
              background:'rgba(251,191,36,0.08)'}}>
              <div style={{fontSize:15,fontWeight:700,color:'var(--text-primary)',
                display:'flex',alignItems:'center',gap:8}}>
                ⚠ Wybierz sposób rozszerzenia obszaru
              </div>
              <div style={{fontSize:11,color:'var(--text-muted)',marginTop:6,lineHeight:1.5}}>
                Zaznaczyłeś <b style={{color:'var(--warn-2)'}}>{expandDialog.newCounties.length} powiat{expandDialog.newCounties.length===1?'':expandDialog.newCounties.length<5?'y':'ów'}</b> spoza
                pierwotnego obszaru ostrzeżenia. Standard CAP wymaga, aby dla nowego obszaru
                wydać <b>nowe ostrzeżenie</b> (Alert), bo odbiorcy z tych powiatów wcześniej go nie dostali.
              </div>
            </div>

            <div style={{padding:'16px 20px'}}>
              {/* Lista nowych powiatów */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:10,color:'var(--text-muted)',textTransform:'uppercase',
                  letterSpacing:'0.06em',marginBottom:6}}>
                  Powiaty poza pierwotnym obszarem ({expandDialog.newCounties.length}):
                </div>
                <div style={{display:'flex',flexWrap:'wrap',gap:4,maxHeight:80,overflowY:'auto',
                  padding:6,background:'var(--bg-elevated)',borderRadius:'var(--radius-md)'}}>
                  {expandDialog.newCounties.map(c => (
                    <span key={c.id} style={{fontSize:10,padding:'2px 7px',background:'var(--warn-2)',
                      color:'#000',borderRadius:3,fontFamily:'var(--font-mono)',fontWeight:600}}>
                      {c.name}
                    </span>
                  ))}
                </div>
              </div>

              {/* Opcja 1: Split (zalecana) */}
              <button onClick={() => performSave('split')} disabled={saving}
                style={{display:'block',width:'100%',padding:14,marginBottom:10,
                  background:'rgba(34,197,94,0.12)',
                  border:'2px solid var(--success)',borderRadius:'var(--radius-md)',
                  cursor:saving?'wait':'pointer',textAlign:'left',color:'var(--text-primary)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <span style={{fontSize:20}}>➕</span>
                  <span style={{fontSize:13,fontWeight:700}}>Rozszerz obszar (zalecane)</span>
                  <span style={{marginLeft:'auto',fontSize:9,padding:'2px 6px',
                    background:'var(--success)',color:'#000',borderRadius:10,fontWeight:700}}>
                    DOMYŚLNE
                  </span>
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5}}>
                  System wyśle <b>dwa komunikaty</b>:<br/>
                  • <b>Aktualizacja</b> dla {expandDialog.oldCounties.length} powiat{expandDialog.oldCounties.length===1?'a':'ów'} z pierwotnego obszaru<br/>
                  • <b>Nowe ostrzeżenie</b> dla {expandDialog.newCounties.length} powiat{expandDialog.newCounties.length===1?'a':expandDialog.newCounties.length<5?'ów':'ów'} dodanych teraz<br/>
                  Historia obu obszarów jest zachowana niezależnie.
                </div>
              </button>

              {/* Opcja 2: Replace */}
              <button onClick={() => performSave('replace')} disabled={saving}
                style={{display:'block',width:'100%',padding:14,marginBottom:10,
                  background:'rgba(239,68,68,0.08)',
                  border:'1px solid var(--warn-3)',borderRadius:'var(--radius-md)',
                  cursor:saving?'wait':'pointer',textAlign:'left',color:'var(--text-primary)'}}>
                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:6}}>
                  <span style={{fontSize:20}}>♻</span>
                  <span style={{fontSize:13,fontWeight:700}}>Zastąp wszystko nowym ostrzeżeniem</span>
                </div>
                <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5}}>
                  Pierwotne ostrzeżenie zostanie <b>odwołane</b> z przyczyną „kontynuacja w nowym ostrzeżeniu".
                  Wydane zostanie nowe ostrzeżenie obejmujące wszystkie {(selectedCounties||[]).length} powiat{(selectedCounties||[]).length===1?'':'ów'}
                  jako jedno wydarzenie. <b>Stara historia zostaje zamknięta.</b>
                </div>
              </button>

              {/* Anuluj */}
              <button onClick={() => setExpandDialog(null)} disabled={saving}
                style={{display:'block',width:'100%',padding:10,
                  background:'transparent',
                  border:'1px solid var(--border)',borderRadius:'var(--radius-md)',
                  cursor:saving?'wait':'pointer',color:'var(--text-muted)',fontSize:12}}>
                ← Wróć do edycji
              </button>

              {saving && (
                <div style={{textAlign:'center',marginTop:10,fontSize:11,color:'var(--accent-blue)'}}>
                  ⏳ Wysyłanie komunikatów CAP...
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
