import 'dotenv/config';
import { createDatabase, createRequestStore } from './db';
import { createApp } from './app';
import { createCoach } from './coach';
import { databaseUrl } from './database-url';
const prisma = createDatabase(databaseUrl());
const store = createRequestStore(prisma);
const missing = ['OPENAI_API_KEY', 'OPENAI_MODEL', 'DAYLOG_TOKEN'].filter(
  (k) => !process.env[k]?.trim(),
);
const origins = (
  process.env.ALLOWED_ORIGINS ||
  'http://localhost:5180,http://localhost:4380,http://127.0.0.1:5180,http://127.0.0.1:4380'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const config = {
  token: process.env.DAYLOG_TOKEN?.trim() || '',
  origins,
  configured: missing.length === 0,
  missing,
};
const coach = createCoach({
  apiKey: process.env.OPENAI_API_KEY || 'not-configured',
  model: process.env.OPENAI_MODEL || 'not-configured',
  baseURL: process.env.OPENAI_BASE_URL || undefined,
});
await prisma.$connect();
const app = createApp(config, store, coach).listen({
  port: Number(process.env.PORT || 3080),
  hostname: process.env.HOST || '127.0.0.1',
});
console.log(
  `Daylog local API: http://${app.server?.hostname}:${app.server?.port} · AI ${config.configured ? 'ready' : 'needs configuration'}`,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, async () => {
    await app.stop();
    await prisma.$disconnect();
    process.exit(0);
  });
