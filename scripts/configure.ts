import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
const envPath = fileURLToPath(new URL('../apps/server/.env', import.meta.url));
if (!(await Bun.file(envPath).exists())) {
  let contents = await Bun.file(
    fileURLToPath(new URL('../apps/server/.env.example', import.meta.url)),
  ).text();
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.family === 'IPv4')
    .map((i) => i!.address);
  const origins = [...ips.flatMap((ip) => [`http://${ip}:5180`, `http://${ip}:4380`])];
  if (origins.length)
    contents = contents.replace(
      'http://127.0.0.1:4380',
      'http://127.0.0.1:4380,' + origins.join(','),
    );
  await Bun.write(envPath, contents);
  console.log('Created apps/server/.env. Fill in OpenAI settings when ready.');
} else console.log('Existing server .env preserved.');
