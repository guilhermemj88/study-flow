import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export interface SignUpInput {
  displayName: string;
  email: string;
  password: string;
  emailRedirectTo: string;
}
export async function signIn(email: string, password: string) {
  const { error } = await createClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUp(input: SignUpInput): Promise<{ needsEmailConfirmation: boolean }> {
  const { data, error } = await createClient().auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      emailRedirectTo: input.emailRedirectTo,
      data: { display_name: input.displayName },
    },
  });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function signOut() {
  const { error } = await createClient().auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await createClient().auth.getUser();
  if (error) return null;
  return data.user;
}
