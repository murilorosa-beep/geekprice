import { notFound } from "next/navigation";
import { requireOrganization } from "@/server/auth/context";
import { MypPublicTest } from "@/components/myp-public-test";

export default async function MypTestPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  await requireOrganization("admin");
  return <MypPublicTest />;
}
