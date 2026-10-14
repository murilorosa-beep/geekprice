import type { DefaultSession } from "next-auth";
import type { MemberRole } from "@/server/auth/permissions";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & { id: string; organizationId: string; role: MemberRole; authVersion: number };
  }
  interface User { organizationId: string; role: MemberRole; authVersion: number }
}

declare module "next-auth/jwt" {
  interface JWT { userId: string; organizationId: string; role: MemberRole; authVersion: number }
}
