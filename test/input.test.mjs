import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildSubmission} from '../public/input.js';

test('input modes submit only their own content',()=>{
  const drafts={text:'Saved text',transcript:'Spoken claim',image:'data:image/png;base64,YQ==',model:'swift'};
  assert.deepEqual(buildSubmission('image',drafts),{mode:'image',text:'',image:drafts.image,model:'swift'});
  assert.deepEqual(buildSubmission('voice',drafts),{mode:'voice',text:'Spoken claim',image:null,model:'swift'});
  assert.deepEqual(buildSubmission('text',drafts),{mode:'text',text:'Saved text',image:null,model:'swift'});
  assert.throws(()=>buildSubmission('image',{text:'Old hidden text'}),/image first/);
  assert.throws(()=>buildSubmission('voice',{text:'Old hidden text'}),/transcript first/);
});
