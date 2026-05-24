import { useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { AdminUser, AdminRole } from '../types/admin';

interface AuthState {
  user: User | null;
  adminUser: AdminUser | null;
  loading: boolean;
  error: string | null;
}

const OWNER_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

async function resolveAdminUser(user: User): Promise<AdminUser | null> {
  // Önce adminUsers koleksiyonuna bak (mevcut adminler)
  const adminRef = doc(db, 'adminUsers', user.uid);
  const adminSnap = await getDoc(adminRef);

  if (adminSnap.exists()) {
    const data = adminSnap.data() as AdminUser;
    // Eski kayıtlarda isActive olmayabilir — varsayılan true
    const adminUser: AdminUser = { isActive: true, ...data, lastLoginAt: new Date().toISOString() };
    await updateDoc(adminRef, { lastLoginAt: new Date().toISOString(), isActive: adminUser.isActive });
    return adminUser;
  }

  // VITE_ADMIN_EMAIL ile giriş yapan kullanıcıyı otomatik owner yap
  if (OWNER_EMAIL && user.email === OWNER_EMAIL) {
    const adminUser: AdminUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? undefined,
      role: 'owner',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    await setDoc(adminRef, adminUser);
    return adminUser;
  }

  // Sonra users koleksiyonuna bak — isAdmin: true olan KurdîGo kullanıcıları
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    const userData = userSnap.data();
    if (userData.isAdmin === true) {
      const role: AdminRole = userData.adminRole ?? 'content_editor';
      const adminUser: AdminUser = {
        uid: user.uid,
        email: user.email!,
        displayName: user.displayName ?? userData.name ?? undefined,
        role,
        isActive: true,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      await setDoc(adminRef, adminUser);
      return adminUser;
    }
  }

  return null;
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

      try {
        const adminUser = await resolveAdminUser(user);

        if (!adminUser) {
          await signOut(auth);
          setState({ user: null, adminUser: null, loading: false, error: 'Bu hesabın admin erişimi yok.' });
          return;
        }

        if (!adminUser.isActive) {
          await signOut(auth);
          setState({ user: null, adminUser: null, loading: false, error: 'Hesabınız devre dışı bırakılmış.' });
          return;
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
