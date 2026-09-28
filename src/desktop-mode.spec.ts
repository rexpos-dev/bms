/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { runSqliteMigrations } from './sqlite-migrator';

/**
 * Boots the real AppModule in desktop mode against a throw-away SQLite file.
 * Requires the generated client (`npm run gen:sqlite`); skipped when it is absent.
 *
 * PrismaService/AppModule are required lazily: both read APP_MODE when first loaded.
 */
const sqliteClient = join(__dirname, '..', 'generated', 'sqlite-client');
const suite = existsSync(sqliteClient) ? describe : describe.skip;

suite('desktop mode (SQLite)', () => {
  let app: INestApplication;
  let dir: string;
  let token: string;
  const auth = () => ({ Authorization: `Bearer ${token}` });
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'metriqa-desktop-'));
    process.env.APP_MODE = 'desktop';
    process.env.DESKTOP_DATABASE_URL = `file:${join(dir, 'desktop.db').replace(/\\/g, '/')}`;
    process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
    process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';

    const { PrismaClient } = require('../generated/sqlite-client');
    const db = new PrismaClient({
      datasourceUrl: process.env.DESKTOP_DATABASE_URL,
    });
    const migrations = join(__dirname, '..', 'prisma', 'sqlite');
    expect(await runSqliteMigrations(db, migrations)).toEqual([
      '0001_baseline.sql',
      '0002_sync_local.sql',
    ]);
    expect(await runSqliteMigrations(db, migrations)).toEqual([]); // idempotent
    await db.$disconnect();

    const { AppModule } = require('./app.module');
    const { PrismaService } = require('./prisma.service');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    await app.get(PrismaService).user.create({
      data: {
        email: 'admin@example.com',
        passwordHash: await bcrypt.hash('Passw0rd!', 4),
        fullName: 'Local Admin',
        role: 'SUPER_ADMIN',
      },
    });
    const login = await http()
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'Passw0rd!' });
    expect(login.status).toBe(200);
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app?.close();
    rmSync(dir, { recursive: true, force: true });
    delete process.env.APP_MODE;
  });

  it('uses the SQLite client, not MySQL', async () => {
    const { PrismaService } = require('./prisma.service');
    const rows = await app
      .get(PrismaService)
      .$queryRawUnsafe('SELECT sqlite_version() AS v');
    expect(rows[0].v).toMatch(/^3\./);
  });

  it('does not expose server-only modules', async () => {
    expect((await http().get('/api/jobs').set(auth())).status).toBe(404);
    expect((await http().get('/api/sync/devices').set(auth())).status).toBe(
      404,
    ); // server-side device admin
    expect((await http().get('/api/sync/status').set(auth())).status).toBe(200); // local agent status
  });

  it('runs clients → inventory → job order → payment offline, with money intact', async () => {
    const client = await http().post('/api/clients').set(auth()).send({
      clientCode: 'CLT-1',
      businessName: 'Acme Store',
      ownerName: 'Juan',
      contactNo: '0917',
    });
    expect(client.status).toBe(201);

    const item = await http()
      .post('/api/inventory')
      .set(auth())
      .send({ name: 'Cable', barcode: 'B-1', unitPrice: 100.25, stockQty: 10 });
    expect(item.status).toBe(201);

    // unique barcode → friendly 400 (proves error mapping works with the SQLite client)
    const dup = await http()
      .post('/api/inventory')
      .set(auth())
      .send({ name: 'Cable 2', barcode: 'B-1' });
    expect(dup.status).toBe(400);
    expect(dup.body.message).toMatch(/barcode/i);

    const order = await http()
      .post('/api/job-orders')
      .set(auth())
      .send({
        clientId: client.body.id,
        salePrice: 1500.5,
        items: [
          {
            name: 'Cable',
            quantity: 2,
            unitPrice: 100.25,
            inventoryItemId: item.body.id,
          },
        ],
      });
    expect(order.status).toBe(201);
    const got = await http()
      .get(`/api/job-orders/${order.body.id}`)
      .set(auth());
    expect(got.status).toBe(200);
    expect(Number(got.body.salePrice)).toBe(1500.5);
    expect(got.body.items).toHaveLength(1);
    expect(Number(got.body.items[0].unitPrice)).toBe(100.25);

    const pay = await http()
      .post(`/api/job-orders/${order.body.id}/payments`)
      .set(auth())
      .send({
        amount: 500.25,
        method: 'CASH',
        paidAt: new Date().toISOString(),
      });
    expect(pay.status).toBe(201);
    const list = await http()
      .get(`/api/job-orders/${order.body.id}/payments`)
      .set(auth());
    expect(list.status).toBe(200);

    const voided = await http()
      .post(`/api/payments/${pay.body.id}/void`)
      .set(auth())
      .send({ reason: 'typo' });
    expect(voided.status).toBe(201);
  });

  it('records audit logs (Json metadata) locally', async () => {
    const logs = await http().get('/api/audit-logs').set(auth());
    expect(logs.status).toBe(200);
    expect(logs.body.length).toBeGreaterThan(0);
    expect(
      logs.body.some((l: { action: string }) => l.action === 'User Login'),
    ).toBe(true);
  });
});
