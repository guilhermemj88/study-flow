export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}
export function getSupabaseConfig(): SupabasePublicConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}

export function requireSupabaseConfig(): SupabasePublicConfig {
  const config = getSupabaseConfig();
  if (!config) {
    throw new Error(
      "Supabase não configurado. Copie .env.example para .env.local e preencha as variáveis públicas.",
    );
  }
  return config;
}
