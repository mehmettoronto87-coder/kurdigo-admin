import { useEffect, useState, useRef } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import { subscribeSceneLibrary, updateAssetAudio } from '../lib/firestore';
import { UNITS } from '../lib/curriculumData';
import type { SceneAsset, AudioStatus } from '../types/admin';

// ─── Sahte son işlemler — ileride Firestore changeHistory'den gelecek ───
const RECENT_ACTIONS = [
  { time: 'Az önce', text: 'DALL-E ile "silav" görseli üretildi', icon: '🎨' },
  { time: '2 dk',    text: '"spas" ses dosyası yüklendi',          icon: '🎙️' },
  { time: '5 dk',    text: '"belê" görseli onaylandı',             icon: '✅' },
  { time: '12 dk',   text: 'Unit1 D1 üretime gönderildi',         icon: '⚙️' },
  { time: '1 sa',    text: '"heval" görseli reddedildi — yeniden', icon: '🔄' },
];

type MediaTab = 'images' | 'audio' | 'video';

const TAB_CFG: Record<MediaTab, { label: string; icon: string; desc: string }> = {
  images: { label: 'Görseller',  icon: '🖼️',  desc: 'DALL-E & manuel fotoğraflar' },
  audio:  { label: 'Sesler',     icon: '🎙️',  desc: 'Kürtçe telaffuz kayıtları'  },
  video:  { label: 'Videolar',   icon: '🎬',  desc: 'Animasyon & sahne videoları' },
};

const AUDIO_STATUS_CFG: Record<AudioStatus, { label: string; dot: string; color: string }> = {
  missing:          { label: 'Eksik',    dot: '🔴', color: 'var(--red)'    },
  recording_needed: { label: 'Kayıt gerekli', dot: '🟡', color: 'var(--orange)' },
  uploaded:         { label: 'Yüklendi', dot: '🟢', color: 'var(--green)'  },
  verified:         { label: 'Onaylı',   dot: '✅', color: 'var(--green)'  },
};

export default function SceneLibraryPage() {
  const [assets, setAssets] = useState<SceneAsset[]>([]);
  const [tab, setTab] = useState<MediaTab>('images');
  const [filterUnit, setFilterUnit] = useState<string>('all');
  const [filterAudio, setFilterAudio] = useState<string>('all');
  const [filterImg, setFilterImg] = useState<string>('all');
  const [selected, setSelected] = useState<SceneAsset | null>(null);

  useEffect(() => {
    const unsub = subscribeSceneLibrary(filterUnit === 'all' ? null : filterUnit, setAssets);
    return unsub;
  }, [filterUnit]);

  // ─── Derived stats ───
  const imgMissing  = assets.filter(a => !a.storageUrl).length;
  const audMissing  = assets.filter(a => !a.audioStatus || a.audioStatus === 'missing').length;

  return (
    <div className="page">
      {/* ─── BAŞLIK ─── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 Ortam Kütüphanesi</h1>
          <p className="page-subtitle">
            {assets.length} varlık · 🖼️ {imgMissing} görsel eksik · 🎙️ {audMissing} ses eksik
          </p>
        </div>
      </div>

      {/* ─── 3 ANA KATEGORİ TABLAR ─── */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
        {(Object.keys(TAB_CFG) as MediaTab[]).map(key => {
          const cfg = TAB_CFG[key];
          const isActive = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                flex: 1, padding: '16px 20px', borderRadius: 12,
                background: isActive ? 'var(--blue)' : 'var(--bg3)',
                border: `1px solid ${isActive ? 'var(--blue)' : 'var(--border)'}`,
                color: isActive ? '#000' : 'var(--text2)',
                cursor: 'pointer', transition: 'all 0.15s',
                display: 'flex', flexDirection: 'column', gap: 4,
                textAlign: 'left',
              }}
            >
              <span style={{ fontSize: 24 }}>{cfg.icon}</span>
              <span style={{ fontWeight: 700, fontSize: 14 }}>{cfg.label}</span>
              <span style={{ fontSize: 11, opacity: 0.75 }}>{cfg.desc}</span>
            </button>
          );
        })}
      </div>

      {/* ─── GÖRSELLER SEKMESİ ─── */}
      {tab === 'images' && (
        <ImagesTab
          assets={assets}
          filterUnit={filterUnit}
          filterImg={filterImg}
          onFilterUnit={setFilterUnit}
          onFilterImg={setFilterImg}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {/* ─── SESLER SEKMESİ ─── */}
      {tab === 'audio' && (
        <AudioTab
          assets={assets}
          filterUnit={filterUnit}
          filterAudio={filterAudio}
          onFilterUnit={setFilterUnit}
          onFilterAudio={setFilterAudio}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {/* ─── VİDEOLAR SEKMESİ ─── */}
      {tab === 'video' && (
        <VideoTab />
      )}

      {/* ─── SON İŞLEMLER ─── */}
      <div style={{
        marginTop: 40, paddingTop: 20,
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Son İşlemler
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {RECENT_ACTIONS.map((a, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 12px', background: 'var(--bg3)',
              borderRadius: 8, fontSize: 12,
            }}>
              <span style={{ fontSize: 16 }}>{a.icon}</span>
              <span style={{ flex: 1, color: 'var(--text2)' }}>{a.text}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{a.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── GÖRSELLER TAB ───
function ImagesTab({
  assets, filterUnit, filterImg, onFilterUnit, onFilterImg, selected, onSelect,
}: {
  assets: SceneAsset[];
  filterUnit: string; filterImg: string;
  onFilterUnit: (v: string) => void; onFilterImg: (v: string) => void;
  selected: SceneAsset | null;
  onSelect: (a: SceneAsset | null) => void;
}) {
  const filtered = assets.filter(a => {
    if (filterImg === 'has') return !!a.storageUrl;
    if (filterImg === 'missing') return !a.storageUrl;
    return true;
  });

  return (
    <div>
      {/* Filtreler */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <select value={filterUnit} onChange={e => onFilterUnit(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tüm Üniteler</option>
          {UNITS.slice(0, 20).map(u => <option key={u.id} value={u.id}>{u.icon} {u.title}</option>)}
        </select>
        <select value={filterImg} onChange={e => onFilterImg(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tüm Görseller</option>
          <option value="has">✅ Görsel Var</option>
          <option value="missing">❌ Görsel Eksik</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text2)', alignSelf: 'center' }}>
          {filtered.length} görsel
        </span>
      </div>

      {!filtered.length ? (
        <EmptyState icon="🖼️" msg="Henüz görsel yok" sub="Dersler onaylanınca burada görünecek" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
          {filtered.map(asset => (
            <div
              key={asset.id}
              onClick={() => onSelect(selected?.id === asset.id ? null : asset)}
              style={{
                borderRadius: 12, overflow: 'hidden', cursor: 'pointer',
                border: `2px solid ${selected?.id === asset.id ? 'var(--blue)' : 'var(--border)'}`,
                background: 'var(--bg3)', transition: 'all 0.12s',
              }}
            >
              {/* Önizleme */}
              <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg4)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                {asset.storageUrl ? (
                  <img src={asset.storageUrl} alt={asset.primaryKu} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <span style={{ fontSize: 36 }}>{asset.emoji}</span>
                )}
                {!asset.storageUrl && (
                  <div style={{
                    position: 'absolute', bottom: 4, right: 4,
                    background: 'var(--red)', borderRadius: 6, padding: '2px 5px',
                    fontSize: 9, fontWeight: 700, color: '#fff',
                  }}>Eksik</div>
                )}
              </div>
              {/* Bilgi */}
              <div style={{ padding: '8px 10px' }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{asset.primaryKu || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{asset.primaryTr}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Seçili varlık detayı */}
      {selected && (
        <AssetDetail asset={selected} onClose={() => onSelect(null)} />
      )}
    </div>
  );
}

// ─── SESLER TAB ───
function AudioTab({
  assets, filterUnit, filterAudio, onFilterUnit, onFilterAudio, selected, onSelect,
}: {
  assets: SceneAsset[];
  filterUnit: string; filterAudio: string;
  onFilterUnit: (v: string) => void; onFilterAudio: (v: string) => void;
  selected: SceneAsset | null;
  onSelect: (a: SceneAsset | null) => void;
}) {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);

  const filtered = assets.filter(a => {
    const s = a.audioStatus ?? 'missing';
    if (filterAudio !== 'all' && s !== filterAudio) return false;
    return true;
  });

  const handleUpload = async (asset: SceneAsset, file: File) => {
    setUploadingId(asset.id);
    setUploadPct(0);
    const path = `audio/scene/${asset.id}_${Date.now()}.mp3`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on('state_changed',
      snap => setUploadPct(Math.round(snap.bytesTransferred / snap.totalBytes * 100)),
      () => setUploadingId(null),
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        await updateAssetAudio(asset.id, url, path);
        setUploadingId(null);
      },
    );
  };

  return (
    <div>
      {/* Filtreler */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={filterUnit} onChange={e => onFilterUnit(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tüm Üniteler</option>
          {UNITS.slice(0, 20).map(u => <option key={u.id} value={u.id}>{u.icon} {u.title}</option>)}
        </select>
        <select value={filterAudio} onChange={e => onFilterAudio(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Tüm Ses Durumları</option>
          {Object.entries(AUDIO_STATUS_CFG).map(([s, cfg]) => (
            <option key={s} value={s}>{cfg.dot} {cfg.label}</option>
          ))}
        </select>
        {/* İlerleme özeti */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12 }}>
          {Object.entries(AUDIO_STATUS_CFG).map(([s, cfg]) => {
            const count = assets.filter(a => (a.audioStatus ?? 'missing') === s).length;
            if (!count) return null;
            return (
              <span key={s} style={{ color: cfg.color }}>
                {cfg.dot} {count} {cfg.label}
              </span>
            );
          })}
        </div>
      </div>

      {!filtered.length ? (
        <EmptyState icon="🎙️" msg="Ses bulunamadı" sub="Filtre kriterini değiştir" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(asset => {
            const audioCfg = AUDIO_STATUS_CFG[asset.audioStatus ?? 'missing'];
            const isUploading = uploadingId === asset.id;
            return (
              <div
                key={asset.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '12px 16px', background: 'var(--bg3)',
                  border: `1px solid var(--border)`, borderRadius: 10,
                  cursor: 'pointer', transition: 'border-color 0.12s',
                }}
                onClick={() => onSelect(selected?.id === asset.id ? null : asset)}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--blue)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <span style={{ fontSize: 28, flexShrink: 0 }}>{asset.emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{asset.primaryKu}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{asset.primaryTr}</div>
                </div>

                {/* Ses durumu + oynatıcı */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: audioCfg.color, fontWeight: 600 }}>
                    {audioCfg.dot} {audioCfg.label}
                  </span>
                  {asset.audioUrl && (
                    <audio src={asset.audioUrl} controls style={{ height: 28, width: 160 }} onClick={e => e.stopPropagation()} />
                  )}
                  {isUploading ? (
                    <div style={{ fontSize: 11, color: 'var(--blue)', whiteSpace: 'nowrap' }}>
                      ⏳ {uploadPct}%
                    </div>
                  ) : (
                    <label
                      className="btn btn-secondary btn-sm"
                      style={{ cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                      onClick={e => e.stopPropagation()}
                    >
                      🎙️ Yükle
                      <input
                        type="file" accept="audio/*" style={{ display: 'none' }}
                        onChange={e => e.target.files?.[0] && handleUpload(asset, e.target.files[0])}
                        ref={audioInputRef}
                      />
                    </label>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── VİDEO TAB (Gelecekte) ───
function VideoTab() {
  return (
    <EmptyState
      icon="🎬"
      msg="Video kütüphanesi yakında"
      sub="Animasyon ve sahne videoları bu bölümde yönetilecek"
    />
  );
}

// ─── VARLIK DETAYI ───
function AssetDetail({ asset, onClose }: { asset: SceneAsset; onClose: () => void }) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg2)', borderRadius: 16, padding: 24,
          maxWidth: 480, width: '90%', maxHeight: '80vh', overflowY: 'auto',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {asset.storageUrl
              ? <img src={asset.storageUrl} alt={asset.primaryKu} style={{ width: 60, height: 60, objectFit: 'cover', borderRadius: 10 }} />
              : <span style={{ fontSize: 48 }}>{asset.emoji}</span>
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{asset.primaryKu}</div>
              <div style={{ color: 'var(--text2)', fontSize: 14 }}>{asset.primaryTr}</div>
              {asset.primaryEn && <div style={{ color: 'var(--text3)', fontSize: 12 }}>{asset.primaryEn}</div>}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Ses */}
        {asset.audioUrl && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>🎙️ Ses</div>
            <audio controls src={asset.audioUrl} style={{ width: '100%', height: 36 }} />
          </div>
        )}

        {/* Affordance etiketleri */}
        {asset.visualAffordanceTags?.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>Visual Tags</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {asset.visualAffordanceTags.map(tag => (
                <span key={tag} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--blue-dim)', color: 'var(--blue)' }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Derslerde kullanım */}
        {asset.usedInLessons?.length > 0 && (
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {asset.usedInLessons.length} derste kullanılıyor
          </div>
        )}
      </div>
    </div>
  );
}

// ─── BOŞ DURUM ───
function EmptyState({ icon, msg, sub }: { icon: string; msg: string; sub: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 280, color: 'var(--text3)',
      border: '2px dashed var(--border)', borderRadius: 12,
    }}>
      <div style={{ fontSize: 52, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 4 }}>{msg}</div>
      <div style={{ fontSize: 12 }}>{sub}</div>
    </div>
  );
}

// ─── YENİ VARLIK OBJESİ ───
function _newAsset(unitId: string): SceneAsset {
  const now = new Date().toISOString();
  return {
    id: `asset_${unitId}_${Date.now()}`,
    mediaId: `asset_${Date.now()}`,
    unitId,
    lessonId: '',
    primaryItemId: '',
    primaryKu: '',
    primaryTr: '',
    primaryEn: '',
    emoji: '❓',
    visualAffordanceTags: [],
    affordanceAnswers: [],
    questionFamilies: [],
    reusableExerciseTypes: [],
    usedInLessons: [],
    status: 'placeholder',
    audioStatus: 'missing',
    tags: [],
    createdAt: now,
    updatedAt: now,
  };
}
void _newAsset; // referenced by future "Yeni Ekle" button
