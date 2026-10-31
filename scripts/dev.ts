export {};
const children = [
  Bun.spawn(['bun', '--cwd', 'apps/server', 'dev'], { stdout: 'inherit', stderr: 'inherit' }),
  Bun.spawn(['bun', '--cwd', 'apps/web', 'dev'], { stdout: 'inherit', stderr: 'inherit' }),
];
for (const sig of ['SIGINT', 'SIGTERM'] as const)
  process.on(sig, () => {
    children.forEach((c) => c.kill());
    process.exit(0);
  });
const exitCode = await Promise.race(children.map((c) => c.exited));
children.forEach((c) => c.kill());
process.exit(exitCode);
