import {test} from 'node:test';
import assert from 'node:assert/strict';
import {geminiError} from '../provider-errors.mjs';
test('distinguishes authentication, model, quota and availability failures without exposing raw messages',()=>{
 for(const [status,phrase] of [[401,'authentication'],[404,'model'],[429,'quota'],[503,'overloaded']]){
  const error=geminiError(status,{error:{message:'secret-key-should-not-leak',status:'UNAUTHENTICATED',details:[{reason:'ACCESS_TOKEN_TYPE_UNSUPPORTED'}]}});
  assert.ok(error.public);assert.match(error.message,new RegExp(phrase));assert.ok(error.message.includes(String(status)));assert.ok(!error.message.includes('secret-key-should-not-leak'));
 }
});
test('reports model, zero allowance and retry metadata without raw provider content',()=>{
 const zero=geminiError(429,{error:{details:[{violations:[{quotaId:'GenerateRequestsPerDay-FreeTier',quotaValue:'0'}]}]}},'gemini-example-flash');
 assert.match(zero.message,/gemini-example-flash/);assert.match(zero.message,/limit 0/);assert.match(zero.message,/zero allowance/);
 const retry=geminiError(429,{error:{details:[{retryDelay:'45s'}]}});
 assert.match(retry.message,/45s/);
});
