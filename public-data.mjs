const rateUrl = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR';

export function checkClaimContext(text){
  const value=String(text).trim();
  const subjective=/\b(?:is|are|was|were)\b.{0,65}\b(?:most famous|most loved|most hated|best|worst|greatest)\b/i.test(value);
  const defined=/\b(?:according to|survey|poll|ranking|ranked|approval|followers|views|searches|percent|score|metric|measured|guinness|award|winner|won|selling)\b|best[ -](?:picture|actor|actress|supporting|original)|\d\s*%/i.test(value);
  if(!subjective||defined)return null;
  const reason='This ranking needs a defined measure. Specify a survey, audience and date, or a measurable value such as follower count. Fame, popularity and approval are different measures.';
  return {provider:'Claim context',researchStatus:'needs-context',checkedAt:new Date().toISOString(),verdict:'Unverified',summary:reason,
    claims:[{claim:value,verdict:'Unverified',reason,evidence:[]}]};
}

export async function checkExchangeRate(text) {
  // Full-string patterns keep forecasts, dated claims and compound stories out.
  const value = text.trim().toLowerCase().replace(/[.!?]+$/, '');
  const informal = /^rupee price goes\s+(\d+(?:\.\d+)?)\s*usd$/.exec(value);
  const explicit = /^(?:1\s*usd|one us dollar|one dollar)\s*(?:is|equals|=)\s*(?:₹\s*)?(\d+(?:\.\d+)?)\s*(?:inr|rupees?)$/.exec(value);
  if (!informal && !explicit) return null;
  const amount = Number((informal || explicit)[1]);
  const response = await fetch(rateUrl, {signal: AbortSignal.timeout(10000)});
  if (!response.ok) throw new Error('Rate lookup unavailable');
  const data = await response.json();
  const rate = data.rates?.INR;
  if (data.base !== 'USD' || !Number.isFinite(rate) || rate <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('Invalid reference rate');
  const age = Date.now() - Date.parse(data.date);
  const current = age >= -86400000 && age < 7 * 86400000;
  const verdict = current ? (Math.abs(rate - amount) < 0.005 ? 'Supported' : 'Contradicted') : 'Unverified';
  const reason = 'On ' + data.date + ', the published reference rate was ₹' + rate + ' per US dollar (about US$' + (1/rate).toFixed(4) + ' per rupee).';
  return {provider:'Frankfurter', checkedAt:new Date().toISOString(), verdict,
    summary:(informal ? 'Interpreting this as a claim about today’s rate of ₹' + amount + ' per US dollar. ' : '') + (current ? 'This compares the latest published daily reference rate. A forecast or intraday price needs a date and time.' : 'The available rate is too old to verify today’s price.'),
    claims:[{claim:'One US dollar equals ₹' + amount + '.', verdict, reason, evidence:[{title:'Published USD/INR reference rate',url:rateUrl.replace('latest',data.date),explanation:reason}]}]};
}

export function incompleteReport(text, reason) {
  return {provider:'Unavailable',researchStatus:'unavailable', checkedAt:new Date().toISOString(),verdict:'Unverified',summary:reason,
    claims:[{claim:text.trim().slice(0,1200) || 'Submitted image',verdict:'Unverified',reason:'No verified evidence was available for this submission.',evidence:[]}]};
}
