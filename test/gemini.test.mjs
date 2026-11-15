import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyGemini} from '../gemini.mjs';

test('image input is transcribed before evaluation and only retrieved quotations establish verdicts',async()=>{
  const original=global.fetch;
  const calls=[];
  const source='The Moon is the only natural satellite of Earth.';
  global.fetch=async(url,options)=>{
    if(String(url).includes('generativelanguage')){
      const request=JSON.parse(options.body);calls.push(request);
      const result=calls.length===1?{claims:['The Moon is a star.'],query:'Moon astronomy'}:
        {summary:'The Moon is a natural satellite.',claims:[{claim:'The Moon is a star.',verdict:'Contradicted',reason:'It is a natural satellite.',evidence:[{url:'https://en.wikipedia.org/wiki/Moon',quote:source,explanation:'Identifies the type of object.'},{url:'https://fake.example',quote:source}]}]};
      return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}));
    }
    if(String(url).includes('wikipedia'))return new Response(JSON.stringify({query:{pages:{one:{title:'Moon',fullurl:'https://en.wikipedia.org/wiki/Moon',extract:source}}}}));
    return new Response('<rss><channel></channel></rss>');
  };
  try{
    const report=await verifyGemini({text:'',image:'data:image/png;base64,YQ=='},['gemini-2.5-flash']);
    assert.equal(report.verdict,'Contradicted');
    assert.equal(report.claims[0].evidence.length,1);
    assert.equal(calls[0].contents[0].parts[1].inlineData.mimeType,'image/png');
    assert.equal(calls[0].tools,undefined);
    assert.equal(calls[0].generationConfig.thinkingConfig.thinkingBudget,0);
  }finally{global.fetch=original;}
});
