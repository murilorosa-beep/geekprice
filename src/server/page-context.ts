import "server-only";
import { redirect } from "next/navigation";
import { AuthError, getOrganizationSessionContext } from "@/server/auth/context";

export const getPrivatePageContext = async (allowBillingAccess = false) => {
  try {
    const ctx = await getOrganizationSessionContext();
    if (!allowBillingAccess && ctx.access === "blocked") {
      throw new AuthError(402, "A assinatura está cancelada ou expirada. Acesse Plano e consumo para regularizar.");
    }
    return {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      role: ctx.role,
      name: ctx.name,
      organizationName: ctx.organizationName,
      onboardingCompleted: ctx.onboardingCompleted,
      access: ctx.access,
    };
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.status === 401 || error.status === 403) {
        redirect("/login");
      }
      if (error.status === 402) {
        redirect("/billing");
      }
    }
    throw error;
  }
};
