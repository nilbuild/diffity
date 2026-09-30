import { describe, expect, it } from 'vitest';
import { updatesSupported, worthOffering } from '../src/features/updates/update-policy';

describe('worthOffering', () => {
  it('offers a version nobody declined', () => {
    expect(worthOffering(null, '0.1.2')).toBe(true);
  });

  it('does not raise a declined version again', () => {
    expect(worthOffering('0.1.2', '0.1.2')).toBe(false);
  });

  it('offers a newer version than the declined one', () => {
    expect(worthOffering('0.1.2', '0.1.3')).toBe(true);
  });
});

describe('updatesSupported', () => {
  it('is on for an installed release', () => {
    expect(updatesSupported({ isTauri: true, dev: false, tauriDebug: 'false' })).toBe(true);
  });

  it('is off under tauri dev', () => {
    expect(updatesSupported({ isTauri: true, dev: true, tauriDebug: 'true' })).toBe(false);
  });

  it('is off for a --debug bundle', () => {
    expect(updatesSupported({ isTauri: true, dev: false, tauriDebug: 'true' })).toBe(false);
  });

  it('is off in a browser', () => {
    expect(updatesSupported({ isTauri: false, dev: false, tauriDebug: undefined })).toBe(false);
  });
});
