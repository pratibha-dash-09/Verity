import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const assets={};
const files=['index.html','app.js','history.js','input.js','recorder.js','evidence.js','style.css',...(await readdir(new URL('public/assets/',root))).filter(name=>/\.(svg|ttf|txt)$/.test(name)).map(name=>'assets/'+name)];
for(const file of files){
  const bytes=await readFile(new URL('public/'+file,root));
  const type=file.endsWith('.css')?'text/css; charset=utf-8':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.png')?'image/png':file.endsWith('.ttf')?'font/ttf':file.endsWith('.txt')?'text/plain; charset=utf-8':'text/html; charset=utf-8';
  assets[file==='index.html'?'/':'/'+file]={body:bytes.toString('base64'),type};
}
await writeFile(new URL('worker/assets.generated.mjs',root),'export default '+JSON.stringify(assets)+';\n');
await mkdir(new URL('dist/server/',root),{recursive:true});
await mkdir(new URL('dist/.openai/',root),{recursive:true});
await build({absWorkingDir:fileURLToPath(root),entryPoints:['worker/app.mjs'],outfile:'dist/server/index.js',bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true});
await copyFile(new URL('.openai/hosting.json',root),new URL('dist/.openai/hosting.json',root));
console.log('Built self-contained Verity Worker with '+files.length+' public files.');
