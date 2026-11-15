import {test} from 'node:test';
import assert from 'node:assert/strict';
import {candidates,discoverModels} from '../model-discovery.mjs';
test('model selection requires generation and excludes specialized models',()=>{
 const models=['gemini-2.5-flash','gemini-3.8-flash','gemini-3.8-flash-image','gemini-4-pro','gemini-3.8-flash-tts'].map(n=>({name:'models/'+n,supportedGenerationMethods:['generateContent']}));
 assert.deepEqual(candidates(models),['gemini-3.8-flash','gemini-2.5-flash']);
});
test('setup reads the model catalog without generating a test answer',async()=>{
 const original=global.fetch;
 global.fetch=async(url,options)=>{
  assert.match(url,/models\?pageSize=/);
  assert.equal(options.method,undefined);
  return {ok:true,json:async()=>({models:[{name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}]})};
 };
 try{assert.deepEqual(await discoverModels('test'),['gemini-3.8-flash']);}finally{global.fetch=original;}
});