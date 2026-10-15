import { describe, expect, it, vi } from "vitest";
import { ensureMasterAdminOrganizationOwner } from "./master-admin-membership";

const userId = "master-user";
const adminOrganizationId = "geekprice-admin";

describe("ensureMasterAdminOrganizationOwner", () => {
  it("promotes only the GeekPrice Admin membership when a user belongs to multiple organizations", async () => {
    const repository = {
      findByUserAndOrganization: vi.fn().mockResolvedValue({ role: "admin" }),
      createOwner: vi.fn(),
      promoteToOwner: vi.fn(),
    };

    await expect(ensureMasterAdminOrganizationOwner(repository, userId, adminOrganizationId)).resolves.toBe("promoted");
    expect(repository.findByUserAndOrganization).toHaveBeenCalledWith(userId, adminOrganizationId);
    expect(repository.promoteToOwner).toHaveBeenCalledExactlyOnceWith(userId, adminOrganizationId);
    expect(repository.createOwner).not.toHaveBeenCalled();
  });

  it("does not mutate an existing owner membership", async () => {
    const repository = {
      findByUserAndOrganization: vi.fn().mockResolvedValue({ role: "owner" }),
      createOwner: vi.fn(),
      promoteToOwner: vi.fn(),
    };

    await expect(ensureMasterAdminOrganizationOwner(repository, userId, adminOrganizationId)).resolves.toBe("preserved");
    expect(repository.createOwner).not.toHaveBeenCalled();
    expect(repository.promoteToOwner).not.toHaveBeenCalled();
  });

  it("creates an owner membership only in the dedicated administrative organization", async () => {
    const repository = {
      findByUserAndOrganization: vi.fn().mockResolvedValue(undefined),
      createOwner: vi.fn(),
      promoteToOwner: vi.fn(),
    };

    await expect(ensureMasterAdminOrganizationOwner(repository, userId, adminOrganizationId)).resolves.toBe("created");
    expect(repository.createOwner).toHaveBeenCalledExactlyOnceWith(userId, adminOrganizationId);
    expect(repository.promoteToOwner).not.toHaveBeenCalled();
  });
});
