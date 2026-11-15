const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');

const recent = new Map();
const pending = new Map();

export async function reuseReport(data, models, analyze) {
  const fingerprint = await hash(data.image || '');
  const id = await hash(JSON.stringify([models, data.text.trim(),fingerprint]));
  const cached = recent.get(id);
  if (cached && cached.expires > Date.now()) return cached.report;
  if (pending.has(id)) return pending.get(id);
  const task = Promise.resolve().then(analyze).then(report => {
    if (report.researchStatus !== 'unavailable' && report.claims?.length) {
      recent.delete(id);
      if (recent.size >= 40) recent.delete(recent.keys().next().value);
      const hasEvidence=report.claims.some(claim=>claim.evidence?.length);
      recent.set(id, {report, expires:Date.now() + (hasEvidence ? 120000 : 20000)});
    }
    return report;
  }).finally(() => pending.delete(id));
  pending.set(id,task);
  return task;
}
