import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../../',import.meta.url);
const target=new URL('../',import.meta.url);
await mkdir(new URL('worker/lib/',target),{recursive:true});
await mkdir(new URL('public/assets/',target),{recursive:true});
const modules=['gemini','reference-research','reference-sources','web-search','verify','live-news','recent-reports','provider-errors','public-data','leadership','transcribe','model-discovery'];
for(const name of modules){
  let source=await readFile(new URL(name+'.mjs',root),'utf8');
  if(name==='gemini')source=source.replace('key = process.env.GEMINI_API_KEY','key').replace("process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'","'gemini-3.5-flash-lite'");
  if(name==='verify')source=source.slice(0,source.indexOf('\nasync function call('))+'\n';
  if(name==='live-news')source=source.replace("Buffer.concat(chunks).toString('utf8')","new TextDecoder().decode(await new Blob(chunks).arrayBuffer())");
  if(name==='recent-reports')source=source.replace("import {createHash} from 'node:crypto';","const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');").replace("createHash('sha256').update(data.image || '').digest('hex')","await hash(data.image || '')").replace("createHash('sha256').update(JSON.stringify([models, data.text.trim(),fingerprint])).digest('hex')","await hash(JSON.stringify([models, data.text.trim(),fingerprint]))");
  if(name==='transcribe'){
    const start=source.indexOf('export function validAudio');
    const end=source.indexOf('\nexport async function transcribeAudio');
    source=source.slice(0,start)+`export function validAudio(audio,mimeType){
  if(typeof audio!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(audio)||!formats.has(mimeType)||audio.length>6990510)return false;
  let value;try{value=atob(audio);}catch{return false;}
  if(value.length<16||value.length>5*1024*1024)return false;
  const byte=index=>value.charCodeAt(index);
  if(mimeType==='audio/webm')return [0x1a,0x45,0xdf,0xa3].every((v,i)=>byte(i)===v);
  if(mimeType==='audio/wav')return value.slice(0,4)==='RIFF'&&value.slice(8,12)==='WAVE';
  if(mimeType==='audio/ogg')return value.slice(0,4)==='OggS';
  if(mimeType==='audio/mp4')return value.slice(4,8)==='ftyp';
  return value.slice(0,3)==='ID3'||(byte(0)===0xff&&(byte(1)&0xe0)===0xe0);
}
`+source.slice(end);
  }
  if(/process\.env|node:|Buffer\./.test(source))throw new Error('Nonportable module: '+name);
  await writeFile(new URL('worker/lib/'+name+'.mjs',target),source);
}
for(const name of ['index.html','app.js','history.js','input.js','recorder.js','evidence.js','style.css',...['logo.svg','icons.svg','verity-field.svg','verity-sculpture.png','dm-regular.ttf','dm-medium.ttf','dm-semibold.ttf','dm-bold.ttf','instrument-italic.ttf','instrument-regular.ttf','dm-license.txt','instrument-license.txt','DESIGN.md'].map(name=>'assets/'+name)]){
  try{await copyFile(new URL('public/'+name,root),new URL('public/'+name,target));}catch(error){if(error.code!=='ENOENT')throw error;}
}
console.log('Copied public assets and portable server modules; local settings excluded.');
