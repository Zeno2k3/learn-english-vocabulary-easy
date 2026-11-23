#!/usr/bin/env node
/* Chạy thử trên máy: build, mở server tại http://localhost:4173, tự build lại khi sửa data/ hoặc src/. */
import { createReadStream, existsSync, statSync, watch } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build, report } from "./build.mjs";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const DIST = join(ROOT, "dist");
const PORT = Number(process.env.PORT) || 4173;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

report(build());
let timer;
for (const dir of ["data", "src"]) watch(join(ROOT, dir), { recursive: true }, () => {
  clearTimeout(timer);
  timer = setTimeout(() => report(build()), 150);
});

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  let file = normalize(join(DIST, url));
  if (file !== DIST && !file.startsWith(DIST + sep)) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) { res.writeHead(404).end("Not found"); return; }
  res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log("Mở http://localhost:" + PORT));
