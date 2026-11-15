import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchWithReferences} from '../reference-research.mjs';

test('recent publisher text is evaluated with a quoted passage instead of presenting a headline list',async()=>{
  const original=global.fetch;
  const url='https://www.theguardian.com/science/observatory';
  const passage='The Delta observatory opened its doors to the public today.';
  const body=passage+' Scientists explained the telescope and its observations. '.repeat(14);
  const xml='<rss><channel><item><title>Delta observatory opens</title><link>'+url+'</link><content:encoded><![CDATA[<p>'+body+'</p>]]></content:encoded><pubDate>'+new Date().toUTCString()+'</pubDate></item></channel></rss>';
  global.fetch=async request=>new Response(String(request).includes('wikipedia')?JSON.stringify({query:{pages:{}}}):xml,{status:200,headers:{'Content-Type':String(request).includes('wikipedia')?'application/json':'application/xml'}});
  let calls=0;
  try {
    const result=await researchWithReferences([{text:'The Delta observatory opened today.'}],'gemini-3.5-flash-lite','test',async request=>{
      calls++;
      const input=JSON.parse(request.contents[0].parts[0].text);
      assert.equal(input.sources[0].url,url);
      assert.ok(input.sources[0].extract.includes(passage));
      assert.ok(input.sources[0].publishedAt);
      return {candidates:[{content:{parts:[{text:JSON.stringify({summary:'The observatory opened today.',claims:[{claim:input.claims[0],verdict:'Supported',reason:'The dated report explicitly records the opening.',evidence:[{url,quote:passage,explanation:'Records the opening.'}]}]})}]}}]};
    });
    assert.equal(calls,1);
    assert.equal(result.verdict,'Supported');
    assert.equal(result.claims[0].evidence[0].quote,passage);
  }finally{global.fetch=original;}
});
