import { PrismaClient } from './generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import type { RequestStore } from './app';
export function createDatabase(url: string) {
  return new PrismaClient({ adapter: new PrismaLibSql({ url }) });
}
export function createRequestStore(prisma: PrismaClient): RequestStore {
  return {
    get: (id) => prisma.coachRequest.findUnique({ where: { id } }),
    reserve: async (id, payloadHash) => {
      try {
        await prisma.coachRequest.create({ data: { id, payloadHash } });
        return true;
      } catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === 'P2002') return false;
        throw e;
      }
    },
    complete: async (id, answer) => {
      await prisma.coachRequest.update({ where: { id }, data: { answer, status: 'complete' } });
    },
    remove: async (id) => {
      await prisma.coachRequest.deleteMany({ where: { id, status: 'pending' } });
    },
  };
}
