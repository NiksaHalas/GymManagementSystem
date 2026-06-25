/** Time-ordered UUIDv7 for offline intent ids (DB.md §6). */
export function uuidv7(): string {
  const ts = BigInt(Date.now());
  const bytes = crypto.getRandomValues(new Uint8Array(10));

  const hex = (n: bigint, len: number) => n.toString(16).padStart(len, "0");

  const timeHex = hex(ts, 12);
  const randHex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  return [
    timeHex.slice(0, 8),
    timeHex.slice(8, 12),
    "7" + randHex.slice(0, 3),
    ((parseInt(randHex.slice(3, 5), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0") +
      randHex.slice(5, 7),
    randHex.slice(7, 19),
  ].join("-");
}
