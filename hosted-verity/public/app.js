import {HISTORY_KEY, readHistory, writeHistory, makeHistoryEntry, filterHistory} from './history.js';
import {VoiceRecorder} from './recorder.js';
import {buildSubmission} from './input.js';
import {evidenceCoverage} from './evidence.js';

const $ = selector => document.querySelector(selector);
let attachedImage = null;
let imageVersion = 0;
let report = null;
let activeMode = 'text';
let voiceRecorder = null;
let transcribing = false;
let voiceVersion = 0;
let lastAudio = null;
let transcriptionRequest = null;
let readingImage = false;
let busy = false;
let historyEntries = [];
let historyStorage;
let toastTimeout;
try { historyStorage = localStorage; historyEntries = readHistory(historyStorage); } catch { /* Private browser storage may be unavailable. */ }

function icon(name, className = '') {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  node.setAttribute('class', 'icon ' + className);
  node.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '/assets/icons.svg#' + name);
  node.append(use);
  return node;
}
function toast(text) {
  clearTimeout(toastTimeout);
  $('#toast').textContent = text;
  $('#toast').hidden = false;
  toastTimeout = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function message(text) { $('#message').textContent = text; }
function element(tag, text, className) {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

fetch('/api/status').then(response => response.json()).then(status => {
  $('#connection-text').textContent = status.ready ? 'Ready to check' : 'Public source checks';
  const select = $('#research-model');
  select.replaceChildren(...status.models.map(model => new Option(model.name, model.id)));
  if (status.models.length) {
    let previous;
    try {
      // Apply the faster starting choice once, then preserve deliberate selections.
      if(localStorage.getItem('verity-speed-default') !== '1'){
        localStorage.setItem('verity-model',status.defaultModel);
        localStorage.setItem('verity-speed-default','1');
      }
      previous = localStorage.getItem('verity-model');
    } catch { /* Storage may be disabled. */ }
    select.value = status.models.some(model => model.id === previous) ? previous : status.defaultModel;
    select.disabled = false;
  } else { select.append(new Option('Verity source check', '')); }
}).catch(() => {
  $('#connection-text').textContent = 'Connection unavailable';
  message('Could not reach Verity. Refresh the page to reconnect.');
});
$('#research-model').onchange = event => {
  try { localStorage.setItem('verity-model', event.target.value); } catch { /* Selection still works. */ }
};
$('#claim').oninput = () => { $('#count').textContent = `${$('#claim').value.length.toLocaleString()} / 20,000 characters`; };
function selectMode(mode) {
    if(busy)return;
    if(mode!==activeMode){report=null;$('#results').hidden=true;}
    if(mode!=='voice')cancelVoice(false);
    activeMode=mode;
    document.querySelectorAll('[data-mode]').forEach(tab => {
      const selected=tab.dataset.mode===mode;
      tab.classList.toggle('selected', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    $('#image-panel').hidden = mode !== 'image';
    $('#voice-panel').hidden = mode !== 'voice';
    $('#text-panel').hidden = mode !== 'text';
    document.querySelector('.input-note kbd').hidden = mode === 'image';
    message('');
    refreshControls();
}
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = () => selectMode(button.dataset.mode);
});
function removeImage() {
  imageVersion++;
  attachedImage = null;
  $('#image').value = '';
  $('#attachment').hidden = true;
  $('#preview').removeAttribute('src');
  readingImage=false;
  refreshControls();
}
$('#remove').onclick = removeImage;
$('#image').onchange = event => {
  const file = event.target.files[0];
  removeImage();
  if (!file) return;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
    message('Choose a PNG, JPG or WebP image under 5 MB.');
    return;
  }
  const version = imageVersion;
  const reader = new FileReader();
  readingImage=true;
  refreshControls();
  reader.onload = () => {
    if (version !== imageVersion) return;
    attachedImage = reader.result;
    $('#preview').src = attachedImage;
    $('#attachment').hidden = false;
    if(activeMode==='image')message('Image ready to check.');
  };
  reader.onerror = () => { if (version === imageVersion) message('Could not read the image. Try another file.'); };
  reader.onloadend = () => { if (version === imageVersion) { readingImage=false;refreshControls(); } };
  reader.readAsDataURL(file);
};
function clearInput() {
  cancelVoice(true);
  $('#claim').value = '';
  $('#claim').oninput();
  removeImage();
  message('');
  $('#results').hidden = true;
  report = null;
}
$('#clear').onclick = () => { $('#claim').value='';$('#claim').oninput();message(''); };
const recordingSupported = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
function voiceMessage(text) { $('#voice-status').textContent=text; }
$('#voice-transcript').oninput=()=>{ $('#voice-count').textContent=$('#voice-transcript').value.length.toLocaleString()+' / 20,000 characters'; };
function refreshControls() {
  const state=voiceRecorder?.state || 'idle';
  const voiceWorking=transcribing || state!=='idle';
  $('#analyze').disabled=busy || (activeMode==='voice' && voiceWorking) || (activeMode==='image' && readingImage);
  $('#record').disabled=busy || transcribing || !recordingSupported || ['requesting','stopping'].includes(state);
  $('#record').textContent=state==='recording'?'Stop & transcribe':state==='requesting'?'Opening microphone...':state==='stopping'?'Finishing recording...':transcribing?'Transcribing...':'Start recording';
  $('#voice-panel').classList.toggle('recording',state==='recording');
  $('#audio-file').disabled=busy || voiceWorking;
  $('#language').disabled=busy || voiceWorking;
  $('#voice-transcript').disabled=busy || voiceWorking;
  $('#retry-transcribe').disabled=busy || voiceWorking;
  $('#retry-transcribe').hidden=!lastAudio;
}
function cancelVoice(clear) {
  voiceVersion++;
  transcriptionRequest?.abort();
  transcriptionRequest=null;
  transcribing=false;
  voiceRecorder?.cancel();
  voiceMessage('');
  if(clear){lastAudio=null;$('#audio-file').value='';$('#voice-transcript').value='';$('#voice-transcript').oninput();}
  refreshControls();
}
async function transcribeClip(blob) {
  if(busy || activeMode!=='voice')return;
  if(blob.size>5*1024*1024){voiceMessage('Choose a voice clip under 5 MB.');return;}
  const aliases={'audio/x-wav':'audio/wav','audio/mp3':'audio/mpeg','audio/x-m4a':'audio/mp4'};
  const baseType=blob.type.split(';')[0];
  const mimeType=aliases[baseType] || baseType;
  if(!['audio/webm','audio/wav','audio/mpeg','audio/mp4','audio/ogg','audio/aac'].includes(mimeType)){
    voiceMessage('Use a WebM, WAV, MP3, M4A, OGG or AAC voice clip.');return;
  }
  lastAudio=blob;
  $('#voice-transcript').value='';
  $('#voice-transcript').oninput();
  const version=++voiceVersion;
  transcribing=true;
  transcriptionRequest=new AbortController();
  const controller=transcriptionRequest;
  const signal=controller.signal;
  refreshControls();voiceMessage('Transcribing your recording...');
  const timeout=setTimeout(()=>controller.abort(),65000);
  try {
    const audio=await new Promise((resolve,reject)=>{
      const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('Could not read the recording.'));reader.readAsDataURL(blob);
    });
    if(signal.aborted)return;
    const response=await fetch('/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio,mimeType,language:$('#language').value,model:$('#research-model').value || undefined}),signal});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error || 'Transcription could not finish. Try again.');
    if(version!==voiceVersion)return;
    $('#voice-transcript').value=data.transcript;
    $('#voice-transcript').oninput();
    voiceMessage(data.transcript?'Transcript ready. Review it, then check the facts.':'No clear speech was detected. Check your microphone and try again.');
    if(data.transcript)lastAudio=null;
  } catch(error) {
    if(version===voiceVersion)voiceMessage(error.name==='AbortError'?'Transcription took too long. Retry or paste your transcript.':error.message);
  } finally {
    clearTimeout(timeout);
    if(version===voiceVersion){transcribing=false;transcriptionRequest=null;refreshControls();}
  }
}
if(recordingSupported) {
  voiceRecorder=new VoiceRecorder({mediaDevices:navigator.mediaDevices,Recorder:window.MediaRecorder,
    onState:state=>{refreshControls();if(state==='recording')voiceMessage('Recording. Speak now, then press Stop & transcribe.');},
    onAudio:transcribeClip,onError:voiceMessage});
} else { $('#speech-note').textContent='Recording is unavailable in this browser. Upload a voice clip or paste a transcript below.'; }
$('#record').onclick=()=>{if(voiceRecorder?.state==='recording')voiceRecorder.stop();else{voiceMessage('');voiceRecorder?.start();}};
$('#retry-transcribe').onclick=()=>{if(lastAudio)transcribeClip(lastAudio);};
$('#clear-voice').onclick=()=>cancelVoice(true);
$('#audio-file').onchange=event=>{const file=event.target.files[0];if(file)transcribeClip(file);event.target.value='';};
window.addEventListener('pagehide',()=>cancelVoice(false));
refreshControls();
function verdictLabel(verdict) {
  return {Supported:'True', Contradicted:'False', Unverified:'Unverified', Misleading:'Misleading', 'Mixed findings':'Mixed findings'}[verdict] || 'Unverified';
}
function reportLabel(result) {
  if(result.researchStatus==='needs-context')return 'Needs context';
  return result.researchStatus === 'unavailable' ? 'Check unavailable' : verdictLabel(result.verdict);
}
function render(result) {
  const box = $('#report');
  const verdict = element('div', '', 'verdict ' + result.verdict);
  const symbol = element('span', '', 'verdict-symbol');
  symbol.append(icon(result.verdict === 'Supported' ? 'check' : result.verdict === 'Contradicted' ? 'close' : 'help'));
  verdict.append(symbol, document.createTextNode(reportLabel(result)));
  const coverage=evidenceCoverage(result);
  const lead=element('div','','result-lead');
  const answer=element('div','','answer-copy');
  answer.append(verdict,element('p',result.kind==='coverage'?'This saved report contains unassessed search results. Run a new check for an analysis.':result.summary));
  const score=element('aside','','coverage-card');
  score.setAttribute('aria-label','Evidence coverage');
  score.append(element('span','EVIDENCE COVERAGE','coverage-label'));
  const value=element('strong',coverage.percentage===null?'—':coverage.percentage+'%','coverage-value');
  score.append(value);
  if(coverage.percentage!==null){
    const meter=element('progress','','coverage-meter');
    meter.max=100;meter.value=coverage.percentage;
    meter.setAttribute('aria-label','Claims with a clear verdict and cited evidence');
    score.append(meter,element('span',coverage.assessed+' of '+coverage.total+' '+(coverage.total===1?'claim':'claims')+' backed by citations','coverage-caption'));
  }else score.append(element('span',result.researchStatus==='needs-context'?'A measurable claim is needed':'A completed check is needed','coverage-caption'));
  const explanation=element('details','','coverage-explanation');
  explanation.append(element('summary','What does this mean?'),element('p','The share of claims with a clear verdict and at least one citation. This measures evidence coverage, not the probability that the answer is correct. Sources can still be incomplete or mistaken.'));
  score.append(explanation,element('span','Not an accuracy estimate.','coverage-disclaimer'));
  lead.append(answer,score);
  box.replaceChildren(lead);
  result.claims.forEach(claim => {
    const section = element('article', '', 'claim-result');
    if (result.claims.length > 1) section.append(element('span', verdictLabel(claim.verdict), 'badge ' + claim.verdict));
    section.append(element('h3', claim.claim));
    if (claim.reason !== result.summary || result.claims.length > 1) section.append(element('p', claim.reason));
    const details = element('details', '', 'source-details');
    if (claim.evidence.length) {
      const summary = element('summary', 'View supporting evidence (' + claim.evidence.length + ')');
      summary.append(icon('plus'));
      details.append(summary);
    }
    claim.evidence.forEach(source => {
      let url;
      try { url = new URL(source.url); } catch { return; }
      if (!['https:', 'http:'].includes(url.protocol)) return;
      const card = element('div', '', 'evidence');
      const link = element('a', source.title);
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.append(icon('external'));
      card.append(link);
      if (source.quote) card.append(element('blockquote', source.quote));
      card.append(element('p', source.explanation));
      details.append(card);
    });
    if (claim.evidence.length) section.append(details);
    box.append(section);
  });
  box.append(element('small', 'Checked ' + new Date(result.checkedAt).toLocaleString(undefined, {dateStyle:'medium', timeStyle:'short'})));
  $('#results').hidden = false;
  $('#results').scrollIntoView({behavior:'smooth', block:'start'});
}
function setBusy(value) {
  busy = value;
  for (const selector of ['#clear', '#clear-voice', '#image', '#remove', '#claim']) $(selector).disabled = value;
  document.querySelectorAll('[data-mode]').forEach(button=>{button.disabled=value;});
  refreshControls();
  $('#analyze').replaceChildren(document.createTextNode(value ? 'Checking evidence...' : 'Check the facts'), icon(value ? 'search' : 'arrow'));
  $('#results').setAttribute('aria-busy', String(value));
}
$('#analyze').onclick = async () => {
  if (busy) return;
  let submitted;
  try { submitted=buildSubmission(activeMode,{text:$('#claim').value,transcript:$('#voice-transcript').value,image:attachedImage,model:$('#research-model').value || undefined}); }
  catch(error){message(error.message);return;}
  setBusy(true);
  report = null;
  const modelName = $('#research-model').selectedOptions[0]?.textContent || 'Verity source check';
  $('#results').hidden = true;
  message('Checking the evidence...');
  try {
    const response = await fetch('/api/analyze', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(submitted),
      signal:AbortSignal.timeout(90000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'The check could not finish. Try again.');
    data.evidenceCoverage=evidenceCoverage(data);
    report = data;
    const entry = makeHistoryEntry({...submitted, modelName, report:data}, historyEntries);
    persistHistory([entry, ...historyEntries.filter(item => item.id !== entry.id)]);
    showView('workspace');
    $('#report-origin').textContent = 'THE VERDICT';
    render(data);
    message('');
  } catch (error) {
    message(error.name === 'TimeoutError' ? 'The research service took too long. Please try again.' : error.message);
  } finally { setBusy(false); }
};
$('#download').onclick = () => {
  if (!report) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify({...report,evidenceCoverage:evidenceCoverage(report)}, null, 2)], {type:'application/json'}));
  const link = element('a', '');
  link.href = url;
  link.download = 'verity-report.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

function persistHistory(entries) {
  try {
    if (!historyStorage) throw new Error();
    historyEntries = writeHistory(historyStorage, entries);
    updateHistory();
    return true;
  } catch { toast('Browser storage is unavailable, so history could not be updated.'); return false; }
}
function shortDate(value) {
  return new Date(value).toLocaleString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
}
function openEntry(entry) {
  if (busy) { toast('Your current check is still running.'); return; }
  cancelVoice(false);
  removeImage();
  selectMode(entry.inputType==='image'?'image':entry.inputType==='voice'?'voice':'text');
  if(entry.inputType==='voice'){$('#voice-transcript').value=entry.text;$('#voice-transcript').oninput();}
  else{$('#claim').value=entry.text;$('#claim').oninput();}
  report = entry.report;
  showView('workspace');
  $('#report-origin').textContent = 'FROM YOUR HISTORY';
  render(report);
  message(entry.inputType === 'image' ? 'Saved report opened. Reattach the image to run a new check.' : '');
}
function updateHistory() {
  $('#history-count').textContent = String(historyEntries.length);
  const recent = $('#sidebar-history');
  recent.replaceChildren();
  historyEntries.slice(0, 3).forEach(entry => {
    const button = element('button', '', 'recent-link');
    button.append(element('span', '', 'result-dot ' + entry.report.verdict), element('span', entry.title));
    button.onclick = () => openEntry(entry);
    recent.append(button);
  });
  if (!historyEntries.length) recent.append(element('p', 'Your checks will appear here.', 'sidebar-empty'));
  const last = $('#last-check');
  last.replaceChildren();
  if (historyEntries.length) {
    const entry = historyEntries[0];
    const button = element('button', entry.title, 'last-check-button');
    button.append(element('span', reportLabel(entry.report) + '  /  ' + shortDate(entry.savedAt)));
    button.onclick = () => openEntry(entry);
    last.append(button);
  } else { last.append(element('p', 'No checks saved yet.')); }
  renderHistory();
}
function renderHistory() {
  const query = $('#history-search').value;
  const verdict = $('#history-filter').value;
  const entries = filterHistory(historyEntries, query, verdict);
  $('#history-summary').textContent = entries.length + (entries.length === 1 ? ' saved check' : ' saved checks');
  $('#clear-history').disabled = !historyEntries.length;
  const list = $('#history-list');
  list.replaceChildren();
  if (!entries.length) {
    const empty = element('div', '', 'empty-state');
    empty.append(icon('clock'), element('h2', historyEntries.length ? 'No matching checks.' : 'Every question starts a story.'),
      element('p', historyEntries.length ? 'Try another search or choose a different result.' : 'Your completed fact checks will be saved here. Come back to the evidence whenever you need it.'));
    const button = element('button', historyEntries.length ? 'Reset filters' : 'Make your first check', 'secondary');
    button.onclick = () => {
      if (historyEntries.length) { $('#history-search').value = ''; $('#history-filter').value = ''; renderHistory(); }
      else { newCheck(); }
    };
    empty.append(button);
    list.append(empty);
    return;
  }
  let lastDay = '';
  entries.forEach(entry => {
    const day = new Date(entry.savedAt).toLocaleDateString(undefined, {month:'long', day:'numeric', year:'numeric'});
    if (day !== lastDay) { list.append(element('h2', day, 'history-group')); lastDay = day; }
    const row = element('article', '', 'history-entry');
    const button = element('button', '', 'history-open');
    button.setAttribute('aria-label', 'Open report: ' + entry.title);
    const type = element('span', '', 'history-entry-icon');
    type.append(icon(entry.inputType === 'image' ? 'image' : entry.inputType==='voice'?'mic':'text'));
    const copy = element('span', '', 'history-entry-copy');
    copy.append(element('span', entry.title, 'history-entry-title'), element('span', entry.modelName + '  /  ' + shortDate(entry.savedAt), 'history-entry-meta'));
    button.append(type, copy, element('span', reportLabel(entry.report), 'badge ' + entry.report.verdict), icon('external'));
    button.onclick = () => openEntry(entry);
    const remove = element('button', '', 'icon-button');
    remove.setAttribute('aria-label', 'Delete check: ' + entry.title);
    remove.append(icon('trash'));
    remove.onclick = () => { if (persistHistory(historyEntries.filter(item => item.id !== entry.id))) toast('Check deleted.'); };
    row.append(button, remove);
    list.append(row);
  });
}
function showView(view) {
  const isHistory = view === 'history';
  $('#workspace-view').hidden = isHistory;
  $('#history-view').hidden = !isHistory;
  $('#results').hidden = isHistory || !report;
  $('#page-name').textContent = isHistory ? 'History' : 'Fact checker';
  document.querySelectorAll('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  if (isHistory) cancelVoice(false);
  if (location.hash !== '#' + view) location.hash = view;
}
function newCheck() {
  if (busy) { toast('Your current check is still running.'); return; }
  clearInput();
  showView('workspace');
  document.querySelector('[data-mode="text"]').click();
  $('#claim').focus();
}
document.querySelectorAll('[data-view]').forEach(button => {
  button.onclick = () => { showView(button.dataset.view); window.scrollTo({top:0, behavior:'smooth'}); };
});
$('#new-check').onclick = newCheck;
$('#view-history').onclick = () => { showView('history'); window.scrollTo({top:0, behavior:'smooth'}); };
$('#history-search').oninput = renderHistory;
$('#history-filter').onchange = renderHistory;
$('#clear-history').onclick = () => $('#clear-dialog').showModal();
$('#confirm-clear').onclick = () => { persistHistory([]); $('#clear-dialog').close(); };
$('#how-it-works').onclick = () => $('#how-dialog').showModal();
$('#footer-help').onclick = () => $('#how-dialog').showModal();
document.querySelectorAll('[data-close-dialog]').forEach(button => { button.onclick = () => button.closest('dialog').close(); });
document.querySelectorAll('[data-example]').forEach(button => {
  button.onclick = () => {
    if (busy) return;
    clearInput();
    selectMode('text');
    $('#claim').value = button.dataset.example;
    $('#claim').oninput();
    $('#claim').focus();
  };
});
$('#claim').onkeydown = event => { if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); $('#analyze').click(); } };
$('#voice-transcript').onkeydown=$('#claim').onkeydown;
window.addEventListener('hashchange', () => showView(location.hash === '#history' ? 'history' : 'workspace'));
window.addEventListener('storage', event => {
  if (event.key === HISTORY_KEY || event.key === null) { historyEntries = readHistory(historyStorage); updateHistory(); }
});
updateHistory();
showView(location.hash === '#history' ? 'history' : 'workspace');
