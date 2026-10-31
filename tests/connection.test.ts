import { expect, test } from 'bun:test';
import { askCoach, checkConnection, type Connection } from '../apps/web/src/connection';
import type { CoachInput } from '../packages/shared/domain';

async function withServer(
  respond: (request: Request) => Response | Promise<Response>,
  check: (connection: Connection) => Promise<void>,
) {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: respond });
  try {
    await check({ url: `http://127.0.0.1:${server.port}`, token: 'local-test-token' });
  } finally {
    server.stop(true);
  }
}

const input: CoachInput = {
  requestId: crypto.randomUUID(),
  question: 'Help me plan',
  from: '2026-10-25',
  to: '2026-10-31',
  timezone: 'Asia/Tehran',
  categories: [],
  activities: [],
  history: [],
};

test('an HTML SPA fallback is rejected instead of becoming a healthy AI connection', async () => {
  await withServer(
    () =>
      new Response('<!doctype html><html></html>', { headers: { 'Content-Type': 'text/html' } }),
    async (connection) => {
      await expect(checkConnection(connection)).rejects.toThrow('valid Daylog API response');
      await expect(askCoach(connection, input, new AbortController().signal)).rejects.toThrow(
        'valid Daylog API response',
      );
    },
  );
});

test('a static host API 404 gives a connection error', async () => {
  await withServer(
    () => new Response('Not found', { status: 404 }),
    async (connection) => {
      await expect(checkConnection(connection)).rejects.toThrow('Check the server address');
    },
  );
});

test('a real health response preserves configuration status and sends the connection token', async () => {
  await withServer(
    (request) => {
      expect(new URL(request.url).pathname).toBe('/api/health');
      expect(request.headers.get('authorization')).toBe('Bearer local-test-token');
      return Response.json({ status: 'ok', configured: false, missing: ['OPENAI_API_KEY'] });
    },
    async (connection) => {
      expect(await checkConnection(connection)).toEqual({
        status: 'ok',
        configured: false,
        missing: ['OPENAI_API_KEY'],
      });
    },
  );
});

test('JSON without a valid health payload cannot reach the settings success view', async () => {
  for (const payload of [null, {}, { status: 'ok', configured: true, missing: null }]) {
    await withServer(
      () => Response.json(payload),
      async (connection) => {
        await expect(checkConnection(connection)).rejects.toThrow('valid Daylog health response');
      },
    );
  }
});

test('API authorization errors retain their useful server message', async () => {
  await withServer(
    () => Response.json({ error: 'Connection token is incorrect.' }, { status: 401 }),
    async (connection) => {
      await expect(checkConnection(connection)).rejects.toThrow('Connection token is incorrect.');
    },
  );
});

test('coach replies must contain an answer for the current request', async () => {
  await withServer(
    () => Response.json({ answer: 'Start with one focused block.', requestId: input.requestId }),
    async (connection) => {
      expect(await askCoach(connection, input, new AbortController().signal)).toEqual({
        answer: 'Start with one focused block.',
        requestId: input.requestId,
      });
    },
  );
  await withServer(
    () => Response.json({ answer: 'A different reply.', requestId: 'another-request' }),
    async (connection) => {
      await expect(askCoach(connection, input, new AbortController().signal)).rejects.toThrow(
        'invalid reply',
      );
    },
  );
});
