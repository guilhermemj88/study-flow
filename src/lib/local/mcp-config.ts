// This address is configured by the installation, never by an API request.
export function getMcpInternalBaseUrl() {
  const configured = process.env.MCP_INTERNAL_URL?.trim();
  if (!configured) return `http://127.0.0.1:${process.env.MCP_PORT || "3333"}`;
  const url = new URL(configured);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
    url.search || url.hash || url.pathname !== "/") {
    throw new Error("MCP_INTERNAL_URL deve conter somente uma origem HTTP(S), sem credenciais.");
  }
  return url.origin;
}
