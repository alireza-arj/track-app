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
  const invalidResponse = connection.url
    ? 'This address did not return a valid Daylog API response. Check the server address in Settings.'
    : 'No AI server is connected at this address. In Settings, enter a reachable HTTPS address for your local AI server, or use the included local proxy.';
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (contentType !== 'application/json' && !contentType?.endsWith('+json'))
    throw new Error(invalidResponse);
  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error(invalidResponse);
  }
  if (data && typeof data === 'object' && 'error' in data && typeof data.error === 'string')
    throw new Error(data.error);
  if (!response.ok) throw new Error('The AI server rejected the request. Check its configuration.');
  return data as T;
}
export async function checkConnection(c: Connection): Promise<Health> {
  const data = await request<Partial<Health> | null>(c, '/health');
  if (
    data?.status !== 'ok' ||
    typeof data.configured !== 'boolean' ||
    !Array.isArray(data.missing) ||
    !data.missing.every((item) => typeof item === 'string')
  )
    throw new Error('This address did not return a valid Daylog health response. Check Settings.');
  return data as Health;
}
export async function askCoach(c: Connection, input: CoachInput, signal: AbortSignal) {
  const data = await request<{ answer?: unknown; requestId?: unknown } | null>(
    c,
    '/coach',
    input,
    signal,
  );
  if (typeof data?.answer !== 'string' || !data.answer.trim() || data.requestId !== input.requestId)
    throw new Error('The AI server returned an invalid reply. Please try again.');
  return { answer: data.answer, requestId: input.requestId };
}
