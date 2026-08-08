import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return <Suspense><AuthPage mode="signup" /></Suspense>;
}
