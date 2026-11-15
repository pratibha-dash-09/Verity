import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validAudio,transcribeAudio} from '../transcribe.mjs';

const wav=Buffer.alloc(64);wav.write('RIFF');wav.write('WAVE',8);
test('audio validates its format and payload before contacting the service',()=>{
  assert.equal(validAudio(wav.toString('base64'),'audio/wav'),true);
  assert.equal(validAudio(Buffer.from('This is text masquerading as speech.').toString('base64'),'audio/wav'),false);
  assert.equal(validAudio(wav.toString('base64'),'image/png'),false);
});
test('audio is transcribed as text with the service key kept in a request header',async()=>{
  const original=global.fetch;
  global.fetch=async(url,options)=>{
    const request=JSON.parse(options.body);
    assert.equal(options.headers['x-goog-api-key'],'private-test-key');
    assert.equal(request.contents[0].parts[0].inlineData.mimeType,'audio/wav');
    assert.ok(!options.body.includes('private-test-key'));
    return new Response(JSON.stringify({candidates:[{content:{parts:[{text:JSON.stringify({transcript:'The Moon orbits Earth.'})}]}}]}));
  };
  try{assert.equal(await transcribeAudio({audio:wav.toString('base64'),mimeType:'audio/wav',language:'en-IN'},['gemini-3.5-flash-lite'],'private-test-key'),'The Moon orbits Earth.');}
  finally{global.fetch=original;}
});
