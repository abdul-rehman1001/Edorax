import { PROJECT_FILES_SCRIPT, validateProjectPath } from './project-files';
import type { ProjectEntry } from '../domain/labs';
import Docker from 'dockerode';
import { createHash } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PassThrough, type Duplex } from 'node:stream';
import type { LabStatus } from '../domain/labs';

// Multi-platform manifest from Docker Hub's official Node 22 Alpine image.
export const LAB_IMAGE =
  'node@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914';
export function workspaceName(scope: string) {
  return `edorax-code-${createHash('sha256').update(scope).digest('hex').slice(0, 24)}`;
}
const labels = (scope: string) => ({ 'com.edorax.lab': workspaceName(scope) });
export const STARTER = '// Write your course exercise here.\n';
const missing = (error: unknown) =>
  (error as { statusCode?: number })?.statusCode === 404;
export function validateContent(content: unknown): asserts content is string {
  if (
    typeof content !== 'string' ||
    Buffer.byteLength(content) > 64 * 1024 ||
    content.includes('\0')
  )
    throw new Error('The script must be text no larger than 64 KB.');
}
export function containerOptions(scope = 'integration-test') {
  const name = workspaceName(scope);
  return {
    name,
    Image: LAB_IMAGE,
    Labels: labels(scope),
    WorkingDir: '/workspace',
    Cmd: ['sh', '-c', 'while :; do sleep 3600; done'],
    HostConfig: {
      Mounts: [
        {
          Type: 'volume' as const,
          Source: `${name}-workspace`,
          Target: '/workspace',
        },
      ],
      Memory: 256 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      PidsLimit: 64,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges:true'],
      ReadonlyRootfs: true,
      Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=32m' },
      NetworkMode: 'none',
    },
  };
}
export function localDocker() {
  const host = process.env.DOCKER_HOST;
  if (host && !host.startsWith('unix://') && !host.startsWith('npipe://'))
    throw new Error(
      'Local labs require a local Docker socket. Remote DOCKER_HOST is not supported.',
    );
  const socketPath = host
    ? host.replace(/^(unix|npipe):\/\//, '')
    : process.platform === 'win32'
      ? '//./pipe/docker_engine'
      : [
          join(homedir(), '.docker/run/docker.sock'),
          '/var/run/docker.sock',
        ].find(existsSync) || '/var/run/docker.sock';
  return new Docker({ socketPath, timeout: 120_000 });
}

export class LabRuntime {
  private tail: Promise<unknown> = Promise.resolve();
  private terminal?: { id: string; exec: Docker.Exec; stream: Duplex };
  constructor(
    private readonly docker: Docker,
    private readonly emit: (event: {
      id: string;
      data: string;
    }) => void = () => {},
    private readonly scope = 'integration-test',
    private readonly starter = STARTER,
  ) {}
  // Serialize mutations, including terminal attachment, across rapid clicks/navigation.
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work, work);
    this.tail = result.catch(() => {});
    return result;
  }
  private async owned() {
    const container = this.docker.getContainer(workspaceName(this.scope));
    try {
      const info = await container.inspect();
      if (info.Config.Labels?.['com.edorax.lab'] !== workspaceName(this.scope))
        throw new Error(
          'A container with the lab name already exists and is not owned by Edorax.',
        );
      return { container, info };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
  private async running() {
    const resource = await this.owned();
    if (!resource?.info.State.Running)
      throw new Error('Docker lab stopped. Select Start terminal to resume.');
    return resource.container;
  }
  async status(): Promise<LabStatus> {
    try {
      await this.docker.ping();
    } catch {
      return {
        available: false,
        running: false,
        message:
          'Docker is unavailable. Open Docker Desktop, wait for the engine to start, then retry.',
      };
    }
    try {
      const resource = await this.owned();
      return {
        available: true,
        running: Boolean(resource?.info.State.Running),
        message: resource?.info.State.Running
          ? 'Docker lab running'
          : 'Docker lab stopped. Select Start terminal to resume.',
      };
    } catch (error) {
      return {
        available: false,
        running: false,
        message: `Docker workspace is unavailable. ${error instanceof Error ? error.message : 'Retry the status check.'}`,
      };
    }
  }
  private async exec(
    command: string[],
    input?: string,
  ): Promise<{ code: number; output: string }> {
    const container = await this.running();
    const execution = await container.exec({
      Cmd: command,
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: input !== undefined,
      WorkingDir: '/workspace',
    });
    const stream = await execution.start({
      hijack: true,
      stdin: input !== undefined,
    });
    const output = new PassThrough();
    let text = '';
    const decoder = new StringDecoder('utf8');
    output.on('data', (chunk: Buffer) => {
      text = (text + decoder.write(chunk)).slice(-128 * 1024);
    });
    this.docker.modem.demuxStream(stream, output, output);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        stream.destroy();
        reject(new Error('Lab command timed out.'));
      }, 15_000);
      stream.once('end', () => {
        clearTimeout(timer);
        resolve();
      });
      stream.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      if (input !== undefined) stream.end(input);
    });
    return { code: (await execution.inspect()).ExitCode ?? 1, output: text };
  }
  start() {
    return this.serial(async () => {
      let resource = await this.owned();
      if (!resource) {
        try {
          await this.docker.getImage(LAB_IMAGE).inspect();
        } catch (error) {
          if (!missing(error)) throw error;
          const stream = await this.docker.pull(LAB_IMAGE);
          await new Promise<void>((resolve, reject) =>
            this.docker.modem.followProgress(stream, (error) =>
              error ? reject(error) : resolve(),
            ),
          );
        }
        const volume = this.docker.getVolume(
          `${workspaceName(this.scope)}-workspace`,
        );
        try {
          const info = await volume.inspect();
          if (info.Labels?.['com.edorax.lab'] !== workspaceName(this.scope))
            throw new Error('Workspace volume is not owned by Edorax.');
        } catch (error) {
          if (!missing(error)) throw error;
          await this.docker.createVolume({
            Name: `${workspaceName(this.scope)}-workspace`,
            Labels: labels(this.scope),
          });
        }
        await this.docker.createContainer(containerOptions(this.scope));
        resource = await this.owned();
      }
      if (!resource) throw new Error('Could not create lab.');
      if (!resource.info.State.Running) await resource.container.start();
      // Never overwrite learner files when resuming.
      const result = await this.exec([
        'sh',
        '-c',
        'if [ ! -e exercise.js ] && [ ! -L exercise.js ]; then printf "%s" "$1" > exercise.js; fi',
        'init',
        this.starter,
      ]);
      if (result.code)
        throw new Error(result.output || 'Could not initialize workspace.');
      await this.project('init');
    });
  }
  private disconnect() {
    this.terminal?.stream.destroy();
    this.terminal = undefined;
  }
  dispose() {
    this.disconnect();
  }
  stop() {
    return this.serial(async () => {
      this.disconnect();
      const resource = await this.owned();
      if (resource?.info.State.Running) await resource.container.stop({ t: 2 });
    });
  }
  reset() {
    return this.serial(async () => {
      this.disconnect();
      const volume = this.docker.getVolume(
        `${workspaceName(this.scope)}-workspace`,
      );
      try {
        const info = await volume.inspect();
        if (info.Labels?.['com.edorax.lab'] !== workspaceName(this.scope))
          throw new Error('Workspace volume is not owned by Edorax.');
      } catch (error) {
        if (!missing(error)) throw error;
      }
      const resource = await this.owned();
      if (resource) await resource.container.remove({ force: true });
      try {
        await volume.remove();
      } catch (error) {
        if (!missing(error)) throw error;
      }
    });
  }
  private async project(action: string, path = '', content = '') {
    const result = await this.exec([
      'node',
      '-e',
      PROJECT_FILES_SCRIPT,
      action,
      path,
      content,
    ]);
    let response;
    try {
      response = JSON.parse(result.output);
    } catch {
      throw new Error('Could not read the project filesystem.');
    }
    if (!response.ok)
      throw new Error(response.message || 'Project operation failed.');
    return response.value;
  }
  listFiles(): Promise<ProjectEntry[]> {
    return this.serial(() => this.project('list'));
  }
  readProjectFile(path: string): Promise<string> {
    validateProjectPath(path);
    return this.serial(async () =>
      Buffer.from(await this.project('read', path), 'base64').toString('utf8'),
    );
  }
  saveProjectFile(path: string, content: unknown): Promise<void> {
    validateProjectPath(path);
    validateContent(content);
    return this.serial(async () => {
      await this.project(
        'write',
        path,
        Buffer.from(content).toString('base64'),
      );
    });
  }
  createEntry(path: string, kind: string): Promise<void> {
    validateProjectPath(path);
    if (kind !== 'file' && kind !== 'directory')
      throw new Error('Invalid project entry type.');
    return this.serial(async () => {
      await this.project(kind, path);
    });
  }
  readFile() {
    return this.readProjectFile('exercise.js');
  }
  saveFile(content: unknown) {
    return this.saveProjectFile('exercise.js', content);
  }
  openTerminal(id: string) {
    return this.serial(async () => {
      if (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(id))
        throw new Error('Invalid terminal session.');
      this.disconnect();
      const execution = await (
        await this.running()
      ).exec({
        Cmd: ['sh'],
        Tty: true,
        AttachStdin: true,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: '/workspace',
        Env: ['TERM=xterm-256color', 'PS1=lab:/workspace $ '],
      });
      const stream = await execution.start({
        hijack: true,
        stdin: true,
        Tty: true,
      });
      this.terminal = { id, exec: execution, stream };
      const decoder = new StringDecoder('utf8');
      // Apply stream backpressure so noisy commands cannot flood Electron IPC.
      stream.on('data', (chunk: Buffer) => {
        this.emit({ id, data: decoder.write(chunk) });
        stream.pause();
        setTimeout(() => {
          if (!stream.destroyed) stream.resume();
        }, 16);
      });
      stream.on('error', () =>
        this.emit({
          id,
          data: '\r\nTerminal disconnected. Reconnect to continue.\r\n',
        }),
      );
      stream.on('end', () =>
        this.emit({ id, data: '\r\nTerminal session ended.\r\n' }),
      );
    });
  }
  closeTerminal(id: string) {
    return this.serial(async () => {
      if (this.terminal?.id === id) this.disconnect();
    });
  }
  async terminalInput(id: string, data: string) {
    if (typeof data !== 'string' || Buffer.byteLength(data) > 16 * 1024)
      throw new Error('Terminal input too large.');
    if (this.terminal?.id === id) this.terminal.stream.write(data);
  }
  async resizeTerminal(id: string, cols: number, rows: number) {
    if (
      ![cols, rows].every(
        (value) => Number.isInteger(value) && value > 0 && value <= 500,
      )
    )
      throw new Error('Invalid terminal size.');
    if (this.terminal?.id === id)
      await this.terminal.exec.resize({ w: cols, h: rows });
  }
}
