export function validateProjectPath(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length > 180 ||
    !value ||
    value
      .split("/")
      .some(
        (part) => !/^[A-Za-z0-9_. -]+$/.test(part) || part === "." || part === ".." || !part.trim(),
      )
  )
    throw new Error(
      "Use a relative project path without .., absolute paths, or special characters.",
    );
}

// Runs inside the container, never against the host filesystem. Paths and every
// existing parent are checked; symlinks and non-regular files are rejected.
export const PROJECT_FILES_SCRIPT = String.raw`
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [action, relative, encoded] = process.argv.slice(1);
const root = '/workspace';
function target(name) {
  if (!name || name.length > 180 || name.split('/').some(p => !/^[A-Za-z0-9_. -]+$/.test(p) || p === '.' || p === '..' || !p.trim())) throw Error('Invalid project path');
  let current = root;
  for (const part of name.split('/')) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw Error('Symbolic links cannot be edited'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return current;
}
try {
  let value = null;
  if (action === 'init') {
    for (const [name, content] of Object.entries({ 'package.json': '{"private":true,"scripts":{"start":"node exercise.js"}}\n', 'README.md': '# Course project\n\nRun npm start or node exercise.js.\n' })) {
      try { fs.writeFileSync(target(name), content, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
    }
    try { fs.mkdirSync(target('src')); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  } else if (action === 'list') {
    const entries = [];
    function walk(dir, prefix, depth) {
      if (depth > 8) return;
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isSymbolicLink() || ['node_modules', '.git'].includes(item.name) || item.name.startsWith('.editor-')) continue;
        const name = prefix + item.name;
        if (name.length > 180 || !/^[A-Za-z0-9_. /-]+$/.test(name)) continue;
        if (!item.isDirectory() && !item.isFile()) continue;
        if (entries.length >= 200) throw Error('Project explorer supports up to 200 entries');
        entries.push({ path: name, kind: item.isDirectory() ? 'directory' : 'file' });
        if (item.isDirectory()) walk(path.join(dir, item.name), name + '/', depth + 1);
      }
    }
    walk(root, '', 0); value = entries;
  } else {
    const file = target(relative);
    if (action === 'read') {
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 65536) throw Error('Only text files up to 64 KB can be opened');
        const data = fs.readFileSync(fd);
        if (data.includes(0) || data.length > 65536) throw Error('Only text files up to 64 KB can be opened');
        value = data.toString('base64');
      } finally { fs.closeSync(fd); }
    } else if (action === 'write') {
      const data = Buffer.from(encoded, 'base64');
      if (data.length > 65536 || data.includes(0)) throw Error('Only text files up to 64 KB can be saved');
      const temp = path.join(path.dirname(file), '.editor-' + crypto.randomUUID());
      try { fs.writeFileSync(temp, data, { flag: 'wx' }); target(relative); fs.renameSync(temp, file); }
      finally { try { fs.unlinkSync(temp); } catch {} }
    } else if (action === 'file') fs.writeFileSync(file, '', { flag: 'wx' });
    else if (action === 'directory') fs.mkdirSync(file);
    else throw Error('Unsupported file action');
  }
  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) { process.stdout.write(JSON.stringify({ ok: false, message: error.message })); process.exitCode = 1; }
`;
