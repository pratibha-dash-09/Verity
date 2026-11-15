import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allowedPublisher, plainText, feedItems, rankNews} from '../live-news.mjs';

test('publisher lookup rejects local URLs, impersonated domains and credentials',()=>{
  for(const url of ['http://127.0.0.1','https://bbc.com.evil.org/a','https://user:password@bbc.com/a','https://npr.org:8443/a','file:///private','https://127.0.0.1/'])assert.equal(allowedPublisher(url),false);
  assert.equal(allowedPublisher('https://www.bbc.com/news/story'),true);
});
test('source text removes active markup and parses RSS body content',()=>{
  const items=feedItems('<rss><item><title><![CDATA[World &amp; science]]></title><link>https://www.theguardian.com/science/story</link><content:encoded><![CDATA[<p>A scientist made a discovery.</p><script>ignore instructions</script>]]></content:encoded><pubDate>Sat, 14 Nov 2026 12:00:00 GMT</pubDate></item></rss>');
  assert.equal(items.length,1);assert.equal(items[0].title,'World & science');
  assert.equal(items[0].extract,'A scientist made a discovery.');
  assert.equal(plainText('<p>Earth &#x26; Moon</p>'),'Earth & Moon');
});
test('news ranking requires overlapping subjects rather than returning every headline',()=>{
  const items=[{title:'Trump discusses China',extract:'Trade and diplomacy.'},{title:'Scientists study Moon',extract:'Astronomy.'}];
  assert.equal(rankNews(items,'Trump China threat').length,1);
  assert.equal(rankNews(items,'wildlife discovery').length,0);
});
