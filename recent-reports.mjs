import {createHash} from 'node:crypto';

const recent = new Map();
const pending = new Map();

export async function reuseReport(data, models, analyze) {
  const fingerprint = createHash('sha256').update(data.image || '').digest('hex');
  const id = createHash('sha256').update(JSON.stringify([models, data.text.trim(),fingerprint])).digest('hex');
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
