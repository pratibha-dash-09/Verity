import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HISTORY_KEY, makeHistoryEntry, readHistory, writeHistory, filterHistory} from '../public/history.js';

const report = {verdict:'Supported',summary:'A source supports the claim.',checkedAt:'2026-11-14T12:00:00Z',claims:[{claim:'The Moon orbits Earth.',verdict:'Supported',reason:'Recorded in the reference.',evidence:[{url:'https://example.org',title:'Record',explanation:'A matching passage.'}]}]};
function storage() {
  const values = new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
}
test('completed checks survive storage reload without saving image content',()=>{
  const store=storage();
  const entry=makeHistoryEntry({text:'Test claim',image:'data:image/png;base64,PRIVATE_IMAGE',modelName:'Verity Swift',report});
  writeHistory(store,[entry]);
  assert.equal(readHistory(store)[0].id,entry.id);
  assert.ok(!store.getItem(HISTORY_KEY).includes('PRIVATE_IMAGE'));
  assert.equal(readHistory(store)[0].inputType,'image');
});
test('corrupt storage and invalid report fields do not break history',()=>{
  const store=storage();
  for(const value of ['{','null','{}','[{}]']){store.setItem(HISTORY_KEY,value);assert.deepEqual(readHistory(store),[]);}
});
test('history search, verdict filters, deletion and capacity retain the right checks',()=>{
  const store=storage();
  const entries=Array.from({length:55},(_,index)=>makeHistoryEntry({text:'Claim '+index,modelName:'Verity Swift',report}));
  const saved=writeHistory(store,entries);
  assert.equal(saved.length,50);
  assert.equal(filterHistory(saved,'claim 12','Supported').length,1);
  assert.equal(filterHistory(saved,'claim 12','Contradicted').length,0);
  writeHistory(store,saved.filter(entry=>entry.id!==saved[0].id));
  assert.equal(readHistory(store).length,49);
  writeHistory(store,[]);assert.deepEqual(readHistory(store),[]);
});
test('repeated text checks reuse a history entry while distinct image reports remain separate',()=>{
  const first=makeHistoryEntry({text:'A claim',modelName:'Verity Swift',report});
  assert.equal(makeHistoryEntry({text:'A claim',modelName:'Verity Swift',report},[first]).id,first.id);
  const image=makeHistoryEntry({text:'',image:true,modelName:'Verity Swift',report});
  const other=makeHistoryEntry({text:'',image:true,modelName:'Verity Swift',report:{...report,claims:[{...report.claims[0],claim:'Another image claim'}]}},[image]);
  assert.notEqual(image.id,other.id);
});
test('service failures can be filtered separately from an inconclusive assessment',()=>{
  const unavailable=makeHistoryEntry({text:'A',modelName:'Verity Swift',report:{...report,verdict:'Unverified',researchStatus:'unavailable'}});
  const inconclusive=makeHistoryEntry({text:'B',modelName:'Verity Swift',report:{...report,verdict:'Unverified'}});
  assert.deepEqual(filterHistory([unavailable,inconclusive],'','Unverified'),[inconclusive]);
  assert.deepEqual(filterHistory([unavailable,inconclusive],'','unavailable'),[unavailable]);
});
