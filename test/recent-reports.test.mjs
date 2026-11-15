import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reuseReport} from '../recent-reports.mjs';

const supported={verdict:'Supported',claims:[{evidence:[{url:'https://example.org'}]}]};
test('identical image checks share one in-flight analysis and reuse the completed report',async()=>{
  const data={text:'',image:'image-a'};let calls=0;let resolve;
  const analyze=()=>{calls++;return new Promise(done=>{resolve=done;});};
  const first=reuseReport(data,['image-test'],analyze);
  const second=reuseReport(data,['image-test'],analyze);
  await Promise.resolve();assert.equal(calls,1);resolve(supported);
  assert.deepEqual(await first,supported);assert.deepEqual(await second,supported);
  await reuseReport(data,['image-test'],analyze);assert.equal(calls,1);
  await reuseReport({...data,image:'image-b'},['image-test'],async()=>{calls++;return supported;});
  assert.equal(calls,2);
});
test('service failures and thrown requests are retryable instead of cached',async()=>{
  let calls=0;
  const data={text:'service-test'};
  const analyze=async()=>{calls++;return {researchStatus:'unavailable',claims:[{evidence:[]}]};};
  await reuseReport(data,[],analyze);await reuseReport(data,[],analyze);assert.equal(calls,2);
  await assert.rejects(reuseReport({text:'throw-test'},[],async()=>{throw new Error('temporary');}));
  assert.deepEqual(await reuseReport({text:'throw-test'},[],async()=>supported),supported);
});
test('uncited inconclusive results expire quickly and cited reports keep their original check timestamp',async()=>{
  const original=Date.now;let now=1000000;Date.now=()=>now;
  let calls=0;
  const analyze=async()=>{calls++;return {verdict:'Unverified',checkedAt:'original',claims:[{evidence:[]}]};};
  try{
    const data={text:'short-lived-test'};
    await reuseReport(data,[],analyze);now+=10000;
    const cached=await reuseReport(data,[],analyze);assert.equal(calls,1);assert.equal(cached.checkedAt,'original');
    now+=11000;await reuseReport(data,[],analyze);assert.equal(calls,2);
  }finally{Date.now=original;}
});
