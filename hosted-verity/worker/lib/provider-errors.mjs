export function geminiError(status,body={},model=''){
 const details=Array.isArray(body.error?.details)?body.error.details:[];
 const safe=value=>typeof value==='string'&&/^[A-Za-z0-9_.\/-]{1,160}$/.test(value)?value:'';
 const quota=details.flatMap(d=>Array.isArray(d.violations)?d.violations:[]).slice(0,4).map(v=>{
  const id=safe(v.quotaId)||safe(v.quotaMetric);
  const value=/^\d+$/.test(String(v.quotaValue))?String(v.quotaValue):'';
  return id?`${id}${value!==''?' (limit '+value+')':''}`:'';
 }).filter(Boolean);
 const retry=details.map(d=>d.retryDelay).find(v=>typeof v==='string'&&/^\d+(\.\d+)?s$/.test(v));
 const zero=details.some(d=>d.violations?.some(v=>String(v.quotaValue)==='0'));
 const reason=body.error?.details?.map(d=>d.reason).find(r=>typeof r==='string'&&/^[A-Z_]{1,80}$/.test(r));
 const label=typeof body.error?.status==='string'&&/^[A-Z_]{1,80}$/.test(body.error.status)?body.error.status:'';
 const advice=status===401?'Google rejected authentication. Create a new auth key in Google AI Studio; if this persists, try a new AI Studio project.':status===403?'Google denied access. Check whether the key is blocked, restricted, or unavailable in your region.':status===429?'Your Gemini quota or rate limit was reached. Check free-tier model quotas in AI Studio and try again later. No paid fallback was used.':status===404?'The configured Gemini model is unavailable to this project. Check model access in AI Studio.':status===400?'Google rejected the request configuration. Check model support for images and Google Search grounding.':status>=500?'Google’s API is overloaded or unavailable. Try again shortly.':'Google could not complete the request.';
 const extra=[model?'Model: '+safe(model)+'.':'',quota.length?'Quota: '+quota.join('; ')+'.':'',zero?'Google reports a zero allowance for this quota. Repeated retries will not resolve a zero allowance.':'',retry&&!zero?'Google suggests retrying after '+retry+'.':''].filter(Boolean).join(' ');
 const error=new Error(`Gemini HTTP ${status}${label?' · '+label:''}${reason?' · '+reason:''}. ${extra} ${status===429&&zero?'Check this model’s quota in AI Studio. No paid fallback was used.':advice}`);error.public=true;return error;
}
