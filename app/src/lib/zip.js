// A plain zip file made in the browser, with nothing compressed: the photos in it are JPEGs already, and every computer
// opens this kind. Takes [{ name, data: Uint8Array }] and gives back the file's bytes.
const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const UTF8 = 0x0800;
const dosDate = (d) => ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
const dosTime = (d) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);

function header(size) {
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  return { bytes, u16: (at, v) => view.setUint16(at, v, true), u32: (at, v) => view.setUint32(at, v, true) };
}

export function zip(files, now = new Date()) {
  const encoder = new TextEncoder();
  const parts = [], central = [];
  let at = 0;
  for (const f of files) {
    const name = encoder.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const a = header(30);
    a.u32(0, 0x04034b50); a.u16(4, 20); a.u16(6, UTF8); a.u16(8, 0); a.u16(10, dosTime(now)); a.u16(12, dosDate(now));
    a.u32(14, crc); a.u32(18, size); a.u32(22, size); a.u16(26, name.length); a.u16(28, 0);
    parts.push(a.bytes, name, f.data);
    const c = header(46);
    c.u32(0, 0x02014b50); c.u16(4, 20); c.u16(6, 20); c.u16(8, UTF8); c.u16(10, 0); c.u16(12, dosTime(now)); c.u16(14, dosDate(now));
    c.u32(16, crc); c.u32(20, size); c.u32(24, size); c.u16(28, name.length); c.u32(42, at);
    central.push(c.bytes, name);
    at += 30 + name.length + size;
  }
  const dirSize = central.reduce((n, b) => n + b.length, 0);
  const end = header(22);
  end.u32(0, 0x06054b50); end.u16(8, files.length); end.u16(10, files.length); end.u32(12, dirSize); end.u32(16, at);
  const all = [...parts, ...central, end.bytes];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let i = 0;
  for (const b of all) { out.set(b, i); i += b.length; }
  return out;
}
