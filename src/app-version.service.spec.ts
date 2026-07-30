import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppVersionService, compareVersions } from './app-version.service';

/** Lets the tests point the service at a throwaway manifest. */
class TestAppVersionService extends AppVersionService {
  constructor(path: string) {
    super();
    this.manifestPath = path;
  }
}

async function serviceWith(manifest: string | null) {
  const dir = await mkdtemp(join(tmpdir(), 'app-version-'));
  const path = join(dir, 'app-version.json');
  if (manifest !== null) await writeFile(path, manifest, 'utf8');
  return new TestAppVersionService(path);
}

describe('compareVersions', () => {
  it('orders by each numeric segment', () => {
    expect(compareVersions('1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
  });

  it('does not compare segments as strings', () => {
    // '10' > '9' numerically, but '10' < '9' lexically.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
  });

  it('treats missing trailing segments as zero', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.1', '1.2')).toBe(1);
  });
});

describe('AppVersionService.check', () => {
  it('reports an update when the manifest is newer than the installed build', async () => {
    const service = await serviceWith(
      JSON.stringify({
        version: '1.3.0',
        versionCode: 4,
        notes: 'Dev projects',
      }),
    );
    const res = await service.check('1.2.0');
    expect(res.updateAvailable).toBe(true);
    expect(res.latest).toBe('1.3.0');
    expect(res.versionCode).toBe(4);
    expect(res.notes).toBe('Dev projects');
    expect(res.apkUrl).toBe('/downloads/beulah-field.apk');
  });

  it('reports no update when the installed build is current', async () => {
    const service = await serviceWith(
      JSON.stringify({ version: '1.3.0', versionCode: 4 }),
    );
    await expect(service.check('1.3.0')).resolves.toMatchObject({
      updateAvailable: false,
    });
  });

  it('reports no update when the installed build is newer than the manifest', async () => {
    const service = await serviceWith(
      JSON.stringify({ version: '1.2.0', versionCode: 3 }),
    );
    await expect(service.check('1.3.0')).resolves.toMatchObject({
      updateAvailable: false,
    });
  });

  it('never claims an update when the client sends no version', async () => {
    const service = await serviceWith(
      JSON.stringify({ version: '9.9.9', versionCode: 99 }),
    );
    const res = await service.check(undefined);
    expect(res.updateAvailable).toBe(false);
    expect(res.latest).toBe('9.9.9');
  });

  it('degrades quietly when the manifest is missing', async () => {
    const service = await serviceWith(null);
    await expect(service.check('1.2.0')).resolves.toEqual({
      latest: null,
      versionCode: null,
      notes: null,
      apkUrl: '/downloads/beulah-field.apk',
      updateAvailable: false,
    });
  });

  it('degrades quietly when the manifest is malformed JSON', async () => {
    const service = await serviceWith('{ not json');
    await expect(service.check('1.2.0')).resolves.toMatchObject({
      latest: null,
      updateAvailable: false,
    });
  });

  it('rejects a manifest whose version is not dotted-numeric', async () => {
    const service = await serviceWith(
      JSON.stringify({ version: 'v2-beta', versionCode: 5 }),
    );
    await expect(service.check('1.2.0')).resolves.toMatchObject({
      latest: null,
      updateAvailable: false,
    });
  });
});
