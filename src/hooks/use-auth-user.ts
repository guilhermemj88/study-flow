"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth/auth-service";

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!getSupabaseConfig()) return;
    let active = true;
    void getCurrentUser().then((currentUser) => {
      if (active) setUser(currentUser);
    });
    return () => {
      active = false;
    };
  }, []);

  return user;
}
