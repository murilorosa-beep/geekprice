// Read-only administrative-account inspection. It never emits an email, password,
// hash, token, or connection string.
import fs from "node:fs";
import postgres from "postgres";

const connection = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!connection || !process.env.DATABASE_SSL_CA_PATH) {
  throw new Error("DATABASE_URL e DATABASE_SSL_CA_PATH são necessários.");
}

const client = postgres(connection, {
  ssl: { ca: fs.readFileSync(process.env.DATABASE_SSL_CA_PATH, "utf8"), rejectUnauthorized: true },
  prepare: false,
  max: 1,
  connect_timeout: 10,
});
const email = (process.env.ADMIN_EMAIL || process.env.SEED_ADMIN_EMAIL || "admin@geekprice.com.br").trim().toLowerCase();

try {
  const rows = await client.begin("read only", async (tx) => tx`
    select
      active,
      email_verified_at is not null as email_verified,
      session_version,
      updated_at,
      case
        when password_hash like '$argon2%' then 'argon2'
        when password_hash like '$2%' then 'bcrypt'
        else 'unknown'
      end as password_scheme
    from users
    where lower(email) = ${email}
    limit 1
  `);
  console.log(JSON.stringify({
    adminAccountFound: rows.length === 1,
    account: rows.length === 1 ? rows[0] : null,
    rotationConclusion: "Metadados podem indicar atualização e invalidação, mas não provam que uma senha histórica deixou de funcionar sem um teste autorizado com essa senha.",
  }, null, 2));
} finally {
  await client.end();
}
