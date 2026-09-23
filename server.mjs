import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.argv[2] || 8765);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === "/") pathname = "/index.html";
    const full = normalize(join(root, pathname));
    if (!full.startsWith(root)) throw new Error("forbidden");
    const info = await stat(full);
    if (!info.isFile()) throw new Error("not file");
    const data = await readFile(full);
    res.writeHead(200, { "Content-Type": mime[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  } catch (_) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Medical System MVP: http://127.0.0.1:${port}`);
});
