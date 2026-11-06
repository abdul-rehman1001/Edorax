import {
  app,
  BrowserWindow,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { backendBase } from './api';
import { createNotificationStream, createPreviewClient } from './api';
import { createBrowserAuth } from './auth/browser-auth';

app.setName('Edorax');
const iconFile =
  process.platform === 'darwin' ? 'edorax-dock.png' : 'edorax.png';
const appIcon = app.isPackaged
  ? path.join(process.resourcesPath, iconFile)
  : path.join(app.getAppPath(), 'assets', iconFile);

let mainWindow: BrowserWindow | null = null;
const apiBase = process.env.BUILDMENT_API_URL || 'http://localhost:4000';
const webBase = process.env.BUILDMENT_WEB_URL || 'http://localhost:3000';
const previewClient = createPreviewClient(apiBase);
const notificationStream = createNotificationStream(
  previewClient.openNotificationStream,
  (item) => mainWindow?.webContents.send('mascot:notification', item),
);
const browserAuth = createBrowserAuth(webBase, previewClient.exchange, (url) =>
  shell.openExternal(url),
);
function cancelBrowserAuth() {
  previewClient.cancelSignIn();
  browserAuth.cancel();
}
app.on('before-quit', () => {
  cancelBrowserAuth();
  notificationStream.stop();
});
function requireRenderer(event: IpcMainInvokeEvent) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  )
    throw new Error('Untrusted request');
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
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
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
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  const showLoadError = (error: unknown) => {
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
    ipcMain.handle('course:start-learning', (event, slug) => {
      requireRenderer(event);
      return previewClient.nextLesson(slug);
    });
    ipcMain.handle('app:web-origin', (event) => {
      requireRenderer(event);
      return new URL(webBase).origin;
    });
    ipcMain.handle('app:open-web', (event, path) => {
      requireRenderer(event);
      // App paths only: a mascot's link can never open another site from here.
      if (
        typeof path !== 'string' ||
        !path.startsWith('/') ||
        path.startsWith('//')
      )
        return;
      return shell.openExternal(new URL(path, webBase).href);
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
    ipcMain.handle('learning:track', (event, moment) => {
      requireRenderer(event);
      return previewClient.learning.track(moment);
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
    ipcMain.handle('auth:sign-in', async (event) => {
      requireRenderer(event);
      const result = await browserAuth.start();
      if (result.ok) notificationStream.start();
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
      cancelBrowserAuth();
      notificationStream.stop();
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
