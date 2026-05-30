import { useState, useEffect } from 'react';
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, type User,
} from 'firebase/auth';
import {
  doc, getDoc, setDoc, updateDoc,
  collection, query, where, getDocs, limit as fsLimit,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { AdminUser, AdminRole } from '../types/admin';
import { logAction, setAuditRole } from '../lib/auditLog';

interface AuthState {
  user: User | null;
  adminUser: AdminUser | null;
  loading: boolean;
  error: string | null;
}

const OWNER_EMAIL = import.meta.env.VITE_ADMIN_EMAIL as string | undefined;

// Brute force sabitleri
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000;  // 5 dakika
const LOCKOUT_MS       = 15 * 60 * 1000;  // 15 dakika

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

// ─── Brute Force ─────────────────────────────────────────────────────────────

function loginAttemptsDocId(email: string) {
  return email.toLowerCase().replace(/[^a-z0-9]/g, '_');
}

async function checkLoginLock(email: string): Promise<string | null> {
  try {
    const ref = doc(db, 'loginAttempts', loginAttemptsDocId(email));
    const snap = await withTimeout(getDoc(ref), 5000);
    if (!snap.exists()) return null;
    const data = snap.data();
    if (data.lockedUntil) {
      const lockedUntil: Date = data.lockedUntil instanceof Timestamp
        ? data.lockedUntil.toDate()
        : new Date(data.lockedUntil);
      if (lockedUntil > new Date()) {
        const minsLeft = Math.ceil((lockedUntil.getTime() - Date.now()) / 60_000);
        return `Çok fazla başarısız deneme. ${minsLeft} dakika sonra tekrar deneyin.`;
      }
    }
    return null;
  } catch {
    return null; // Firestore erişilemezse engelleme
  }
}

async function recordFailedAttempt(email: string): Promise<void> {
  try {
    const ref = doc(db, 'loginAttempts', loginAttemptsDocId(email));
    const snap = await withTimeout(getDoc(ref), 5000);
    const now = Date.now();
    const existing = snap.exists() ? snap.data() : {};

    const rawAttempts: number[] = (existing.attempts ?? []).map((t: unknown) =>
      t instanceof Timestamp ? t.toMillis() : Number(t)
    );
    const recent = rawAttempts.filter(t => now - t < ATTEMPT_WINDOW_MS);
    recent.push(now);

    const patch: Record<string, unknown> = { attempts: recent };
    if (recent.length >= MAX_ATTEMPTS) {
      patch.lockedUntil = new Date(now + LOCKOUT_MS).toISOString();
      logAction('login_blocked', 'auth', {
        severity: 'warning',
        overrideEmail: email,
        overrideUid: 'pre-auth',
        overrideRole: 'unknown',
        details: { failedAttempts: recent.length },
      });
    }
    await setDoc(ref, patch, { merge: true });
  } catch { /* sessizce geç */ }
}

async function clearLoginAttempts(email: string): Promise<void> {
  try {
    const ref = doc(db, 'loginAttempts', loginAttemptsDocId(email));
    await setDoc(ref, { attempts: [], lockedUntil: null }, { merge: true });
  } catch { /* sessizce geç */ }
}

// ─── Admin Çözümleme ──────────────────────────────────────────────────────────

async function resolveAdminUser(user: User): Promise<AdminUser | null> {
  const adminRef = doc(db, 'adminUsers', user.uid);

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
    try {
      const adminSnap = await withTimeout(getDoc(adminRef), 5000);
      if (adminSnap.exists()) {
        const existing = adminSnap.data() as AdminUser;
        const merged: AdminUser = { isActive: true, ...existing, lastLoginAt: new Date().toISOString() };
        updateDoc(adminRef, { lastLoginAt: merged.lastLoginAt, isActive: true }).catch(() => {});
        return merged;
      }
      setDoc(adminRef, baseAdmin).catch(() => {});
    } catch { /* Firestore erişilemese bile owner'ı içeri al */ }
    return baseAdmin;
  }

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

  if (user.email) {
    try {
      const pendingSnap = await withTimeout(
        getDocs(query(collection(db, 'adminUsers'), where('email', '==', user.email), fsLimit(1))),
        5000,
      );
      if (!pendingSnap.empty) {
        const data = pendingSnap.docs[0].data() as AdminUser;
        const adminUser: AdminUser = { isActive: true, ...data, uid: user.uid, lastLoginAt: new Date().toISOString() };
        setDoc(adminRef, adminUser).catch(() => {});
        return adminUser;
      }
    } catch { /* devam et */ }
  }

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

// ─── Hook ─────────────────────────────────────────────────────────────────────

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
          logAction('login_unauthorized', 'auth', {
            severity: 'warning',
            overrideUid: user.uid,
            overrideEmail: user.email ?? 'unknown',
            overrideRole: 'none',
          });
          setState({ user: null, adminUser: null, loading: false, error: 'Bu hesabın admin erişimi yok.' });
          return;
        }

        if (!adminUser.isActive) {
          await signOut(auth);
          logAction('login_deactivated_account', 'auth', {
            severity: 'warning',
            overrideUid: user.uid,
            overrideEmail: user.email ?? 'unknown',
            overrideRole: adminUser.role,
          });
          setState({ user: null, adminUser: null, loading: false, error: 'Hesabınız devre dışı bırakılmış.' });
          return;
        }

        setAuditRole(adminUser.role);
        logAction('login_success', 'auth', {
          severity: 'info',
          overrideUid: user.uid,
          overrideEmail: user.email ?? 'unknown',
          overrideRole: adminUser.role,
        });
        setState({ user, adminUser, loading: false, error: null });
      } catch {
        setState({ user, adminUser: null, loading: false, error: 'Kullanıcı verisi alınamadı.' });
      }
    });

    return unsub;
  }, []);

  const login = async (email: string, password: string) => {
    setState(s => ({ ...s, loading: true, error: null }));

    const lockMsg = await checkLoginLock(email);
    if (lockMsg) {
      setState(s => ({ ...s, loading: false, error: lockMsg }));
      return;
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      await clearLoginAttempts(email);
    } catch {
      await recordFailedAttempt(email);
      logAction('login_failed', 'auth', {
        severity: 'warning',
        overrideEmail: email,
        overrideUid: 'pre-auth',
        overrideRole: 'unknown',
      });
      setState(s => ({ ...s, loading: false, error: 'Giriş başarısız. Email veya şifre hatalı.' }));
    }
  };

  const logout = async () => {
    logAction('logout', 'auth', { severity: 'info' });
    await signOut(auth);
  };

  const resetPassword = async (email: string): Promise<void> => {
    await sendPasswordResetEmail(auth, email);
  };

  return { ...state, login, logout, resetPassword };
}
