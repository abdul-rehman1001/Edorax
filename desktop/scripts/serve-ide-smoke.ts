import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TheiaRuntime } from '../src/ide/runtime';
async function main() {
  const root = await mkdtemp(path.join(tmpdir(), 'edorax-theia-check-'));
  await writeFile(path.join(root,'hello.js'), 'console.log("Hello from Edorax");\n');
  await writeFile(path.join(root,'index.html'), '<h1>Edorax project preview</h1>');
  const runtime = new TheiaRuntime(path.resolve('desktop/ide'), path.join(root,'.config'));
  const current = await runtime.start(root,'http://127.0.0.1:5173');
  const unauthorized = await fetch(current.url);
  if (unauthorized.status !== 403) throw new Error('Unauthenticated IDE access was not blocked');
  const headers = {'X-Edorax-IDE-Token': runtime.authentication()};
  const authenticated = await fetch(current.url, {headers});
  if(authenticated.status !== 200) throw new Error(`IDE HTTP ${authenticated.status}`);
  const foreignOrigin = await fetch(current.url, {headers:{...headers,Origin:'https://example.com'}});
  if(foreignOrigin.status !== 403) throw new Error('Foreign origin was not blocked');
  await writeFile('/tmp/edorax-theia-check.json', JSON.stringify({...current, token:runtime.authentication(),pid:process.pid}), {mode:0o600});
  console.log(`READY ${current.url} — authentication checks passed; project ${root}`);
  const stop = async () => {await runtime.stop(); await rm(root,{recursive:true,force:true}); await rm('/tmp/edorax-theia-check.json',{force:true}); process.exit(0);};
  process.on('SIGTERM',stop); process.on('SIGINT',stop);
}
void main().catch(error => {console.error(error); process.exit(1);});
