"use client";

import { useEffect, useState } from "react";
import type { LocalAuthUser } from "@/types/auth";
import { getCurrentUser } from "@/lib/auth/auth-service";

export function useAuthUser() {
  const [user, setUser] = useState<LocalAuthUser | null>(null);

  useEffect(() => {
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
