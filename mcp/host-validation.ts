import type { RequestHandler, Response } from "express";
import { getMcpPublicBaseUrl } from "@/lib/local/oauth-store";

interface HostValidationConfig {
  allowedHostnames: string[];
  publicHostname: string | null;
  publicProtocol: "http" | "https" | null;
}

function reject(res: Response, message: string) {
  res.status(403).json({
    jsonrpc: "2.0",
    error: { code: -32000, message },
    id: null,
  });
}

function singleHeader(value: string | string[] | undefined) {
  if (!value || Array.isArray(value) || value.includes(",")) return null;
  return value.trim() || null;
}

function hostnameFromHeader(value: string) {
  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function getMcpHostValidationConfig(): HostValidationConfig {
  const publicUrl = new URL(getMcpPublicBaseUrl());
  const configuredPublicUrl = process.env.MCP_PUBLIC_URL?.trim() ? publicUrl : null;
  return {
    allowedHostnames: [...new Set(["127.0.0.1", "localhost", "[::1]", configuredPublicUrl?.hostname.toLowerCase()].filter((value): value is string => Boolean(value)))],
    publicHostname: configuredPublicUrl?.hostname.toLowerCase() ?? null,
    publicProtocol: configuredPublicUrl ? configuredPublicUrl.protocol.slice(0, -1) as "http" | "https" : null,
  };
}

export function proxyAwareHostValidation(config: HostValidationConfig): RequestHandler {
  const allowed = new Set(config.allowedHostnames);
  return (req, res, next) => {
    const rawHost = singleHeader(req.headers.host);
    const host = rawHost ? hostnameFromHeader(rawHost) : null;
    if (!host || !allowed.has(host)) {
      reject(res, host ? `Invalid Host: ${host}` : "Missing or invalid Host header");
      return;
    }

    const forwardedHostHeader = req.headers["x-forwarded-host"];
    if (forwardedHostHeader !== undefined) {
      const rawForwardedHost = singleHeader(forwardedHostHeader);
      const forwardedHost = rawForwardedHost ? hostnameFromHeader(rawForwardedHost) : null;
      if (!forwardedHost || !allowed.has(forwardedHost)) {
        reject(res, forwardedHost ? `Invalid X-Forwarded-Host: ${forwardedHost}` : "Invalid X-Forwarded-Host header");
        return;
      }
    }

    const forwardedProtoHeader = req.headers["x-forwarded-proto"];
    if (forwardedProtoHeader !== undefined) {
      const forwardedProto = singleHeader(forwardedProtoHeader)?.toLowerCase();
      if (!forwardedProto || !["http", "https"].includes(forwardedProto)) {
        reject(res, "Invalid X-Forwarded-Proto header");
        return;
      }
      const forwardedHost = singleHeader(forwardedHostHeader);
      const effectiveHostname = forwardedHost ? hostnameFromHeader(forwardedHost) : host;
      if (effectiveHostname === config.publicHostname && forwardedProto !== config.publicProtocol) {
        reject(res, "X-Forwarded-Proto does not match MCP_PUBLIC_URL");
        return;
      }
    }

    next();
  };
}
