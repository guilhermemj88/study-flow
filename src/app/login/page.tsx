import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return <Suspense><AuthPage mode="login" /></Suspense>;
}
