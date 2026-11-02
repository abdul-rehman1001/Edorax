const { app } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
let terminal;
let root;
let finished = false;
async function finish(error) {
  if (finished) return;
  finished = true;
  if (terminal) { try { terminal.kill(); } catch {} }
  if (root) await fs.rm(root, { recursive: true, force: true });
  if (error) console.error(error);
  else console.log('PASS: packaged native PTY runs under Electron');
  app.exit(error ? 1 : 0);
}
setTimeout(() => finish(new Error('Native PTY timed out')), 15000);
app.whenReady().then(async () => {
  const modulePath = process.argv[2] || path.resolve(__dirname, '../node_modules/node-pty');
  const pty = require(modulePath);
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'edorax-electron-pty-'));
  let output = '';
  terminal = pty.spawn(process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh', process.platform === 'win32' ? ['-Command', 'Write-Output edorax-native-pty-ok'] : ['-lc', 'printf "%s\\n" edorax-native-pty-ok'], { cwd: root, cols: 80, rows: 24, name: 'xterm-256color', env: process.env });
  terminal.onData(data => { output += data; });
  terminal.onExit(() => finish(output.includes('edorax-native-pty-ok') ? null : new Error('Native PTY produced no expected output')));
}).catch(finish);
