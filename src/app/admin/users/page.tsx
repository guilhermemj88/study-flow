import type { Metadata } from "next";
import { AdminUsersPage } from "@/components/admin/admin-users-page";
import { AppShell } from "@/components/layout/app-shell";
import { requireAdmin } from "@/lib/auth/server-session";
import { listAdminUsers } from "@/lib/local/admin-store";

export const metadata: Metadata = { title: "Usuários" };
export const dynamic = "force-dynamic";

export default async function AdminUsersRoute() {
  const admin = await requireAdmin();
  return <AppShell><AdminUsersPage currentAdminId={admin.id} initialUsers={listAdminUsers()} /></AppShell>;
}
