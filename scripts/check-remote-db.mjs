const u = new URL(process.env.DATABASE_URL || "postgres://localhost/postgres");
console.log(!["localhost", "127.0.0.1", "::1", "[::1]"].includes(u.hostname));
