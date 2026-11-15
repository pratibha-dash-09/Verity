import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isSafeApiKey} from '../credentials.mjs';
test('accepts modern authorization keys without requiring the legacy prefix',()=>{
 assert.equal(isSafeApiKey('AQ.'+'a'.repeat(60)),true);
 assert.equal(isSafeApiKey('AIza'+'b'.repeat(35)),true);
});
test('rejects unsafe or malformed credential input before contacting Google',()=>{
 for(const key of [null,{},'', 'short', 'AQ.'+'a'.repeat(600),'AQ.'+'a'.repeat(30)+'\r\nInjected: header'])assert.equal(isSafeApiKey(key),false);
});
