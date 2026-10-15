import { and, eq, or, sql } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { z } from "zod";
import { db } from "@/db";
import { memberships, organizations, users } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";
import { assertLoginAllowed, clearLoginFailures, getLoginOrigin, getLoginOriginHash, recordLoginFailure } from "./rate-limit";

const credentialsSchema = z.object({
  email: z.string().trim().min(2).max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
});

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [CredentialsProvider({
    name: "E-mail e senha",
    credentials: { email: { label: "E-mail", type: "email" }, password: { label: "Senha", type: "password" } },
    async authorize(raw, request) {
      const parsed = credentialsSchema.safeParse(raw);
      if (!parsed.success) return null;
      return db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${parsed.data.email}, 3))`);
      const originHash = getLoginOriginHash(getLoginOrigin(request.headers));
      await assertLoginAllowed(parsed.data.email, originHash, tx);
      const identifier = parsed.data.email;
      const isEmail = identifier.includes("@");
      const userCondition = isEmail
        ? eq(sql`lower(${users.email})`, identifier)
        : or(
            eq(sql`lower(${users.email})`, identifier),
            eq(sql`lower(${users.email})`, `${identifier}@geekprice.com.br`),
            eq(sql`lower(split_part(${users.email}, '@', 1))`, identifier)
          );

      const [record] = await tx.select({
        id: users.id, name: users.name, email: users.email, passwordHash: users.passwordHash,
        active: users.active, emailVerifiedAt: users.emailVerifiedAt, authVersion: users.sessionVersion,
        organizationId: organizations.id, role: memberships.role,
      }).from(users)
        .innerJoin(memberships, eq(memberships.userId, users.id))
        .innerJoin(organizations, eq(organizations.id, memberships.organizationId))
        .where(and(userCondition, eq(users.active, true))).limit(1);
      const passwordResult = record ? await verifyPassword(record.passwordHash, parsed.data.password) : { valid: false, needsUpgrade: false };
      if (!record || !passwordResult.valid) {
        await recordLoginFailure(parsed.data.email, originHash, tx);
        if (record && record.email.toLowerCase() !== parsed.data.email) {
          await recordLoginFailure(record.email.toLowerCase(), originHash, tx);
        }
        return null;
      }
      if (!record.emailVerifiedAt) return null;
      await clearLoginFailures(parsed.data.email, originHash, tx);
      if (record.email.toLowerCase() !== parsed.data.email) {
        await clearLoginFailures(record.email.toLowerCase(), originHash, tx);
      }
      if (passwordResult.needsUpgrade) {
        await tx.update(users).set({ passwordHash: await hashPassword(parsed.data.password), updatedAt: new Date() }).where(eq(users.id, record.id));
      }
      return { id: record.id, name: record.name, email: record.email, organizationId: record.organizationId, role: record.role, authVersion: record.authVersion };
      });
    },
  })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) { token.userId = user.id; token.organizationId = user.organizationId; token.role = user.role; token.authVersion = user.authVersion; }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId;
        session.user.organizationId = token.organizationId;
        session.user.role = token.role;
        session.user.authVersion = token.authVersion;
      }
      return session;
    },
  },
};
