import { promises as fs, constants } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type * as Pty from 'node-pty';
import type { LabStatus, ProjectEntry } from '../domain/labs';
import { validateContent } from './runtime';
import { validateProjectPath } from './project-files';

export class LocalRuntime {
  private started = false;
  private terminal?: { id: string; process: Pty.IPty };
  constructor(
    readonly root: string,
    private readonly pty: typeof Pty,
    private readonly emit: (event: { id: string; data: string }) => void,
  ) {}
  async status(): Promise<LabStatus> {
    return {
      available: true,
      running: this.started,
      message: this.started ? 'Local terminal running' : 'Local folder ready',
    };
  }
  async start() {
    await fs.access(this.root);
    this.started = true;
  }
  async stop() {
    this.dispose();
    this.started = false;
  }
  dispose() {
    const terminal = this.terminal;
    this.terminal = undefined;
    if (terminal) {
      try {
        terminal.process.resume();
        terminal.process.kill();
      } catch {}
    }
  }
  async reset(): Promise<void> {
    throw new Error(
      'Reset is only available for Docker workspaces. Local project files are never bulk-deleted.',
    );
  }
  private async target(relative: string) {
    validateProjectPath(relative);
    let current = this.root;
    for (const part of relative.split('/')) {
      current = path.join(current, part);
      try {
        if ((await fs.lstat(current)).isSymbolicLink())
          throw new Error('Symbolic links cannot be edited.');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    // Resolve parent to enforce selected-folder boundary, including external renames.
    const parent = await fs.realpath(path.dirname(current));
    if (parent !== this.root && !parent.startsWith(this.root + path.sep))
      throw new Error('Path is outside the selected project.');
    return current;
  }
  async listFiles(): Promise<ProjectEntry[]> {
    const entries: ProjectEntry[] = [];
    const walk = async (directory: string, prefix: string, depth: number) => {
      if (depth > 8) return;
      for (const entry of await fs.readdir(directory, {
        withFileTypes: true,
      })) {
        if (
          entry.isSymbolicLink() ||
          ['node_modules', '.git', '.DS_Store'].includes(entry.name) ||
          entry.name.startsWith('.editor-')
        )
          continue;
        const relative = prefix + entry.name;
        try {
          validateProjectPath(relative);
        } catch {
          continue;
        }
        if (!entry.isFile() && !entry.isDirectory()) continue;
        if (entries.length >= 200)
          throw new Error(
            'Project explorer supports up to 200 entries; open a smaller project folder.',
          );
        entries.push({
          path: relative,
          kind: entry.isDirectory() ? 'directory' : 'file',
        });
        if (entry.isDirectory())
          await walk(await this.target(relative), relative + '/', depth + 1);
      }
    };
    await walk(this.root, '', 0);
    return entries;
  }
  async readProjectFile(relative: string) {
    const file = await this.target(relative);
    const handle = await fs.open(
      file,
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 65536)
        throw new Error('Only text files up to 64 KB can be opened.');
      const data = await handle.readFile();
      if (data.includes(0) || data.length > 65536)
        throw new Error('Only text files up to 64 KB can be opened.');
      return data.toString('utf8');
    } finally {
      await handle.close();
    }
  }
  async saveProjectFile(relative: string, content: unknown) {
    validateContent(content);
    const file = await this.target(relative);
    const temp = path.join(path.dirname(file), '.editor-' + randomUUID());
    try {
      await fs.writeFile(temp, content, { flag: 'wx' });
      await this.target(relative);
      await fs.rename(temp, file);
    } finally {
      await fs.unlink(temp).catch(() => {});
    }
  }
  async createEntry(relative: string, kind: string) {
    const file = await this.target(relative);
    if (kind === 'directory') await fs.mkdir(file);
    else if (kind === 'file') await fs.writeFile(file, '', { flag: 'wx' });
    else throw new Error('Invalid project entry type.');
  }
  readFile() {
    return this.readProjectFile('exercise.js');
  }
  saveFile(content: unknown) {
    return this.saveProjectFile('exercise.js', content);
  }
  async openTerminal(id: string) {
    if (!this.started) throw new Error('Start the local terminal first.');
    if (!/^[a-zA-Z0-9-]{1,80}$/.test(id))
      throw new Error('Invalid terminal session.');
    this.dispose();
    const shell =
      process.platform === 'win32'
        ? 'powershell.exe'
        : process.env.SHELL || '/bin/zsh';
    const terminal = this.pty.spawn(
      shell,
      process.platform === 'win32' ? [] : ['-l'],
      {
        cwd: this.root,
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        env: { ...process.env, TERM: 'xterm-256color' },
      },
    );
    this.terminal = { id, process: terminal };
    terminal.onData((data) => {
      if (this.terminal?.id !== id) return;
      this.emit({ id, data });
      terminal.pause();
      setTimeout(() => {
        if (this.terminal?.id === id) terminal.resume();
      }, 16);
    });
    terminal.onExit(() => {
      if (this.terminal?.id === id) this.terminal = undefined;
      this.emit({
        id,
        data: '\r\nTerminal exited. Select Reconnect to open a new shell.\r\n',
      });
    });
  }
  async closeTerminal(id: string) {
    if (this.terminal?.id === id) this.dispose();
  }
  async terminalInput(id: string, data: string) {
    if (typeof data !== 'string' || Buffer.byteLength(data) > 16384)
      throw new Error('Terminal input too large.');
    if (this.terminal?.id === id) this.terminal.process.write(data);
  }
  async resizeTerminal(id: string, cols: number, rows: number) {
    if (![cols, rows].every((n) => Number.isInteger(n) && n > 0 && n <= 500))
      throw new Error('Invalid terminal size.');
    if (this.terminal?.id === id) this.terminal.process.resize(cols, rows);
  }
}
