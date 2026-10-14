import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";

export async function requireBillingAdministrator() {
  const allowedEmails = (process.env.BILLING_ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || !allowedEmails.includes(session.user.email.toLowerCase())) {
    return null;
  }
  return session.user;
}
