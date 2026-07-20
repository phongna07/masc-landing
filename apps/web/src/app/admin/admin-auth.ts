import { getAdminByEmail } from "@masc-landing/api/admin-access";
import {
  adminRoleConfig,
  canAccessAdminArea,
  type AdminArea,
} from "@masc-landing/api/admin-roles";
import { redirect } from "next/navigation";
import { cache } from "react";

import { getFreshServerSession } from "@/lib/server-session";

const getCurrentAdmin = cache(async () => {
  const session = await getFreshServerSession();
  const admin = session?.user
    ? await getAdminByEmail(session.user.email)
    : null;

  return { session, admin };
});

export async function requireAdmin() {
  const { session, admin } = await getCurrentAdmin();

  if (!session?.user) {
    redirect("/login");
  }

  if (!admin) {
    redirect("/");
  }

  return admin;
}

export async function requireAdminArea(area: AdminArea) {
  const admin = await requireAdmin();

  if (!canAccessAdminArea(admin.role, area)) {
    redirect(adminRoleConfig[admin.role].defaultRoute);
  }

  return admin;
}
