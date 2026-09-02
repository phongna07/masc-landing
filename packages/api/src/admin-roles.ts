import type { AdminRole } from "@masc-landing/db/schema/admin-emails";

export type { AdminRole } from "@masc-landing/db/schema/admin-emails";

export const adminAreas = [
  "overview",
  "announcements",
  "users",
  "teams",
  "mail",
  "rounds",
  "roundOneCvScreening",
  "activityLogs",
] as const;

export type AdminArea = (typeof adminAreas)[number];

export const adminRoleConfig = {
  root: {
    defaultRoute: "/admin",
    allowedAreas: adminAreas,
  },
  professional: {
    defaultRoute: "/admin/cv-screening-round-1",
    allowedAreas: ["roundOneCvScreening"],
  },
} as const satisfies Record<
  AdminRole,
  { defaultRoute: string; allowedAreas: readonly AdminArea[] }
>;

export function canAccessAdminArea(role: AdminRole, area: AdminArea) {
  return (adminRoleConfig[role].allowedAreas as readonly AdminArea[]).includes(area);
}
