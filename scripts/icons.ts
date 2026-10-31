import { deflateSync } from 'node:zlib';
const table = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(data: Buffer) {
  let c = 0xffffffff;
  for (const b of data) c = table[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name: string, data: Buffer) {
  const kind = Buffer.from(name),
    size = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  checksum.writeUInt32BE(crc(Buffer.concat([kind, data])));
  return Buffer.concat([size, kind, data, checksum]);
}
function png(size: number) {
  const pixels = Buffer.alloc((size * 3 + 1) * size);
  const bars = [
    [41, 83, 25, 65],
    [84, 43, 25, 105],
    [127, 65, 25, 83],
  ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let coverage = 0;
      for (const [dx, dy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        const px = ((x + dx) / size) * 192,
          py = ((y + dy) / size) * 192;
        if (
          bars.some(([bx, by, w, h]) => {
            const r = 12.5,
              cx = Math.max(bx + r, Math.min(px, bx + w - r)),
              cy = Math.max(by + r, Math.min(py, by + h - r));
            return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
          })
        )
          coverage++;
      }
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      [21, 61, 255].forEach(
        (v, i) => (pixels[offset + i] = Math.round(v + ((255 - v) * coverage) / 4)),
      );
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(pixels)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
for (const size of [180, 192, 512])
  await Bun.write(
    new URL(
      '../apps/web/public/' + (size === 180 ? 'apple-touch-icon.png' : `icon-${size}.png`),
      import.meta.url,
    ),
    png(size),
  );
