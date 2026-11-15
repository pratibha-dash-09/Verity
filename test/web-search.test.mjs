import {test} from 'node:test';
import assert from 'node:assert/strict';
import {lookupWebSources,searchResultSource} from '../web-search.mjs';
import {researchWithReferences} from '../reference-research.mjs';
const article='The Vega observatory opened on 15 November 2026. '+('The article records the official opening ceremony and the new public research facilities. '.repeat(8));
test('web search uses the key only in its header and fixes basic search without automatic upgrades',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async(url,options)=>{calls++;assert.equal(url,'https://api.tavily.com/search');assert.equal(options.headers.Authorization,'Bearer private-test-key');const body=JSON.parse(options.body);assert.equal(body.search_depth,'basic');assert.equal(body.auto_parameters,false);assert.equal(body.include_answer,false);assert.equal(body.include_raw_content,'text');assert.ok(!options.body.includes('private-test-key'));return Response.json({results:[{url:'https://example.org/vega',title:'Vega opens',raw_content:article,published_date:'2026-11-15'}]});};
 try{const result=await lookupWebSources('Vega observatory opened today','private-test-key');assert.equal(result[0].publishedAt,'2026-11-15');assert.ok(result[0].extract.includes('opened on 15 November'));assert.deepEqual(await lookupWebSources('Vega observatory opened today','private-test-key'),result);assert.equal(calls,1);}finally{global.fetch=original;}
});
test('a search snippet or unsafe destination is never promoted to article evidence',()=>{
 assert.equal(searchResultSource({url:'https://example.org',title:'Headline',content:article},'Vega'),null);
 for(const url of ['http://example.org','https://127.0.0.1','https://user:password@example.org','https://host.internal'])assert.equal(searchResultSource({url,raw_content:article},'Vega'),null);
});
test('quota failures are sanitized and are not cached as an empty successful search',async()=>{
 const original=global.fetch;let calls=0;
 global.fetch=async()=>{calls++;return new Response('SECRET PROVIDER ERROR',{status:432});};
 try{for(let i=0;i<2;i++)await assert.rejects(()=>lookupWebSources('quota fixture','quota-test-key'),error=>error.code==='SEARCH_QUOTA'&&!error.message.includes('SECRET'));assert.equal(calls,2);}finally{global.fetch=original;}
});
test('a claim outside the fixed feeds can be verified from retrieved web article text',async()=>{
 const original=global.fetch;
 global.fetch=async url=>String(url).includes('api.tavily.com')?Response.json({results:[{url:'https://example.org/vega-news',title:'Official observatory opening',raw_content:article,published_date:'2026-11-15'}]}):String(url).includes('wikipedia')?Response.json({query:{pages:{}}}):new Response('<rss><channel></channel></rss>');
 try{const result=await researchWithReferences([{text:'The Vega observatory opened today.'}],'gemini-3.5-flash-lite','model-key',async body=>{const input=JSON.parse(body.contents[0].parts[0].text);const source=input.sources.find(source=>source.type==='web-article');assert.ok(source);return {candidates:[{content:{parts:[{text:JSON.stringify({summary:'The observatory opened on 15 November 2026.',claims:[{claimId:0,verdict:'Supported',reason:'The dated article records the opening.',evidence:[{sourceId:source.sourceId,quote:'The Vega observatory opened on 15 November 2026.'}]}]})}]}}]};},'integration-key');assert.equal(result.verdict,'Supported');assert.equal(result.researchCoverage,'broad');assert.equal(result.claims[0].evidence[0].url,'https://example.org/vega-news');}finally{global.fetch=original;}
});
test('a failed live search is a service problem, not a researched unverified answer',async()=>{
 const original=global.fetch;
 global.fetch=async url=>String(url).includes('api.tavily.com')?new Response('',{status:432}):String(url).includes('wikipedia')?Response.json({query:{pages:{}}}):new Response('<rss><channel></channel></rss>');
 try{const result=await researchWithReferences([{text:'An unnamed unique fixture event happened.'}],'gemini-3.5-flash-lite','model-key',async()=>({candidates:[{content:{parts:[{text:JSON.stringify({claims:['An unnamed unique fixture event happened.'],query:'unique fixture no records'})}]}}]}),'failure-integration-key');assert.equal(result.researchStatus,'unavailable');assert.ok(result.summary.includes('allowance'));assert.equal(result.researchCoverage,'limited');}finally{global.fetch=original;}
});
