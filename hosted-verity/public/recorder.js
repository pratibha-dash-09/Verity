// Capture is independent of browser-specific speech recognition services.
export class VoiceRecorder {
  constructor({mediaDevices, Recorder, onState, onAudio, onError, maxDuration=90000}) {
    this.mediaDevices=mediaDevices;
    this.Recorder=Recorder;
    this.onState=onState;
    this.onAudio=onAudio;
    this.onError=onError;
    this.maxDuration=maxDuration;
    this.state='idle';
    this.session=0;
  }
  setState(state) { this.state=state; this.onState(state); }
  async start() {
    if(this.state!=='idle')return;
    const session=++this.session;
    this.setState('requesting');
    let stream;
    try {
      stream=await this.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      if(session!==this.session){stream.getTracks().forEach(track=>track.stop());return;}
      this.stream=stream;
      const mimeType=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'].find(type=>this.Recorder.isTypeSupported(type));
      this.recorder=new this.Recorder(stream,mimeType ? {mimeType,audioBitsPerSecond:64000} : undefined);
      const chunks=[];
      let size=0;
      this.recorder.ondataavailable=event=>{
        if(session!==this.session || !event.data?.size)return;
        size+=event.data.size;
        if(size>5*1024*1024){this.cancel();this.onError('The recording is too large. Please record a shorter claim.');return;}
        chunks.push(event.data);
      };
      this.recorder.onerror=()=>{if(session===this.session){this.cancel();this.onError('The microphone recording failed. Check your microphone and try again.');}};
      this.recorder.onstop=()=>{
        if(session!==this.session){stream.getTracks().forEach(track=>track.stop());return;}
        this.releaseStream();
        this.setState('idle');
        const mime=(this.recorder.mimeType || chunks[0]?.type || '').split(';')[0];
        const blob=new Blob(chunks,{type:mime});
        if(blob.size<16){this.onError('No audio was captured. Check your microphone and try again.');return;}
        this.onAudio(blob);
      };
      this.recorder.start(250);
      this.setState('recording');
      this.timeout=setTimeout(()=>this.stop(),this.maxDuration);
    } catch(error) {
      if(session!==this.session)return;
      stream?.getTracks().forEach(track=>track.stop());
      this.stream=null;
      this.setState('idle');
      this.onError(error.name==='NotAllowedError' ? 'Microphone access was blocked. Allow microphone access for this site, then try again or upload a voice clip.'
        : error.name==='NotFoundError' ? 'No microphone was found. Connect a microphone or upload a voice clip.'
        : 'Could not open the microphone. Close other apps using it and try again, or upload a voice clip.');
    }
  }
  stop() {
    if(this.state!=='recording')return;
    clearTimeout(this.timeout);
    this.setState('stopping');
    this.recorder.stop();
  }
  releaseStream() {
    clearTimeout(this.timeout);
    this.stream?.getTracks().forEach(track=>track.stop());
    this.stream=null;
  }
  cancel() {
    this.session++;
    if(this.recorder?.state==='recording')this.recorder.stop();
    this.releaseStream();
    this.setState('idle');
  }
}
