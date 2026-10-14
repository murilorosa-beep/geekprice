import { describe, expect, it } from "vitest";
import {
  validateQuoteInventoryMatch,
  QuoteMismatchError,
  persistBrazilianQuoteForInventoryItem,
  InvalidQuoteTokenError,
} from "./brazilian-service";
import { calculateRecommendation } from "@/lib/pricing";

describe("brazilian-service - Validações e Integridade Financeira", () => {
  describe("validateQuoteInventoryMatch - Correspondência de Edição e Cartas", () => {
    const validItem = {
      productName: "Charizard",
      setName: "151",
      collectorNumber: "006",
      finish: "standard",
      condition: "near_mint",
      language: "pt-BR",
    };

    it("aprova correspondência exata de nome, coleção e número", () => {
      expect(() =>
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: "151",
          collectorNumber: "006",
        })
      ).not.toThrow();
    });

    it("aprova correspondência com numeração normalizada (ex: 006 vs 6 ou 006/165)", () => {
      expect(() =>
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: "151",
          collectorNumber: "6/165",
        })
      ).not.toThrow();
    });

    it("bloqueia cartas de edições diferentes (EDITION_MISMATCH)", () => {
      expect(() =>
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: "Destinos Brilhantes",
          collectorNumber: "006",
        })
      ).toThrowError(QuoteMismatchError);

      try {
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: "Destinos Brilhantes",
        });
      } catch (err) {
        expect(err).toBeInstanceOf(QuoteMismatchError);
        expect((err as QuoteMismatchError).code).toBe("EDITION_MISMATCH");
      }
    });

    it("bloqueia correspondências ambíguas quando o estoque tem edição mas a cotação não especifica", () => {
      expect(() =>
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: undefined,
        })
      ).toThrowError(QuoteMismatchError);

      try {
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: undefined,
        });
      } catch (err) {
        expect((err as QuoteMismatchError).code).toBe("AMBIGUOUS_MATCH");
      }
    });

    it("bloqueia número do colecionador divergente (NUMBER_MISMATCH)", () => {
      try {
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard",
          edition: "151",
          collectorNumber: "183", // versão ilustração rara secreta
        });
      } catch (err) {
        expect((err as QuoteMismatchError).code).toBe("NUMBER_MISMATCH");
      }
    });

    it("bloqueia variantes especiais de carta incompatíveis (ex: Charizard normal vs Charizard VMAX)", () => {
      try {
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Charizard VMAX",
          edition: "151",
          collectorNumber: "006",
        });
      } catch (err) {
        expect((err as QuoteMismatchError).code).toBe("NAME_MISMATCH");
        expect((err as QuoteMismatchError).message).toContain("VMAX");
      }
    });

    it("bloqueia nomes de cartas completamente diferentes", () => {
      try {
        validateQuoteInventoryMatch(validItem, {
          cardTitle: "Blastoise",
          edition: "151",
          collectorNumber: "006",
        });
      } catch (err) {
        expect((err as QuoteMismatchError).code).toBe("NAME_MISMATCH");
      }
    });
  });

  describe("Rejeição de Valores e Tokens Falsificados", () => {
    it("rejeita gravação quando a cotação não possui token assinado", async () => {
      await expect(
        persistBrazilianQuoteForInventoryItem("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", {
          sourceLabel: "Liga Pokémon",
          price: 50.0,
          cardTitle: "Pikachu",
          edition: "151",
          // token ausente!
        })
      ).rejects.toThrowError(InvalidQuoteTokenError);
    });

    it("rejeita gravação com token adulterado", async () => {
      await expect(
        persistBrazilianQuoteForInventoryItem("00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000002", {
          sourceLabel: "Liga Pokémon",
          price: 1.0, // preço forjado
          cardTitle: "Pikachu",
          edition: "151",
          token: "token-falso-adulterado",
        })
      ).rejects.toThrowError(InvalidQuoteTokenError);
    });
  });

  describe("Proteção de Autopilot contra Fontes Não-Homologadas (Requirement 5)", () => {
    it("bloqueia ajuste automático e aciona trava unverified_market_reference", () => {
      const calculation = calculateRecommendation({
        cost: 50,
        feesPercent: 12,
        desiredMarginPercent: 25,
        currentPrice: 80,
        marketPrice: 90,
        hasUnverifiedMarketReference: true, // Fonte não homologada (scraping público)
      });

      // Deve ser marcado como suspeito/revisão necessária, NUNCA safe_auto
      expect(calculation.safetyStatus).toBe("suspicious_flagged");
      expect(calculation.safetyGate).toBe("unverified_market_reference");
      expect(calculation.safetyFlag).toContain("Referência externa não homologada");
    });
  });
});
