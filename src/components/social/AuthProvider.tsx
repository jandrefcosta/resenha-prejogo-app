'use client';

import { AuthContext, useAuthState } from '@/hooks/useAuth';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const state = useAuthState();
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}
