interface Props {
  title: string;
  icon: string;
}

export default function ComingSoonPage({ title, icon }: Props) {
  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 16 }}>{icon}</div>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{title}</h1>
      <p style={{ color: 'var(--text3)', fontSize: 15, maxWidth: 400 }}>
        Bu modül yakında aktif olacak. Geliştirme sürecinde takipte kalın.
      </p>
      <div style={{
        marginTop: 24, padding: '8px 20px', background: 'var(--bg3)',
        borderRadius: 8, fontSize: 13, color: 'var(--text2)', border: '1px solid var(--border)',
      }}>
        🚧 Yapım aşamasında
      </div>
    </div>
  );
}
