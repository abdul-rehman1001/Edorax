import { installIDE } from './ide/controller';
import { createRequire } from 'node:module';
import { mkdir, realpath } from 'node:fs/promises';

// Prevent npm lifecycle environment variables from leaking to child processes and breaking tools like nvm
for (const key of Object.keys(process.env)) {
  if (key.toLowerCase().startsWith('npm_')) {
    delete process.env[key];
  }
}

import { LocalRuntime } from './labs/local-runtime';
import {
  app,
  dialog,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { backendBase } from './api';
import { createPreviewClient } from './api';
import { createBrowserAuth } from './auth/browser-auth';

import { LabRuntime, localDocker } from './labs/runtime';

let ideController: ReturnType<typeof installIDE> | undefined;
const locals = new Map<string, LocalRuntime>();
const labs = new Map<string, LabRuntime>();
const runtimeRequire = createRequire(__filename);
function disposeLabs() {
  for (const lab of labs.values()) lab.dispose();
  labs.clear();
  for (const local of locals.values()) local.dispose();
  locals.clear();
}
async function labRuntime(blockId: string) {
  if (
    typeof blockId !== 'string' ||
    !/^(course:)?[a-zA-Z0-9_-]{1,160}$/.test(blockId)
  )
    throw new Error('Invalid course exercise.');
  if (locals.has(blockId)) return locals.get(blockId)!;
  const user = await previewClient.resolveLocalLabUser();
  if (!user) throw new Error('Sign in to open a course workspace.');
  const scope = `${user}:${blockId}`;
  const existing = labs.get(scope);
  if (existing) return existing;
  let starter: string;
  if (blockId.startsWith('course:')) {
    const result = await previewClient.learning.overview(blockId.slice(7));
    if (!result.ok) throw new Error(result.message);
    if (result.data.access !== 'active')
      throw new Error('Enroll in this course to start its workspace.');
    starter = '// Course workspace\nconsole.log("Ready to learn");\n';
  } else {
    const result = await previewClient.learning.block(blockId);
    if (!result.ok) throw new Error(result.message);
    if (
      result.data.type !== 'CODE' ||
      result.data.config.language !== 'javascript'
    )
      throw new Error(
        'This course activity does not support a local code workspace.',
      );
    starter =
      result.data.initialState?.source ?? result.data.config.starterCode;
  }
  if (previewClient.localLabUser() !== user)
    throw new Error('Your session changed. Reopen the workspace.');
  // Recheck after authorization to avoid duplicate runtimes from concurrent requests.
  if (!labs.has(scope))
    labs.set(
      scope,
      new LabRuntime(
        localDocker(),
        (data) => {
          if (mainWindow && !mainWindow.isDestroyed())
            mainWindow.webContents.send('labs:terminal-data', data);
        },
        scope,
        starter,
      ),
    );
  return labs.get(scope)!;
}
app.setName('Edorax');
const iconFile =
  process.platform === 'darwin' ? 'edorax-dock.png' : 'edorax.png';
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, iconFile)
  : path.join(app.getAppPath(), 'assets', iconFile);

let mainWindow: BrowserWindow | null = null;
const apiBase =
  process.env.BUILDMENT_API_URL ||
  'https://buildment-eca06ffd3e8f.herokuapp.com';
const previewClient = createPreviewClient(apiBase);
const browserAuth = createBrowserAuth(
  process.env.BUILDMENT_WEB_URL || 'https://edorax.com',
  previewClient.exchange,
  (url) => shell.openExternal(url),
);
function cancelBrowserAuth() {
  previewClient.cancelSignIn();
  browserAuth.cancel();
}
app.on('before-quit', () => {
  cancelBrowserAuth();
  disposeLabs();
});
function requireRenderer(event: IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error('Untrusted request');
}

function installApplicationMenu() {
  const isMac = process.platform === 'darwin';
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const },
            ],
          },
        ]
      : []),
    { role: 'fileMenu' as const },
    { role: 'editMenu' as const },
    { role: 'viewMenu' as const },
    { role: 'windowMenu' as const },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  if (process.platform === 'darwin') app.dock?.setIcon(appIcon);
  mainWindow = new BrowserWindow({
    title: 'Edorax',
    ...(process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 16, y: 20 },
        }
      : {}),
    icon: appIcon,
    width: 1240,
    height: 840,
    minWidth: 760,
    minHeight: 600,
    // Never expose the native window's empty surface before the first paint.
    show: false,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#141310' : '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const window = mainWindow;
  window.once('ready-to-show', () => {
    if (!window.isDestroyed()) window.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Reading references open in the browser; no remote Electron windows.
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (
      MAIN_WINDOW_VITE_DEV_SERVER_URL &&
      url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)
    )
      return;
    event.preventDefault();
  });
  mainWindow.webContents.on('did-start-loading', () => {
    ideController?.hide();
  });
  // Camera access is requested only by the quiz's explicit opt-in control.
  mainWindow.webContents.session.setPermissionRequestHandler(
    (contents, permission, callback, details) => {
      const trusted =
        contents === mainWindow?.webContents && details.isMainFrame;
      const videoOnly =
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'video';
      callback(Boolean(trusted && permission === 'media' && videoOnly));
    },
  );
  mainWindow.webContents.session.setPermissionCheckHandler(
    (contents, permission, _origin, details) => {
      return (
        contents === mainWindow?.webContents &&
        permission === 'media' &&
        details.mediaType === 'video'
      );
    },
  );
  mainWindow.webContents.on('render-process-gone', () => {
    disposeLabs();
    void ideController?.stop();
  });
  mainWindow.on('closed', () => {
    void ideController?.stop();
    disposeLabs();
    mainWindow = null;
  });
  const showLoadError = (error: unknown) => {
    if (
      MAIN_WINDOW_VITE_DEV_SERVER_URL &&
      (error as { code?: string })?.code === 'ERR_ABORTED' &&
      !window.isDestroyed()
    ) {
      setTimeout(() => {
        if (!window.isDestroyed()) {
          void window
            .loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
            .catch(showLoadError);
        }
      }, 500);
      return;
    }
    console.error('Could not load the Edorax renderer:', error);
    if (window.isDestroyed()) return;
    const html =
      '<!doctype html><html><head><meta charset="utf-8"><title>Edorax</title></head><body style="background:#ffffff;color:#171717;padding:48px;font:16px Segoe UI,sans-serif"><h1>Edorax could not open</h1><p>The local interface could not be loaded.</p><p>Close this window, stop the development command with Ctrl+C, and run <strong>pnpm start</strong> again from the desktop folder.</p></body></html>';
    void window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
    );
  };
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
    void mainWindow
      .loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL)
      .catch(showLoadError);
  else
    void mainWindow
      .loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
      )
      .catch(showLoadError);
}

if (started) app.quit();
else {
  app.whenReady().then(() => {
    app.setAboutPanelOptions({
      applicationName: 'Edorax',
      applicationVersion: app.getVersion(),
    });
    installApplicationMenu();
    ideController = installIDE(() => mainWindow, requireRenderer);
    ipcMain.handle(
      'labs:configure',
      async (event, blockId, mode, createProject) => {
        requireRenderer(event);
        if (
          typeof blockId !== 'string' ||
          !/^(course:)?[a-zA-Z0-9_-]{1,160}$/.test(blockId)
        )
          throw new Error('Invalid workspace.');
        if (mode === 'local') {
          let selectedPath: string;
          if (createProject === true) {
            const selection = await dialog.showSaveDialog(mainWindow!, {
              title: 'Create project folder',
              buttonLabel: 'Create project',
              defaultPath: path.join(
                app.getPath('documents'),
                'edorax-project',
              ),
            });
            if (selection.canceled || !selection.filePath) return null;
            await mkdir(selection.filePath);
            selectedPath = selection.filePath;
          } else {
            const selection = await dialog.showOpenDialog(mainWindow!, {
              title: 'Open local project folder',
              properties: ['openDirectory', 'createDirectory'],
            });
            if (selection.canceled || !selection.filePaths[0]) return null;
            selectedPath = selection.filePaths[0];
          }
          const root = await realpath(selectedPath);
          const pty = runtimeRequire(
            app.isPackaged
              ? path.join(
                  process.resourcesPath,
                  'app.asar/node_modules/node-pty',
                )
              : path.join(app.getAppPath(), 'node_modules/node-pty'),
          );
          labs.get(`${previewClient.localLabUser()}:${blockId}`)?.dispose();
          locals.get(blockId)?.dispose();
          locals.set(
            blockId,
            new LocalRuntime(root, pty, (data) => {
              if (mainWindow && !mainWindow.isDestroyed())
                mainWindow.webContents.send('labs:terminal-data', data);
            }),
          );
          return { mode, folder: root };
        }
        if (mode !== 'docker') throw new Error('Unknown runtime.');
        locals.get(blockId)?.dispose();
        locals.delete(blockId);
        return { mode };
      },
    );
    const labHandlers: Record<
      string,
      (lab: LabRuntime | LocalRuntime, ...args: any[]) => unknown
    > = {
      files: (lab) => lab.listFiles(),
      'file-read': (lab, path) => lab.readProjectFile(path),
      'file-save': (lab, path, content) => lab.saveProjectFile(path, content),
      'file-create': (lab, path, kind) => lab.createEntry(path, kind),
      status: (lab) => lab.status(),
      start: (lab) => lab.start(),
      stop: (lab) => lab.stop(),
      reset: (lab) => lab.reset(),
      'read-file': (lab) => lab.readFile(),
      'save-file': (lab, content) => lab.saveFile(content),
      'terminal-open': (lab, id) => lab.openTerminal(id),
      'terminal-close': (lab, id) => lab.closeTerminal(id),
      'terminal-input': (lab, id, data) => lab.terminalInput(id, data),
      'terminal-resize': (lab, id, cols, rows) =>
        lab.resizeTerminal(id, cols, rows),
    };
    for (const [name, handler] of Object.entries(labHandlers)) {
      ipcMain.handle(`labs:${name}`, async (event, blockId, ...args) => {
        requireRenderer(event);
        return handler(await labRuntime(blockId), ...args);
      });
    }
    ipcMain.handle('course:start-learning', (event, slug) => {
      requireRenderer(event);
      return previewClient.nextLesson(slug);
    });
    ipcMain.handle('app:web-origin', (event) => {
      requireRenderer(event);
      return new URL(process.env.BUILDMENT_WEB_URL || 'http://localhost:3000')
        .origin;
    });
    ipcMain.handle('learning:integrity', (event, path, method, body) => {
      requireRenderer(event);
      return previewClient.integrityRequest(path, method, body);
    });
    ipcMain.handle('learning:lesson', (event, course, chapter) => {
      requireRenderer(event);
      return previewClient.learning.lesson(course, chapter);
    });
    ipcMain.handle('learning:update-track', (event, course, kind, slug) => {
      requireRenderer(event);
      return previewClient.learning.updateTrack(course, kind, slug);
    });
    ipcMain.handle('learning:overview', (event, course) => {
      requireRenderer(event);
      return previewClient.learning.overview(course);
    });
    ipcMain.handle('learning:block', (event, id) => {
      requireRenderer(event);
      return previewClient.learning.block(id);
    });
    ipcMain.handle('learning:ai-interview', (event, id, action, payload) => {
      requireRenderer(event);
      return previewClient.learning.aiInterview(id, action, payload);
    });
    ipcMain.handle('learning:answer', (event, id, payload) => {
      requireRenderer(event);
      return previewClient.learning.answer(id, payload);
    });
    ipcMain.handle('learning:quiz', (event, id) => {
      requireRenderer(event);
      return previewClient.learning.quiz(id);
    });
    ipcMain.handle('learning:submit-quiz', (event, id, answers) => {
      requireRenderer(event);
      return previewClient.learning.submitQuiz(id, answers);
    });
    ipcMain.handle('learning:complete', (event, id) => {
      requireRenderer(event);
      return previewClient.learning.complete(id);
    });
    ipcMain.handle('learning:save-log', (event, id, answers) => {
      requireRenderer(event);
      return previewClient.learning.saveLog(id, answers);
    });
    ipcMain.handle('learning:checklist', (event, id, item, checked) => {
      requireRenderer(event);
      return previewClient.learning.checklist(id, item, checked);
    });
    ipcMain.handle('enrollment:create', (event, courseId) => {
      requireRenderer(event);
      return previewClient.enroll(courseId);
    });
    ipcMain.handle('catalog:detail', (event, slug) => {
      requireRenderer(event);
      return previewClient.courseDetail(slug);
    });
    ipcMain.handle('learner:profile', (event) => {
      requireRenderer(event);
      return previewClient.learnerProfile();
    });
    ipcMain.handle('auth:status', (event) => {
      requireRenderer(event);
      return previewClient.authStatus();
    });
    ipcMain.handle('auth:sign-in', async (event) => {
      requireRenderer(event);
      disposeLabs();
      const result = await browserAuth.start();
      if (result.ok && mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
      return result;
    });
    ipcMain.handle('auth:cancel-sign-in', (event) => {
      requireRenderer(event);
      cancelBrowserAuth();
    });
    ipcMain.handle('auth:sign-out', (event) => {
      requireRenderer(event);
      disposeLabs();
      cancelBrowserAuth();
      return previewClient.signOut();
    });
    ipcMain.handle('catalog:list', (event) => {
      if (
        !mainWindow ||
        event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame
      ) {
        throw new Error('Untrusted request');
      }
      try {
        backendBase(apiBase);
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Invalid backend configuration.',
        };
      }
      return previewClient.listCourses();
    });
    createWindow();
    app.on('activate', () => {
      if (!mainWindow) createWindow();
    });
  });
}
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
