import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {verify} from './verify.mjs';
import {verifyGemini} from './gemini.mjs';
import {isSafeApiKey} from './credentials.mjs';
import {loadConnection, saveConnection} from './saved-connection.mjs';
import {discoverModels, names} from './model-discovery.mjs';
import {checkExchangeRate, incompleteReport,checkClaimContext} from './public-data.mjs';
import {checkGoogleLeadership} from './leadership.mjs';
import {reuseReport} from './recent-reports.mjs';
import {transcribeAudio, validAudio} from './transcribe.mjs';
import {warmNewsSources} from './live-news.mjs';

const root = new URL('./public/', import.meta.url);
const adminToken = randomBytes(32).toString('hex');
const modelSlots = [
  {id:'swift', name:'Verity Swift'},
  {id:'scout', name:'Verity Scout'},
  {id:'lens', name:'Verity Lens'}
];
let availableModels = [];
let savingConnection = false;
const saved = await loadConnection().catch(() => null);
if (saved && isSafeApiKey(saved.key) && Array.isArray(saved.models)) {
  availableModels = saved.models.filter(id => Object.hasOwn(names, id));
  if (availableModels.length) process.env.GEMINI_API_KEY = saved.key;
}

function publicModels() {
  return modelSlots.filter(slot => availableModels.some(id => names[id] === slot.name));
}
function status() {
  const models = publicModels();
  return {ready:Boolean(process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY), models, defaultModel:models[0]?.id || ''};
}
function publicReport(report) {
  // Explicit fields prevent service metadata and configuration entering public reports.
  return {
    verdict:report.verdict, summary:report.summary, checkedAt:report.checkedAt,
    kind:report.provider === 'Public news search' ? 'coverage' : 'assessment',
    researchStatus:report.researchStatus || 'complete',
    claims:report.claims.map(claim => ({claim:claim.claim, verdict:claim.verdict, reason:claim.reason,
      evidence:claim.evidence.map(source => ({url:source.url, title:source.title, explanation:source.explanation, ...(source.quote ? {quote:source.quote} : {})}))}))
  };
}
function failure(statusCode, message) {
  const error = new Error(message);
  error.httpStatus = statusCode;
  return error;
}
async function bodyJson(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw failure(413, 'The upload is too large. Use an image under 5 MB.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw failure(400, 'The request could not be read. Refresh the page and try again.'); }
}
function validateInput(data) {
  if (typeof data.text !== 'string' || data.text.length > 20000 || (!data.text.trim() && !data.image)) {
    throw failure(400, 'Enter a claim or attach an article image. Text is limited to 20,000 characters.');
  }
  if (data.image) {
    if (typeof data.image !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image)) {
      throw failure(400, 'Use a PNG, JPG or WebP image under 5 MB.');
    }
    if (Buffer.byteLength(data.image.split(',')[1], 'base64') > 5 * 1024 * 1024) {
      throw failure(413, 'Use an image under 5 MB.');
    }
  }
  if (data.model !== undefined && typeof data.model !== 'string') throw failure(400, 'Choose a Verity model.');
}
function selectedModels(model) {
  // Accept an old model selection from an already-open tab during upgrades.
  if (model && availableModels.includes(model)) return [model];
  const slot = modelSlots.find(item => item.id === model) || (!model ? publicModels()[0] : null);
  if (model && !slot) throw failure(400, 'Refresh the page and choose a Verity model.');
  const selected = availableModels.filter(id => names[id] === slot?.name);
  if (model && !selected.length) throw failure(400, 'This model is unavailable. Choose another Verity model.');
  if (!selected.length) return availableModels;
  const fallback = availableModels.filter(id => !selected.includes(id)).sort((a,b) => Number(b === 'gemini-3.5-flash-lite') - Number(a === 'gemini-3.5-flash-lite'));
  return [...selected, ...fallback];
}
async function analyze(data) {
  const models=process.env.GEMINI_API_KEY ? selectedModels(data.model) : [];
  return reuseReport(data,models,()=>performAnalysis(data,models));
}
async function performAnalysis(data,models) {
  if (!data.image) {
    const context=checkClaimContext(data.text);
    if(context)return context;
    const leadership = await checkGoogleLeadership(data.text).catch(() => null);
    if (leadership) return leadership;
    try {
      const rate = await checkExchangeRate(data.text);
      if (rate) return rate;
    } catch { return incompleteReport(data.text, 'The exchange-rate record is temporarily unavailable.'); }
  }
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) {
    return incompleteReport(data.text, 'The research service is not connected. A new assessment could not be completed.');
  }
  try {
    return await (process.env.GEMINI_API_KEY ? verifyGemini(data, models) : verify(data));
  } catch (error) {
    if (error.httpStatus) throw error;
    const reason = error.status === 429
      ? 'The research service has reached its usage limit. Try again after the allowance resets.'
      : error.name === 'TimeoutError'
        ? 'The research service took too long to respond. Please try again.'
        : 'The research service could not complete this check. Please try again.';
    return incompleteReport(data.text,reason);
  }
}

export const server = http.createServer(async (req, res) => {
  const port = server.address()?.port || process.env.PORT || 3000;
  const allowedHosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const trustedHost = allowedHosts.includes(req.headers.host);
  const sameOrigin = allowedHosts.map(host => 'http://' + host).includes(req.headers.origin);
  const send = (code, data) => {
    res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'});
    res.end(JSON.stringify(data));
  };
  const pathname = req.url?.split('?')[0];
  try {
    if (!trustedHost) return send(403, {error:'Open Verity through its local address.'});
    if (req.method === 'GET' && pathname === '/api/status') {
      void warmNewsSources();
      return send(200, status());
    }
    if (req.method === 'POST' && pathname === '/api/setup') {
      if (!local || !sameOrigin || req.headers['x-verity-admin'] !== adminToken) {
        return send(403, {error:'Open the private settings page on this computer to manage the connection.'});
      }
      if (!String(req.headers['content-type']).startsWith('application/json')) return send(415, {error:'A JSON request is required.'});
      if (savingConnection) return send(409, {error:'A connection is already being saved. Please wait.'});
      const {key} = await bodyJson(req, 2000);
      if (!isSafeApiKey(key)) return send(400, {error:'Enter the complete service key without spaces or line breaks.'});
      savingConnection = true;
      try {
        const models = await discoverModels(key);
        await saveConnection({key, models});
        process.env.GEMINI_API_KEY = key;
        availableModels = models;
        return send(200, status());
      } catch {
        return send(502, {error:'Could not save the connection. Check the key, service access and connection, then try again.'});
      } finally { savingConnection = false; }
    }
    if (req.method === 'POST' && pathname === '/api/analyze') {
      if (req.headers.origin && !sameOrigin) return send(403, {error:'Open Verity to submit a claim.'});
      const data = await bodyJson(req, 8000000);
      validateInput(data);
      // Validate stale selections before any external lookup.
      if (data.model && process.env.GEMINI_API_KEY) selectedModels(data.model);
      return send(200, publicReport(await analyze(data)));
    }
    if (req.method === 'POST' && pathname === '/api/transcribe') {
      if(req.headers.origin && !sameOrigin)return send(403,{error:'Open Verity to transcribe a recording.'});
      const data=await bodyJson(req,8000000);
      if(!validAudio(data.audio,data.mimeType))return send(400,{error:'Use a valid WebM, WAV, MP3, M4A, OGG or AAC voice clip under 5 MB.'});
      if(data.language && !['en-IN','hi-IN','en-US'].includes(data.language))return send(400,{error:'Choose a supported recording language.'});
      if(!process.env.GEMINI_API_KEY)return send(503,{error:'Voice transcription is temporarily unavailable. You can paste your transcript instead.'});
      try {
        const transcript=await transcribeAudio(data,selectedModels(data.model),process.env.GEMINI_API_KEY);
        return send(200,{transcript});
      } catch(error) {
        if(error.httpStatus)throw error;
        return send(502,{error:error.status===429 ? 'The transcription service reached its usage limit. Your clip is kept in this tab so you can retry later.' : 'The clip could not be transcribed. Check the recording, then retry or paste a transcript.'});
      }
    }
    const files = {
      '/':'index.html', '/app.js':'app.js', '/history.js':'history.js', '/recorder.js':'recorder.js', '/input.js':'input.js', '/evidence.js':'evidence.js', '/style.css':'style.css',
      '/settings':'settings.html', '/settings.js':'settings.js',
      ...Object.fromEntries(['logo.svg','icons.svg','verity-field.svg','verity-sculpture.png','dm-regular.ttf','dm-medium.ttf','dm-semibold.ttf','dm-bold.ttf','instrument-italic.ttf','instrument-regular.ttf'].map(name=>['/assets/'+name,'assets/'+name]))
    };
    if (req.method !== 'GET' || !Object.hasOwn(files, pathname)) return send(404, {error:'Not found'});
    if (pathname.startsWith('/settings') && !local) return send(403, {error:'Private settings are available only on this computer.'});
    const file = files[pathname];
    let content = await readFile(fileURLToPath(new URL(file, root)));
    if (file === 'settings.html') content = Buffer.from(content.toString('utf8').replace('__ADMIN_TOKEN__', adminToken));
    const contentType = file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : file.endsWith('.ttf') ? 'font/ttf' : 'text/html; charset=utf-8';
    res.writeHead(200, {
      'Content-Type':contentType,
      'Cache-Control':file.startsWith('assets/') ? 'public, max-age=86400' : 'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
    });
    res.end(content);
  } catch (error) {
    send(error.httpStatus || 500, {error:error.httpStatus ? error.message : 'The check could not finish. Please try again.'});
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(Number(process.env.PORT) || 3000, '127.0.0.1', () => console.log('Verity is running at http://127.0.0.1:' + server.address().port));
}
