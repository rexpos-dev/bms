/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { runSqliteMigrations } from './sqlite-migrator';
import type { SyncAgentService } from './sync-agent.service';

/**
 * End-to-end offline sync: a REAL server process (built from this repo) on a scratch
 * MySQL database + two desktop instances (real AppModule in desktop mode, own SQLite file
 * each) that sync with it. The server is genuinely killed and restarted to simulate outages.
 *
 *   SYNC_TEST_DATABASE_URL=mysql://root:…@localhost:3306/sdlmp_sync_test  npx jest src/sync.e2e.spec.ts
 *   (SYNC_E2E_SKIP_BUILD=1 reuses .e2e-dist from a previous run)
 *
 * The database MUST be a scratch database (name ends in `_test`, built via `prisma migrate
 * deploy`); the suite refuses to run against anything else. Requires `npm run gen:sqlite`.
 */
const url = process.env.SYNC_TEST_DATABASE_URL;
const root = join(__dirname, '..');
const ready =
  !!url &&
  /\/[^/?]+_test(\?|$)/.test(url) &&
  existsSync(join(root, 'generated', 'sqlite-client'));
const suite = ready ? describe : describe.skip;

const PORT = 38591;
const SERVER_URL = `http://127.0.0.1:${PORT}`;
const ADMIN = { email: 'e2e-admin@example.com', password: 'Passw0rd!' };

// NB: never statically import anything that pulls in PrismaService — it must first load after APP_MODE is set.
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const code = () => `E2E-${randomUUID().slice(0, 8)}`;

suite('offline sync end-to-end (server ⇄ 2 desktop PCs)', () => {
  jest.setTimeout(300_000);

  let server: ChildProcess | undefined;
  let serverLog = '';
  let srv: PrismaClient; // direct view of the central database
  let adminJwt: string;
  const tmpDirs: string[] = [];

  interface Device {
    name: string;
    app: INestApplication;
    agent: SyncAgentService;
    jwt: string;
    api: () => ReturnType<typeof request>;
    auth: () => Record<string, string>;
    local: any; // the device's own Prisma client (SQLite)
  }

  // ── server process ────────────────────────────────────────────────────────

  async function startServer() {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: url!,
      PORT: String(PORT),
    };
    delete env.APP_MODE;
    delete env.DESKTOP_DATABASE_URL;
    server = spawn(process.execPath, [join(root, '.e2e-dist', 'main.js')], {
      cwd: root,
      env,
    });
    server.stdout?.on('data', (d) => (serverLog += String(d)));
    server.stderr?.on('data', (d) => (serverLog += String(d)));

    const deadline = Date.now() + 90_000;
    for (;;) {
      try {
        await fetch(`${SERVER_URL}/api/sync/status`); // 401 is fine: it's up
        return;
      } catch {
        if (Date.now() > deadline)
          throw new Error(`server did not start:\n${serverLog.slice(-2000)}`);
        await sleep(500);
      }
    }
  }

  async function stopServer() {
    const p = server;
    if (!p) return;
    server = undefined;
    const exited = new Promise((r) => p.once('exit', r));
    p.kill();
    await exited;
  }

  // ── desktop instances ─────────────────────────────────────────────────────

  async function bootDevice(name: string, token: string): Promise<Device> {
    const dir = mkdtempSync(join(tmpdir(), `metriqa-${name}-`));
    tmpDirs.push(dir);
    process.env.DESKTOP_DATABASE_URL = `file:${join(dir, 'desktop.db').replace(/\\/g, '/')}`;
    process.env.SYNC_SERVER_URL = SERVER_URL;
    process.env.SYNC_DEVICE_TOKEN = token;
    process.env.SYNC_AUTOSTART = 'false'; // the test drives sync cycles explicitly

    const { PrismaClient: LocalClient } = require('../generated/sqlite-client');
    const db = new LocalClient({
      datasourceUrl: process.env.DESKTOP_DATABASE_URL,
    });
    await runSqliteMigrations(db, join(root, 'prisma', 'sqlite'));
    await db.$disconnect();

    const { AppModule } = require('./app.module');
    const { SyncAgentService: Agent } = require('./sync-agent.service');
    const { PrismaService } = require('./prisma.service');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    const dev: Device = {
      name,
      app,
      agent: app.get(Agent),
      jwt: '',
      api: () => request(app.getHttpServer()),
      auth: () => ({ Authorization: `Bearer ${dev.jwt}` }),
      local: app.get(PrismaService),
    };
    return dev;
  }

  async function login(dev: Device) {
    const res = await dev.api().post('/api/auth/login').send(ADMIN);
    expect(res.status).toBe(200);
    dev.jwt = res.body.accessToken;
  }

  const localClientName = async (dev: Device, id: string) =>
    (await dev.local.client.findUnique({ where: { id } }))?.businessName;

  // ── setup / teardown ──────────────────────────────────────────────────────

  let A: Device;
  let B: Device;
  let tokenB = '';
  let seeded: { clientId: string; itemId: string; productId: string };

  beforeAll(async () => {
    if (
      !process.env.SYNC_E2E_SKIP_BUILD ||
      !existsSync(join(root, '.e2e-dist', 'main.js'))
    ) {
      rmSync(join(root, '.e2e-dist'), { recursive: true, force: true });
      execFileSync(
        'npx',
        [
          'tsc',
          '-p',
          'tsconfig.build.json',
          '--outDir',
          '.e2e-dist',
          '--incremental',
          'false',
        ],
        { cwd: root, shell: process.platform === 'win32', stdio: 'inherit' },
      );
    }

    srv = new PrismaClient({ datasourceUrl: url });
    await srv.user.upsert({
      where: { email: ADMIN.email },
      update: {},
      create: {
        email: ADMIN.email,
        passwordHash: await bcrypt.hash(ADMIN.password, 4),
        fullName: 'E2E Admin',
        role: 'SUPER_ADMIN',
      },
    });

    // reference + business data that exists on the server before any PC is installed
    const client = await srv.client.create({
      data: {
        clientCode: code(),
        businessName: 'Seed Client',
        ownerName: 'S',
        contactNo: '1',
      },
    });
    const product = await srv.softwareProduct.create({
      data: {
        productName: 'POS',
        version: '1.0',
        licenseType: 'LIFETIME',
        price: 1000,
      },
    });
    await srv.license.create({
      data: { licenseKey: code(), clientId: client.id, productId: product.id },
    });
    const item = await srv.inventoryItem.create({
      data: { name: 'Stock Item', unitPrice: 50.5, stockQty: 10 },
    });
    seeded = { clientId: client.id, itemId: item.id, productId: product.id };

    await startServer();
    const loginRes = await fetch(`${SERVER_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(ADMIN),
    });
    adminJwt = ((await loginRes.json()) as { accessToken: string }).accessToken;

    const mkDevice = async (name: string) => {
      const r = await fetch(`${SERVER_URL}/api/sync/devices`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${adminJwt}`,
        },
        body: JSON.stringify({ name }),
      });
      expect(r.status).toBe(201);
      return ((await r.json()) as { token: string }).token;
    };

    process.env.APP_MODE = 'desktop'; // must be set before AppModule / PrismaService are first required
    tokenB = await mkDevice('PC B');
    A = await bootDevice('pc-a', await mkDevice('PC A'));
    B = await bootDevice('pc-b', tokenB);
  });

  afterAll(async () => {
    await A?.app.close();
    await B?.app.close();
    await stopServer();
    await srv?.$disconnect();
    delete process.env.APP_MODE;
    for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
  });

  // ── scenarios (ordered: each builds on the previous state) ────────────────

  it('first sync downloads the server data to each PC', async () => {
    for (const dev of [A, B]) {
      const st = await dev.agent.syncNow();
      expect(st).toMatchObject({
        configured: true,
        online: true,
        initialDone: true,
        pending: 0,
        lastError: null,
      });
      expect(await localClientName(dev, seeded.clientId)).toBe('Seed Client');
      expect(
        (
          await dev.local.inventoryItem.findUnique({
            where: { id: seeded.itemId },
          })
        ).stockQty,
      ).toBe(10);
      expect(await dev.local.softwareProduct.count()).toBeGreaterThan(0);
      // nullable Json column (License.hardwareFingerprint) round-trips
      expect(await dev.local.license.count()).toBeGreaterThan(0);
    }
  });

  it('users sign in on a PC: first time online (confirmed by the server), then offline from the cached hash', async () => {
    await login(A);
    await login(B);
    const cached = await A.local.user.findUnique({
      where: { email: ADMIN.email },
    });
    expect(cached.passwordHash).not.toBe('!');
  });

  it('both PCs keep working while the server is off, and offline sign-in still works', async () => {
    await stopServer();

    // A: a client, a job order with an item, and a payment
    const clientA = await A.api().post('/api/clients').set(A.auth()).send({
      clientCode: code(),
      businessName: 'Offline A',
      ownerName: 'A',
      contactNo: '1',
    });
    expect(clientA.status).toBe(201);
    const order = await A.api()
      .post('/api/job-orders')
      .set(A.auth())
      .send({
        clientId: clientA.body.id,
        salePrice: 1500.5,
        items: [{ name: 'Cable', quantity: 2, unitPrice: 100.25 }],
      });
    expect(order.status).toBe(201);
    const pay = await A.api()
      .post(`/api/job-orders/${order.body.id}/payments`)
      .set(A.auth())
      .send({
        amount: 500.25,
        method: 'CASH',
        paidAt: new Date().toISOString(),
      });
    expect(pay.status).toBe(201);

    // B: its own client + a stock movement
    const clientB = await B.api().post('/api/clients').set(B.auth()).send({
      clientCode: code(),
      businessName: 'Offline B',
      ownerName: 'B',
      contactNo: '2',
    });
    expect(clientB.status).toBe(201);
    const adj = await B.api()
      .post(`/api/inventory/${seeded.itemId}/adjust`)
      .set(B.auth())
      .send({ delta: -3 });
    expect(adj.status).toBe(201);

    // sync attempts fail politely; nothing is lost
    const stA = await A.agent.syncNow();
    expect(stA.online).toBe(false);
    expect(stA.pending).toBeGreaterThan(0);

    // offline login (hash cached earlier)
    const relog = await A.api().post('/api/auth/login').send(ADMIN);
    expect(relog.status).toBe(200);

    Object.assign(globalThis, {
      __e2e: {
        clientA: clientA.body.id,
        clientB: clientB.body.id,
        order: order.body.id,
        pay: pay.body.id,
      },
    });
  });

  it('when the server returns, offline work is pushed and shared with the other PC', async () => {
    const ids = (globalThis as any).__e2e as Record<string, string>;
    await startServer();

    expect((await A.agent.syncNow()).pending).toBe(0);
    expect((await B.agent.syncNow()).pending).toBe(0);
    await A.agent.syncNow(); // pick up B's changes

    // central database has everything
    expect(
      (await srv.client.findUniqueOrThrow({ where: { id: ids.clientA } }))
        .businessName,
    ).toBe('Offline A');
    expect(
      (await srv.client.findUniqueOrThrow({ where: { id: ids.clientB } }))
        .businessName,
    ).toBe('Offline B');
    const jo = await srv.jobOrder.findUniqueOrThrow({
      where: { id: ids.order },
      include: { items: true, payments: true },
    });
    expect(jo.salePrice.toString()).toBe('1500.5');
    expect(jo.items).toHaveLength(1);
    expect(jo.items[0].unitPrice.toString()).toBe('100.25');
    expect(jo.payments[0].amount.toString()).toBe('500.25');

    // ...and so does the other PC
    expect(await localClientName(B, ids.clientA)).toBe('Offline A');
    expect(await localClientName(A, ids.clientB)).toBe('Offline B');
    const joOnB = await B.local.jobOrder.findUnique({
      where: { id: ids.order },
      include: { items: true },
    });
    expect(joOnB.items).toHaveLength(1);
    expect(Number(joOnB.salePrice)).toBe(1500.5);
  });

  it('concurrent stock changes on both PCs add up (delta-based, not overwritten)', async () => {
    await B.agent.syncNow();
    await A.agent.syncNow();
    // B sold 3 earlier → server 7. Now both sell more while disconnected from each other.
    await A.api()
      .post(`/api/inventory/${seeded.itemId}/adjust`)
      .set(A.auth())
      .send({ delta: -2 });
    await B.api()
      .post(`/api/inventory/${seeded.itemId}/adjust`)
      .set(B.auth())
      .send({ delta: -1 });
    await A.agent.syncNow();
    await B.agent.syncNow();
    await A.agent.syncNow();

    expect(
      (
        await srv.inventoryItem.findUniqueOrThrow({
          where: { id: seeded.itemId },
        })
      ).stockQty,
    ).toBe(4);
    for (const dev of [A, B]) {
      expect(
        (
          await dev.local.inventoryItem.findUnique({
            where: { id: seeded.itemId },
          })
        ).stockQty,
      ).toBe(4);
    }
  });

  it('a server-side change reaches the PCs on their next sync', async () => {
    await srv.client.update({
      where: { id: seeded.clientId },
      data: { businessName: 'Renamed on server' },
    });
    await A.agent.syncNow();
    await B.agent.syncNow();
    expect(await localClientName(A, seeded.clientId)).toBe('Renamed on server');
    expect(await localClientName(B, seeded.clientId)).toBe('Renamed on server');
  });

  it('conflicting offline edits: the server keeps the first push, the loser is flagged and overwritten', async () => {
    const id = seeded.clientId;
    await A.api()
      .patch(`/api/clients/${id}`)
      .set(A.auth())
      .send({ businessName: 'Edited by A' });
    await B.api()
      .patch(`/api/clients/${id}`)
      .set(B.auth())
      .send({ businessName: 'Edited by B' });

    expect((await A.agent.syncNow()).rejectedUnseen).toBe(0);
    const st = await B.agent.syncNow();

    expect(
      (await srv.client.findUniqueOrThrow({ where: { id } })).businessName,
    ).toBe('Edited by A');
    expect(await localClientName(B, id)).toBe('Edited by A'); // B's copy converged to the server
    expect(st.rejectedUnseen).toBe(1);
    const rejected = await B.agent.listRejected();
    expect(rejected[0]).toMatchObject({
      table_name: 'clients',
      record_id: id,
      reason: 'STALE',
    });
    expect(JSON.parse(rejected[0].local_row!).businessName).toBe('Edited by B');
    expect(
      await srv.syncConflict.count({
        where: { recordId: id, reason: 'STALE' },
      }),
    ).toBe(1);

    await B.agent.markRejectedSeen();
    expect((await B.agent.status()).rejectedUnseen).toBe(0);
    await A.agent.syncNow();
  });

  it('an offline-created row with a duplicate business key is rejected and removed locally', async () => {
    const dupCode = code();
    await srv.client.create({
      data: {
        clientCode: dupCode,
        businessName: 'Taken',
        ownerName: 'S',
        contactNo: '1',
      },
    });
    // B creates the same clientCode offline, before it has heard about the server's row
    const created = await B.api().post('/api/clients').set(B.auth()).send({
      clientCode: dupCode,
      businessName: 'Dup on B',
      ownerName: 'B',
      contactNo: '1',
    });
    expect(created.status).toBe(201);

    const st = await B.agent.syncNow();
    expect(st.pending).toBe(0);
    expect(
      await B.local.client.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
    expect(
      (await B.agent.listRejected()).some((r) => r.reason === 'DUPLICATE_KEY'),
    ).toBe(true);
    expect(await srv.client.count({ where: { clientCode: dupCode } })).toBe(1);
  });

  it('a deletion on the server disappears from the PCs', async () => {
    const victim = await srv.client.create({
      data: {
        clientCode: code(),
        businessName: 'Short lived',
        ownerName: 'S',
        contactNo: '1',
      },
    });
    await A.agent.syncNow();
    expect(await localClientName(A, victim.id)).toBe('Short lived');

    await srv.client.delete({ where: { id: victim.id } });
    await A.agent.syncNow();
    expect(await localClientName(A, victim.id)).toBeUndefined();
  });

  it('a PC deleting a row it synced before removes it centrally too', async () => {
    const created = await A.api().post('/api/clients').set(A.auth()).send({
      clientCode: code(),
      businessName: 'Delete me',
      ownerName: 'A',
      contactNo: '1',
    });
    await A.agent.syncNow();
    expect(
      await srv.client.findUnique({ where: { id: created.body.id } }),
    ).not.toBeNull();

    const del = await A.api()
      .delete(`/api/clients/${created.body.id}`)
      .set(A.auth());
    expect(del.status).toBeLessThan(300);
    await A.agent.syncNow();
    expect(
      await srv.client.findUnique({ where: { id: created.body.id } }),
    ).toBeNull();
  });

  it('a revoked device can no longer sync', async () => {
    const dev = await srv.syncDevice.findUniqueOrThrow({
      where: { tokenHash: createHash('sha256').update(tokenB).digest('hex') },
    });
    const res = await fetch(`${SERVER_URL}/api/sync/devices/${dev.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${adminJwt}` },
    });
    expect(res.status).toBe(200);
    const st = await B.agent.syncNow();
    expect(st.lastError).toMatch(/revoked|unknown/i);
  });
});
