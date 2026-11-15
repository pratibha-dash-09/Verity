const recent=new Map();
const pending=new Map();
const stop=new Set('a an the is are was were be been being has have had do does did it its this that these those of in on at for to by and or as with from about true false today yesterday now who what when where which why how please tell me'.split(' '));
export function searchTerms(query){
  return [...new Set((String(query).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu)||[]).filter(term=>term.length>1&&!stop.has(term)))];
}
export function selectPassages(text,query,limit=6500){
  const terms=searchTerms(query);
  const paragraphs=String(text).split(/\n+/).flatMap(part=>part.length>1400?part.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)||[part]:[part]).map(part=>part.trim()).filter(part=>part.length>=35);
  const ranked=paragraphs.map((paragraph,index)=>({paragraph,index,score:terms.reduce((score,term)=>score+(paragraph.toLowerCase().includes(term)?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index);
  // Retain article identity and relevant sections, rather than only its introduction.
  const selected=new Set(paragraphs.length?[0]:[]);
  let size=(paragraphs[0]||'').length;
  for(const {paragraph,index,score}of ranked){
    if(!score||selected.has(index)||size+paragraph.length>limit)continue;
    selected.add(index);size+=paragraph.length+1;
    if(selected.size>=10)break;
  }
  return [...selected].sort((a,b)=>a-b).map(index=>paragraphs[index]).join('\n').slice(0,limit);
}
async function jsonLimited(response,limit=1600000){
  const reader=response.body.getReader();const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw new Error('Reference response too large');chunks.push(value);}}
  finally{await reader.cancel().catch(()=>{});}
  return JSON.parse(await new Blob(chunks).text());
}
async function wiki(params){
  const url=new URL('https://en.wikipedia.org/w/api.php');
  url.search=new URLSearchParams({action:'query',format:'json',...params});
  const response=await fetch(url,{headers:{'User-Agent':'Verity/1.0 (evidence reference lookup)'},signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw new Error('Reference lookup unavailable');
  return jsonLimited(response);
}
async function retrieve(query){
  const data=await wiki({generator:'search',gsrsearch:query,gsrlimit:'4',gsrnamespace:'0',prop:'extracts|info',explaintext:'1',exintro:'1',inprop:'url'});
  const pages=Object.values(data.query?.pages||{}).filter(page=>page.fullurl&&page.extract&&!/\(disambiguation\)$/.test(page.title)).sort((a,b)=>(a.index||0)-(b.index||0));
  const expanded=await Promise.allSettled(pages.slice(0,2).map(async page=>{
    if(!Number.isInteger(page.pageid)||page.pageid<=0)return page;
    const full=await wiki({pageids:String(page.pageid),prop:'extracts|info',explaintext:'1',inprop:'url'});
    return full.query?.pages?.[page.pageid]||page;
  }));
  for(let index=0;index<expanded.length;index++)if(expanded[index].status==='fulfilled')pages[index]=expanded[index].value;
  return pages.map(page=>({title:page.title,url:page.fullurl,extract:selectPassages(page.extract,query),type:'reference-article'})).filter(source=>source.extract.length>=35);
}
export async function lookupReferences(query){
  const key=String(query).trim().slice(0,200);
  if(!key)return [];
  const cached=recent.get(key);
  if(cached?.expires>Date.now())return cached.sources;
  if(pending.has(key))return pending.get(key);
  const task=retrieve(key).catch(()=>[]).then(sources=>{
    if(recent.size>=64)recent.delete(recent.keys().next().value);
    recent.set(key,{sources,expires:Date.now()+(sources.length?300000:15000)});
    return sources;
  }).finally(()=>pending.delete(key));
  pending.set(key,task);return task;
}
