const profile = 'https://blog.google/authors/sundar-pichai/';

export async function checkGoogleLeadership(text) {
  const claim = text.trim().replace(/[.!]$/, '');
  const match = /^(?:mr\.?\s+)?([a-z]+(?: [a-z]+){1,3}) (is|becomes|became) (?:the )?(?:google(?:'s)? ceo|ceo of google)( today)?$/i.exec(claim);
  if (!match || /\b(?:never|not|no|if|will|maybe|unless)\b/i.test(claim)) return null;
  const response = await fetch(profile, {signal:AbortSignal.timeout(8000)});
  if (!response.ok) return null;
  const html = await response.text();
  const page = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
  if (!/Leadership Sundar Pichai, CEO\b/i.test(page)) return null;
  const matchesHolder = match[1].toLowerCase() === 'sundar pichai';
  const appointment = match[2].toLowerCase() !== 'is';
  if (appointment && !match[3]) return null;
  const verdict = !matchesHolder ? 'Contradicted' : appointment ? 'Unverified' : 'Supported';
  const reason = 'Google currently identifies Sundar Pichai as CEO in its leadership listing.' +
    (appointment ? ' This record identifies the officeholder but does not date an appointment.' : '');
  return {provider:'Google leadership listing',checkedAt:new Date().toISOString(),verdict,summary:reason,
    claims:[{claim:text,verdict,reason,evidence:[{title:'Google’s leadership listing',url:profile,explanation:'The Leadership section identifies “Sundar Pichai, CEO”.'}]}]};
}
