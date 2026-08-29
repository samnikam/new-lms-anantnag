import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, setAccessToken } from './api';

export type Role =
  | 'SUPER_ADMIN'
  | 'ACADEMIC_ADMIN'
  | 'TEACHER'
  | 'STUDENT'
  | 'PARENT'
  | 'CONTENT_MANAGER'
  | 'DEPT_OVERSIGHT';

export interface SessionUser {
  id: string;
  fullName: string;
  email?: string | null;
  role: Role;
  siteId?: string | null;
  site?: { id: string; name: string; code: string } | null;
  locale?: string;
  children?: Array<{ id: string; fullName: string }>;
}

/** A classroom panel signed in with kiosk credentials, not a person. */
export interface KioskSession {
  id: string;
  name: string;
  code: string;
  siteName: string;
  isStudio: boolean;
}

interface AuthContextValue {
  user: SessionUser | null;
  kiosk: KioskSession | null;
  loading: boolean;
  signIn: (identifier: string, password: string) => Promise<void>;
  signInKiosk: (kioskUsername: string, kioskPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [kiosk, setKiosk] = useState<KioskSession | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on load: the refresh cookie survives a page reload.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const savedKiosk = sessionStorage.getItem('lms:kiosk');
      const savedKioskToken = sessionStorage.getItem('lms:kioskToken');
      if (savedKiosk && savedKioskToken) {
        setAccessToken(savedKioskToken);
        setKiosk(JSON.parse(savedKiosk));
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.post<{ accessToken: string }>('/auth/refresh');
        setAccessToken(data.accessToken);
        const me = await api.get<SessionUser>('/auth/me');
        if (!cancelled) setUser(me.data);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // The API client raises this when a refresh fails outright.
  useEffect(() => {
    const onSignedOut = () => {
      setUser(null);
      setKiosk(null);
    };
    window.addEventListener('lms:signed-out', onSignedOut);
    return () => window.removeEventListener('lms:signed-out', onSignedOut);
  }, []);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const { data } = await api.post<{ accessToken: string; user: SessionUser }>('/auth/login', {
      identifier,
      password,
    });
    setAccessToken(data.accessToken);
    const me = await api.get<SessionUser>('/auth/me');
    setUser(me.data);
  }, []);

  const signInKiosk = useCallback(async (kioskUsername: string, kioskPassword: string) => {
    const { data } = await api.post<{ accessToken: string; classroom: any }>('/auth/kiosk/login', {
      kioskUsername,
      kioskPassword,
    });
    const session: KioskSession = {
      id: data.classroom.id,
      name: data.classroom.name,
      code: data.classroom.code,
      siteName: data.classroom.siteName,
      isStudio: data.classroom.isStudio,
    };
    setAccessToken(data.accessToken);
    // Kiosk tokens are per-device and last one school day.
    sessionStorage.setItem('lms:kiosk', JSON.stringify(session));
    sessionStorage.setItem('lms:kioskToken', data.accessToken);
    setKiosk(session);
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/auth/logout').catch(() => undefined);
    sessionStorage.removeItem('lms:kiosk');
    sessionStorage.removeItem('lms:kioskToken');
    setAccessToken(null);
    setUser(null);
    setKiosk(null);
  }, []);

  const value = useMemo(
    () => ({ user, kiosk, loading, signIn, signInKiosk, signOut }),
    [user, kiosk, loading, signIn, signInKiosk, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ACADEMIC_ADMIN: 'Academic Admin',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
  PARENT: 'Parent / Guardian',
  CONTENT_MANAGER: 'Content Manager',
  DEPT_OVERSIGHT: 'Department Oversight',
};
