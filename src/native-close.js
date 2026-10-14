// Keep the event callback synchronous: Tauri checks preventDefault before
// returning from this callback, before any save dialog or async work finishes.
export function registerNativeCloseProtection({ getState, requestAction, onError,
  loadWindow = () => import('@tauri-apps/api/window').then(module => module.getCurrentWindow()) }) {
  let disposed = false;
  let unlisten;
  const report = (message, cause) => { if (!disposed) onError(`${message}: ${String(cause)}`); };
  const stop = listener => {
    try { Promise.resolve(listener()).catch(cause => report('Close listener cleanup failed', cause)); }
    catch (cause) { report('Close listener cleanup failed', cause); }
  };
  const ready = Promise.resolve().then(loadWindow).then(async nativeWindow => {
    if (disposed) return;
    const listener = await nativeWindow.onCloseRequested(event => {
      if (disposed) return;
      const state = getState();
      if (!state.dirty && !state.busy && !state.pendingAction) return;
      event.preventDefault();
      if (state.busy || state.pendingAction) return;
      requestAction(async () => {
        if (disposed || getState().busy) return false;
        try { await nativeWindow.destroy(); return true; }
        catch (cause) { report('Could not close the window', cause); return false; }
      });
    });
    if (disposed) stop(listener); else unlisten = listener;
  }).catch(cause => report('Close protection unavailable', cause));
  return {
    ready,
    dispose() { disposed = true; if (unlisten) { const listener = unlisten; unlisten = null; stop(listener); } },
  };
}
