import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

export function internalApiKeyValid(request: FastifyRequest): boolean {
  const expected = config.internalApiKey;
  if (!expected) return false;
  const auth = request.headers.authorization;
  const bearer =
    typeof auth === "string" && auth.toLowerCase().startsWith("bearer ")
      ? auth.slice(7).trim()
      : "";
  const raw = request.headers["x-api-key"];
  const headerKey = typeof raw === "string" ? raw.trim() : "";
  const candidate = bearer || headerKey;
  if (!candidate) return false;
  try {
    const a = Buffer.from(candidate, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * When `INTERNAL_API_KEY` is set, callers must send it. When unset (local dev), this is a no-op.
 */
export function requireInternalApiKey(
  request: FastifyRequest,
  reply: FastifyReply
): boolean {
  if (!config.internalApiKey) return true;
  if (internalApiKeyValid(request)) return true;
  reply.code(401);
  reply.send({
    error: "unauthorized",
    message:
      "Set INTERNAL_API_KEY in the server environment and send it as Authorization: Bearer <token> or X-API-Key.",
  });
  return false;
}
