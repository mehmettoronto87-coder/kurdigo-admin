import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { AdminUser } from '../types/admin';

const ALLOWED_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string;

interface AuthState {
  user: User | null;
  adminUser: AdminUser | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    adminUser: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ user: null, adminUser: null, loading: false, error: null });
        return;
      }

      if (user.email !== ALLOWED_EMAIL) {
        await signOut(auth);
        setState({ user: null, adminUser: null, loading: false, error: 'Bu hesabın admin erişimi yok.' });
        return;
      }

      try {
        const adminRef = doc(db, 'adminUsers', user.uid);
        const snap = await getDoc(adminRef);

        let adminUser: AdminUser;
        if (snap.exists()) {
          adminUser = snap.data() as AdminUser;
        } else {
          adminUser = {
            uid: user.uid,
            email: user.email!,
            displayName: user.displayName ?? undefined,
            role: 'owner',
            createdAt: new Date().toISOString(),
          };
          await setDoc(adminRef, adminUser);
        }

        setState({ user, adminUser, loading: false, error: null });
      } catch {
        setState({ user, adminUser: null, loading: false, error: 'Kullanıcı verisi alınamadı.' });
      }
    });

    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch {
      setState(s => ({ ...s, loading: false, error: 'Giriş başarısız. Email veya şifre hatalı.' }));
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  return { ...state, login, logout };
}
