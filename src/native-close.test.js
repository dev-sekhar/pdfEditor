import { describe, expect, it, vi } from 'vitest';
import { registerNativeCloseProtection } from './native-close';

async function harness(initial = {}) {
  let state = { dirty: false, busy: false, pendingAction: false, ...initial };
  let close;
  let continuation;
  const unlisten = vi.fn();
  const nativeWindow = { destroy: vi.fn().mockResolvedValue(undefined),
    onCloseRequested: vi.fn(async callback => { close = callback; return unlisten; }) };
  const onError = vi.fn();
  const requestAction = vi.fn(action => { continuation = action; });
  const protection = registerNativeCloseProtection({ getState: () => state, requestAction, onError,
    loadWindow: async () => nativeWindow });
  await protection.ready;
  return { nativeWindow, unlisten, requestAction, onError, protection,
    setState: patch => { state = { ...state, ...patch }; },
    close: () => { const event = { preventDefault: vi.fn() }; close(event); return event; },
    continue: () => continuation() };
}

describe('native close protection', () => {
  it('allows normal clean close without destroying the window or prompting', async () => {
    const h = await harness();
    expect(h.close().preventDefault).not.toHaveBeenCalled();
    expect(h.requestAction).not.toHaveBeenCalled();
    expect(h.nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it('blocks dirty close synchronously, and destroys only after the guarded continuation runs', async () => {
    const h = await harness({ dirty: true });
    const event = h.close();
    // No microtask has run since close() returned; prevention must already exist.
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(h.requestAction).toHaveBeenCalledOnce();
    expect(h.nativeWindow.destroy).not.toHaveBeenCalled();
    // Cancel or unsuccessful/cancelled save leaves the continuation uncalled.
    await Promise.resolve();
    expect(h.nativeWindow.destroy).not.toHaveBeenCalled();
    // Both explicit discard and successful save use this same continuation.
    expect(await h.continue()).toBe(true);
    expect(h.nativeWindow.destroy).toHaveBeenCalledOnce();
  });

  it('uses fresh dirty state after saving, rather than the state at registration', async () => {
    const h = await harness({ dirty: true });
    h.setState({ dirty: false });
    expect(h.close().preventDefault).not.toHaveBeenCalled();
    h.setState({ dirty: true });
    expect(h.close().preventDefault).toHaveBeenCalledOnce();
    expect(h.requestAction).toHaveBeenCalledOnce();
  });

  it('blocks busy and already-pending close without replacing an existing save/discard/cancel prompt', async () => {
    const h = await harness({ busy: true });
    expect(h.close().preventDefault).toHaveBeenCalledOnce();
    h.setState({ busy: false, dirty: true, pendingAction: true });
    expect(h.close().preventDefault).toHaveBeenCalledOnce();
    expect(h.requestAction).not.toHaveBeenCalled();
    expect(h.nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it('does not execute a stale continuation while a save is busy or after disposal', async () => {
    const h = await harness({ dirty: true });
    h.close();
    h.setState({ busy: true });
    expect(await h.continue()).toBe(false);
    h.setState({ busy: false }); h.protection.dispose();
    expect(await h.continue()).toBe(false);
    expect(h.nativeWindow.destroy).not.toHaveBeenCalled();
  });

  it('reports destroy rejection without an unhandled rejection or losing the document', async () => {
    const h = await harness({ dirty: true });
    h.nativeWindow.destroy.mockRejectedValue(new Error('Permission denied'));
    h.close();
    expect(await h.continue()).toBe(false);
    expect(h.onError).toHaveBeenCalledWith('Could not close the window: Error: Permission denied');
    expect(h.close().preventDefault).toHaveBeenCalledOnce();
  });

  it('cleans up exactly once and ignores callbacks from a disposed registration', async () => {
    const h = await harness({ dirty: true });
    h.protection.dispose(); h.protection.dispose();
    expect(h.unlisten).toHaveBeenCalledOnce();
    h.close();
    expect(h.requestAction).not.toHaveBeenCalled();
  });

  it('immediately removes a listener whose async registration resolves after disposal', async () => {
    let resolve;
    const unlisten = vi.fn();
    const nativeWindow = { onCloseRequested: vi.fn(() => new Promise(done => { resolve = done; })) };
    const onError = vi.fn();
    const h = registerNativeCloseProtection({ getState: () => ({ dirty: true }), requestAction: vi.fn(), onError,
      loadWindow: () => nativeWindow });
    // Allow native onCloseRequested to start but leave registration pending.
    await Promise.resolve(); await Promise.resolve();
    expect(nativeWindow.onCloseRequested).toHaveBeenCalledOnce();
    h.dispose(); resolve(unlisten); await h.ready;
    expect(unlisten).toHaveBeenCalledOnce();
    expect(onError).not.toHaveBeenCalled();
  });

  it('does not register or report errors after disposal during async module loading', async () => {
    let reject;
    const onError = vi.fn();
    const h = registerNativeCloseProtection({ getState: vi.fn(), requestAction: vi.fn(), onError,
      loadWindow: () => new Promise((_, fail) => { reject = fail; }) });
    await Promise.resolve(); h.dispose(); reject(new Error('Module unavailable')); await h.ready;
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports unavailable modules and failed native registration without rejecting ready', async () => {
    for (const loadWindow of [() => Promise.reject(new Error('Module unavailable')),
      () => ({ onCloseRequested: () => Promise.reject(new Error('Listener denied')) })]) {
      const onError = vi.fn();
      const h = registerNativeCloseProtection({ getState: vi.fn(), requestAction: vi.fn(), onError, loadWindow });
      await expect(h.ready).resolves.toBeUndefined();
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/^Close protection unavailable:/));
      h.dispose();
    }
  });
});
