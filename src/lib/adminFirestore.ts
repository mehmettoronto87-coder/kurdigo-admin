import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, addDoc,
  query, orderBy, limit, where, Timestamp, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/config';
import type { AdminUser, AdminRole, SupportTicket, TicketStatus, TicketPriority, AdminMessage, AdminTask, TaskStatus } from '../types/admin';

// ─── Ekip Yönetimi ──────────────────────────────────────────────────────────

export async function getAllAdminUsers(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'adminUsers'));
  return snap.docs.map(d => d.data() as AdminUser);
}

export async function updateAdminRole(uid: string, role: AdminRole): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { role });
  // users koleksiyonunda da güncelle
  try {
    await updateDoc(doc(db, 'users', uid), { adminRole: role });
  } catch { /* users kaydı olmayabilir */ }
}

export async function deactivateAdmin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { isActive: false });
}

export async function activateAdmin(uid: string): Promise<void> {
  await updateDoc(doc(db, 'adminUsers', uid), { isActive: true });
}

export async function inviteAdminByEmail(email: string, role: AdminRole, invitedBy: string): Promise<void> {
  // KurdîGo users koleksiyonunda bu email'i ara
  const usersSnap = await getDocs(
    query(collection(db, 'users'), where('email', '==', email), limit(1))
  );

  if (usersSnap.empty) {
    throw new Error('Bu email adresiyle kayıtlı bir KurdîGo hesabı bulunamadı.');
  }

  const userDoc = usersSnap.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();

  // adminUsers kaydı var mı kontrol et
  const adminSnap = await getDoc(doc(db, 'adminUsers', uid));
  if (adminSnap.exists()) {
    throw new Error('Bu kullanıcı zaten admin olarak kayıtlı.');
  }

  const adminUser: AdminUser = {
    uid,
    email,
    displayName: userData.name ?? undefined,
    role,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  // adminUsers'a ekle
  await setDoc(doc(db, 'adminUsers', uid), adminUser);

  // users koleksiyonuna isAdmin flag'i ekle
  await updateDoc(doc(db, 'users', uid), {
    isAdmin: true,
    adminRole: role,
    adminInvitedBy: invitedBy,
    adminInvitedAt: new Date().toISOString(),
  });
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
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateTicketPriority(ticketId: string, priority: TicketPriority): Promise<void> {
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    priority,
    updatedAt: serverTimestamp(),
  });
}

export async function assignTicket(ticketId: string, uid: string, displayName: string): Promise<void> {
  await updateDoc(doc(db, 'supportTickets', ticketId), {
    assignedTo: uid,
    assignedName: displayName,
    status: 'in_progress',
    updatedAt: serverTimestamp(),
  });
}

export async function replyToTicket(
  ticketId: string,
  uid: string,
  displayName: string,
  text: string,
): Promise<void> {
  const ticketRef = doc(db, 'supportTickets', ticketId);
  const snap = await getDoc(ticketRef);
  if (!snap.exists()) throw new Error('Talep bulunamadı.');

  const replies = snap.data().replies ?? [];
  replies.push({ uid, displayName, text, createdAt: new Date().toISOString() });

  await updateDoc(ticketRef, {
    replies,
    updatedAt: serverTimestamp(),
  });
}

// Uygulama tarafından veya admin panelinden test talebi oluşturma
export async function createSupportTicket(
  userId: string,
  userEmail: string,
  userName: string,
  subject: string,
  message: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'supportTickets'), {
    userId,
    userEmail,
    userName,
    subject,
    message,
    status: 'open',
    priority: 'medium',
    replies: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
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
      ...data,
      id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
    } as AdminMessage;
  }).reverse();
}

export async function sendAdminMessage(
  authorUid: string,
  authorName: string,
  authorRole: AdminRole,
  text: string,
  mentions: string[] = [],
): Promise<void> {
  await addDoc(collection(db, 'adminMessages'), {
    authorUid,
    authorName,
    authorRole,
    text,
    mentions,
    createdAt: serverTimestamp(),
  });
}

// ─── Görevler ───────────────────────────────────────────────────────────────

export async function getAdminTasks(): Promise<AdminTask[]> {
  const q = query(collection(db, 'adminTasks'), orderBy('createdAt', 'desc'), limit(100));
  const snap = await getDocs(q);
  return snap.docs.map(d => {
    const data = d.data();
    return {
      ...data,
      id: d.id,
      createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : (data.createdAt ?? ''),
      updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : (data.updatedAt ?? ''),
    } as AdminTask;
  });
}

export async function createTask(
  title: string,
  description: string,
  assignedTo: string,
  assignedName: string,
  createdBy: string,
  createdByName: string,
  dueDate?: string,
): Promise<string> {
  const ref = await addDoc(collection(db, 'adminTasks'), {
    title,
    description,
    assignedTo,
    assignedName,
    createdBy,
    createdByName,
    status: 'todo',
    dueDate: dueDate ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateTaskStatus(taskId: string, status: TaskStatus): Promise<void> {
  await updateDoc(doc(db, 'adminTasks', taskId), {
    status,
    updatedAt: serverTimestamp(),
  });
}
