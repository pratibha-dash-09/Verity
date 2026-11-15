import assets from './assets.generated.mjs';
import {verifyGemini} from './lib/gemini.mjs';
import {names} from './lib/model-discovery.mjs';
import {checkExchangeRate,incompleteReport,checkClaimContext} from './lib/public-data.mjs';
import {checkGoogleLeadership} from './lib/leadership.mjs';
import {reuseReport} from './lib/recent-reports.mjs';
import {transcribeAudio,validAudio} from './lib/transcribe.mjs';
import {warmNewsSources} from './lib/live-news.mjs';

const slots=[{id:'swift',name:'Verity Swift'},{id:'scout',name:'Verity Scout'},{id:'lens',name:'Verity Lens'}];
const limits=new Map();
let active=0;
const headers={
  'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
  'Permissions-Policy':'microphone=(self), camera=(), geolocation=()',
  'Content-Security-Policy':"default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
function json(value,status=200){return new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});}
function fail(status,message){const error=new Error(message);error.httpStatus=status;throw error;}
function modelsFor(env){
  try{return JSON.parse(env.VERITY_MODELS||'[]').filter(id=>Object.hasOwn(names,id));}catch{return [];}
}
function selectModels(id,available){
  const slot=slots.find(slot=>slot.id===(id||'swift'));
  if(!slot)fail(400,'Refresh the page and choose a Verity model.');
  const chosen=available.filter(model=>names[model]===slot.name);
  if(!chosen.length)fail(400,'This model is unavailable. Choose another Verity model.');
  return [...chosen,...available.filter(model=>!chosen.includes(model))];
}
function publicReport(report){return {
  verdict:report.verdict,summary:report.summary,checkedAt:report.checkedAt,kind:'assessment',researchStatus:report.researchStatus||'complete',
  claims:report.claims.map(claim=>({claim:claim.claim,verdict:claim.verdict,reason:claim.reason,evidence:claim.evidence.map(source=>({url:source.url,title:source.title,explanation:source.explanation,...(source.quote?{quote:source.quote}:{})}))}))
};}
async function bodyJson(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'A JSON request is required.');
  if(Number(request.headers.get('Content-Length'))>8000000)fail(413,'Use a file under 5 MB.');
  const reader=request.body?.getReader();
  if(!reader)fail(400,'The request could not be read.');
  const chunks=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8000000)fail(413,'Use a file under 5 MB.');chunks.push(value);}
  }finally{await reader.cancel().catch(()=>{});}
  try{const data=JSON.parse(await new Blob(chunks).text());if(!data||typeof data!=='object'||Array.isArray(data))throw new Error();return data;}
  catch{fail(400,'The request could not be read. Refresh and try again.');}
}
function validate(data){
  if(typeof data.text!=='string'||data.text.length>20000||(!data.text.trim()&&!data.image))fail(400,'Enter a claim or attach an article image. Text is limited to 20,000 characters.');
  if(data.image){
    if(typeof data.image!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(data.image))fail(400,'Use a PNG, JPG or WebP image under 5 MB.');
    try{if(atob(data.image.split(',')[1]).length>5*1024*1024)fail(413,'Use an image under 5 MB.');}catch(error){if(error.httpStatus)throw error;fail(400,'The image could not be read.');}
  }
}
function admission(request){
  // Best-effort, bounded per-isolate protection for the shared free allowance.
  const ip=request.headers.get('CF-Connecting-IP')||request.headers.get('oai-authenticated-user-id')||'anonymous';
  const now=Date.now();
  if(limits.size>=1000){for(const [key,value]of limits)if(value.reset<=now)limits.delete(key);if(limits.size>=1000)limits.delete(limits.keys().next().value);}
  let entry=limits.get(ip);
  if(!entry||entry.reset<=now){entry={count:0,reset:now+60000};limits.set(ip,entry);}
  if(entry.count>=5||active>=4)fail(429,'Verity is busy. Please wait a moment before checking again.');
  entry.count++;
}
async function analyze(data,models,key){return reuseReport(data,models,async()=>{
  if(!data.image){
    const context=checkClaimContext(data.text);
    if(context)return context;
    const leadership=await checkGoogleLeadership(data.text).catch(()=>null);
    if(leadership)return leadership;
    try{const rate=await checkExchangeRate(data.text);if(rate)return rate;}catch{return incompleteReport(data.text,'The exchange-rate record is temporarily unavailable.');}
  }
  if(!key)return incompleteReport(data.text,'The research service is temporarily unavailable. Please try again later.');
  try{return await verifyGemini(data,models,key);}
  catch(error){return incompleteReport(data.text,error.status===429?'The shared research allowance has been used. Please try again after it resets.':error.name==='TimeoutError'?'The research service took too long to respond. Please try again.':'The research service could not complete this check. Please try again.');}
});}
export default {async fetch(request,env,ctx){
  const {pathname,origin}=new URL(request.url);
  try{
    const available=modelsFor(env);
    if(request.method==='GET'&&pathname==='/api/status'){
      if(ctx?.waitUntil)ctx.waitUntil(warmNewsSources());
      const models=slots.filter(slot=>available.some(id=>names[id]===slot.name));
      return json({ready:Boolean(env.GEMINI_API_KEY&&models.length),models,defaultModel:models[0]?.id||''});
    }
    if(request.method==='POST'&&['/api/analyze','/api/transcribe'].includes(pathname)){
      if(request.headers.get('Origin')&&request.headers.get('Origin')!==origin)fail(403,'Open Verity to submit a claim.');
      const data=await bodyJson(request);
      if(pathname==='/api/analyze')validate(data);
      else{
        if(!validAudio(data.audio,data.mimeType))fail(400,'Use a valid WebM, WAV, MP3, M4A, OGG or AAC recording under 5 MB.');
        if(data.language&&!['en-IN','hi-IN','en-US'].includes(data.language))fail(400,'Choose a supported recording language.');
      }
      const models=selectModels(data.model,available);
      if(!env.GEMINI_API_KEY)fail(503,'The research service is temporarily unavailable. Please try again later.');
      admission(request);active++;
      try{
        if(pathname==='/api/analyze')return json(publicReport(await analyze(data,models,env.GEMINI_API_KEY)));
        try{return json({transcript:await transcribeAudio(data,models,env.GEMINI_API_KEY)});}
        catch{fail(502,'The recording could not be transcribed. Please retry later or paste a transcript.');}
      }finally{active--;}
    }
    if(!['GET','HEAD'].includes(request.method)||!Object.hasOwn(assets,pathname))return json({error:'Not found'},404);
    const asset=assets[pathname];
    const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),character=>character.charCodeAt(0));
    return new Response(bytes,{headers:{...headers,'Content-Type':asset.type,'Cache-Control':pathname.startsWith('/assets/')?'public, max-age=86400':'no-cache'}});
  }catch(error){return json({error:error.httpStatus?error.message:'The check could not finish. Please try again.'},error.httpStatus||500);}
}};
