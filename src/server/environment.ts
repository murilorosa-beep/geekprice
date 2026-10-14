import "server-only";

export type AppEnvironment = "development" | "staging" | "production" | "test";

export function getAppEnvironment(): AppEnvironment {
  if (process.env.APP_ENV) {
    const env = process.env.APP_ENV.toLowerCase();
    if (env === "production" || env === "staging" || env === "test" || env === "development") {
      return env as AppEnvironment;
    }
  }
  if (process.env.NODE_ENV === "test") return "test";
  if (process.env.NODE_ENV === "production") return "production";
  return "development";
}

/**
 * Garante que operações de teste ou dados sintéticos nunca sejam executados
 * contra a base de dados comercial de produção.
 */
export function assertSafeTestDatabase(connectionString?: string): void {
  const urlString = connectionString || process.env.DATABASE_URL;
  if (!urlString) {
    throw new Error("DATABASE_URL não está configurada.");
  }

  const url = new URL(urlString);
  const dbName = decodeURIComponent(url.pathname.slice(1));

  // No Supabase, o banco comercial é 'postgres'
  const isCommercialDb = dbName === "postgres";
  const isProd = getAppEnvironment() === "production";

  if (isCommercialDb && !isProd) {
    // Se estamos em staging/test/dev, o banco comercial padrão não pode ser alvo de writes destrutivos de teste
    if (process.env.ALLOW_COMMERCIAL_DATABASE_WRITE !== "true") {
      throw new Error(
        `Operação de teste/sintética rejeitada: o banco ativo é "${dbName}" (banco comercial de produção). Utilize um banco isolado de homologação/staging.`
      );
    }
  }
}

/**
 * Informa se geração e injeção de dados sintéticos são permitidas no ambiente atual.
 */
export function isSyntheticDataAllowed(): boolean {
  const env = getAppEnvironment();
  if (env === "production") return false;
  
  const urlString = process.env.DATABASE_URL;
  if (urlString) {
    try {
      const url = new URL(urlString);
      const dbName = decodeURIComponent(url.pathname.slice(1));
      if (dbName === "postgres") return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Validação de chave de criptografia de credenciais (32 bytes Base64).
 */
export function ensureIntegrationEncryptionKey(): void {
  const key = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY não configurada no ambiente.");
  }
  const buffer = Buffer.from(key, "base64");
  if (buffer.length !== 32) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY deve ter exatamente 32 bytes em Base64 (256 bits).");
  }
}
