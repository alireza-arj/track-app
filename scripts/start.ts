export {};
const children = [
  Bun.spawn(['bun', '--cwd', 'apps/server', 'start'], { stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', 'scripts/serve-web.ts'], { stdout: 'inherit', stderr: 'inherit' }),
];
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    children.forEach((c) => c.kill());
    process.exit(0);
  });
const exitCode = await Promise.race(children.map((c) => c.exited));
children.forEach((c) => c.kill());
process.exit(exitCode);
