export type MembershipRole = "owner" | "admin" | "member";

export type MasterAdminMembershipRepository = {
  findByUserAndOrganization(userId: string, organizationId: string): Promise<{ role: MembershipRole } | undefined>;
  createOwner(userId: string, organizationId: string): Promise<void>;
  promoteToOwner(userId: string, organizationId: string): Promise<void>;
};

export type MasterAdminMembershipResult = "created" | "promoted" | "preserved";

/**
 * Gives the master account ownership only of the dedicated administrative
 * organization. A master user can also belong to customer organizations; those
 * memberships are deliberately never read or modified by this operation.
 */
export async function ensureMasterAdminOrganizationOwner(
  repository: MasterAdminMembershipRepository,
  userId: string,
  organizationId: string,
): Promise<MasterAdminMembershipResult> {
  const membership = await repository.findByUserAndOrganization(userId, organizationId);
  if (!membership) {
    await repository.createOwner(userId, organizationId);
    return "created";
  }
  if (membership.role !== "owner") {
    await repository.promoteToOwner(userId, organizationId);
    return "promoted";
  }
  return "preserved";
}
