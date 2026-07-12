import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const dist = resolve(root, "dist");
const client = resolve(dist, "client");
const server = resolve(dist, "server");
const metadata = resolve(dist, ".openai");

await rm(dist, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });
await mkdir(metadata, { recursive: true });

await cp(resolve(root, "src/frontend"), client, { recursive: true });

await cp(resolve(root, "worker/index.js"), resolve(server, "index.js"));
await cp(
  resolve(root, ".openai/hosting.json"),
  resolve(metadata, "hosting.json"),
);

const requiredFiles = [
  "client/index.html",
  "client/admin.html",
  "client/script.js",
  "client/admin.js",
  "client/styles.css",
  "server/index.js",
  ".openai/hosting.json",
];

for (const file of requiredFiles) {
  await readFile(resolve(dist, file));
}

await writeFile(resolve(dist, "BUILD_OK"), "artisse-order-sites\n");
