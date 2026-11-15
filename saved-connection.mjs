import {execFile} from 'node:child_process';
import {readFile,writeFile,rename,rm} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

const location=fileURLToPath(new URL('./.verity-connection',import.meta.url));
function windowsProtect(input,restore){
  const command = restore
    ? "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()); [Console]::Write([Net.NetworkCredential]::new('',$s).Password)"
    : "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd()) -AsPlainText -Force; [Console]::Write((ConvertFrom-SecureString $s))";
  return new Promise((resolve,reject)=>{
    const child=execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],
      {windowsHide:true,timeout:15000},(error,stdout)=>error||!stdout?reject(new Error('Windows credential storage unavailable')):resolve(stdout));
    child.stdin.on('error',reject);
    child.stdin.end(input);
  });
}
export async function saveConnection(connection,path=location){
  const protectedData=await windowsProtect(JSON.stringify(connection),false);
  const temporary=path+'.'+randomUUID();
  try {
    await writeFile(temporary,protectedData,{flag:'wx',mode:0o600});
    await rename(temporary,path);
  } finally {await rm(temporary,{force:true});}
}
export async function loadConnection(path=location){
  let encrypted;
  try {encrypted=await readFile(path,'utf8');} catch(error){if(error.code==='ENOENT')return null;throw error;}
  return JSON.parse(await windowsProtect(encrypted,true));
}
