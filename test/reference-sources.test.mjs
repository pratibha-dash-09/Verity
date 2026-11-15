import {test} from 'node:test';
import assert from 'node:assert/strict';
import {selectPassages,lookupReferences} from '../reference-sources.mjs';
import {bindAssessment,researchWithReferences} from '../reference-research.mjs';
import {checkClaimContext} from '../public-data.mjs';

test('reference selection can find a relevant section beyond an unrelated introduction',()=>{
  const intro='Water is an inorganic compound and a liquid under ordinary conditions.';
  const passage='At sea level, the boiling point of pure water is 100 degrees Celsius.';
  const text=intro+'\n'+('Unrelated information about rivers, lakes and geography.\n'.repeat(40))+passage;
  const selected=selectPassages(text,'water boiling point sea level');
  assert.ok(selected.includes(intro));assert.ok(selected.includes(passage));assert.ok(selected.length<=6500);
});
test('full article evidence is retrieved when the lead omits the needed fact',async()=>{
  const original=global.fetch;const requests=[];
  global.fetch=async url=>{
    const query=new URL(url).searchParams;requests.push(query);
    const page={pageid:99,title:'Reference fixture',fullurl:'https://en.wikipedia.org/wiki/Reference_fixture',extract:query.has('pageids')?'The fixture records the exact property.\nThe zeta material has a boiling point of 80 degrees.':'The fixture is an encyclopedic article.'};
    return Response.json({query:{pages:{99:page}}});
  };
  try{
    const sources=await lookupReferences('zeta material boiling fixture');
    assert.ok(sources[0].extract.includes('boiling point of 80'));
    assert.ok(requests.some(query=>query.has('pageids')&&!query.has('exintro')));
  }finally{global.fetch=original;}
});
test('subjective fame needs a metric while measurable rankings and facts continue to research',()=>{
  assert.equal(checkClaimContext('modi is worlds most famous political leader').researchStatus,'needs-context');
  assert.equal(checkClaimContext('Modi is the most famous leader according to a named survey'),null);
  assert.equal(checkClaimContext('PM Modi got jailed today'),null);
  assert.equal(checkClaimContext('Titanic won Best Picture'),null);
  assert.equal(checkClaimContext('The greatest common divisor of 12 and 18 is 6'),null);
});
test('source identifiers resolve citations without allowing the answer to replace the submitted claim',()=>{
  const source={url:'https://example.org/record',title:'Record',extract:'The capital of the country is Delta City.'};
  const report=bindAssessment({claims:[{claimId:0,claim:'A paraphrased claim',verdict:'Contradicted',reason:'The capital is Delta City.',evidence:[{sourceId:'S1',quote:source.extract}]}]},['Gamma is the capital.'],[source]);
  assert.equal(report.claims[0].claim,'Gamma is the capital.');
  assert.equal(report.claims[0].evidence[0].url,source.url);
  assert.throws(()=>bindAssessment({claims:[{claimId:8,claim:'Other',verdict:'Supported'}]},['Original'],[source]),/identity/);
});
test('public greetings cannot disprove a same-day arrest claim',()=>{
  const quote='Prime Minister Narendra Modi greeted residents on Sunday on the State foundation day.';
  const sources=[{url:'https://example.org/greeting',title:'Public greeting',extract:quote}];
  const result=bindAssessment({summary:'He was not jailed.',claims:[{claimId:0,verdict:'Contradicted',reason:'He issued public greetings.',evidence:[{sourceId:'S1',quote}]}]},['pm modi got jailed today'],sources);
  assert.equal(result.verdict,'Unverified');assert.equal(result.claims[0].evidence.length,0);assert.ok(result.summary.includes('does not directly'));
});
test('a direct quoted denial can refute a dated arrest rumour',()=>{
  const quote='Police denied the false claim that Example Leader was arrested today.';
  const sources=[{url:'https://example.org/denial',title:'Dated police denial',extract:quote}];
  const result=bindAssessment({claims:[{claimId:0,verdict:'Contradicted',reason:'The allegation is explicitly denied.',evidence:[{sourceId:'S1',quote}]}]},['Example Leader was arrested today'],sources);
  assert.equal(result.verdict,'Contradicted');assert.equal(result.claims[0].evidence.length,1);
});
test('an inconclusive first search gets one focused retry and keeps the original claim',async()=>{
  const original=global.fetch;
  global.fetch=async url=>{
    const query=new URL(url).searchParams;
    if(String(url).includes('wikipedia'))return Response.json({query:{pages:{1:{title:'Retry fixture',fullurl:'https://en.wikipedia.org/wiki/Retry_fixture_'+(query.get('gsrsearch')?.includes('targeted')?'target':'initial'),extract:query.get('gsrsearch')?.includes('targeted')?'The zeta satellite orbits the Delta planet.':'An initial encyclopedia page about the general subject.'}}}});
    return new Response('<rss><channel></channel></rss>');
  };
  let calls=0;
  try{
    const report=await researchWithReferences([{text:'The zeta satellite orbits Delta.'}],'gemini-3.5-flash-lite','test',async body=>{
      calls++;const input=JSON.parse(body.contents[0].parts[0].text);
      const result=calls===1?{summary:'More specific evidence is needed.',followUpQueries:['targeted zeta satellite record'],claims:[{claimId:0,claim:input.claims[0],verdict:'Unverified',reason:'Initial page does not establish the orbit.',evidence:[]}]}:{summary:'The zeta satellite orbits Delta.',claims:[{claimId:0,claim:input.claims[0],verdict:'Supported',reason:'The record identifies the planet.',evidence:[{sourceId:input.sources.find(source=>source.extract.includes('orbits the Delta')).sourceId,quote:'The zeta satellite orbits the Delta planet.'}]}]};
      return {candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]};
    });
    assert.equal(calls,2);assert.equal(report.verdict,'Supported');assert.equal(report.claims[0].claim,'The zeta satellite orbits Delta.');
  }finally{global.fetch=original;}
});
test('absence of an arrest report cannot become false and retries are bounded',async()=>{
  const original=global.fetch;
  global.fetch=async url=>String(url).includes('wikipedia')?Response.json({query:{pages:{1:{title:'Leader biography',fullurl:'https://en.wikipedia.org/wiki/Arrest_fixture',extract:'This is a general biography. It establishes no current arrest event.'}}}}):new Response('<rss><channel></channel></rss>');
  let calls=0;
  try{
    const report=await researchWithReferences([{text:'Example leader was jailed today.'}],'gemini-3.5-flash-lite','test',async()=>{
      calls++;return {candidates:[{content:{parts:[{text:JSON.stringify({summary:'No dated evidence establishes this alleged arrest.',followUpQueries:['dated Example arrest record'],claims:[{claimId:0,claim:'Example leader was jailed today.',verdict:'Unverified',reason:'No dated arrest or court record was retrieved.',evidence:[]}]})}]}}]};
    });
    assert.equal(report.verdict,'Unverified');assert.ok(calls<=2);assert.ok(report.claims[0].reason.includes('dated'));
  }finally{global.fetch=original;}
});
