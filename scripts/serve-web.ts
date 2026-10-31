import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../apps/web/dist/', import.meta.url));
const headers = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' http: https:; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
};
const server = Bun.serve({
  hostname: process.env.WEB_HOST || '0.0.0.0',
  port: Number(process.env.WEB_PORT || 4380),
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        const target = new URL(
          url.pathname + url.search,
          'http://127.0.0.1:' + (process.env.API_PORT || 3080),
        );
        const upstream = await fetch(new Request(target, request), {
          signal: AbortSignal.timeout(60000),
        });
        const result = new Response(upstream.body, upstream);
        for (const [k, v] of Object.entries(headers)) result.headers.set(k, v);
        return result;
      } catch {
        return Response.json(
          { error: 'Your local AI server is offline. Start it when you want to use the coach.' },
          { status: 503, headers: { ...headers, 'Cache-Control': 'no-store' } },
        );
      }
    }
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', { status: 405, headers });
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response('Invalid path', { status: 400, headers });
    }
    const path = resolve(root, '.' + pathname);
    if (path !== resolve(root) && !path.startsWith(resolve(root) + sep))
      return new Response('Not found', { status: 404, headers });
    let file = Bun.file(path);
    if (!(await file.exists())) {
      if (pathname.includes('.')) return new Response('Not found', { status: 404, headers });
      file = Bun.file(resolve(root, 'index.html'));
    }
    if (!(await file.exists()))
      return new Response('Build Daylog first: bun run build', { status: 503, headers });
    return new Response(request.method === 'HEAD' ? null : file, {
      headers: {
        ...headers,
        'Content-Type': file.type,
        'Cache-Control': pathname.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
      },
    });
  },
});
console.log(`Daylog: http://localhost:${server.port}`);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => {
    server.stop();
    process.exit(0);
  });
