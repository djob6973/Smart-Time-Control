// Shim mínimo de Buffer para módulos de Node.js (pg, node:crypto) que se cuelan
// accidentalmente en el bundle del cliente. Estos módulos NUNCA se ejecutan en el
// navegador (solo en loaders SSR), pero su inicialización intenta acceder a Buffer.
if (typeof globalThis.Buffer === "undefined") {
  (globalThis as Record<string, unknown>).Buffer = {
    isBuffer: () => false,
    from: (v: unknown) => (v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(0)),
    alloc: (n: number) => new Uint8Array(n),
    concat: (bufs: Uint8Array[]) => {
      const total = bufs.reduce((s, b) => s + b.length, 0);
      const out = new Uint8Array(total);
      let off = 0;
      for (const b of bufs) { out.set(b, off); off += b.length; }
      return out;
    },
    byteLength: (s: string) => new TextEncoder().encode(s).length,
  };
}
