import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
/** Both Prisma CLI and the running server resolve relative files from apps/server. */
export function databaseUrl(value = process.env.DATABASE_URL || 'file:./prisma/daylog.db') {
  if (!value.startsWith('file:')) throw new Error('Daylog expects a local SQLite file URL.');
  return 'file:' + resolve(fileURLToPath(new URL('../', import.meta.url)), value.slice(5));
}
