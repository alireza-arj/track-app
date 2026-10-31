import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '../apps/server/src/generated/prisma/client';
import { createDatabase, createRequestStore } from '../apps/server/src/db';
import { createApp, type RequestStore } from '../apps/server/src/app';
import { emptySnapshot, type CoachInput } from '../packages/shared/domain';
let folder: string, db: PrismaClient, store: RequestStore;
beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'daylog-test-'));
  db = createDatabase('file:' + join(folder, 'test.db'));
  await db.$executeRawUnsafe(
    "CREATE TABLE CoachRequest (id TEXT PRIMARY KEY, payloadHash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', answer TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)",
  );
  store = createRequestStore(db);
});
afterAll(async () => {
  await db?.$disconnect();
  if (folder) await rm(folder, { recursive: true, force: true });
});
const config = {
  token: 'test-token',
  origins: ['http://localhost:5180'],
  configured: true,
  missing: [],
};
const input = (): CoachInput => ({
  requestId: crypto.randomUUID(),
  question: 'Help me reflect',
  from: '2026-10-25',
  to: '2026-10-31',
  timezone: 'Asia/Tehran',
  categories: emptySnapshot().categories,
  activities: [],
  history: [],
});
const request = (
  path: string,
  body?: unknown,
  token = 'test-token',
  origin = 'http://localhost:5180',
) =>
  new Request('http://localhost' + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      Authorization: 'Bearer ' + token,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
describe('Local Elysia API with real Prisma + SQLite', () => {
  test('enforces token and origin', async () => {
    const app = createApp(config, store, async () => 'unused');
    expect((await app.handle(request('/api/health', undefined, 'wrong'))).status).toBe(401);
    expect(
      (
        await app.handle(
          request('/api/health', undefined, 'test-token', 'https://untrusted.example'),
        )
      ).status,
    ).toBe(403);
    expect((await app.handle(request('/api/health'))).status).toBe(200);
  });
  test('returns setup state and never fabricates AI replies', async () => {
    const app = createApp(
      { ...config, configured: false, missing: ['OPENAI_API_KEY'] },
      store,
      async () => {
        throw new Error('Must not call provider');
      },
    );
    const r = await app.handle(request('/api/coach', input()));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toContain('OPENAI_API_KEY');
  });
  test('validates context before calling provider', async () => {
    let calls = 0;
    const app = createApp(config, store, async () => {
      calls++;
      return 'unused';
    });
    expect((await app.handle(request('/api/coach', { ...input(), from: 'bad' }))).status).toBe(400);
    expect(calls).toBe(0);
  });
  test('persists completed requests and replays identical IDs without billing twice', async () => {
    let calls = 0;
    const app = createApp(config, store, async () => {
      calls++;
      return 'Try one focused block.';
    });
    const body = input();
    const first = await app.handle(request('/api/coach', body));
    expect(first.status).toBe(200);
    expect((await first.json()).answer).toBe('Try one focused block.');
    expect((await app.handle(request('/api/coach', body))).status).toBe(200);
    expect(calls).toBe(1);
    expect((await store.get(body.requestId))?.status).toBe('complete');
    expect(
      (await app.handle(request('/api/coach', { ...body, question: 'Different content' }))).status,
    ).toBe(409);
  });
  test('surfaces provider failure and makes failed requests retryable', async () => {
    let calls = 0;
    const app = createApp(config, store, async () => {
      calls++;
      if (calls === 1) throw { status: 429 };
      return 'Recovered';
    });
    const body = input();
    const failed = await app.handle(request('/api/coach', body));
    expect(failed.status).toBe(429);
    expect(await store.get(body.requestId)).toBeNull();
    const retry = await app.handle(request('/api/coach', body));
    expect(retry.status).toBe(200);
    expect((await retry.json()).answer).toBe('Recovered');
  });
});
