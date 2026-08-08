import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { getCurrentPageUser } from "@/lib/auth/server-session";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  if (await getCurrentPageUser()) redirect("/hoje");
  return <Suspense><AuthPage mode="login" /></Suspense>;
}
