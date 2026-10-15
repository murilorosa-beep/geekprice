export type ProductStatus = "attention" | "healthy" | "opportunity";

export type Product = {
  id: string;
  name: string;
  set: string;
  code: string;
  category: string;
  cost: number;
  currentPrice: number;
  marketPrice: number | null;
  stock: number;
  desiredMarginPercent: number;
  change: number;
  status: ProductStatus;
  image: string;
  imageUrl?: string | null;
};

export type DashboardData = {
  products: Product[];
  alerts: Alert[];
  userName: string;
  organizationName: string;
  role: import("@/server/auth/permissions").MemberRole;
  planLabel: string;
  pricing: {
    feePercent: number;
    additionalCostPercent: number;
    minimumMarginPercent: number;
    desiredMarginPercent: number;
    marketDiscountPercent: number;
  };
  initialHistory?: {
    hasData: boolean;
    days: number;
    points: Array<{
      date: string;
      displayDate: string;
      marketPrice: number | null;
      storePrice: number | null;
    }>;
    summary: {
      minPrice: number;
      maxPrice: number;
      avgMarketPrice: number;
      percentageChange: number;
      totalObservations: number;
    } | null;
  };
};

export type Alert = {
  id: string;
  title: string;
  description: string;
  time: string;
  tone: "amber" | "green" | "blue";
};
