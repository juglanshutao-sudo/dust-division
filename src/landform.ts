export function randomSource(seed: number) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
    return seed / 4294967296
  }
}
const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))
const smooth = (n: number) => {
  const t = clamp(n, 0, 1)
  return t * t * (3 - 2 * t)
}
function hash(x: number, z: number) {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return n - Math.floor(n)
}
export function noise(x: number, z: number) {
  const i = Math.floor(x),
    j = Math.floor(z),
    u = smooth(x - i),
    v = smooth(z - j)
  const a = hash(i, j),
    b = hash(i + 1, j),
    c = hash(i, j + 1),
    d = hash(i + 1, j + 1)
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v
}
export function terrainHeight(x: number, z: number) {
  const outer = smooth((Math.hypot((x - 2) * 0.87, (z + 19) * 1.03) - 38) / 42)
  const field = Math.sin(x * 0.12 + z * 0.045) * 0.09 + Math.sin(z * 0.15) * 0.08
  return field + outer * (1.4 + 7 * noise(x * 0.043, z * 0.043) + 2.5 * noise(x * 0.1, z * 0.1))
}
