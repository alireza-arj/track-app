import type { CoachInput } from '../../../packages/shared/domain';
export interface Connection {
  url: string;
  token: string;
}
export interface Health {
  status: string;
  configured: boolean;
  missing: string[];
}
export function loadConnection(): Connection {
  try {
    const s = JSON.parse(localStorage.getItem('daylog-connection') || '{}');
    return {
      url: typeof s.url === 'string' ? s.url : '',
      token: typeof s.token === 'string' ? s.token : '',
    };
  } catch {
    return { url: '', token: '' };
  }
}
export function saveConnection(value: Connection) {
  localStorage.setItem('daylog-connection', JSON.stringify(value));
}
export function connectionUrl(value: string) {
  const text = value.trim().replace(/\/$/, '');
  if (!text) return '';
  const url = new URL(text);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Use a server origin, e.g. http://192.168.1.10:3080');
  return url.origin;
}
async function request<T>(
  connection: Connection,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch((connection.url || '') + '/api' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(connection.token ? { Authorization: 'Bearer ' + connection.token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(65000)])
        : AbortSignal.timeout(8000),
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch (error) {
    if (signal?.aborted) throw new Error('Request cancelled. Your journal is safe.');
    throw new Error(
      'Cannot reach your local server. Start it and check the address, network permission, and connection settings.',
    );
  }
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an invalid response.' }));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data as T;
}
export const checkConnection = (c: Connection) => request<Health>(c, '/health');
export const askCoach = (c: Connection, input: CoachInput, signal: AbortSignal) =>
  request<{ answer: string; requestId: string }>(c, '/coach', input, signal);
