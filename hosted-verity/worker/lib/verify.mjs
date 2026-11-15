export function normalize(report,sources){
 const allowed=new Map(sources.filter(s=>s&&typeof s.url==='string'&&/^https?:\/\//.test(s.url)).map(s=>[s.url,s]));
 if(!report||!Array.isArray(report.claims)||!report.claims.length)throw new Error('Invalid analysis');
 let downgraded=false;
 const claims=report.claims.slice(0,8).map(c=>{
   if(!c||typeof c.claim!=='string'||!c.claim.trim())throw new Error('Invalid claim');
   const evidence=Array.isArray(c.evidence)?c.evidence.filter(e=>{
     if(!e||!allowed.has(e.url))return false;
     const source=allowed.get(e.url);
     if(!source.extract)return true;
     // Reference-based verdicts must point to text actually present in the source.
     const normalizeText=value=>value.replace(/\s+/g,' ').trim().toLowerCase();
     return typeof e.quote==='string'&&e.quote.length>=12&&normalizeText(source.extract).includes(normalizeText(e.quote));
   }).map(e=>({url:e.url,title:allowed.get(e.url).title||e.url,explanation:String(e.explanation||''),...(e.quote?{quote:e.quote}:{})})):[];
   const verdict=evidence.length&&['Supported','Contradicted','Misleading'].includes(c.verdict)?c.verdict:'Unverified';
   const changed=verdict==='Unverified'&&c.verdict!=='Unverified';
   downgraded ||= changed;
   return {claim:c.claim,verdict,reason:changed?'The sources do not contain enough directly cited evidence to verify this claim.':String(c.reason||''),evidence};
 });
 const verdict=claims.every(claim=>claim.verdict===claims[0].verdict)?claims[0].verdict:'Mixed findings';
 return {summary:downgraded?'Some claims could not be verified from the cited evidence.':String(report.summary||''),claims,checkedAt:new Date().toISOString(),verdict};
}
