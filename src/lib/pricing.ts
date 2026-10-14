import Decimal from "decimal.js";

export type PriceRoundingMode = "none" | "ends_90" | "ends_99" | "round_integer";
export type PriceChannel = "counter" | "ecommerce" | "marketplace";

export type PriceSafetyStatus =
  | "safe_auto"
  | "suspicious_flagged"
  | "unchanged";

export type SafetyGate =
  | "none"
  | "missing_cost"
  | "missing_current_price"
  | "spike_threshold_exceeded"
  | "margin_below_minimum"
  | "missing_market_reference";

export type PricingInput = {
  cost: number;
  feesPercent: number;
  additionalCostsPercent?: number;
  desiredMarginPercent: number;
  marketDiscountPercent?: number;
  marketPrice?: number | null;
  // Enhanced Autopilot parameters:
  currentPrice?: number;
  minimumMarginPercent?: number;
  maxChangePercent?: number;
  roundingMode?: PriceRoundingMode;
};

export type PricingResult = {
  minimumPrice: number;
  suggestedPrice: number;
  rawSuggestedPrice: number;
  projectedMargin: number;
  priceDifference: number;
  percentageChange: number;
  safetyStatus: PriceSafetyStatus;
  safetyGate: SafetyGate;
  safetyReason: string;
  safetyFlag: string | null;
};

export function applyPriceRounding(
  rawPrice: number,
  mode: PriceRoundingMode = "none",
  minimumPrice: number = 0
): number {
  if (rawPrice <= 0) return 0;
  if (mode === "none") {
    const rounded = new Decimal(rawPrice).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
    return rounded < minimumPrice ? minimumPrice : rounded;
  }

  let rounded: number;
  if (mode === "ends_90") {
    const floor = Math.floor(rawPrice);
    const candidates = [floor - 1 + 0.9, floor + 0.9, floor + 1 + 0.9]
      .filter((c) => c > 0 && c >= minimumPrice - 0.001);

    if (candidates.length === 0) {
      let c = Math.floor(minimumPrice) + 0.9;
      if (c < minimumPrice) c += 1;
      rounded = c;
    } else {
      candidates.sort((a, b) => Math.abs(a - rawPrice) - Math.abs(b - rawPrice));
      rounded = candidates[0];
    }
  } else if (mode === "ends_99") {
    const floor = Math.floor(rawPrice);
    const candidates = [floor - 1 + 0.99, floor + 0.99, floor + 1 + 0.99]
      .filter((c) => c > 0 && c >= minimumPrice - 0.001);

    if (candidates.length === 0) {
      let c = Math.floor(minimumPrice) + 0.99;
      if (c < minimumPrice) c += 1;
      rounded = c;
    } else {
      candidates.sort((a, b) => Math.abs(a - rawPrice) - Math.abs(b - rawPrice));
      rounded = candidates[0];
    }
  } else if (mode === "round_integer") {
    let intVal = Math.round(rawPrice);
    if (intVal < minimumPrice) {
      intVal = Math.ceil(minimumPrice);
    }
    rounded = intVal;
  } else {
    rounded = rawPrice;
  }

  // Safety invariant: rounded price must NEVER breach minimumPrice
  if (rounded < minimumPrice) {
    if (mode === "ends_90") {
      let c = Math.floor(minimumPrice) + 0.9;
      if (c < minimumPrice) c += 1;
      rounded = c;
    } else if (mode === "ends_99") {
      let c = Math.floor(minimumPrice) + 0.99;
      if (c < minimumPrice) c += 1;
      rounded = c;
    } else if (mode === "round_integer") {
      rounded = Math.ceil(minimumPrice);
    } else {
      rounded = minimumPrice;
    }
  }

  return new Decimal(rounded).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

export function calculateRecommendation(input: PricingInput): PricingResult {
  const cost = new Decimal(input.cost);
  const fees = new Decimal(input.feesPercent).div(100);
  const additionalCosts = new Decimal(input.additionalCostsPercent ?? 0).div(100);
  const desiredMargin = new Decimal(input.desiredMarginPercent).div(100);

  const minMarginPercent = input.minimumMarginPercent ?? input.desiredMarginPercent;
  const minMargin = new Decimal(minMarginPercent).div(100);

  const minDenominator = new Decimal(1).minus(fees).minus(additionalCosts).minus(minMargin);
  if (minDenominator.lte(0)) {
    throw new Error("A soma de taxas, custos adicionais e margem mínima deve ser menor que 100%.");
  }

  const desiredDenominator = new Decimal(1).minus(fees).minus(additionalCosts).minus(desiredMargin);
  if (desiredDenominator.lte(0)) {
    throw new Error("A soma de taxas, custos adicionais e margem deve ser menor que 100%.");
  }

  const hardMinimumDecimal = cost.div(minDenominator);
  const desiredFloorDecimal = cost.div(desiredDenominator);

  const marketMultiplier = new Decimal(1).minus(new Decimal(input.marketDiscountPercent ?? 2).div(100));
  const marketTarget = input.marketPrice == null || input.marketPrice <= 0 ? null : new Decimal(input.marketPrice).mul(marketMultiplier);

  let rawSuggestedDecimal = marketTarget == null || desiredFloorDecimal.gt(marketTarget)
    ? desiredFloorDecimal
    : marketTarget;

  if (hardMinimumDecimal.gt(rawSuggestedDecimal)) {
    rawSuggestedDecimal = hardMinimumDecimal;
  }

  // A profitable floor must round up: half-up can fall below the exact minimum.
  const minimumPrice = hardMinimumDecimal.toDecimalPlaces(2, Decimal.ROUND_CEIL).toNumber();
  const rawSuggestedPrice = rawSuggestedDecimal.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();

  const roundingMode = input.roundingMode ?? "none";
  const suggestedPrice = applyPriceRounding(rawSuggestedPrice, roundingMode, minimumPrice);

  const suggestedDecimal = new Decimal(suggestedPrice);
  const projectedMarginDecimal = suggestedDecimal.gt(0)
    ? suggestedDecimal.mul(new Decimal(1).minus(fees).minus(additionalCosts)).minus(cost).div(suggestedDecimal).mul(100)
    : new Decimal(0);
  const projectedMargin = projectedMarginDecimal.toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();

  const currentPrice = input.currentPrice ?? 0;
  const priceDifference = Number(new Decimal(suggestedPrice).minus(currentPrice).toFixed(2));
  const percentageChange = currentPrice > 0
    ? Number(new Decimal(priceDifference).div(currentPrice).mul(100).toFixed(2))
    : 0;

  const maxChange = input.maxChangePercent ?? 15;
  let safetyStatus: PriceSafetyStatus = "safe_auto";
  let safetyGate: SafetyGate = "none";
  let safetyFlag: string | null = null;
  let safetyReason = `Alteração segura (${percentageChange >= 0 ? "+" : ""}${percentageChange}%) com margem de ${projectedMargin.toFixed(1)}%.`;

  if (input.cost <= 0) {
    safetyStatus = "suspicious_flagged";
    safetyGate = "missing_cost";
    safetyFlag = "Informe o custo de aquisição do produto antes de usar uma sugestão de preço.";
    safetyReason = safetyFlag;
  } else if (currentPrice <= 0) {
    safetyStatus = "suspicious_flagged";
    safetyGate = "missing_current_price";
    safetyFlag = "Informe o preço de venda atual para comparar a sugestão com segurança.";
    safetyReason = safetyFlag;
  } else if (input.marketPrice == null || input.marketPrice <= 0) {
    safetyStatus = "suspicious_flagged";
    safetyGate = "missing_market_reference";
    safetyFlag = "Sem cotação externa de mercado: cálculo restrito a custo, taxas e margem desejada.";
    safetyReason = safetyFlag;
  } else if (projectedMargin < minMarginPercent - 0.05) {
    safetyStatus = "suspicious_flagged";
    safetyGate = "margin_below_minimum";
    safetyFlag = `Trava de rentabilidade acionada: margem projetada (${projectedMargin.toFixed(1)}%) abaixo do piso de segurança (${minMarginPercent}%).`;
    safetyReason = safetyFlag;
  } else if (currentPrice > 0 && Math.abs(percentageChange) > maxChange) {
    safetyStatus = "suspicious_flagged";
    safetyGate = "spike_threshold_exceeded";
    safetyFlag = `Trava de oscilação acionada: variação de ${percentageChange >= 0 ? "+" : ""}${percentageChange}% excede a trava segura autorizada (${maxChange}%).`;
    safetyReason = safetyFlag;
  } else if (currentPrice > 0 && Math.abs(priceDifference) < 0.01) {
    safetyStatus = "unchanged";
    safetyGate = "none";
    safetyFlag = null;
    safetyReason = "Preço atual coincide exatamente com a recomendação do motor.";
  }

  return {
    minimumPrice,
    suggestedPrice,
    rawSuggestedPrice,
    projectedMargin,
    priceDifference,
    percentageChange,
    safetyStatus,
    safetyGate,
    safetyReason,
    safetyFlag,
  };
}
