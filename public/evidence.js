const assessedVerdicts=new Set(['Supported','Contradicted','Misleading']);

// A measurable coverage ratio, never an estimate of factual accuracy.
export function evidenceCoverage(report){
  const claims=Array.isArray(report?.claims)?report.claims:[];
  if(!claims.length||['unavailable','needs-context'].includes(report?.researchStatus)||report?.kind==='coverage'){
    return {percentage:null,assessed:0,total:claims.length,sources:0};
  }
  const domains=new Set();
  let assessed=0;
  for(const claim of claims){
    if(!assessedVerdicts.has(claim?.verdict))continue;
    const citations=(Array.isArray(claim.evidence)?claim.evidence:[]).filter(source=>{
      try{
        const url=new URL(source?.url);
        if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return false;
        domains.add(url.hostname.replace(/^www\./,''));
        return true;
      }catch{return false;}
    });
    if(citations.length)assessed++;
  }
  return {percentage:Math.round(100*assessed/claims.length),assessed,total:claims.length,sources:domains.size};
}
