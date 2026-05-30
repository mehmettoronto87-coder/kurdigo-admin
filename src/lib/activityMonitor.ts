import { auth } from '../firebase/config';
import { logAction } from './auditLog';

const DELETE_WINDOW_MS = 60_000; // 1 dakika
const DELETE_THRESHOLD = 20;

// uid → son 1 dakikadaki silme timestamp'leri
const deleteTimestamps = new Map<string, number[]>();

export function trackDelete(targetType: string): void {
  const uid = auth.currentUser?.uid;
  if (!uid) return;

  const now = Date.now();
  const recent = (deleteTimestamps.get(uid) ?? []).filter(t => now - t < DELETE_WINDOW_MS);
  recent.push(now);
  deleteTimestamps.set(uid, recent);

  if (recent.length >= DELETE_THRESHOLD) {
    // Aynı pencerede tekrar spam loglamayı önlemek için sıfırla
    deleteTimestamps.set(uid, []);
    logAction('suspicious_rapid_delete', 'system', {
      severity: 'critical',
      details: {
        count: recent.length,
        windowSeconds: DELETE_WINDOW_MS / 1000,
        targetType,
      },
    });
  }
}
