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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function resolveAdminUser(user: User): Promise<AdminUser | null> {
  const adminRef = doc(db, 'adminUsers', user.uid);

  // VITE_ADMIN_EMAIL ile giriş yapan kullanıcıyı hemen owner say (Firestore okumadan önce)
  if (OWNER_EMAIL && user.email === OWNER_EMAIL) {
    const baseAdmin: AdminUser = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName ?? undefined,
      role: 'owner',
      isActive: true,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    // Firestore'a kaydet — hata olsa bile girişi engelleme
    try {
      const adminSnap = await withTimeout(getDoc(adminRef), 5000);
      if (adminSnap.exists()) {
        const existing = adminSnap.data() as AdminUser;
        const merged: AdminUser = { isActive: true, ...existing, lastLoginAt: new Date().toISOString() };
        updateDoc(adminRef, { lastLoginAt: merged.lastLoginAt, isActive: true }).catch(() => {});
        return merged;
      }
      setDoc(adminRef, baseAdmin).catch(() => {});
    } catch {
      // Firestore erişilemese bile owner'ı içeri al
    }
    return baseAdmin;
  }

  // Diğer kullanıcılar için adminUsers koleksiyonunu kontrol et (UID ile)
  try {
    const adminSnap = await withTimeout(getDoc(adminRef), 5000);
    if (adminSnap.exists()) {
      const data = adminSnap.data() as AdminUser;
      const adminUser: AdminUser = { isActive: true, ...data, lastLoginAt: new Date().toISOString() };
      updateDoc(adminRef, { lastLoginAt: new Date().toISOString(), isActive: adminUser.isActive }).catch(() => {});
      return adminUser;
    }
  } catch {
    return null;
  }

  // Email ile önceden davet edilmiş pending kayıt kontrolü
  if (user.email) {
    try {
      const { collection, query, where, limit: fsLimit, getDocs } = await import('firebase/firestore');
      const pendingSnap = await withTimeout(
        getDocs(query(collection(db, 'adminUsers'), where('email', '==', user.email), fsLimit(1))),
        5000,
      );
      if (!pendingSnap.empty) {
        const data = pendingSnap.docs[0].data() as AdminUser;
        const adminUser: AdminUser = { isActive: true, ...data, uid: user.uid, lastLoginAt: new Date().toISOString() };
        // Pending kaydı gerçek UID ile güncelle
        setDoc(adminRef, adminUser).catch(() => {});
        return adminUser;
      }
    } catch { /* devam et */ }
  }

  // users koleksiyonunda isAdmin: true kontrolü
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await withTimeout(getDoc(userRef), 5000);
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
        setDoc(adminRef, adminUser).catch(() => {});
        return adminUser;
      }
    }
  } catch {
    return null;
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
