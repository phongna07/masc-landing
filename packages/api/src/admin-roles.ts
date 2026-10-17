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
  "tickets",
  "checkIn",
  "manageAdmins",
] as const;

export type AdminArea = (typeof adminAreas)[number];

export const adminRoleConfig = {
  developer: {
    defaultRoute: "/admin",
    allowedAreas: adminAreas,
  },
  root: {
    defaultRoute: "/admin",
    allowedAreas: adminAreas.filter((area) => area !== "manageAdmins"),
  },
  professional: {
    defaultRoute: "/admin/cv-screening-round-1",
    allowedAreas: ["rounds", "roundOneCvScreening"],
  },
  "entrance-staff": {
    defaultRoute: "/admin/check-in",
    allowedAreas: ["checkIn"],
  },
} as const satisfies Record<
  AdminRole,
  { defaultRoute: string; allowedAreas: readonly AdminArea[] }
>;

export function canAccessAdminArea(role: AdminRole, area: AdminArea) {
  return (adminRoleConfig[role].allowedAreas as readonly AdminArea[]).includes(area);
}
