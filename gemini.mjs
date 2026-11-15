import {geminiError} from './provider-errors.mjs';
import {researchWithReferences} from './reference-research.mjs';

export async function generate(body, model, key) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method:'POST', headers:{'Content-Type':'application/json', 'x-goog-api-key':key},
    body:JSON.stringify(body), signal:AbortSignal.timeout(60000)
  });
  if (!response.ok) {
    let data = {};
    try { data = await response.json(); } catch { /* A status code still identifies the service failure. */ }
    const error = geminiError(response.status, data, model);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function verifyGemini({text, image}, models = []) {
  const options = models.length ? models : [process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite'];
  const key = process.env.GEMINI_API_KEY;
  const parts = [{text:text.trim() || 'Read the article image and check its factual claims.'}];
  if (image) {
    const [,mimeType,data] = image.match(/^data:(image\/\w+);base64,(.+)$/);
    parts.push({inlineData:{mimeType,data}});
  }
  for (const model of options) {
    try { return await researchWithReferences(parts, model, key, generate); }
    catch (error) { if (error.status !== 404 || model === options.at(-1)) throw error; }
  }
}
