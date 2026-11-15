import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalize} from '../verify.mjs';
import {server} from '../server.mjs';
test('uncited and fabricated citations cannot produce a supported verdict',()=>{const r=normalize({claims:[{claim:'x',verdict:'Supported',evidence:[{url:'https://invented.example'}]}]},[]);assert.equal(r.verdict,'Unverified');assert.equal(r.claims[0].evidence.length,0);});
test('preserves evidence that research actually returned',()=>{const r=normalize({claims:[{claim:'x',verdict:'Contradicted',evidence:[{url:'https://example.org/record',explanation:'Counterevidence'}]}]},[{url:'https://example.org/record',title:'Original record'}]);assert.equal(r.verdict,'Contradicted');assert.equal(r.claims[0].evidence[0].title,'Original record');});
test('local server validates requests and serves UI',async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base)).status,200);assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:JSON.stringify({text:''})})).status,400);assert.equal((await fetch(base+'/api/analyze',{method:'POST',body:'{'})).status,400);assert.equal((await fetch(base+'/api/analyze',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);assert.equal((await fetch(base+'/.env')).status,404);}finally{await new Promise(r=>server.close(r));}});
test('public responses expose branded choices while private setup requires its local token',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const original=global.fetch;
 const base='http://127.0.0.1:'+server.address().port;
 try {
  const page=await (await original(base)).text();
  assert.ok(!page.includes('api-key'));
  assert.ok(!/gemini|OPENAI_API_KEY/i.test(page));
  global.fetch=(url,options)=>String(url).startsWith(base)?original(url,options):Promise.resolve(new Response('<rss><channel></channel></rss>'));
  const status=await (await original(base+'/api/status')).json();
  assert.ok(!/gemini-|AIza|AQ\./i.test(JSON.stringify(status)));
  assert.equal(status.provider,undefined);
  assert.ok(status.models.length<=3);
  for(const path of ['/.env','/.verity-connection','/saved-connection.mjs','/settings.html'])assert.equal((await original(base+path)).status,404);
  assert.equal((await original(base+'/api/setup',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:'{}'})).status,403);
  for(const body of ['null','[]','{"text":{}}'])assert.equal((await original(base+'/api/analyze',{method:'POST',body})).status,400);
  assert.equal((await original(base+'/api/transcribe',{method:'POST',body:JSON.stringify({audio:'not-audio',mimeType:'audio/wav'})})).status,400);
  assert.equal((await original(base+'/api/transcribe',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403);
  global.fetch=(url,options)=>String(url)=== 'https://blog.google/authors/sundar-pichai/'?Promise.resolve({ok:true,text:async()=>'<main>Leadership Sundar Pichai, CEO</main>'}):original(url,options);
  const report=await (await original(base+'/api/analyze',{method:'POST',body:JSON.stringify({text:'Someone Else is CEO of Google'})})).json();
  assert.equal(report.verdict,'Contradicted');
  assert.equal(report.provider,undefined);
  assert.ok(report.claims[0].evidence.length);
 }finally{global.fetch=original;await new Promise(resolve=>server.close(resolve));}
});
test('reference verdicts require quotes in the retrieved text',()=>{
 const source={url:'https://example.org',title:'Record',extract:'The Moon orbits the Earth.'};
 const claim={claim:'The Moon orbits Earth',verdict:'Supported',evidence:[{url:source.url,quote:'A completely invented quotation'}]};
 assert.equal(normalize({claims:[claim]},[source]).verdict,'Unverified');
 claim.evidence[0].quote='The Moon orbits the Earth.';
 assert.equal(normalize({claims:[claim]},[source]).verdict,'Supported');
});
test('a failed research service produces an unavailable result instead of search links',async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const original=global.fetch;
 try{
  global.fetch=async()=>new Response(JSON.stringify({error:{status:'RESOURCE_EXHAUSTED'}}),{status:429,headers:{'Content-Type':'application/json'}});
  const base='http://127.0.0.1:'+server.address().port;
  const response=await original(base+'/api/analyze',{method:'POST',body:JSON.stringify({text:'An unknown event happened in an unnamed place yesterday.'})});
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.researchStatus,'unavailable');
  assert.equal(result.claims[0].evidence.length,0);
  assert.ok(!result.summary.includes('Open the articles'));
 }finally{global.fetch=original;await new Promise(resolve=>server.close(resolve));}
});
