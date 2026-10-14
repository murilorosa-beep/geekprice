import "server-only";

import { resolve4 } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";

export function assertPublicIpv4(address: string): void {
  if (isIP(address) !== 4) throw new Error("Endereço IP da loja não é público.");
  const [a, b, c] = address.split(".").map(Number);
  if (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  ) throw new Error("Endereço IP da loja não é público.");
}

export function validateStoreUrl(raw: string): URL {
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (url.protocol !== "https:") throw new Error("Conexões WooCommerce devem utilizar HTTPS obrigatoriamente.");
  if (url.port && url.port !== "443") throw new Error("Porta da loja não permitida.");
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Informe apenas o domínio HTTPS da loja.");
  }
  if (isIP(url.hostname) || !url.hostname.includes(".") || url.hostname.endsWith(".local")) {
    throw new Error("A loja deve usar um domínio público.");
  }
  return url;
}

export async function safeWooGet(url: URL, authorization: string, timeoutMs: number): Promise<Response> {
  const addresses = await resolve4(url.hostname);
  if (addresses.length === 0) throw new Error("Domínio da loja sem endereço IPv4 público.");
  addresses.forEach(assertPublicIpv4);
  const pinnedAddress = addresses[0];

  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "GET",
      agent: false,
      timeout: timeoutMs,
      lookup: (_hostname, _options, callback) => callback(null, pinnedAddress, 4),
      headers: { Authorization: authorization, Accept: "application/json", "User-Agent": "GeekPrice-Commerce/1.0" },
    }, (res) => {
      const status = res.statusCode ?? 502;
      if (status >= 300 && status < 400) {
        res.destroy();
        reject(new Error("Redirecionamento da loja bloqueado."));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 5_000_000) {
          req.destroy(new Error("Resposta WooCommerce excede 5 MB."));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status,
        headers: Object.fromEntries(Object.entries(res.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
      })));
    });
    req.on("timeout", () => req.destroy(new Error("Tempo limite da loja excedido.")));
    req.on("error", reject);
    req.end();
  });
}
