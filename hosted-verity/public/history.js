export const HISTORY_KEY = 'verity-history-v1';
const verdicts = new Set(['Supported', 'Contradicted', 'Unverified', 'Misleading', 'Mixed findings']);

export function validEntry(entry) {
  return Boolean(entry && typeof entry.id === 'string' && typeof entry.text === 'string'
    && typeof entry.title === 'string' && typeof entry.modelName === 'string' && ['text','image','voice'].includes(entry.inputType) && Number.isFinite(Date.parse(entry.savedAt))
    && entry.report && Number.isFinite(Date.parse(entry.report.checkedAt)) && verdicts.has(entry.report.verdict) && typeof entry.report.summary === 'string'
    && Array.isArray(entry.report.claims) && entry.report.claims.length
    && entry.report.claims.every(claim => claim && typeof claim.claim === 'string'
      && typeof claim.reason === 'string' && verdicts.has(claim.verdict)
      && Array.isArray(claim.evidence) && claim.evidence.every(source => source
        && typeof source.url === 'string' && typeof source.title === 'string'
        && typeof source.explanation === 'string')));
}

export function readHistory(storage) {
  try {
    const entries = JSON.parse(storage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(entries) ? entries.filter(validEntry).slice(0, 50) : [];
  } catch { return []; }
}

export function writeHistory(storage, entries) {
  const retained = entries.filter(validEntry).slice(0, 50);
  // If the browser is nearly full, retain the most recent reports first.
  while (retained.length) {
    try { storage.setItem(HISTORY_KEY, JSON.stringify(retained)); return retained; }
    catch { if (retained.length === 1) throw new Error('History could not be saved in this browser.'); retained.pop(); }
  }
  storage.removeItem(HISTORY_KEY);
  return [];
}

export function makeHistoryEntry({text, image, mode, modelName, report}, previous = []) {
  const title = text.trim() || report.claims[0]?.claim || 'Article image';
  const inputType=mode==='voice'?'voice':image?'image':'text';
  const existing = previous.find(entry => entry.text === text.trim() && entry.title === title.slice(0,240) && entry.modelName === modelName && entry.inputType === inputType);
  return {id:existing?.id || crypto.randomUUID(), text:text.trim(), title:title.slice(0, 240),
    modelName, inputType, savedAt:new Date().toISOString(), report};
}

export function filterHistory(entries, query, verdict) {
  const term = query.trim().toLocaleLowerCase();
  return entries.filter(entry => (!verdict || (verdict === 'unavailable'
      ? entry.report.researchStatus === 'unavailable'
      : entry.report.verdict === verdict && entry.report.researchStatus !== 'unavailable'))
    && (!term || (entry.text + ' ' + entry.title + ' ' + entry.report.summary).toLocaleLowerCase().includes(term)));
}
