export const roles = ["owner", "admin", "member"] as const;
export type MemberRole = (typeof roles)[number];

const rank: Record<MemberRole, number> = { member: 1, admin: 2, owner: 3 };

export function hasMinimumRole(actual: MemberRole, required: MemberRole) {
  return rank[actual] >= rank[required];
}

export function assertSameOrganization(sessionOrganizationId: string, resourceOrganizationId: string) {
  if (sessionOrganizationId !== resourceOrganizationId) throw new Error("FORBIDDEN");
}
