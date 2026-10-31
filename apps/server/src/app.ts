import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { timingSafeEqual, createHash } from 'node:crypto';
import { coachSchema, type CoachInput } from '../../../packages/shared/domain';
export interface RequestRecord {
  id: string;
  payloadHash: string;
  status: string;
  answer: string | null;
  createdAt: Date;
}
export interface RequestStore {
  get(id: string): Promise<RequestRecord | null>;
  reserve(id: string, hash: string): Promise<boolean>;
  complete(id: string, answer: string): Promise<void>;
  remove(id: string): Promise<void>;
}
export interface ServerConfig {
  token: string;
  origins: string[];
  configured: boolean;
  missing: string[];
}
function matches(value: string, expected: string) {
  const a = Buffer.from(value),
    b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createApp(
  config: ServerConfig,
  store: RequestStore,
  coach: (input: CoachInput) => Promise<string>,
) {
  let active = 0;
  let times: number[] = [];
  return new Elysia({ serve: { maxRequestBodySize: 1024 * 1024 } })
    .use(
      cors({
        origin: config.origins,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
      }),
    )
    .onRequest(({ request, set }) => {
      set.headers['Cache-Control'] = 'no-store';
      set.headers['X-Content-Type-Options'] = 'nosniff';
      set.headers['Referrer-Policy'] = 'no-referrer';
      const origin = request.headers.get('origin');
      if (origin && !config.origins.includes(origin)) {
        set.status = 403;
        return { error: 'This website origin is not allowed by the local server.' };
      }
    })
    .onBeforeHandle(({ request, set }) => {
      if (request.method === 'OPTIONS') return;
      if (
        config.token &&
        !matches(request.headers.get('authorization') || '', 'Bearer ' + config.token)
      ) {
        set.status = 401;
        return { error: 'Connection token is incorrect. Update it in Settings.' };
      }
    })
    .get('/api/health', () => ({
      status: 'ok',
      configured: config.configured,
      missing: config.missing,
    }))
    .post(
      '/api/coach',
      async ({ body, set }) => {
        if (!config.configured) {
          set.status = 503;
          return {
            error:
              'Set ' +
              config.missing.join(', ') +
              ' in the server .env file, then restart the server.',
          };
        }
        const parsed = coachSchema.safeParse(body);
        if (!parsed.success) {
          set.status = 400;
          return { error: parsed.error.issues[0].message };
        }
        const input = parsed.data;
        const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        let reserved = false;
        try {
          const old = await store.get(input.requestId);
          if (old) {
            if (old.payloadHash !== hash) {
              set.status = 409;
              return { error: 'This request ID belongs to different content.' };
            }
            if (old.status === 'complete' && old.answer)
              return { answer: old.answer, requestId: old.id };
            set.status = 409;
            return {
              error:
                'This request is already processing or was interrupted. Wait a moment; if the server restarted, send a new message.',
            };
          }
          times = times.filter((t) => t > Date.now() - 3600000);
          if (times.length >= 30 || active >= 2) {
            set.status = 429;
            return { error: 'The coach is busy. Try again in a little while.' };
          }
          reserved = await store.reserve(input.requestId, hash);
          if (!reserved) {
            set.status = 409;
            return { error: 'This request is already processing.' };
          }
          times.push(Date.now());
          active++;
          try {
            const answer = await coach(input);
            await store.complete(input.requestId, answer);
            return { answer, requestId: input.requestId };
          } catch (error) {
            await store.remove(input.requestId);
            const code =
              error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
            set.status = code === 429 ? 429 : 502;
            return {
              error:
                code === 401
                  ? 'The server’s OpenAI API key was rejected. Check OPENAI_API_KEY.'
                  : code === 429
                    ? 'OpenAI rate limit or quota reached. Check your API account and try later.'
                    : code === 404
                      ? 'The configured model or API endpoint was not found. Check OPENAI_MODEL and OPENAI_BASE_URL.'
                      : 'The AI provider could not complete this request. Your journal has not changed. Please try again.',
            };
          } finally {
            active--;
          }
        } catch {
          set.status = 500;
          return {
            error: 'The local server could not save the request. Check its database and restart.',
          };
        }
      },
      { parse: 'json' },
    )
    .onError(({ code, set }) => {
      set.status =
        code === 'NOT_FOUND' ? 404 : code === 'PARSE' || code === 'VALIDATION' ? 400 : 500;
      return {
        error:
          code === 'NOT_FOUND'
            ? 'Endpoint not found.'
            : code === 'PARSE' || code === 'VALIDATION'
              ? 'Invalid request body.'
              : 'Unexpected server error.',
      };
    });
}
