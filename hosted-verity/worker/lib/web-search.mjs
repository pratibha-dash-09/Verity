import {selectPassages} from './reference-sources.mjs';

const cache=new Map();
const pending=new Map();
let activeKey='';
let generation=0;
function failure(status){
  const error=new Error('Web search could not complete.');
  error.code=[402,429,432].includes(status)?'SEARCH_QUOTA':[401,403].includes(status)?'SEARCH_AUTH':'SEARCH_UNAVAILABLE';
  return error;
}
export function searchResultSource(result,query){
  try{
    const url=new URL(result.url);
    if(url.protocol!=='https:'||url.username||url.password||url.port||!url.hostname.includes('.')||/^(?:\d[\d.]*|\[.*\])$/.test(url.hostname)||/\.(?:local|internal|localhost)$/.test(url.hostname))return null;
    // A generated search answer, headline or snippet is not original article evidence.
    if(typeof result.raw_content!=='string'||result.raw_content.trim().length<300)return null;
    const extract=selectPassages(result.raw_content.slice(0,120000),query,7000);
    if(extract.length<200)return null;
    return {title:String(result.title||url.hostname).slice(0,350),url:url.href,extract,type:'web-article',...(result.published_date?{publishedAt:String(result.published_date).slice(0,100)}:{})};
  }catch{return null;}
}
async function limitedJson(response){
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4000000)throw failure(502);chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(await new Blob(chunks).text());
}
export async function lookupWebSources(query,key){
  if(!key)return [];
  if(key!==activeKey){activeKey=key;generation++;cache.clear();pending.clear();}
  const text=String(query).trim().slice(0,300);
  if(!text)return [];
  const topic=/\b(?:today|yesterday|latest|breaking|recently|news|announced|jailed|arrested)\b/i.test(text)?'news':'general';
  const id=generation+'\n'+topic+'\n'+text;
  const previous=cache.get(id);
  if(previous?.expires>Date.now())return previous.sources;
  if(pending.has(id))return pending.get(id);
  const task=(async()=>{
    let response;
    try{
      response=await fetch('https://api.tavily.com/search',{
        method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},
        body:JSON.stringify({query:text,topic,search_depth:'basic',auto_parameters:false,max_results:6,include_raw_content:'text',include_answer:false,include_published_date:true}),
        signal:AbortSignal.timeout(18000)
      });
    }catch{throw failure(503);}
    if(!response.ok){await response.body?.cancel();throw failure(response.status);}
    let data;try{data=await limitedJson(response);}catch{throw failure(502);}
    if(!Array.isArray(data.results))throw failure(502);
    const sources=[...new Map(data.results.map(result=>searchResultSource(result,text)).filter(Boolean).map(source=>[source.url,source])).values()];
    if(cache.size>=40)cache.delete(cache.keys().next().value);
    cache.set(id,{sources,expires:Date.now()+(sources.length?120000:20000)});
    return sources;
  })().finally(()=>pending.delete(id));
  pending.set(id,task);return task;
}
