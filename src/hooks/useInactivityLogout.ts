import { useEffect, useRef } from 'react';
import { logAction } from '../lib/auditLog';

const INACTIVITY_MS = 120 * 60 * 1000; // 120 dakika
const CHECK_INTERVAL_MS = 60_000;       // her 1 dakikada kontrol
const ACTIVITY_EVENTS = ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'] as const;

export function useInactivityLogout(logout: () => void, isLoggedIn: boolean): void {
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    if (!isLoggedIn) return;

    const resetTimer = () => { lastActivityRef.current = Date.now(); };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));

    const interval = setInterval(async () => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_MS) {
        await logAction('session_expired_inactivity', 'auth', {
          severity: 'info',
          details: { inactivityMinutes: INACTIVITY_MS / 60_000 },
        });
        logout();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetTimer));
      clearInterval(interval);
    };
  }, [isLoggedIn, logout]);
}
