import { openDB } from 'idb';
import {
  emptySnapshot,
  normalizeSnapshot,
  snapshotSchema,
  type Snapshot,
} from '../../../packages/shared/domain';
const dbPromise = openDB('daylog', 1, {
  upgrade(db) {
    db.createObjectStore('journal');
  },
});
const channel =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('daylog-changes') : null;
export async function readJournal(): Promise<Snapshot> {
  const db = await dbPromise;
  const tx = db.transaction('journal', 'readwrite');
  const stored = await tx.store.get('snapshot');
  const value = stored ? normalizeSnapshot(stored) : emptySnapshot();
  if (stored && 'sampleMode' in stored) await tx.store.put(value, 'snapshot');
  await tx.done;
  return value;
}
export async function updateJournal(mutate: (s: Snapshot) => Snapshot | void): Promise<Snapshot> {
  const db = await dbPromise;
  const tx = db.transaction('journal', 'readwrite');
  const old = await tx.store.get('snapshot');
  const draft = old ? normalizeSnapshot(old) : emptySnapshot();
  const next = snapshotSchema.parse(mutate(draft) || draft);
  await tx.store.put(next, 'snapshot');
  await tx.done;
  channel?.postMessage('changed');
  return next;
}
export function onJournalChange(listener: () => void) {
  const handler = () => listener();
  channel?.addEventListener('message', handler);
  return () => channel?.removeEventListener('message', handler);
}
export async function requestPersistence() {
  try {
    return await navigator.storage?.persist?.();
  } catch {
    return false;
  }
}
export function downloadBackup(snapshot: Snapshot) {
  const blob = new Blob(
    [
      JSON.stringify(
        { app: 'daylog', exportedAt: new Date().toISOString(), data: snapshot },
        null,
        2,
      ),
    ],
    { type: 'application/json' },
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `daylog-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function parseBackup(file: File) {
  if (file.size > 15 * 1024 * 1024) throw new Error('Backup is too large (15 MB maximum).');
  const raw: unknown = JSON.parse(await file.text());
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('app' in raw) ||
    raw.app !== 'daylog' ||
    !('data' in raw)
  )
    throw new Error('Choose a Daylog backup file.');
  try {
    return normalizeSnapshot(raw.data);
  } catch {
    throw new Error('Invalid backup. Its activities, dates, or categories failed validation.');
  }
}
