export const HISTORY_LIMIT = 30;

export function createHistory() {
  return {
    past: [],
    present: { sources: [], pages: [], index: 0, bytes: null, label: '' },
    future: [],
  };
}

export function historyReducer(state, action) {
  switch (action.type) {
    case 'commit':
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: action.document,
        future: [],
      };
    case 'select':
      return {
        ...state,
        present: {
          ...state.present,
          index: Math.max(0, Math.min(action.index, state.present.pages.length - 1)),
        },
      };
    case 'undo':
      if (!state.past.length) return state;
      return {
        past: state.past.slice(0, -1),
        present: state.past.at(-1),
        future: [state.present, ...state.future],
      };
    case 'redo':
      if (!state.future.length) return state;
      return {
        past: [...state.past, state.present].slice(-HISTORY_LIMIT),
        present: state.future[0],
        future: state.future.slice(1),
      };
    default:
      return state;
  }
}

export function historyShortcut(event) {
  const target = event.target;
  if (target?.closest?.('input, textarea, select, [contenteditable="true"], dialog[open]')) return null;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}
