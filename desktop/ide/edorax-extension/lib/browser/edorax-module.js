'use strict';
const { ContainerModule } = require('@theia/core/shared/inversify');
const { FrontendApplicationContribution } = require('@theia/core/lib/browser/frontend-application-contribution');
const { OpenerService, open } = require('@theia/core/lib/browser/opener-service');
const { CommandRegistry } = require('@theia/core/lib/common/command');
const { StatusBar, StatusBarAlignment } = require('@theia/core/lib/browser/status-bar/status-bar');
const { ThemeService } = require('@theia/core/lib/browser/theming');
const URI = require('@theia/core/lib/common/uri').default;
require('./workspace.css');
exports.default = new ContainerModule(bind => {
  bind(FrontendApplicationContribution).toDynamicValue(({container}) => ({
    onStart() {
      window.addEventListener('edorax:open-file', event => {
        if (typeof event.detail === 'string' && event.detail.startsWith('file:')) {
          void open(container.get(OpenerService), new URI(event.detail));
        }
      });
      window.addEventListener('edorax:new-terminal', () => {
        try {
          const commands = container.get(CommandRegistry);
          void commands.executeCommand('workbench.action.terminal.toggleTerminal');
        } catch (err) {
          console.error('Failed to toggle terminal:', err);
        }
      });
      window.addEventListener('edorax:reveal-explorer', () => {
        try {
          void container.get(CommandRegistry).executeCommand('workbench.files.action.focusFilesExplorer');
        } catch (err) {
          console.error('Failed to reveal explorer:', err);
        }
      });
      try {
        const themeService = container.get(ThemeService);
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = () => {
          try {
            themeService.setCurrentTheme(media.matches ? 'dark' : 'light', false);
          } catch (err) {
            console.error('Failed to sync OS theme:', err);
          }
        };
        applyTheme();
        media.addEventListener('change', applyTheme);
      } catch (err) {
        console.error('Failed to enable OS theme sync:', err);
      }
      try {
        const statusBar = container.get(StatusBar);
        void statusBar.setElement('edorax-terminal', {
          text: '$(terminal)',
          tooltip: 'Toggle Terminal',
          alignment: StatusBarAlignment.RIGHT,
          command: 'workbench.action.terminal.toggleTerminal',
        });
      } catch (err) {
        console.error('Failed to add terminal status bar item:', err);
      }
      document.documentElement.dataset.edoraxReady = 'true';
    }
  })).inSingletonScope();
});
