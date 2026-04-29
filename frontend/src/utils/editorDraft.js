/**
 * Globalny store stanu edytora — persystuje formularz przy przełączaniu zakładek.
 * 
 * Podobny wzorzec do mapState.js — prosty singleton, nie Redux/Zustand.
 * Stan żyje przez całą sesję przeglądarki (do odświeżenia strony).
 * Przy odświeżeniu formularz zaczyna od defaultów — to zachowanie oczekiwane.
 */

const DEFAULT_DRAFT = {
  phenomenon: 'silny_wiatr',
  params: null,          // null = użyj getDefaultParams przy wczytaniu
  level: null,
  onset: null,           // null = oblicz świeżo przy wczytaniu
  expires: null,
  headline: '',
  description: '',
  instruction: '',
  msgType: 'Alert',
  referencesId: '',
  altFrom: '',
  altTo: '',
  // Flagi ręcznej edycji tekstów
  descriptionUserEdited: false,
  instructionUserEdited: false,
  lastDefaultDescription: '',
  lastDefaultInstruction: '',
};

let _draft = { ...DEFAULT_DRAFT };
let _dirty = false;  // czy draft różni się od defaultu

export function getDraft() {
  return { ..._draft };
}

export function setDraft(updates) {
  _draft = { ..._draft, ...updates };
  _dirty = true;
}

export function isDirty() {
  return _dirty;
}

export function resetDraft() {
  _draft = { ...DEFAULT_DRAFT };
  _dirty = false;
}
