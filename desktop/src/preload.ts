import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { NotificationItem } from '../../server/src/shared/api/notifications';
import type { DesktopAPI } from './domain/catalog';

const api: DesktopAPI = {
  platform: process.platform,
  webOrigin: () => ipcRenderer.invoke('app:web-origin'),
  openWeb: (path) => ipcRenderer.invoke('app:open-web', path),
  onNotification: (listener) => {
    const forward = (_event: IpcRendererEvent, item: NotificationItem) =>
      listener(item);
    ipcRenderer.on('mascot:notification', forward);
    return () => ipcRenderer.removeListener('mascot:notification', forward);
  },
  integrityRequest: (path, method, body) =>
    ipcRenderer.invoke('learning:integrity', path, method, body),
  learning: {
    updateTrack: (course, kind, slug) =>
      ipcRenderer.invoke('learning:update-track', course, kind, slug),
    quiz: (id) => ipcRenderer.invoke('learning:quiz', id),
    submitQuiz: (id, answers) =>
      ipcRenderer.invoke('learning:submit-quiz', id, answers),
    lesson: (course, chapter) =>
      ipcRenderer.invoke('learning:lesson', course, chapter),
    overview: (course) => ipcRenderer.invoke('learning:overview', course),
    block: (id) => ipcRenderer.invoke('learning:block', id),
    aiInterview: (id, action, payload) =>
      ipcRenderer.invoke('learning:ai-interview', id, action, payload),
    answer: (id, payload) => ipcRenderer.invoke('learning:answer', id, payload),
    complete: (id) => ipcRenderer.invoke('learning:complete', id),
    saveLog: (id, answers) =>
      ipcRenderer.invoke('learning:save-log', id, answers),
    track: (event) => ipcRenderer.invoke('learning:track', event),
    checklist: (id, item, checked) =>
      ipcRenderer.invoke('learning:checklist', id, item, checked),
  },
  startLearning: (slug) => ipcRenderer.invoke('course:start-learning', slug),
  enroll: (courseId) => ipcRenderer.invoke('enrollment:create', courseId),
  listCourses: () => ipcRenderer.invoke('catalog:list'),
  courseDetail: (slug) => ipcRenderer.invoke('catalog:detail', slug),
  signIn: () => ipcRenderer.invoke('auth:sign-in'),
  cancelSignIn: () => ipcRenderer.invoke('auth:cancel-sign-in'),
  signOut: () => ipcRenderer.invoke('auth:sign-out'),
};
contextBridge.exposeInMainWorld('buildment', api);
