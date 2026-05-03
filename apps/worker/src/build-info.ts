import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type BuildInfo = {
  buildTime: string;
  gitSha: string;
  image: string;
};

const FALLBACK: BuildInfo = {
  buildTime: "unknown",
  gitSha: "unknown",
  image: "meet-bot:dev",
};

/**
 * The Dockerfile writes `/app/BUILD_INFO.json` at image-build time. In dev (host runs `tsx src/...`)
 * the same file is written next to `dist/` by `npm run build` if present, otherwise we fall back to
 * env vars set by the run command. This is the single source of truth for "what code is running".
 */
function readBuildInfo(): BuildInfo {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    "/app/BUILD_INFO.json",
    resolve(here, "..", "BUILD_INFO.json"),
    resolve(here, "..", "..", "BUILD_INFO.json"),
    resolve(process.cwd(), "BUILD_INFO.json"),
    resolve(process.cwd(), "dist", "BUILD_INFO.json"),
  ];

  for (const path of candidates) {
    try {
      if (!existsSync(path)) continue;
      const raw = readFileSync(path, "utf8");
      const parsed = JSON.parse(raw) as Partial<BuildInfo>;
      return {
        buildTime: parsed.buildTime ?? FALLBACK.buildTime,
        gitSha: parsed.gitSha ?? FALLBACK.gitSha,
        image: parsed.image ?? FALLBACK.image,
      };
    } catch {
      /* try next candidate */
    }
  }

  return {
    buildTime: process.env.BUILD_TIME?.trim() || FALLBACK.buildTime,
    gitSha: process.env.GIT_SHA?.trim() || FALLBACK.gitSha,
    image: process.env.BUILD_IMAGE?.trim() || FALLBACK.image,
  };
}

let cached: BuildInfo | null = null;

export function getBuildInfo(): BuildInfo {
  if (!cached) cached = readBuildInfo();
  return cached;
}

/**
 * Single-line banner suitable for the very first log line of API or worker. Including this in every
 * boot lets `docker logs` immediately confirm whether `docker compose up --build` actually rebuilt.
 */
export function buildInfoLogLine(role: "api" | "worker"): string {
  const info = getBuildInfo();
  return `[build] ${role} version=${info.gitSha} built=${info.buildTime} image=${info.image}`;
}
