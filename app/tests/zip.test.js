import assert from "node:assert/strict";
import { test } from "node:test";
import { crc32, zip } from "../src/lib/zip.js";

const bytes = (s) => new TextEncoder().encode(s);

test("the checksum matches the known value", () => {
  assert.equal(crc32(bytes("hello")), 0x3610a686);
});

test("a zip holds what went in, read back through its own directory", () => {
  const pic = new Uint8Array([255, 216, 255, 0, 1, 2]);
  const out = zip([{ name: "marble-data.json", data: bytes('{"a":1}') }, { name: "photos/trade-1.jpg", data: pic }]);
  const v = new DataView(out.buffer);
  const end = out.length - 22;
  assert.equal(v.getUint32(0, true), 0x04034b50);
  assert.equal(v.getUint32(end, true), 0x06054b50);
  assert.equal(v.getUint16(end + 10, true), 2);
  const seen = {};
  let at = v.getUint32(end + 16, true);
  for (let n = 0; n < 2; n++) {
    assert.equal(v.getUint32(at, true), 0x02014b50);
    const crc = v.getUint32(at + 16, true), size = v.getUint32(at + 24, true), nameLen = v.getUint16(at + 28, true), local = v.getUint32(at + 42, true);
    const name = new TextDecoder().decode(out.slice(at + 46, at + 46 + nameLen));
    assert.equal(v.getUint32(local, true), 0x04034b50);
    const start = local + 30 + v.getUint16(local + 26, true);
    const data = out.slice(start, start + size);
    assert.equal(crc32(data), crc);
    seen[name] = data;
    at += 46 + nameLen;
  }
  assert.equal(new TextDecoder().decode(seen["marble-data.json"]), '{"a":1}');
  assert.deepEqual([...seen["photos/trade-1.jpg"]], [...pic]);
});

test("an empty zip is still a zip", () => {
  assert.equal(zip([]).length, 22);
});

test("every card sign splits from its digits", async () => {
  const { moneyParts } = await import("../src/lib/money.js");
  for (const s of ["$", "¥", "€", "£"]) assert.deepEqual(moneyParts(`+${s}1,240`).pre, `+${s}`);
});
