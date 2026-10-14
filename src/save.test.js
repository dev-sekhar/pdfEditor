import { beforeEach, describe, expect, it, vi } from 'vitest';
import { savePdf } from './save';

const mocks = vi.hoisted(() => ({ isTauri: vi.fn(), save: vi.fn(), writeFile: vi.fn(), download: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: mocks.writeFile }));
vi.mock('./pdf', () => ({ download: mocks.download }));

describe('PDF Save As', () => {
  beforeEach(() => vi.resetAllMocks());
  const bytes = new Uint8Array([37, 80, 68, 70]);
  it('writes unchanged PDF bytes only to the path chosen in the dialog', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Docs\\chosen.pdf');
    expect(await savePdf(bytes, 'page.pdf')).toEqual({ kind: 'saved', path: 'C:\\Docs\\chosen.pdf' });
    expect(mocks.save).toHaveBeenCalledWith({ title: 'Save PDF As', defaultPath: 'page.pdf',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }] });
    expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Docs\\chosen.pdf', bytes);
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('does not write or download when the dialog is cancelled', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue(null);
    expect(await savePdf(bytes)).toEqual({ kind: 'cancelled' });
    expect(mocks.writeFile).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('reports write errors instead of silently falling back to a download', async () => {
    mocks.isTauri.mockReturnValue(true);
    mocks.save.mockResolvedValue('C:\\Docs\\chosen.pdf');
    mocks.writeFile.mockRejectedValue(new Error('Permission denied'));
    await expect(savePdf(bytes)).rejects.toThrow('Permission denied');
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it('retains browser downloads outside the desktop app', async () => {
    mocks.isTauri.mockReturnValue(false);
    expect(await savePdf(bytes)).toEqual({ kind: 'downloaded' });
    expect(mocks.download).toHaveBeenCalledWith(bytes, 'edited.pdf');
    expect(mocks.save).not.toHaveBeenCalled();
  });
});

it('saves to an acknowledged current path without opening Save As again', async () => {
  vi.resetAllMocks();
  mocks.isTauri.mockReturnValue(true);
  const bytes = new Uint8Array([37, 80, 68, 70]);
  expect(await savePdf(bytes, 'edited.pdf', 'C:\\Docs\\existing.pdf')).toEqual({ kind: 'saved', path: 'C:\\Docs\\existing.pdf' });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.writeFile).toHaveBeenCalledWith('C:\\Docs\\existing.pdf', bytes);
});
