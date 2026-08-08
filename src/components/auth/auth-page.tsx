"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole, Mail, Sparkles, UserRound } from "lucide-react";
import { signIn, signUp } from "@/lib/auth/auth-service";

interface AuthPageProps {
  mode: "login" | "signup";
}
function friendlyAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials") || normalized.includes("e-mail ou senha incorretos")) return "E-mail ou senha incorretos.";
  if (normalized.includes("user already registered") || normalized.includes("já possui uma conta")) return "Este e-mail já possui uma conta.";
  if (normalized.includes("password") || normalized.includes("senha")) return "A senha não atende aos requisitos de segurança.";
  if (normalized.includes("rate limit")) return "Muitas tentativas. Aguarde um pouco e tente novamente.";
  return "Não foi possível concluir. Revise os dados e tente novamente.";
}

export function AuthPage({ mode }: AuthPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isLogin = mode === "login";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);

    try {
      if (isLogin) {
        await signIn(email.trim(), password);
        const requestedPath = searchParams.get("next");
        const destination = requestedPath?.startsWith("/") && !requestedPath.startsWith("//")
          ? requestedPath
          : "/hoje";
        router.replace(destination);
        router.refresh();
      } else {
        const result = await signUp({
          displayName: displayName.trim(),
          email: email.trim(),
          password,
        });
        void result;
        router.replace("/hoje");
        router.refresh();
      }
    } catch (caughtError) {
      setError(friendlyAuthError(caughtError instanceof Error ? caughtError.message : ""));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link className="brand" href="/login">
          <span className="brand-mark"><Sparkles size={19} /></span>
          <span>Study Flow</span>
        </Link>
        <div className="auth-aside__copy">
          <span className="page-eyebrow">Seu ritmo. Seu plano.</span>
          <h1>Organize o estudo.<br />Mantenha o fluxo.</h1>
          <p>Calendário, fontes oficiais e desempenho em um único lugar — privado para cada usuário.</p>
        </div>
        <div className="auth-security-note"><LockKeyhole size={16} /><span>SQLite e arquivos privados permanecem neste computador</span></div>
      </section>

      <section className="auth-form-wrap">
        <div className="auth-form-card">
          <header>
            <span className="auth-mobile-brand"><Sparkles size={16} /> Study Flow</span>
            <h2>{isLogin ? "Boas-vindas de volta" : "Crie sua conta"}</h2>
            <p>{isLogin ? "Entre para continuar seu plano de estudos." : "Comece com um plano privado e organizado."}</p>
          </header>

          <form onSubmit={handleSubmit}>
            {!isLogin ? (
              <label className="field">
                <span>Nome</span>
                <div className="auth-input"><UserRound size={16} /><input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} placeholder="Como quer ser chamado?" required value={displayName} /></div>
              </label>
            ) : null}
            <label className="field">
              <span>E-mail</span>
              <div className="auth-input"><Mail size={16} /><input autoComplete="email" onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required type="email" value={email} /></div>
            </label>
            <label className="field">
              <span>Senha</span>
              <div className="auth-input"><LockKeyhole size={16} /><input autoComplete={isLogin ? "current-password" : "new-password"} minLength={8} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 8 caracteres" required type="password" value={password} /></div>
            </label>

            {error ? <p className="auth-message auth-message--error">{error}</p> : null}
            <button className="button button--primary auth-submit" disabled={submitting} type="submit">
              {submitting ? "Aguarde…" : isLogin ? "Entrar" : "Criar conta"}
              {!submitting ? <ArrowRight size={17} /> : null}
            </button>
          </form>

          <footer>
            {isLogin ? "Ainda não tem conta?" : "Já possui uma conta?"}{" "}
            <Link href={isLogin ? "/cadastro" : "/login"}>{isLogin ? "Criar conta" : "Entrar"}</Link>
          </footer>
        </div>
      </section>
    </main>
  );
}
