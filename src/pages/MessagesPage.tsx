import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { getAdminMessages, sendAdminMessage, getAdminTasks, createTask, updateTaskStatus } from '../lib/adminFirestore';
import { getAllAdminUsers } from '../lib/adminFirestore';
import type { AdminMessage, AdminTask, AdminUser, AdminRole, TaskStatus } from '../types/admin';
import { ROLE_LABELS } from '../types/admin';

const ROLE_COLORS: Record<AdminRole, string> = {
  owner:          'var(--yellow)',
  content_editor: 'var(--blue)',
  social_media:   'var(--purple)',
  advertising:    'var(--orange)',
  accounting:     'var(--green)',
  support_agent:  'var(--text2)',
};

const TASK_STATUS: Record<TaskStatus, { label: string; color: string }> = {
  todo:  { label: 'Yapılacak', color: 'var(--text3)' },
  doing: { label: 'Yapılıyor', color: 'var(--orange)' },
  done:  { label: 'Tamamlandı', color: 'var(--green)' },
};

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function MessagesPage() {
  const { adminUser } = useAuth();
  const [tab, setTab] = useState<'messages' | 'tasks'>('messages');

  // Mesajlar
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(true);
  const [msgText, setMsgText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Görevler
  const [tasks, setTasks] = useState<AdminTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [members, setMembers] = useState<AdminUser[]>([]);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: '', description: '', assignedTo: '', dueDate: '' });
  const [creating, setCreating] = useState(false);

  const loadMessages = async () => {
    setMsgLoading(true);
    const list = await getAdminMessages(80);
    setMessages(list);
    setMsgLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  };

  const loadTasks = async () => {
    setTasksLoading(true);
    const [list, memberList] = await Promise.all([getAdminTasks(), getAllAdminUsers()]);
    setTasks(list);
    setMembers(memberList);
    setTasksLoading(false);
  };

  useEffect(() => {
    loadMessages();
    loadTasks();
  }, []);

  useEffect(() => {
    if (tab === 'messages') {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [tab]);

  const handleSend = async () => {
    if (!msgText.trim() || !adminUser) return;
    setSending(true);
    await sendAdminMessage(adminUser.uid, adminUser.displayName ?? adminUser.email, adminUser.role, msgText.trim());
    setMsgText('');
    await loadMessages();
    setSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCreateTask = async () => {
    if (!newTask.title.trim() || !newTask.assignedTo || !adminUser) return;
    setCreating(true);
    const assignee = members.find(m => m.uid === newTask.assignedTo);
    await createTask(
      newTask.title.trim(),
      newTask.description.trim(),
      newTask.assignedTo,
      assignee?.displayName ?? assignee?.email ?? '',
      adminUser.uid,
      adminUser.displayName ?? adminUser.email,
      newTask.dueDate || undefined,
    );
    setNewTask({ title: '', description: '', assignedTo: '', dueDate: '' });
    setShowNewTask(false);
    await loadTasks();
    setCreating(false);
  };

  return (
    <div className="page">
      <h1 className="page-title">💬 Ekip İletişimi</h1>

      {/* Tab */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['messages', 'tasks'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '7px 20px', borderRadius: 20, fontSize: 13, cursor: 'pointer',
              border: tab === t ? '1px solid var(--blue)' : '1px solid var(--border)',
              background: tab === t ? 'var(--blue-dim)' : 'var(--bg3)',
              color: tab === t ? 'var(--blue)' : 'var(--text2)',
              fontWeight: tab === t ? 700 : 400,
            }}
          >
            {t === 'messages' ? '💬 Mesajlar' : '✅ Görevler'}
          </button>
        ))}
      </div>

      {/* Mesajlar */}
      {tab === 'messages' && (
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '65vh' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {msgLoading ? (
              <div className="loading">Yükleniyor...</div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text3)', paddingTop: 40 }}>
                Henüz mesaj yok. İlk mesajı sen gönder!
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.authorUid === adminUser?.uid;
                return (
                  <div key={msg.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 10, marginBottom: 14 }}>
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: ROLE_COLORS[msg.authorRole] + '22',
                      border: `2px solid ${ROLE_COLORS[msg.authorRole]}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 700, color: ROLE_COLORS[msg.authorRole],
                    }}>
                      {msg.authorName[0]?.toUpperCase()}
                    </div>
                    <div style={{ maxWidth: '70%' }}>
                      {!isMe && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>
                          {msg.authorName} · {ROLE_LABELS[msg.authorRole]}
                        </div>
                      )}
                      <div style={{
                        padding: '8px 12px', borderRadius: isMe ? '12px 4px 12px 12px' : '4px 12px 12px 12px',
                        background: isMe ? 'var(--blue)' : 'var(--bg3)',
                        color: isMe ? '#fff' : 'var(--text)',
                        fontSize: 14, lineHeight: 1.5,
                      }}>
                        {msg.text}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, textAlign: isMe ? 'right' : 'left' }}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Mesaj gönderme */}
          <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8 }}>
            <textarea
              placeholder="Mesaj yaz... (Enter ile gönder)"
              value={msgText}
              onChange={e => setMsgText(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg3)',
                color: 'var(--text)', fontSize: 14, resize: 'none', lineHeight: 1.4,
              }}
            />
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={sending || !msgText.trim()}
              style={{ minWidth: 80 }}
            >
              {sending ? '...' : 'Gönder'}
            </button>
          </div>
        </div>
      )}

      {/* Görevler */}
      {tab === 'tasks' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
            <button className="btn-primary" onClick={() => setShowNewTask(!showNewTask)}>
              {showNewTask ? 'İptal' : '+ Yeni Görev'}
            </button>
          </div>

          {showNewTask && (
            <div className="card" style={{ padding: 20, marginBottom: 20 }}>
              <h3 style={{ fontWeight: 700, marginBottom: 12 }}>Yeni Görev Oluştur</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  placeholder="Görev başlığı"
                  value={newTask.title}
                  onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
                />
                <textarea
                  placeholder="Açıklama (opsiyonel)"
                  value={newTask.description}
                  onChange={e => setNewTask(n => ({ ...n, description: e.target.value }))}
                  rows={2}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14, resize: 'vertical' }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <select
                    value={newTask.assignedTo}
                    onChange={e => setNewTask(n => ({ ...n, assignedTo: e.target.value }))}
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
                  >
                    <option value="">Kişi seç</option>
                    {members.filter(m => m.isActive).map(m => (
                      <option key={m.uid} value={m.uid}>{m.displayName ?? m.email.split('@')[0]} ({ROLE_LABELS[m.role]})</option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={newTask.dueDate}
                    onChange={e => setNewTask(n => ({ ...n, dueDate: e.target.value }))}
                    style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 14 }}
                  />
                </div>
                <button
                  className="btn-primary"
                  onClick={handleCreateTask}
                  disabled={creating || !newTask.title.trim() || !newTask.assignedTo}
                >
                  {creating ? 'Oluşturuluyor...' : 'Görevi Oluştur'}
                </button>
              </div>
            </div>
          )}

          {tasksLoading ? (
            <div className="loading">Yükleniyor...</div>
          ) : tasks.length === 0 ? (
            <div style={{ textAlign: 'center', color: 'var(--text3)', padding: 40 }}>Henüz görev yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {tasks.map(task => {
                const sc = TASK_STATUS[task.status];
                const isAssigned = task.assignedTo === adminUser?.uid;
                return (
                  <div key={task.id} className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{task.title}</div>
                      {task.description && (
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>{task.description}</div>
                      )}
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                        👤 {task.assignedName} · 📌 {task.createdByName}
                        {task.dueDate && ` · 📅 ${task.dueDate}`}
                      </div>
                    </div>
                    {(isAssigned || adminUser?.role === 'owner') && task.status !== 'done' && (
                      <button
                        onClick={() => updateTaskStatus(task.id, task.status === 'todo' ? 'doing' : 'done').then(loadTasks)}
                        style={{
                          padding: '5px 14px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
                          border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)',
                        }}
                      >
                        {task.status === 'todo' ? '▶ Başla' : '✅ Bitir'}
                      </button>
                    )}
                    <div style={{
                      fontSize: 11, fontWeight: 700, color: sc.color,
                      padding: '3px 10px', borderRadius: 6, background: sc.color + '18',
                      whiteSpace: 'nowrap',
                    }}>
                      {sc.label}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
