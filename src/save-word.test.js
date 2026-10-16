import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveWord, WORD_MIME } from './save-word';

const mocks = vi.hoisted(() => ({ isTauri: vi.fn(), save: vi.fn(), writeFile: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }));

describe('Word export save', () => {
  const bytes = new Uint8Array([80,75,3,4,1,2,3]);
  let createUrl;
  let revokeUrl;
  beforeEach(() => {
    vi.resetAllMocks();
    createUrl = vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:word-export');
    revokeUrl = vi.spyOn(URL,'revokeObjectURL').mockImplementation(() => {});
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('uses a fresh DOCX-only Save As grant and writes the original bytes', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Documents\\chosen.docx');
    expect(await saveWord(bytes,'report.docx')).toEqual({kind:'saved',path:'C:\\Documents\\chosen.docx'});
    expect(mocks.save).toHaveBeenCalledWith({title:'Export Word document',defaultPath:'report.docx',filters:[{name:'Word documents',extensions:['docx']}]});
    expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Documents\\chosen.docx',bytes);
    expect(mocks.writeFile.mock.calls[0][1]).toBe(bytes);
    expect(createUrl).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue('C:\\Documents\\second.docx');
    await saveWord(bytes);
    expect(mocks.save).toHaveBeenCalledTimes(2);
    expect(mocks.save.mock.calls[1][0].defaultPath).toBe('document.docx');
    expect(mocks.writeFile).toHaveBeenLastCalledWith('C:\\Documents\\second.docx',bytes);
  });
  it('does not write or download if native Save As is cancelled', async () => {
    mocks.isTauri.mockReturnValue(true);mocks.save.mockResolvedValue(null);
    expect(await saveWord(bytes)).toEqual({kind:'cancelled'});
    expect(mocks.writeFile).not.toHaveBeenCalled();expect(createUrl).not.toHaveBeenCalled();
  });
  it('propagates native dialog and write failures without a browser fallback', async () => {
    mocks.isTauri.mockReturnValue(true);mocks.save.mockRejectedValue(new Error('Dialog failed'));
    await expect(saveWord(bytes)).rejects.toThrow('Dialog failed');
    expect(mocks.writeFile).not.toHaveBeenCalled();
    mocks.save.mockResolvedValue('C:\\Documents\\denied.docx');mocks.writeFile.mockRejectedValue(new Error('Permission denied'));
    await expect(saveWord(bytes)).rejects.toThrow('Permission denied');expect(createUrl).not.toHaveBeenCalled();
  });
  it('downloads browser DOCX bytes with the correct MIME and cleans up its own URL', async () => {
    vi.useFakeTimers();mocks.isTauri.mockReturnValue(false);
    const anchor = {click:vi.fn(),remove:vi.fn()};const append = vi.fn();
    vi.stubGlobal('document',{createElement:vi.fn(() => anchor),body:{append}});
    expect(await saveWord(bytes,'browser.docx')).toEqual({kind:'downloaded'});
    const blob = createUrl.mock.calls[0][0];
    expect(blob.type).toBe(WORD_MIME);expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(anchor.download).toBe('browser.docx');expect(anchor.href).toBe('blob:word-export');
    expect(append).toHaveBeenCalledWith(anchor);expect(anchor.click).toHaveBeenCalledOnce();expect(anchor.remove).toHaveBeenCalledOnce();
    expect(revokeUrl).not.toHaveBeenCalled();await vi.runAllTimersAsync();
    expect(revokeUrl).toHaveBeenCalledOnce();expect(revokeUrl).toHaveBeenCalledWith('blob:word-export');
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('rejects empty or non-byte output before opening any save dialog', async () => {
    mocks.isTauri.mockReturnValue(true);
    await expect(saveWord(new Uint8Array())).rejects.toThrow('empty');
    await expect(saveWord(null)).rejects.toThrow('invalid');
    expect(mocks.save).not.toHaveBeenCalled();expect(mocks.writeFile).not.toHaveBeenCalled();
  });
  it('cleans up and reports a failed browser download instead of claiming success', async () => {
    vi.useFakeTimers();mocks.isTauri.mockReturnValue(false);
    const anchor = {click:vi.fn(() => {throw new Error('Download blocked');}),remove:vi.fn()};
    vi.stubGlobal('document',{createElement:vi.fn(() => anchor),body:{append:vi.fn()}});
    await expect(saveWord(bytes)).rejects.toThrow('Download blocked');
    expect(anchor.remove).toHaveBeenCalledOnce();await vi.runAllTimersAsync();
    expect(revokeUrl).toHaveBeenCalledWith('blob:word-export');
  });
  it('rejects a chosen PDF path without writing or rewriting it', async () => {
    mocks.isTauri.mockReturnValue(true);mocks.save.mockResolvedValue('C:\\Documents\\source.pdf');
    await expect(saveWord(bytes)).rejects.toThrow('ending in .docx');
    expect(mocks.writeFile).not.toHaveBeenCalled();expect(createUrl).not.toHaveBeenCalled();
  });
  it('accepts an uppercase DOCX extension and retains the exact selected path', async () => {
    mocks.isTauri.mockReturnValue(true);mocks.save.mockResolvedValue('C:\\Documents\\chosen.DOCX');
    expect(await saveWord(bytes)).toEqual({kind:'saved',path:'C:\\Documents\\chosen.DOCX'});
    expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Documents\\chosen.DOCX',bytes);
  });
});
