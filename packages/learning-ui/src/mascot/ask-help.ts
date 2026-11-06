// A mascot can offer to open the "ask a mentor" dialog of the chapter being read. The dialog lives
// in the reader and the bubble lives in the layout, so they meet through one window event.

export const ASK_HELP_EVENT = 'buildment:ask-help';

/** Asks the open chapter's help dialog to show itself; nothing happens on pages without one. */
export function requestAskHelp(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ASK_HELP_EVENT));
}
