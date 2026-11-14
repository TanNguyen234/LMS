import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthResponse, User, UserRole } from '../types';
import { ApiError, clearAuthToken, getAuthToken, httpPost, setAuthToken, setUnauthorizedHandler } from '../api/http';
import { getMyProfile, normalizeUser, type ApiUser } from '../api/users';
import { demoSwitch } from '../api/demo';

/** Legacy key read by `api/client.ts`; kept in sync with the `api/http.ts` key until Wave 2 retires client.ts. */
const LEGACY_TOKEN_KEY = 'token';
const USER_STORAGE_KEY = 'user';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  /** Login with email or studentCode/staffCode. */
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => void;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  /** Development only: switch to a seeded demo account without a password. */
  switchDemoAccount: (email: string) => Promise<User>;
  /** Re-fetch `/api/auth/me` and update the cached user. */
  refreshMe: () => Promise<User | null>;
  /** Replace the cached user after a profile update. */
  setCurrentUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredToken(): string | null {
  const current = getAuthToken();
  if (current) return current;
  try {
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      setAuthToken(legacy);
      return legacy;
    }
  } catch {
    // Storage unavailable
  }
  return null;
}

function readStoredUser(): User | null {
  try {
    const saved = localStorage.getItem(USER_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as User) : null;
  } catch {
    return null;
  }
}

function persistSession(token: string, user: User): void {
  setAuthToken(token);
  try {
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable
  }
}

function persistUser(user: User): void {
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Storage unavailable
  }
}

function clearSession(): void {
  clearAuthToken();
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Storage unavailable
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<User | null>(() => (readStoredToken() ? readStoredUser() : null));
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(readStoredToken()));
  const locationRef = useRef(location);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  const logout = useCallback(() => {
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  const applySession = useCallback((response: AuthResponse): User => {
    const normalized = normalizeUser(response.user as unknown as ApiUser);
    persistSession(response.access_token, normalized);
    setToken(response.access_token);
    setUser(normalized);
    return normalized;
  }, []);

  // Any 401 from api/http.ts ends the session and returns to /login, keeping the intended destination.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
      setToken(null);
      setUser(null);
      const current = locationRef.current;
      if (current.pathname !== '/login') {
        navigate('/login', { replace: true, state: { from: current } });
      }
    });
    return () => setUnauthorizedHandler(null);
  }, [navigate]);

  const refreshMe = useCallback(async (): Promise<User | null> => {
    if (!getAuthToken()) return null;
    try {
      const fresh = await getMyProfile();
      setUser(fresh);
      persistUser(fresh);
      return fresh;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) {
        console.error('Không thể xác minh phiên đăng nhập hiện tại', err);
      }
      logout();
      return null;
    }
  }, [logout]);

  // Verify a stored session once on startup.
  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const fresh = await getMyProfile();
        if (cancelled) return;
        setUser(fresh);
        persistUser(fresh);
      } catch (err) {
        if (cancelled) return;
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error('Không thể xác minh phiên đăng nhập hiện tại', err);
        }
        clearSession();
        setToken(null);
        setUser(null);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (identifier: string, password: string): Promise<User> => {
      const response = await httpPost<AuthResponse>(
        '/auth/login',
        { identifier: identifier.trim(), password },
        { skipAuth: true, skipAuthRedirect: true },
      );
      return applySession(response);
    },
    [applySession],
  );

  const switchDemoAccount = useCallback(
    async (email: string): Promise<User> => applySession(await demoSwitch(email)),
    [applySession],
  );

  const setCurrentUser = useCallback((next: User) => {
    setUser(next);
    persistUser(next);
  }, []);

  const hasRole = useCallback(
    (roles: UserRole | UserRole[]): boolean => {
      if (!user) return false;
      const allowed = Array.isArray(roles) ? roles : [roles];
      return allowed.includes(user.role);
    },
    [user],
  );

  const value = useMemo<AuthContextType>(
    () => ({ user, token, isLoading, login, logout, hasRole, switchDemoAccount, refreshMe, setCurrentUser }),
    [user, token, isLoading, login, logout, hasRole, switchDemoAccount, refreshMe, setCurrentUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// oxlint-disable-next-line react/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
