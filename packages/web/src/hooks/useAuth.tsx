import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { User } from '@devpulse/shared';
import { api, session } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  /** True until the stored session has been checked against the server. */
  initializing: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // A stored token may have been revoked server-side, so it is verified once on
  // boot rather than trusted.
  useEffect(() => {
    if (!session.read()) {
      setInitializing(false);
      return;
    }

    api.auth
      .me()
      .then((res) => setUser(res.user))
      .catch(() => session.write(null))
      .finally(() => setInitializing(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.auth.login(email, password);
    session.write(res.tokens);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, name: string, password: string) => {
    const res = await api.auth.register(email, name, password);
    session.write(res.tokens);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    // Clear locally even if the server call fails, so the user is not stuck.
    await api.auth.logout().catch(() => undefined);
    session.write(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, initializing, login, register, logout }),
    [user, initializing, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside an AuthProvider');
  return context;
}
