import {mkdir, copyFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicFiles=['index.html','fov-calculator.html','narrowband-filter-calculator.html','sky-horizon.js','vendor/astronomy-2.1.19.min.js'];
for(const file of publicFiles){
  const source=await readFile(path.join(root,file),'utf8');
  if(file.endsWith('.js')) new vm.Script(source,{filename:file});
  else for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)){
    if(match[1].trim()) new vm.Script(match[1],{filename:file});
  }
  if(source.includes('file:///')) throw new Error(`Local-only file URL in ${file}`);
  const destination=path.join(root,'dist',file);
  await mkdir(path.dirname(destination),{recursive:true});
  await copyFile(path.join(root,file),destination);
}
console.log(`Validated and packaged ${publicFiles.length} public files.`);
