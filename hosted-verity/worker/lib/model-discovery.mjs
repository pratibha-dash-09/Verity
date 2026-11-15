import {geminiError} from './provider-errors.mjs';
export const names = {
  'gemini-3.8-flash': 'Verity Scout',
  'gemini-2.5-flash': 'Verity Lens',
  'gemini-3.1-flash-lite': 'Verity Lens',
  'gemini-3.5-flash-lite': 'Verity Swift'
};
export function candidates(models){
  const supported = new Set(models.filter(m => m.supportedGenerationMethods?.includes('generateContent')).map(m => m.name));
  const selected = new Set();
  return Object.keys(names).filter(id => {
    if (!supported.has('models/'+id) || selected.has(names[id])) return false;
    selected.add(names[id]);
    return true;
  });
}
export async function discoverModels(key){
 const headers={'Content-Type':'application/json','x-goog-api-key':key};
 const models=[];let page='';
 for(let i=0;i<5;i++){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100'+(page?'&pageToken='+encodeURIComponent(page):''),{headers,signal:AbortSignal.timeout(30000)});
  const data=await response.json();if(!response.ok)throw geminiError(response.status,data);
  models.push(...(data.models||[]));page=data.nextPageToken;if(!page)break;
 }
 const options=[...new Set(candidates(models))];
 if(!options.length){const e=new Error('Google returned no compatible Gemini Flash models for this key. Check the project and available models in AI Studio.');e.public=true;throw e;}
 return options;
}
