const feeds = [
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://www.theguardian.com/world/rss',
  'https://feeds.npr.org/1004/rss.xml',
  'https://feeds.bbci.co.uk/news/world/asia/india/rss.xml',
  'https://indianexpress.com/section/india/feed/',
  'https://www.thehindu.com/news/national/feeder/default.rss',
  'https://www.pmindia.gov.in/en/feed/'
];
const publishers = ['bbc.com', 'bbc.co.uk', 'theguardian.com', 'npr.org','indianexpress.com','thehindu.com','pmindia.gov.in'];
const stopWords = new Set('a an the is are was were be been has have had got from with for and or of to in on at by us president today yesterday news reports report says said'.split(' '));
let feedCache;
let feedExpires = 0;
let feedRequest;
const articleCache=new Map();
const articleRequests=new Map();

function decode(value) {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '})[entity])
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => {
      const point = code[0].toLowerCase() === 'x' ? parseInt(code.slice(1),16) : Number(code);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    });
}
export function plainText(html) {
  const unwrapped = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decode(unwrapped.replace(/<(script|style|nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
export function allowedPublisher(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && publishers.some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain));
  } catch { return false; }
}
async function readLimited(response, maximum = 1200000) {
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (size < maximum) {
      const {value, done} = await reader.read();
      if (done) break;
      const chunk = value.slice(0, maximum - size);
      chunks.push(chunk);
      size += chunk.length;
    }
  } finally { await reader.cancel().catch(() => {}); }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}
export function feedItems(xml) {
  const field = (item, tag) => item.match(new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + tag + '>','i'))?.[1] || '';
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].map(([,item]) => ({
    title:plainText(field(item,'title')), url:decode(field(item,'link')).trim(),
    extract:plainText(field(item,'content:encoded') || field(item,'description')),
    publishedAt:plainText(field(item,'pubDate'))
  })).filter(item => item.title && allowedPublisher(item.url));
}
async function currentItems() {
  if (feedCache && feedExpires > Date.now()) return feedCache;
  if (feedRequest) return feedRequest;
  feedRequest = Promise.all(feeds.map(async url => {
    try {
      const response = await fetch(url,{signal:AbortSignal.timeout(5000)});
      return response.ok ? feedItems(await readLimited(response)) : [];
    } catch { return []; }
  })).then(groups => {
    feedCache = groups.flat();
    feedExpires = Date.now() + (feedCache.length ? 180000 : 5000);
    return feedCache;
  }).finally(() => { feedRequest = null; });
  return feedRequest;
}
export function warmNewsSources() {
  return currentItems().catch(()=>[]);
}
export function rankNews(items, query) {
  const terms = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [])].filter(term => !stopWords.has(term));
  const ranked=items.map(item => {
    const text = (item.title + ' ' + item.extract).toLowerCase();
    const words=new Set(text.match(/[\p{L}\p{N}]+/gu)||[]);
    const matches = terms.filter(term => words.has(term));
    return {item, score:matches.length};
  }).filter(result => result.score > 0).sort((a,b) => b.score - a.score);
  const exact=ranked.filter(result=>result.score>=Math.min(2,terms.length));
  // Partial subject matches are leads for the assessor, never proof of a claim.
  return (exact.length?exact:ranked.slice(0,5)).map(result=>result.item);
}
async function articleSource(item) {
  // Full public RSS text can be evaluated directly. Headlines alone are never used as evidence.
  if (item.extract.length >= 600) return {...item, extract:item.extract.slice(0,9000), type:'publisher-feed'};
  let url = item.url;
  const signal=AbortSignal.timeout(5000);
  for (let attempt=0; attempt<3; attempt++) {
    if (!allowedPublisher(url)) return null;
    const response = await fetch(url,{redirect:'manual',signal});
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) return null;
      url = new URL(location,url).href;
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
      await response.body?.cancel();
      return null;
    }
    const html = await readLimited(response);
    const paragraphs = [...html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map(([,paragraph]) => plainText(paragraph)).filter(text => text.length >= 50);
    const extract = [...new Set(paragraphs)].join('\n').slice(0,9000);
    return extract.length >= 300 ? {...item,url,extract,type:'publisher-article'} : null;
  }
  return null;
}
async function cachedArticle(item) {
  const key=item.url+'\n'+item.publishedAt;
  const cached=articleCache.get(key);
  if(cached && cached.expires>Date.now())return cached.source;
  if(articleRequests.has(key))return articleRequests.get(key);
  const request=articleSource(item).then(source=>{
    if(source){
      articleCache.delete(key);
      if(articleCache.size>=40)articleCache.delete(articleCache.keys().next().value);
      articleCache.set(key,{source,expires:Date.now()+120000});
    }
    return source;
  }).finally(()=>articleRequests.delete(key));
  articleRequests.set(key,request);
  return request;
}
export async function lookupNewsText(query) {
  const items = rankNews(await currentItems(),query);
  const chosen = [];
  const domains = new Set();
  for (const item of items) {
    const domain = new URL(item.url).hostname.replace(/^www\./,'');
    if (!domains.has(domain)) { chosen.push(item); domains.add(domain); }
    if (chosen.length === 4) break;
  }
  const results = await Promise.allSettled(chosen.map(cachedArticle));
  return results.filter(result => result.status === 'fulfilled' && result.value).map(result => result.value);
}
