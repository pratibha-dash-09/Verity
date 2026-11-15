import {test} from 'node:test';
import assert from 'node:assert/strict';
import {evidenceCoverage} from '../public/evidence.js';
const claim=(verdict='Supported',url='https://example.org/record')=>({verdict,evidence:[{url}]});
test('coverage measures cited decisive claims, not an accuracy probability',()=>{
  assert.deepEqual(evidenceCoverage({claims:[claim(),claim('Unverified')]}),{percentage:50,assessed:1,total:2,sources:1});
  assert.equal(evidenceCoverage({claims:[claim('Contradicted')]}).percentage,100);
  assert.equal(evidenceCoverage({claims:[claim('Misleading')]}).percentage,100);
  assert.equal(evidenceCoverage({claims:[claim('Unverified')]}).percentage,0);
});
test('missing evidence, unsafe links and unavailable checks never create a score of certainty',()=>{
  assert.equal(evidenceCoverage({claims:[claim('Supported','javascript:alert(1)')]}).percentage,0);
  assert.equal(evidenceCoverage({claims:[claim('Supported','https://user:pass@example.org')]}).percentage,0);
  assert.equal(evidenceCoverage({claims:[{verdict:'Supported'}]}).percentage,0);
  assert.equal(evidenceCoverage({researchStatus:'unavailable',claims:[claim()]}).percentage,null);
  assert.equal(evidenceCoverage({researchStatus:'needs-context',claims:[claim()]}).percentage,null);
  assert.equal(evidenceCoverage({kind:'coverage',claims:[claim()]}).percentage,null);
  assert.equal(evidenceCoverage(null).percentage,null);
});
test('legacy history reports can derive coverage without a stored score',()=>{
  assert.deepEqual(evidenceCoverage({claims:[claim(),claim('Contradicted','https://www.example.org/other'),claim('Unverified')]}),{percentage:67,assessed:2,total:3,sources:1});
});
