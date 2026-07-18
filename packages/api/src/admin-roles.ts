import type { AdminRole } from "@masc-landing/db/schema/admin-emails";

export type { AdminRole } from "@masc-landing/db/schema/admin-emails";

export const adminAreas = [
  "overview",
  "announcements",
  "users",
  "teams",
  "mail",
  "rounds",
] as const;

export type AdminArea = (typeof adminAreas)[number];

export const adminRoleConfig = {
  root: {
    defaultRoute: "/admin",
    allowedAreas: adminAreas,
  },
  professional: {
    defaultRoute: "/admin/teams",
    allowedAreas: ["teams", "mail"],
  },
} as const satisfies Record<
  AdminRole,
  { defaultRoute: string; allowedAreas: readonly AdminArea[] }
>;

export function canAccessAdminArea(role: AdminRole, area: AdminArea) {
  return (adminRoleConfig[role].allowedAreas as readonly AdminArea[]).includes(area);
}
