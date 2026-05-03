import { mkdir, readdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "..", "src", "db", "migrations");
const dstDir = resolve(here, "..", "dist", "db", "migrations");

async function main() {
  await mkdir(dstDir, { recursive: true });
  const files = (await readdir(srcDir)).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    await copyFile(join(srcDir, f), join(dstDir, f));
  }
  console.log(`[copy-migrations] copied ${files.length} files to ${dstDir}`);
}

main().catch((err) => {
  console.error("[copy-migrations] failed:", err);
  process.exit(1);
});
