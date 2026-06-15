// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

// NITRO_PRESET=node-server → builds a Node.js SSR server (for Dokku/VPS).
// Unset (default) → auto mode: nitro only activates inside Lovable's infra (Cloudflare).
const nitroPreset = process.env.NITRO_PRESET;

// pg uses Node.js-only APIs (Buffer, EventEmitter, net, tls…) that crash in the browser.
// It is never actually called client-side — only inside createServerFn handlers that run
// on the server. This plugin replaces pg with a harmless no-op stub for the client bundle.
const pgBrowserStub: Plugin = {
  name: "pg-browser-stub",
  enforce: "pre",
  resolveId(id, _, opts) {
    if (id === "pg" && opts?.ssr !== true) {
      return "\0pg-browser-stub";
    }
  },
  load(id) {
    if (id === "\0pg-browser-stub") {
      return `
        class EventEmitter {
          on() { return this; }
          emit() { return false; }
          removeListener() { return this; }
        }
        export class Pool extends EventEmitter {
          constructor() { super(); }
          connect() { return Promise.resolve(); }
          query() { return Promise.resolve({ rows: [], rowCount: 0 }); }
          end() { return Promise.resolve(); }
        }
        export class Client extends EventEmitter {
          constructor() { super(); }
          connect() { return Promise.resolve(); }
          query() { return Promise.resolve({ rows: [], rowCount: 0 }); }
          end() { return Promise.resolve(); }
        }
        export default { Pool, Client };
      `;
    }
  },
};

export default defineConfig({
  nitro: nitroPreset ? { preset: nitroPreset } : undefined,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [pgBrowserStub],
  },
});
