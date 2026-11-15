import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source=await readFile(new URL('../dist/server/index.js',import.meta.url),'utf8');
const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const env={GEMINI_API_KEY:'test-server-secret',VERITY_MODELS:JSON.stringify(['gemini-3.5-flash-lite','gemini-3.8-flash','gemini-2.5-flash'])};
const request=(path,body,headers={})=>new Request('https://verity.example'+path,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://verity.example',...headers},body:JSON.stringify(body)});
let assertions=0;
const check=(value,expected)=>{assert.deepEqual(value,expected);assertions++;};
const html=await worker.fetch(request('/'),env,{});check(html.status,200);assert.match(await html.text(),/Before you share/);assertions++;
for(const path of ['/app.js','/evidence.js','/style.css','/assets/verity-field.svg','/assets/dm-regular.ttf'])check((await worker.fetch(request(path),env,{})).status,200);
for(const path of ['/settings','/settings.js','/.env','/.verity-connection','/api/setup'])check((await worker.fetch(request(path),env,{})).status,404);
const status=await (await worker.fetch(request('/api/status'),env,{})).json();check(status.ready,true);check(status.searchReady,false);check(status.models.map(x=>x.id),['swift','scout','lens']);check(JSON.stringify(status).includes('gemini'),false);check(JSON.stringify(status).includes(env.GEMINI_API_KEY),false);
check((await worker.fetch(request('/api/analyze',{text:'test'},{Origin:'https://evil.example'}),env,{})).status,403);
check((await worker.fetch(request('/api/analyze',{text:''}),env,{})).status,400);
check((await worker.fetch(request('/api/analyze',{text:'hello',model:'private-model'}),env,{})).status,400);
check((await worker.fetch(request('/api/transcribe',{audio:'nonsense',mimeType:'audio/wav'}),env,{})).status,400);
const originalFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('wikipedia.org'))return Response.json({query:{pages:{1:{title:'Moon',fullurl:'https://en.wikipedia.org/wiki/Moon',extract:'The Moon is the natural satellite of Earth. It orbits Earth.'}}}});
  if(String(url).includes('generateContent')){
    check(options.headers['x-goog-api-key'],env.GEMINI_API_KEY);
    const data=JSON.parse(options.body);
    const instruction=data.systemInstruction.parts[0].text;
    const audio=instruction.startsWith('Transcribe');
    const extraction=instruction.includes('Extract up to 8 factual claims');
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(audio?{transcript:'The Moon orbits Earth.'}:extraction?{claims:['The Moon orbits Earth.'],query:'Moon orbit'}:{summary:'The Moon orbits Earth.',claims:[{claim:'The Moon orbits Earth.',verdict:'Supported',reason:'The Moon is Earth’s natural satellite.',evidence:[{url:'https://en.wikipedia.org/wiki/Moon',quote:'The Moon is the natural satellite of Earth.',explanation:'Identifies Earth as the body it orbits.'}]}]})}]}}]});
  }
  return new Response('',{status:404});
};
try{
  const data=await(await worker.fetch(request('/api/analyze',{text:'The Moon orbits Earth.',model:'swift'}),env,{})).json();
  check(data.verdict,'Supported');check(data.researchStatus,'complete');check(data.claims[0].evidence.length,1);check(JSON.stringify(data).includes(env.GEMINI_API_KEY),false);
  const image=await(await worker.fetch(request('/api/analyze',{text:'',image:'data:image/png;base64,aGVsbG8=',model:'lens'}),env,{})).json();
  check(image.verdict,'Supported');
  const wav=Buffer.alloc(32);wav.write('RIFF');wav.write('WAVE',8);
  const voice=await(await worker.fetch(request('/api/transcribe',{audio:wav.toString('base64'),mimeType:'audio/wav',language:'en-IN',model:'swift'}),env,{})).json();
  check(voice.transcript,'The Moon orbits Earth.');
}finally{globalThis.fetch=originalFetch;}
const searchEnv={...env,TAVILY_API_KEY:'test-search-secret'};
const searchStatus=await(await worker.fetch(request('/api/status'),searchEnv,{})).json();
check(searchStatus.searchReady,true);check(JSON.stringify(searchStatus).includes(searchEnv.TAVILY_API_KEY),false);
const newsClaim='The Vega observatory opened on 15 November 2026.';
globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://api.tavily.com/')){
    // Node accepts redirect:error, but the deployed Worker rejects it before I/O.
    if(options.redirect==='error')throw new TypeError('Invalid redirect value');
    check(options.redirect,'manual');check(options.headers.Authorization,'Bearer '+searchEnv.TAVILY_API_KEY);
    check(options.body.includes(searchEnv.TAVILY_API_KEY),false);
    return Response.json({results:[{url:'https://example.org/vega-news',title:'Vega opening',raw_content:newsClaim+' '+('The dated article records the opening ceremony and the observatory facilities. '.repeat(8))}]});
  }
  if(String(url).includes('wikipedia.org'))return Response.json({query:{pages:{}}});
  if(String(url).includes('generateContent')){
    const input=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
    const evidence=input.sources.find(item=>item.url==='https://example.org/vega-news');assert.ok(evidence);assertions++;
    return Response.json({candidates:[{content:{parts:[{text:JSON.stringify({summary:newsClaim,claims:[{claimId:0,verdict:'Supported',reason:'The original dated article confirms the opening.',evidence:[{sourceId:evidence.sourceId,quote:newsClaim}]}]})}]}}]});
  }
  return new Response('',{status:404});
};
try{
  const broad=await(await worker.fetch(request('/api/analyze',{text:newsClaim}),searchEnv,{})).json();
  check(broad.verdict,'Supported');check(broad.researchCoverage,'broad');check(broad.claims[0].evidence[0].url,'https://example.org/vega-news');
  check(JSON.stringify(broad).includes(searchEnv.TAVILY_API_KEY),false);
}finally{globalThis.fetch=originalFetch;}
assert(!/process\.env|node:|test-server-secret|BEGIN PRIVATE KEY/.test(source));assertions++;
console.log(assertions+' checks passed: public assets, private route exclusion, validation, source-backed text/image assessment, voice transcription and secret isolation.');
