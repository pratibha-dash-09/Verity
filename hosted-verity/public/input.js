export function buildSubmission(mode, {text='', transcript='', image=null, model}) {
  if(mode==='image') {
    if(!image)throw new Error('Choose an article image first.');
    return {mode,text:'',image,model};
  }
  const value=mode==='voice'?transcript:text;
  if(!value.trim())throw new Error(mode==='voice'?'Record a voice clip or enter a transcript first.':'Enter a claim or article first.');
  return {mode,text:value,image:null,model};
}
