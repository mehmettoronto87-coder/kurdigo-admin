import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, orderBy, limit, where, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AdminUser, AdminRole, SupportTicket, TicketStatus, TicketPriority, AdminMessage, AdminTask, TaskStatus } from '../types/admin';
import { logAction } from './auditLog';
import { trackDelete } from './activityMonitor';

// ─── Ekip Yönetimi ──────────────────────────────────────────────────────────

export async function getAllAdminUsers(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'adminUsers'));
  return snap.docs.map(d => d.data() as AdminUser);
}

export async function updateAdminRole(uid: string, role: AdminRole): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { role });
  try {
    await updateDoc(doc(db, 'users', uid), { adminRole: role });
  } catch { /* users kaydı olmayabilir */ }
  logAction('admin_role_changed', 'admin', { targetId: uid, targetType: 'adminUser', details: { newRole: role }, severity: 'warning' });
}

export async function deactivateAdmin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { isActive: false });
  logAction('admin_deactivated', 'admin', { targetId: uid, targetType: 'adminUser', severity: 'warning' });
}

export async function activateAdmin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { isActive: true });
  logAction('admin_activated', 'admin', { targetId: uid, targetType: 'adminUser' });
}

// KurdîGo hesabı şartı yok — Firebase Auth hesabı yeterli
export async function inviteAdminByEmail(email: string, role: AdminRole, invitedBy: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();

  // adminUsers'da bu email zaten var mı?
  const adminSnap = await getDocs(
    query(collection(db, 'adminUsers'), where('email', '==', normalizedEmail), limit(1))
  );
  if (!adminSnap.empty) {
    throw new Error('Bu kullanıcı zaten admin olarak kayıtlı.');
  }

  // KurdîGo users koleksiyonunda ara (varsa UID'yi al)
  let uid: string | null = null;
  let displayName: string | undefined;

  try {
    const usersSnap = await getDocs(
      query(collection(db, 'users'), where('email', '==', normalizedEmail), limit(1))
    );
    if (!usersSnap.empty) {
      uid = usersSnap.docs[0].id;
      displayName = usersSnap.docs[0].data().name ?? undefined;
      // users koleksiyonuna isAdmin flag'i ekle
      await updateDoc(doc(db, 'users', uid), {
        isAdmin: true,
        adminRole: role,
        adminInvitedBy: invitedBy,
        adminInvitedAt: new Date().toISOString(),
      });
    }
  } catch { /* users koleksiyonu erişilemese de devam et */ }

  // UID biliniyorsa adminUsers/{uid}, bilinmiyorsa email-keyed bekleyen kayıt
  const docId = uid ?? `pending_${normalizedEmail.replace(/[^a-z0-9]/g, '_')}`;
  const adminUser: AdminUser & { pendingEmail?: string } = {
    uid: docId,
    email: normalizedEmail,
    displayName,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
    ...(uid ? {} : { pendingEmail: normalizedEmail }),
  };

  await setDoc(doc(db, 'adminUsers', docId), adminUser);
  logAction('admin_invited', 'admin', { targetId: docId, targetType: 'adminUser', details: { email: normalizedEmail, role } });
}

// ─── Destek Talepleri ────────────────────────────────────────────────────────

export async function getSupportTickets(statusFilter?: TicketStatus): Promise<SupportTicket[]> {
  let q = query(collection(db, 'supportTickets'), orderBy('createdAt', 'desc'), limit(100));
  if (statusFilter) {
    q = query(collection(db, 'supportTickets'), where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(100));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : (data.updatedAt ?? ''),
      replies: (data.replies ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        createdAt: r.createdAt instanceof Timestamp ? (r.createdAt as Timestamp).toDate().toISOString() : (r.createdAt ?? ''),
      })),
    } as SupportTicket;
  });
}

export async function updateTicketStatus(ticketId: string, status: TicketStatus): Promise<void> {
  await updateDoc(doc(db, 'supportTickets', ticketId), { status, updatedAt: serverTimestamp() });
}

export async function updateTicketPriority(ticketId: string, priority: TicketPriority): Promise<void> {
  await updateDoc(doc(db, 'supportTickets', ticketId), { priority, updatedAt: serverTimestamp() });
}

export async function assignTicket(ticketId: string, uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    assignedTo: uid, assignedName: displayName, status: 'in_progress', updatedAt: serverTimestamp(),
  });
}

export async function replyToTicket(ticketId: string, uid: string, displayName: string, text: string): Promise<void> {
  const ticketRef = doc(db, 'supportTickets', ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('Talep bulunamadı.');
  const replies = snap.data().replies ?? [];
  replies.push({ uid, displayName, text, createdAt: new Date().toISOString() });
  await updateDoc(ticketRef, { replies, updatedAt: serverTimestamp() });
}

export async function createSupportTicket(userId: string, userEmail: string, userName: string, subject: string, message: string): Promise<string> {
  const ref = await addDoc(collection(db, 'supportTickets'), {
    userId, userEmail, userName, subject, message,
    status: 'open', priority: 'medium', replies: [],
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── İç Mesajlaşma ──────────────────────────────────────────────────────────

export async function getAdminMessages(limitCount = 50): Promise<AdminMessage[]> {
  const q = query(collection(db, 'adminMessages'), orderBy('createdAt', 'desc'), limit(limitCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data, id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
    } as AdminMessage;
  }).reverse();
}

export async function sendAdminMessage(authorUid: string, authorName: string, authorRole: AdminRole, text: string, mentions: string[] = []): Promise<void> {
  await addDoc(collection(db, 'adminMessages'), {
    authorUid, authorName, authorRole, text, mentions, createdAt: serverTimestamp(),
  });
}

// ─── Görevler ───────────────────────────────────────────────────────────────

export async function getAdminTasks(): Promise<AdminTask[]> {
  const q = query(collection(db, 'adminTasks'), orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data, id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : (data.updatedAt ?? ''),
    } as AdminTask;
  });
}

export async function createTask(title: string, description: string, assignedTo: string, assignedName: string, createdBy: string, createdByName: string, dueDate?: string): Promise<string> {
  const ref = await addDoc(collection(db, 'adminTasks'), {
    title, description, assignedTo, assignedName, createdBy, createdByName,
    status: 'todo', dueDate: dueDate ?? null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await updateDoc(doc(db, 'adminTasks', taskId), { status, updatedAt: serverTimestamp() });
}

// ─── Sosyal Medya İçerik Planlama ───────────────────────────────────────────

export type SocialPlatform = 'instagram' | 'tiktok' | 'twitter' | 'facebook' | 'youtube' | 'linkedin';
export type PostStatus = 'idea' | 'draft' | 'review' | 'approved' | 'scheduled' | 'published';
export type PostCategory = 'education' | 'promotion' | 'story' | 'reel' | 'meme' | 'announcement' | 'engagement' | 'behind_scenes';

export const POST_CATEGORY_LABELS: Record<PostCategory, string> = {
  education:     '📚 Eğitim',
  promotion:     '📣 Tanıtım',
  story:         '📖 Hikaye',
  reel:          '🎬 Reel/Video',
  meme:          '😄 Meme',
  announcement:  '📢 Duyuru',
  engagement:    '💬 Etkileşim',
  behind_scenes: '🎥 Sahne Arkası',
};

export interface PostPerformance {
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  reach?: number;
  saves?: number;
  clicks?: number;
  loggedAt?: string;
}

export interface SocialPost {
  id: string;
  title: string;
  caption: string;
  platforms: SocialPlatform[];
  status: PostStatus;
  category?: PostCategory;
  mediaUrls: string[];
  hashtags: string[];
  scheduledAt?: string;
  publishedAt?: string;
  createdBy: string;
  createdByName: string;
  assignedTo?: string;
  assignedName?: string;
  approvedBy?: string;
  approvedByName?: string;
  notes?: string;
  performance?: PostPerformance;
  createdAt: string;
  updatedAt: string;
}

export async function getSocialPosts(statusFilter?: PostStatus): Promise<SocialPost[]> {
  let q = query(collection(db, 'socialPosts'), orderBy('createdAt', 'desc'), limit(100));
  if (statusFilter) {
    q = query(collection(db, 'socialPosts'), where('status', '==', statusFilter), orderBy('createdAt', 'desc'), limit(100));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data, id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : (data.updatedAt ?? ''),
      scheduledAt: data.scheduledAt instanceof Timestamp ? data.scheduledAt.toDate().toISOString() : (data.scheduledAt ?? undefined),
    } as SocialPost;
  });
}

export async function createSocialPost(post: Omit<SocialPost, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const ref = await addDoc(collection(db, 'socialPosts'), {
    ...post, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateSocialPost(id: string, changes: Partial<SocialPost>): Promise<void> {
  await updateDoc(doc(db, 'socialPosts', id), { ...changes, updatedAt: serverTimestamp() });
}

export async function deleteSocialPost(id: string): Promise<void> {
  const { deleteDoc } = await import('firebase/firestore');
  await deleteDoc(doc(db, 'socialPosts', id));
  trackDelete('socialPost');
  logAction('social_post_deleted', 'content', { targetId: id, targetType: 'socialPost', severity: 'warning' });
}

export async function logPostPerformance(id: string, performance: PostPerformance): Promise<void> {
  await updateDoc(doc(db, 'socialPosts', id), {
    performance: { ...performance, loggedAt: new Date().toISOString() },
    updatedAt: serverTimestamp(),
  });
}
