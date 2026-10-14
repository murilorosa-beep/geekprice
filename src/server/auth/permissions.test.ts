import { describe, expect, it } from "vitest";
import { assertSameOrganization, hasMinimumRole } from "./permissions";

describe("isolamento por organização", () => {
  it("recusa recurso pertencente a outra loja", () => {
    expect(() => assertSameOrganization("org-a", "org-b")).toThrow("FORBIDDEN");
  });
  it("aceita somente a mesma organização", () => {
    expect(() => assertSameOrganization("org-a", "org-a")).not.toThrow();
  });
  it("aplica a hierarquia de papéis", () => {
    expect(hasMinimumRole("owner", "admin")).toBe(true);
    expect(hasMinimumRole("member", "admin")).toBe(false);
  });
});
