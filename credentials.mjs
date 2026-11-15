// Only validate safe transport here. Google decides whether the credential is valid.
export function isSafeApiKey(key){
 return typeof key==='string'&&key.length>=20&&key.length<=512&&/^[A-Za-z0-9._-]+$/.test(key);
}
