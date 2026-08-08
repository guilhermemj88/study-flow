import Link from "next/link";

export default function ForbiddenPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <span className="eyebrow">Acesso restrito</span>
        <h1>Esta área é exclusiva para administradores.</h1>
        <p>Sua conta continua com acesso normal às áreas de estudo do Study Flow.</p>
        <Link className="button button--primary" href="/">
          Voltar ao início
        </Link>
      </section>
    </main>
  );
}
