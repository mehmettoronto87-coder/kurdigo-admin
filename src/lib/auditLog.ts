import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase/config';

export type AuditCategory = 'auth' | 'content' | 'admin' | 'system';
export type AuditSeverity = 'info' | 'warning' | 'critical';

// useAuth tarafından set edilir, lib fonksiyonlarında React context olmadığı için
let _currentRole = 'unknown';
export function setAuditRole(role: string) { _currentRole = role; }

export async function logAction(
  action: string,
  category: AuditCategory,
  options: {
    targetId?: string;
    targetType?: string;
    details?: Record<string, unknown>;
    severity?: AuditSeverity;
    overrideUid?: string;
    overrideEmail?: string;
    overrideRole?: string;
  } = {}
): Promise<void> {
  try {
    const user = auth.currentUser;
    await addDoc(collection(db, 'adminAuditLog'), {
      timestamp: serverTimestamp(),
      uid: options.overrideUid ?? user?.uid ?? 'unknown',
      email: options.overrideEmail ?? user?.email ?? 'unknown',
      role: options.overrideRole ?? _currentRole,
      action,
      category,
      severity: options.severity ?? 'info',
      ...(options.targetId   ? { targetId: options.targetId }     : {}),
      ...(options.targetType ? { targetType: options.targetType } : {}),
      ...(options.details    ? { details: options.details }       : {}),
    });
  } catch {
    // Log hatası hiçbir zaman asıl işlemi engellememeli
  }
}
