import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VoiceRecorder} from '../public/recorder.js';

class FakeRecorder {
  static instances=[];
  static isTypeSupported(type){return type==='audio/webm';}
  constructor(){this.state='inactive';this.mimeType='audio/webm';FakeRecorder.instances.push(this);}
  start(){this.state='recording';}
  stop(){this.state='inactive';}
  finish(){this.ondataavailable({data:new Blob([new Uint8Array(32)],{type:'audio/webm'})});this.onstop();}
}
function stream(){const track={stopped:false,stop(){this.stopped=true;}};return {track,getTracks:()=>[track]};}

test('recording stays active until Stop, emits audio once, and releases the microphone',async()=>{
  const source=stream();const states=[];const audio=[];
  const recorder=new VoiceRecorder({mediaDevices:{getUserMedia:async()=>source},Recorder:FakeRecorder,onState:state=>states.push(state),onAudio:blob=>audio.push(blob),onError:assert.fail});
  await recorder.start();
  assert.equal(recorder.state,'recording');assert.equal(source.track.stopped,false);assert.equal(audio.length,0);
  recorder.stop();FakeRecorder.instances.at(-1).finish();
  assert.equal(recorder.state,'idle');assert.equal(source.track.stopped,true);assert.equal(audio.length,1);
  assert.deepEqual(states,['requesting','recording','stopping','idle']);
});
test('blocked permission produces actionable feedback and permits a retry',async()=>{
  const errors=[];
  const recorder=new VoiceRecorder({mediaDevices:{getUserMedia:async()=>{throw {name:'NotAllowedError'};}},Recorder:FakeRecorder,onState:()=>{},onAudio:assert.fail,onError:error=>errors.push(error)});
  await recorder.start();assert.equal(recorder.state,'idle');assert.match(errors[0],/Allow microphone access/);
});
test('a cancelled recording callback cannot stop a newer microphone session',async()=>{
  const sources=[stream(),stream()];let index=0;
  const recorder=new VoiceRecorder({mediaDevices:{getUserMedia:async()=>sources[index++]},Recorder:FakeRecorder,onState:()=>{},onAudio:assert.fail,onError:assert.fail});
  await recorder.start();const old=FakeRecorder.instances.at(-1);
  recorder.cancel();await recorder.start();old.finish();
  assert.equal(recorder.state,'recording');assert.equal(sources[1].track.stopped,false);
  recorder.cancel();assert.equal(sources[1].track.stopped,true);
});
test('switching away during the permission prompt releases a late microphone grant',async()=>{
  const source=stream();let grant;
  const recorder=new VoiceRecorder({mediaDevices:{getUserMedia:()=>new Promise(resolve=>{grant=resolve;})},Recorder:FakeRecorder,onState:()=>{},onAudio:assert.fail,onError:assert.fail});
  const pending=recorder.start();recorder.cancel();grant(source);await pending;
  assert.equal(recorder.state,'idle');assert.equal(source.track.stopped,true);
});
