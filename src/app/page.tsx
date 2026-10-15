import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth/options";
import { getOrganizationSessionContext } from "@/server/auth/context";
import { listPublicSoftwareCatalog } from "@/server/platform/service";
import { MarketingHome } from "@/components/marketing-home";

export const metadata = {
  title: "GeekPrice — Software para o universo geek",
  description: "Conheça o GeekPrice: catálogo, estoque e inteligência de preços para lojas de Pokémon, Magic e colecionáveis. Sua loja geek, com uma gestão à altura.",
};

export default async function PublicMarketingPage() {
  const session = await getServerSession(authOptions);

  // Se o assinante já estiver autenticado, vai direto para o painel de controle
  if (session?.user?.id) {
    let target = "/dashboard";
    try {
      const ctx = await getOrganizationSessionContext();
      if (!ctx.onboardingCompleted) {
        target = "/onboarding";
      }
    } catch {
      target = ""; // Sessão expirada ou inválida; continua na vitrine
    }
    if (target) {
      redirect(target);
    }
  }

  const products = await listPublicSoftwareCatalog();
  return <MarketingHome products={products.map((product) => ({
    id: product.id, code: product.code, name: product.name, tagline: product.tagline,
    description: product.description, marketingFeatures: product.marketingFeatures,
    plans: product.plans.map((plan) => ({
      id: plan.id, code: plan.code, name: plan.name, description: plan.description,
      monthlyPrice: plan.monthlyPrice, productLimit: plan.productLimit,
      memberLimit: plan.memberLimit, trialDays: plan.trialDays, features: plan.features,
    })),
  }))}/>;
}
