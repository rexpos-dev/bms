# Mobile In-App Update Prompt Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a staff member already has METRIQA Field installed, the app tells them a newer APK exists and one tap installs it over the existing app — keeping their login and data, with no uninstall.

**Architecture:** A public `GET /api/app-version` endpoint reads a small JSON manifest that sits next to the APK in `downloads/`. The mobile app sends its own baked-in version as a query param on launch; the **server** decides whether an update is available (so the version-comparison logic lives where the test suite already is). If it is, the app shows a dismissible banner whose button opens the APK URL in the browser — Android then does an in-place upgrade because the signing keystore is unchanged. Separately, `eas.json` gains `autoIncrement` so every build gets a fresh `versionCode`.

**Tech Stack:** NestJS 11 + Jest (backend), Expo SDK 54 + expo-router + axios (mobile), EAS Build.

## Global Constraints

- **Do not change the Android signing keystore.** In-place upgrades only work while the signature matches. Current credentials: `Build Credentials jLdz1xB9C4 (default)` on EAS project `orbit-console` (`15bee5ca-b863-412c-8d96-51688866934e`). A keystore change forces every user to uninstall and lose their session.
- `downloads/` is **git-ignored** and ephemeral on Railway. The manifest lives there beside the APK; the backend must treat a missing or malformed manifest as "no update known" and never throw.
- The version-check endpoint is **public** (no `@UseGuards`). This backend applies auth per-controller — only `ThrottlerGuard` is global (`src/app.module.ts:86`) — so simply omitting `@UseGuards` makes a controller public.
- Mobile must gain **no new native dependencies**. The check is pure JS over the existing axios instance, so it cannot itself require a rebuild to work.
- Version strings are dotted-numeric (`1.2.0`), matching `mobile/app.json`. No pre-release/build suffixes.
- Backend lint: Prettier via ESLint is enforced. Run `npx eslint <files>` before each commit and fix only your own files — `src/dev-projects.service.ts:133,134,180` and `admin-web/src/pages/DevProjectsPage.tsx` have pre-existing violations that are out of scope.
- Mobile has **no test runner**. Do not add one. All new testable logic belongs on the backend.
- **Run the shell commands below in Git Bash, not PowerShell.** In Windows PowerShell `curl` is an alias for `Invoke-WebRequest`, which parses HTML and prompts on first use — it will fail with "PowerShell is in NonInteractive mode". If you must use PowerShell, call `curl.exe` explicitly, or `Invoke-WebRequest -UseBasicParsing`.
- The production backend already occupies ports **3000 and 3001** (PM2 process `beulah-backend`). Any throwaway instance you start for testing must use a different port or it will die with `EADDRINUSE`.

---

## File Structure

| File | Responsibility |
|---|---|
| `mobile/eas.json` | Add `autoIncrement` to the `production-apk` profile |
| `src/app-version.service.ts` | Read + validate the manifest; compare versions; decide `updateAvailable` |
| `src/app-version.service.spec.ts` | Unit tests for comparison, validation, and the missing-file path |
| `src/app-version.controller.ts` | Public `GET /api/app-version` |
| `src/app-version.module.ts` | Wires controller + service |
| `src/app.module.ts` | Register `AppVersionModule` |
| `mobile/src/app-update.ts` | `installedVersion()` + `checkForUpdate()` against the endpoint |
| `mobile/src/UpdateBanner.tsx` | The dismissible "Update available" banner |
| `mobile/app/_layout.tsx` | Mount the banner above the navigator |
| `scripts/publish-apk.mjs` | Release step: download APK + write the manifest so the two never drift |
| `docs/mobile-release.md` | The release checklist |

---

### Task 1: Give every build a fresh versionCode

Right now every APK ships as `versionCode 1`. Android treats an install of the same `versionCode` as a reinstall rather than an upgrade; some OEM installers refuse it outright with "App not installed". `appVersionSource` is already `remote`, so EAS tracks the counter server-side — this only needs the profile to opt in.

**Files:**
- Modify: `mobile/eas.json:8-16` (the `production-apk` profile)

**Interfaces:**
- Consumes: nothing
- Produces: nothing consumed by later tasks (independent config change)

- [ ] **Step 1: Read the current versionCode EAS has on record**

```bash
cd mobile
npx eas-cli build:version:get --platform android
```

Expected: prints the remote versionCode (currently `1`).

- [ ] **Step 2: Add autoIncrement to the production-apk profile**

Edit `mobile/eas.json` so the `production-apk` profile reads exactly:

```json
    "production-apk": {
      "autoIncrement": true,
      "android": {
        "buildType": "apk"
      },
      "env": {
        "EXPO_PUBLIC_API_URL": "https://0rex-server.tail7dcc9b.ts.net/api",
        "ORG_GRADLE_PROJECT_reactNativeArchitectures": "arm64-v8a"
      }
    },
```

- [ ] **Step 3: Verify the config parses**

```bash
cd mobile
npx eas-cli config --platform android --profile production-apk
```

Expected: prints the resolved config without error. (The versionCode increments on the *next build*, not now.)

- [ ] **Step 4: Commit**

```bash
git add mobile/eas.json
git commit -m "build(mobile): auto-increment versionCode on production-apk builds"
```

---

### Task 2: Version manifest service

**Files:**
- Create: `src/app-version.service.ts`
- Test: `src/app-version.service.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `compareVersions(a: string, b: string): number` — `1` if `a` newer, `-1` if older, `0` if equal
  - `interface AppVersionManifest { version: string; versionCode: number; notes?: string }`
  - `interface AppVersionResponse { latest: string | null; versionCode: number | null; notes: string | null; apkUrl: string; updateAvailable: boolean }`
  - `class AppVersionService` with `check(installed?: string): Promise<AppVersionResponse>` and a `protected manifestPath`

- [ ] **Step 1: Write the failing tests**

Create `src/app-version.service.spec.ts`:

```ts
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
      JSON.stringify({ version: '1.3.0', versionCode: 4, notes: 'Dev projects' }),
    );
    const res = await service.check('1.2.0');
    expect(res.updateAvailable).toBe(true);
    expect(res.latest).toBe('1.3.0');
    expect(res.versionCode).toBe(4);
    expect(res.notes).toBe('Dev projects');
    expect(res.apkUrl).toBe('/downloads/beulah-field.apk');
  });

  it('reports no update when the installed build is current', async () => {
    const service = await serviceWith(JSON.stringify({ version: '1.3.0', versionCode: 4 }));
    await expect(service.check('1.3.0')).resolves.toMatchObject({ updateAvailable: false });
  });

  it('reports no update when the installed build is newer than the manifest', async () => {
    const service = await serviceWith(JSON.stringify({ version: '1.2.0', versionCode: 3 }));
    await expect(service.check('1.3.0')).resolves.toMatchObject({ updateAvailable: false });
  });

  it('never claims an update when the client sends no version', async () => {
    const service = await serviceWith(JSON.stringify({ version: '9.9.9', versionCode: 99 }));
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
    const service = await serviceWith(JSON.stringify({ version: 'v2-beta', versionCode: 5 }));
    await expect(service.check('1.2.0')).resolves.toMatchObject({
      latest: null,
      updateAvailable: false,
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest src/app-version.service.spec.ts
```

Expected: FAIL — `Cannot find module './app-version.service'`.

- [ ] **Step 3: Write the implementation**

Create `src/app-version.service.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';

/** Where the landing page and the mobile app both expect the installer. */
const APK_URL = '/downloads/beulah-field.apk';

const VERSION_PATTERN = /^\d+(\.\d+)*$/;

export interface AppVersionManifest {
  version: string;
  versionCode: number;
  notes?: string;
}

export interface AppVersionResponse {
  latest: string | null;
  versionCode: number | null;
  notes: string | null;
  apkUrl: string;
  updateAvailable: boolean;
}

/**
 * Compare dotted-numeric versions segment by segment. Returns 1 when `a` is
 * newer, -1 when older, 0 when equal. Missing trailing segments count as zero,
 * so '1.2' and '1.2.0' are the same version.
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Serves the "is there a newer APK?" question for the mobile app. The manifest
 * is written next to the APK by scripts/publish-apk.mjs; a missing or invalid
 * file simply means "no update known" — this must never throw, because the
 * mobile app calls it on every launch.
 */
@Injectable()
export class AppVersionService {
  protected manifestPath = join(process.cwd(), 'downloads', 'app-version.json');

  async getManifest(): Promise<AppVersionManifest | null> {
    try {
      const raw = await readFile(this.manifestPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AppVersionManifest>;
      if (typeof parsed.version !== 'string' || !VERSION_PATTERN.test(parsed.version)) {
        return null;
      }
      return {
        version: parsed.version,
        versionCode: typeof parsed.versionCode === 'number' ? parsed.versionCode : 0,
        notes: typeof parsed.notes === 'string' ? parsed.notes : undefined,
      };
    } catch {
      return null;
    }
  }

  async check(installed?: string): Promise<AppVersionResponse> {
    const manifest = await this.getManifest();
    return {
      latest: manifest?.version ?? null,
      versionCode: manifest?.versionCode ?? null,
      notes: manifest?.notes ?? null,
      apkUrl: APK_URL,
      updateAvailable:
        !!manifest && !!installed && compareVersions(manifest.version, installed) > 0,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx jest src/app-version.service.spec.ts
```

Expected: PASS — 10 tests.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/app-version.service.ts src/app-version.service.spec.ts
git add src/app-version.service.ts src/app-version.service.spec.ts
git commit -m "feat(api): app version manifest service"
```

Expected: eslint prints nothing.

---

### Task 3: Public version-check endpoint

**Files:**
- Create: `src/app-version.controller.ts`
- Create: `src/app-version.module.ts`
- Modify: `src/app.module.ts` (import list around line 78)

**Interfaces:**
- Consumes: `AppVersionService.check(installed?: string)` from Task 2
- Produces: `GET /api/app-version?installed=<version>` returning `AppVersionResponse`

- [ ] **Step 1: Write the controller**

Create `src/app-version.controller.ts`:

```ts
import { Controller, Get, Query } from '@nestjs/common';
import { AppVersionService } from './app-version.service';

/**
 * Public on purpose: the mobile app checks for a newer installer on launch,
 * including before anyone has logged in. Auth in this app is applied
 * per-controller, so omitting @UseGuards leaves this open.
 */
@Controller('app-version')
export class AppVersionController {
  constructor(private readonly appVersionService: AppVersionService) {}

  @Get()
  check(@Query('installed') installed?: string) {
    return this.appVersionService.check(installed);
  }
}
```

- [ ] **Step 2: Write the module**

Create `src/app-version.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AppVersionController } from './app-version.controller';
import { AppVersionService } from './app-version.service';

@Module({
  controllers: [AppVersionController],
  providers: [AppVersionService],
})
export class AppVersionModule {}
```

- [ ] **Step 3: Register the module**

In `src/app.module.ts`, add the import near the other module imports at the top:

```ts
import { AppVersionModule } from './app-version.module';
```

and add `AppVersionModule,` to the `imports` array, immediately after `NenposClientsModule,`.

- [ ] **Step 4: Verify it compiles and serves**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: no output.

Then start the app and probe the endpoint. In one shell (port 3005 because 3000/3001 are taken by the running PM2 instance):

```bash
npx nest build && PORT=3005 node dist/main.js
```

In another (the manifest does not exist yet, so this proves the graceful path):

```bash
curl -s "http://127.0.0.1:3005/api/app-version?installed=1.2.0"
```

Expected exactly:

```json
{"latest":null,"versionCode":null,"notes":null,"apkUrl":"/downloads/beulah-field.apk","updateAvailable":false}
```

Now write a manifest and probe again:

```bash
echo '{"version":"1.3.0","versionCode":2,"notes":"Dev projects on mobile"}' > downloads/app-version.json
curl -s "http://127.0.0.1:3005/api/app-version?installed=1.2.0"
```

Expected: `"updateAvailable":true` and `"latest":"1.3.0"`.

Stop the server.

- [ ] **Step 5: Lint and commit**

```bash
npx eslint src/app-version.controller.ts src/app-version.module.ts src/app.module.ts
git add src/app-version.controller.ts src/app-version.module.ts src/app.module.ts
git commit -m "feat(api): public GET /app-version endpoint"
```

---

### Task 4: Mobile update check

**Files:**
- Create: `mobile/src/app-update.ts`

**Interfaces:**
- Consumes: `GET /app-version` from Task 3; `api` and `fileUrl` from `mobile/src/api.ts`
- Produces:
  - `installedVersion(): string`
  - `interface UpdateInfo { latest: string; notes: string | null; apkUrl: string }`
  - `checkForUpdate(): Promise<UpdateInfo | null>` — resolves `null` when up to date or unreachable

- [ ] **Step 1: Write the module**

Create `mobile/src/app-update.ts`:

```ts
import Constants from 'expo-constants';
import { api, fileUrl } from './api';

export interface UpdateInfo {
  latest: string;
  notes: string | null;
  /** Absolute URL of the APK on the active backend. */
  apkUrl: string;
}

interface AppVersionResponse {
  latest: string | null;
  versionCode: number | null;
  notes: string | null;
  apkUrl: string;
  updateAvailable: boolean;
}

/** The version baked into this build from app.json. */
export function installedVersion(): string {
  return Constants.expoConfig?.version ?? '0.0.0';
}

/**
 * Ask the backend whether a newer APK is published. The server does the
 * comparison, so this stays a dumb fetch. Any failure (offline, old backend
 * without the endpoint) resolves to null — never surface a network error for
 * a background check.
 */
export async function checkForUpdate(): Promise<UpdateInfo | null> {
  try {
    const { data } = await api.get<AppVersionResponse>('/app-version', {
      params: { installed: installedVersion() },
      timeout: 8000,
    });
    if (!data.updateAvailable || !data.latest) return null;
    return {
      latest: data.latest,
      notes: data.notes,
      apkUrl: fileUrl(data.apkUrl),
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd mobile
npx tsc --noEmit -p tsconfig.json
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/app-update.ts
git commit -m "feat(mobile): check the backend for a newer APK"
```

---

### Task 5: Update banner

**Files:**
- Create: `mobile/src/UpdateBanner.tsx`
- Modify: `mobile/app/_layout.tsx`

**Interfaces:**
- Consumes: `checkForUpdate()`, `UpdateInfo` from Task 4
- Produces: `<UpdateBanner />` — self-contained, takes no props

- [ ] **Step 1: Write the banner**

Create `mobile/src/UpdateBanner.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { checkForUpdate, type UpdateInfo } from './app-update';

/**
 * Sits above the navigator and appears only when the backend advertises a
 * newer APK. "Update" opens the installer in the browser; because the signing
 * keystore is unchanged, Android installs it over the existing app and keeps
 * the user's session and data.
 */
export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void checkForUpdate().then((result) => {
      if (!cancelled) setInfo(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!info || dismissed) return null;

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Update available — v{info.latest}</Text>
        <Text style={styles.body} numberOfLines={2}>
          {info.notes ?? 'Installs over your current app. Your login stays.'}
        </Text>
      </View>
      <Pressable style={styles.cta} onPress={() => void Linking.openURL(info.apkUrl)}>
        <Text style={styles.ctaText}>Update</Text>
      </Pressable>
      <Pressable style={styles.close} onPress={() => setDismissed(true)} hitSlop={8}>
        <Text style={styles.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: '#1f2937',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  title: { color: '#fff', fontWeight: '700', fontSize: 13 },
  body: { color: '#d1d5db', fontSize: 11, marginTop: 2 },
  cta: { backgroundColor: '#6d28d9', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  close: { paddingHorizontal: 4 },
  closeText: { color: '#9ca3af', fontSize: 15, fontWeight: '700' },
});
```

- [ ] **Step 2: Mount it above the navigator**

In `mobile/app/_layout.tsx`, add the import:

```tsx
import { UpdateBanner } from '@/UpdateBanner';
```

and render it as the last child of `<AuthProvider>`, directly after the closing `</Stack>`:

```tsx
        </Stack>
        <UpdateBanner />
      </AuthProvider>
```

- [ ] **Step 3: Typecheck and bundle**

```bash
cd mobile
npx tsc --noEmit -p tsconfig.json
npx expo export --platform android --output-dir /tmp/metriqa-export-check --clear
```

Expected: typecheck silent; export ends with `Exported:` and no error. The export is what catches a bad import path or an invalid style — a typecheck alone will not.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/UpdateBanner.tsx mobile/app/_layout.tsx
git commit -m "feat(mobile): in-app update banner"
```

---

### Task 6: Release script that keeps APK and manifest in sync

The failure mode this prevents: publishing a new APK but forgetting the manifest (nobody is prompted), or bumping the manifest without the APK (everyone is prompted to download a stale file).

**Files:**
- Create: `scripts/publish-apk.mjs`
- Create: `docs/mobile-release.md`

**Interfaces:**
- Consumes: `mobile/app.json` `expo.version`; an EAS artifact URL
- Produces: `downloads/beulah-field.apk`, `downloads/beulah-field-prev.apk`, `downloads/app-version.json`

- [ ] **Step 1: Write the script**

Create `scripts/publish-apk.mjs`:

```js
#!/usr/bin/env node
// Publish a freshly built APK: back up the current one, download the new one,
// then write the manifest the mobile app polls. Run from the repo root:
//   node scripts/publish-apk.mjs <eas-artifact-url> [--notes "What changed"]
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const [, , url, ...rest] = process.argv;
if (!url?.startsWith('http')) {
  console.error('Usage: node scripts/publish-apk.mjs <eas-artifact-url> [--notes "..."]');
  process.exit(1);
}
const notesFlag = rest.indexOf('--notes');
const notes = notesFlag === -1 ? undefined : rest[notesFlag + 1];

const root = process.cwd();
const downloads = join(root, 'downloads');
const apk = join(downloads, 'beulah-field.apk');

await mkdir(downloads, { recursive: true });

// Download and validate BEFORE touching anything on disk, so a failed release
// leaves both the live APK and the rollback copy intact.
console.log('Downloading', url);
const res = await fetch(url);
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status}`);
  process.exit(1);
}
const bytes = Buffer.from(await res.arrayBuffer());
if (bytes.subarray(0, 2).toString() !== 'PK') {
  console.error('Downloaded file is not an APK (missing PK zip header).');
  process.exit(1);
}

// Only now is it safe to rotate the outgoing build out of the way.
try {
  await stat(apk);
  await copyFile(apk, join(downloads, 'beulah-field-prev.apk'));
  console.log('Backed up current APK -> beulah-field-prev.apk');
} catch {
  console.log('No existing APK to back up.');
}

await writeFile(apk, bytes);
console.log(`Wrote ${apk} (${(bytes.length / 1024 / 1024).toFixed(2)} MB)`);

const appJson = JSON.parse(await readFile(join(root, 'mobile', 'app.json'), 'utf8'));
const version = appJson.expo.version;
const manifest = { version, versionCode: 0, ...(notes ? { notes } : {}) };
await writeFile(join(downloads, 'app-version.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('Wrote downloads/app-version.json ->', JSON.stringify(manifest));
console.log('\nDone. Existing installs older than', version, 'will now be prompted to update.');
```

- [ ] **Step 2: Verify the script's guards work**

```bash
node scripts/publish-apk.mjs
```

Expected: prints the usage line and exits 1.

```bash
node scripts/publish-apk.mjs https://example.com/not-an-apk
```

Expected: fails with either a download error or "Downloaded file is not an APK" — and it must leave **both** the live APK and the rollback copy untouched (validation happens before any write). Confirm with:

```bash
ls -la downloads/beulah-field.apk downloads/beulah-field-prev.apk
```

Expected: both mtimes unchanged.

- [ ] **Step 3: Write the release checklist**

Create `docs/mobile-release.md`:

```markdown
# Mobile release checklist

The APK is distributed by direct install from the landing page — there is no
Play Store. Existing installs upgrade in place and keep their login **only**
while the signing keystore stays the same (`jLdz1xB9C4` on EAS project
`orbit-console`). Never regenerate it.

1. Bump `expo.version` in `mobile/app.json` (e.g. `1.2.0` -> `1.3.0`).
   `versionCode` is handled by EAS `autoIncrement` — do not set it by hand.
2. Commit and push to `master`. EAS builds from committed git state.
3. Build:
   ```bash
   cd mobile
   npx eas-cli build --platform android --profile production-apk --non-interactive --no-wait
   ```
   Confirm the log line reads `Using Keystore from configuration: Build Credentials jLdz1xB9C4`.
   A different keystore means every user must uninstall first — stop and investigate.
4. When it finishes, grab the artifact URL:
   ```bash
   npx eas-cli build:view <build-id> --json
   ```
5. Publish from the repo root:
   ```bash
   node scripts/publish-apk.mjs <artifact-url> --notes "What changed"
   ```
6. Verify the server is serving the new file and advertising it:
   ```bash
   curl -sI https://0rex-server.tail7dcc9b.ts.net/downloads/beulah-field.apk | head -3
   curl -s "https://0rex-server.tail7dcc9b.ts.net/api/app-version?installed=1.0.0"
   ```
   The second must report `"updateAvailable":true` with the new version.

No backend restart is needed — `ServeStaticModule` and the manifest are both
read from disk per request.
```

- [ ] **Step 4: Commit**

```bash
git add scripts/publish-apk.mjs docs/mobile-release.md
git commit -m "chore: APK publish script + mobile release checklist"
```

---

### Task 7: Ship it

The banner only reaches users who install a build that *contains* the banner. This release is therefore the last one that existing 1.2.0 users must install manually; from 1.3.0 onward they get prompted.

**Files:**
- Modify: `mobile/app.json` (`expo.version`)

**Interfaces:**
- Consumes: everything above
- Produces: a published 1.3.0 APK plus the manifest that advertises it

- [ ] **Step 1: Bump the version**

In `mobile/app.json` set `"version": "1.3.0"`.

- [ ] **Step 2: Run every check**

```bash
npx tsc --noEmit -p tsconfig.json
npx jest
cd mobile && npx tsc --noEmit -p tsconfig.json && cd ..
```

Expected: typechecks silent; jest reports all suites passing (74 existing + 10 new).

- [ ] **Step 3: Commit and push**

```bash
git add mobile/app.json
git commit -m "release(mobile): 1.3.0 — in-app update prompt"
git push origin master
```

- [ ] **Step 4: Build**

```bash
cd mobile
npx eas-cli build --platform android --profile production-apk --non-interactive --no-wait
```

Confirm the output includes `Build Credentials jLdz1xB9C4`. Note the build id.

- [ ] **Step 5: Publish when the build finishes**

```bash
cd mobile && npx eas-cli build:view <build-id> --json
cd .. && node scripts/publish-apk.mjs <artifact-url> --notes "Dev projects and in-app updates"
```

- [ ] **Step 6: Verify end to end**

```bash
curl -s "http://127.0.0.1:3001/api/app-version?installed=1.2.0"
```

Expected: `"updateAvailable":true`, `"latest":"1.3.0"`.

```bash
curl -s "http://127.0.0.1:3001/api/app-version?installed=1.3.0"
```

Expected: `"updateAvailable":false`.

Then confirm the new `versionCode` actually incremented:

```bash
cd mobile && npx eas-cli build:version:get --platform android
```

Expected: `2` (or higher), not `1`.

- [ ] **Step 7: Confirm on a real device**

Install the 1.3.0 APK on a phone that already has 1.2.0. Expected: Android shows
"Do you want to install an update to this existing application? Your existing
data will not be lost" — **not** a fresh install prompt. After the update, the
app opens still logged in.

This is the one check nothing else substitutes for. If Android instead offers a
clean install, the signature changed — stop and compare the keystore before
distributing.

---

## Notes on what this does *not* do

- **No OTA.** Every update still requires downloading and tapping an APK. If you
  later want JS-only changes to land silently, that is `expo-updates` + EAS
  Update — a separate plan, and it would make this banner redundant for most
  releases.
- **No forced updates.** The banner is always dismissible. Adding a `mandatory`
  flag to the manifest and blocking the UI is a small change on top of Task 2,
  but nothing here needs it yet.
- **Dismissal is per app-launch,** not remembered across restarts. Persisting
  "skip this version" would mean another SecureStore key; skipped as unneeded.
