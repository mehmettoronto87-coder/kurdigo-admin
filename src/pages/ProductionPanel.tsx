import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase/config';
import {
  getSceneAsset,
  markAssetUsedInLesson,
  syncLessonToPublic,
  updateLessonItemMedia,
  updateLessonStatus,
  upsertSceneAssetForLessonItem,
} from '../lib/firestore';
import { UNITS } from '../lib/curriculumData';
import { useAuth } from '../hooks/useAuth';
import type { AdminLesson, ItemMediaStatus, ImageGenStatus, AudioItemStatus, SceneAsset } from '../types/admin';
import type { CurriculumMediaItem } from '../types/curriculum';
import { generateImageAsset, getImageProviderLabel } from '../lib/aiProviders';

// ─── HELPERS ───

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase('tr-TR');
}

function mediaFromSceneAsset(asset: SceneAsset): ItemMediaStatus {
  return {
    imageUrl: asset.storageUrl,
    imageStoragePath: asset.storagePath,
    imageStatus: asset.storageUrl ? 'approved' : 'pending',
    audioUrl: asset.audioUrl,
    audioStoragePath: asset.audioStoragePath,
    audioStatus: asset.audioUrl ? 'verified' : (asset.audioStatus === 'recording_needed' ? 'missing' : asset.audioStatus),
  };
}

function isDialogueVisualItem(item: CurriculumMediaItem): boolean {
  const ku = normalizeText(item.ku);
  const tr = normalizeText(item.tr);
  const en = normalizeText(item.en ?? '');
  const group = normalizeText(item.meaningGroup ?? '');
  const tagText = (item.tags ?? []).join(' ').toLocaleLowerCase('tr-TR');

  return (
    ku.includes('?') ||
    tr.includes('?') ||
    group.includes('greeting') ||
    group.includes('question') ||
    group.includes('thanks') ||
    group.includes('wellbeing') ||
    tagText.includes('meaning:greeting') ||
    tagText.includes('meaning:question') ||
    tagText.includes('meaning:thanks') ||
    tagText.includes('meaning:wellbeing') ||
    ['silav', 'spas', 'belê', 'bele', 'na', 'rojbaş', 'rojbas', 'şevbaş', 'sevbas', 'tu çawa yî'].some(term => ku.includes(term)) ||
    ['merhaba', 'teşekkür', 'evet', 'hayır', 'günaydın', 'iyi geceler', 'nasıl'].some(term => tr.includes(term)) ||
    ['hello', 'thanks', 'yes', 'no', 'good morning', 'good night', 'how are'].some(term => en.includes(term))
  );
}

function buildExpressionSceneRule(item: CurriculumMediaItem): string {
  const tr = normalizeText(item.tr);
  const kuNorm = normalizeText(item.ku);

  if (kuNorm.includes('şevbaş') || kuNorm.includes('sevbas') || tr.includes('iyi geceler')) {
    return `Scene: a cozy nighttime bedroom. A sleepy child says good night to their parent. Show the meaning purely through warm facial expression and calm body language — no text, no speech bubbles anywhere.`;
  }
  if (kuNorm.includes('rojbaş') || kuNorm.includes('rojbas') || tr.includes('günaydın')) {
    return `Scene: a warm morning at home or in a courtyard. Two people greet each other at sunrise with a cheerful wave or nod. Show the meaning through gesture and expression — no text, no speech bubbles anywhere.`;
  }
  if (kuNorm.includes('tu çawa') || tr.includes('nasıl')) {
    return `Scene: two friends meeting in an everyday place. One person leans in with an inquisitive expression and open-palm gesture, clearly asking how the other is. No text, no speech bubbles anywhere.`;
  }
  if (kuNorm.includes('spas') || tr.includes('teşekkür')) {
    return `Scene: a small helpful moment between two people. One person bows slightly or presses hands together in gratitude. Show sincere thanks through body language and warm eye contact — no text, no speech bubbles anywhere.`;
  }
  if (kuNorm.includes('silav') || tr.includes('merhaba')) {
    return `Scene: two people meeting in a culturally fitting everyday place. One person waves warmly or extends a hand in greeting. Show the greeting through gesture and smile — no text, no speech bubbles anywhere.`;
  }
  if (kuNorm.includes('belê') || kuNorm.includes('bele') || tr.includes('evet')) {
    return `Scene: a person giving a clear, confident nod or thumbs-up in response to something. Show "yes" purely through enthusiastic body language and expression — no text, no speech bubbles anywhere.`;
  }
  if (kuNorm === 'na' || tr.includes('hayır')) {
    return `Scene: a person giving a clear, gentle head-shake or hand-wave to decline. Show "no" purely through body language and expression — no text, no speech bubbles anywhere.`;
  }

  return `Scene: two people in a natural, age-appropriate setting. Show the meaning of "${item.tr}" purely through facial expression, gesture, and body language — no text, no speech bubbles anywhere.`;
}

type LocationType = 'indoor' | 'outdoor' | 'either';

function resolveLocationForItem(item: CurriculumMediaItem): LocationType {
  const combined = [
    item.ku, item.tr, item.en ?? '',
    item.meaningGroup ?? '',
    (item.tags ?? []).join(' '),
    (item.visualAffordanceTags ?? []).join(' '),
  ].join(' ').toLocaleLowerCase('tr-TR');

  // Explicit tag override
  if (combined.includes('setting:indoor') || combined.includes('place:indoor')) return 'indoor';
  if (combined.includes('setting:outdoor') || combined.includes('place:outdoor')) return 'outdoor';

  // Strong indoor signals
  const indoorKw = [
    'ev', 'xanî', 'mal', 'jûr', 'mitbax', 'salon', 'razanî', 'banyo', 'pencere', 'derî',
    'mêvan', 'guest', 'misafir', 'malbat', 'family', 'aile',
    'xwarin', 'food', 'yemek', 'vexwarin', 'drink', 'içmek', 'nanê', 'bread',
    'nexweş', 'hasta', 'sick', 'doktor', 'doctor', 'klînik', 'clinic',
    'dibistan', 'school', 'okul', 'sinif', 'classroom', 'kitab', 'book',
    'rûniştin', 'sit', 'oturmak', 'razanê', 'sleep', 'uyumak',
    'masê', 'table', 'kursî', 'chair', 'sandalye',
    'indoor', 'iç mekan',
  ];
  if (indoorKw.some(kw => combined.includes(kw))) return 'indoor';

  // Strong outdoor signals
  const outdoorKw = [
    'roj', 'sun', 'güneş', 'ronahî', 'light',
    'baran', 'rain', 'yağmur', 'bahoz', 'storm', 'fırtına',
    'dar', 'tree', 'ağaç', 'kulîlk', 'flower', 'çiçek', 'giya', 'grass',
    'çiya', 'mountain', 'dağ', 'zozanê', 'highland', 'mêrg', 'meadow',
    'çem', 'river', 'nehir', 'gol', 'lake', 'göl', 'deniz', 'sea',
    'çûk', 'bird', 'kuş', 'hesp', 'horse', 'at', 'animal', 'hayvan',
    'rê', 'road', 'yol', 'kolanê', 'street', 'sokak', 'meydanê', 'square',
    'bazar', 'market', 'pazar', 'outdoor', 'dış mekan',
    'ezmên', 'sky', 'gökyüzü', 'stêrk', 'star', 'yıldız', 'meh', 'moon',
    'zevî', 'field', 'tarlа', 'bax', 'garden', 'bahçe',
  ];
  if (outdoorKw.some(kw => combined.includes(kw))) return 'outdoor';

  return 'either';
}

const INDOOR_PLACES: Record<string, string[]> = {
  default: [
    'a warm Kurdish living room with colourful kilim cushions and low sofas',
    'a cosy local tea house (çayhane) with wooden tables and tulip-shaped tea glasses',
    'a traditional Kurdish kitchen with copper pots, colourful tiles, and a window with curtains',
    'a small neighbourhood grocery shop interior with shelves of local produce',
    'a sunlit school classroom with wooden desks and a green chalkboard',
    'a family home dining area with a low table set for a meal',
    'a local barbershop with mirrors and wooden chairs',
    'a bright apartment living room with patterned cushions and houseplants',
  ],
  'unit1': [
    'a warm Kurdish family living room with kilim-covered sofas and a tea tray',
    'a cosy çayhane in Diyarbakır with wooden tables and backgammon boards',
    'a local grocery shop in Amed with colourful produce on wooden shelves',
    'a sunlit kitchen in a Diyarbakır home with copper pots and potted herbs',
    'a bright school classroom with a chalkboard and wooden desks',
  ],
};

const OUTDOOR_PLACES: Record<string, string[]> = {
  default: [
    'a lively neighbourhood street with apartment buildings and potted balconies on a sunny day',
    'a local open-air produce market with colourful vegetable and fruit stalls',
    'a tree-shaded park with benches and children playing',
    'a hillside with green valleys and blue sky',
    'a riverbank with willow trees, flat rocks, and clear water',
    'a village path between wheat fields under open blue sky',
    'a rooftop garden with potted plants overlooking city rooftops',
    'a sunny town square with a small fountain and café chairs',
  ],
  'unit1': [
    'Hevsel Gardens — lush green orchards and vegetable plots beside the Tigris river, sunny day',
    'a lively neighbourhood street in Diyarbakır with apartment blocks, trees, and parked cars',
    'a colourful open-air watermelon market on a summer morning in Amed',
    'a park with tall trees, benches, and locals sitting in the shade',
    'a rooftop garden in Diyarbakır with potted plants, laundry lines, and city rooftops below',
    'a sunny town square with a small fountain, café chairs, and pigeons',
  ],
};

function pickPlace(places: string[]): string {
  return places[Math.floor(Math.random() * places.length)];
}

function buildLocationRule(item: CurriculumMediaItem, lesson: AdminLesson): string {
  const unit = UNITS.find(u => u.id === lesson.unitId);
  // Strip any mention of walls/fortress from city name before sending to model
  const rawCity = unit?.city ?? 'Diyarbakır';
  const city = rawCity.replace(/—.*/, '').replace(/sur içi|tarihi surlar|surlar|kale|fortress|walls/gi, '').trim();
  const locType = resolveLocationForItem(item);
  const unitKey = lesson.unitId in INDOOR_PLACES ? lesson.unitId : 'default';

  let settingDesc: string;
  if (locType === 'indoor') {
    settingDesc = `LOCATION — INDOOR: ${pickPlace(INDOOR_PLACES[unitKey])}. The scene must take place entirely inside a building.`;
  } else if (locType === 'outdoor') {
    settingDesc = `LOCATION — OUTDOOR: ${pickPlace(OUTDOOR_PLACES[unitKey])}. The scene takes place outside under natural light.`;
  } else {
    const indoor = Math.random() < 0.5;
    settingDesc = indoor
      ? `LOCATION — INDOOR: ${pickPlace(INDOOR_PLACES[unitKey])}. Use an interior setting.`
      : `LOCATION — OUTDOOR: ${pickPlace(OUTDOOR_PLACES[unitKey])}. Use an outdoor setting.`;
  }

  return [
    settingDesc,
    `City atmosphere: ${city}.`,
    `ABSOLUTE LOCATION BAN: Do NOT draw ancient city walls, fortress battlements, black basalt ramparts, city gate towers, or any defensive wall structure. These are completely forbidden as background elements regardless of the city or lesson. Use the specific location described above instead.`,
    `Never include hate-crime imagery, hate symbols, dehumanizing imagery, military imagery, weapons, or conflict/violence scenes.`,
    `Political symbols or flags only when the lesson context genuinely calls for them (Newroz, identity, rights).`,
  ].filter(Boolean).join(' ');
}

function buildGenderBalanceRule(item: CurriculumMediaItem): string {
  if (isDialogueVisualItem(item)) {
    return [
      `Gender balance rule: start dialogue scenes with a woman or girl speaking whenever natural, then balance with a man or boy in other scenes.`,
      `Avoid gender stereotypes completely: do not assign caregiving, authority, work, emotion, or domestic roles by gender.`,
      `If both Baran and Berfin appear, alternate agency: if Berfin greets or asks first, Baran can answer next; both should look equally capable and active.`,
    ].join(' ');
  }
  return `Gender balance rule: represent women/girls and men/boys with equal agency across the lesson. Avoid gender-role stereotypes.`;
}

function buildPointingGestureRule(item: CurriculumMediaItem): string {
  const ku = normalizeText(item.ku);
  const tr = normalizeText(item.tr);
  const en = normalizeText(item.en ?? '');
  const pos = normalizeText(item.partOfSpeech ?? '');
  const group = normalizeText(item.meaningGroup ?? '');
  const tagText = (item.tags ?? []).join(' ').toLocaleLowerCase('tr-TR');
  const combined = `${ku} ${tr} ${en} ${pos} ${group} ${tagText}`;

  if (/\b(ez|min)\b/.test(ku) || /\b(ben|me|i)\b/.test(combined)) {
    return `Pointing gesture rule: if this image includes a person, make the meaning visually distinct by having the person point to themself with one hand. This is the "I/me" card, not a general emotion or wellbeing card.`;
  }
  if (/\btu|te\b/.test(ku) || /\b(sen|you)\b/.test(combined)) {
    return `Pointing gesture rule: if this image includes two people, make the meaning visually distinct by having the speaker point gently toward the other person. This is the "you" card.`;
  }
  if (/\b(ev|vê|vî|vir)\b/.test(ku) || /\b(bu|burada|this|here)\b/.test(combined)) {
    return `Pointing gesture rule: show a clear near-pointing gesture toward the nearby person/object/place so the learner sees "this/here/near".`;
  }
  if (/\b(ew|wê|wî|wir)\b/.test(ku) || /\b(o|şu|orada|that|there)\b/.test(combined)) {
    return `Pointing gesture rule: show a clear far-pointing gesture toward a more distant person/object/place so the learner sees "that/there/far".`;
  }
  if (pos.includes('pronoun') || pos.includes('adposition') || group.includes('deictic') || group.includes('pronoun')) {
    return `Pointing gesture rule: when natural, use a simple pointing gesture to clarify the relationship or direction. Do not force pointing if it would make the scene awkward.`;
  }
  return '';
}

function isPointingGestureItem(item: CurriculumMediaItem): boolean {
  return Boolean(buildPointingGestureRule(item));
}

function buildCharacterDiversityRule(): string {
  return [
    `MANDATORY CHARACTER RULE — READ CAREFULLY:`,
    `Draw ordinary everyday urban Kurdish people — the kind you actually see on any street in Amed, Van, or Mardin.`,
    `DO NOT default to headscarves, full covering, or beards. Most figures must wear normal casual urban clothing: t-shirts, blouses, jeans, dresses, shorts, light jackets — whatever a city person wears on a warm day.`,
    `A single scene should NOT have all women veiled or all men bearded. That is not representative and is forbidden here.`,
    `Clothing mix across the curriculum: secular casual (dominant), occasional traditional şalvar or regional pattern, rare headscarf as one option among many — never as the default.`,
    `Women: young women in summer dresses or jeans, girls in school uniforms, middle-aged women in colourful blouses, elderly women in traditional wraps — ALL valid, vary across cards.`,
    `Men: young men in t-shirts and sneakers, boys in casual clothes, older men in linen shirts — NOT robes, NOT always bearded.`,
    `Age: mix children, teenagers, young adults, middle-aged, elderly across cards.`,
    `Ethnicity: Kurdish/Middle Eastern features, natural olive-to-brown skin tones, dark hair — not whitewashed, not stereotyped.`,
  ].join(' ');
}

function extractLessonText(lesson: AdminLesson): string {
  const parts: string[] = [
    lesson.title,
    lesson.titleTr ?? '',
    lesson.titleEn ?? '',
    ...(lesson.culturalFocusTags ?? []),
  ];

  for (const item of lesson.items) {
    parts.push(
      item.ku,
      item.tr,
      item.en ?? '',
      item.exampleKu ?? '',
      item.exampleTr ?? '',
      item.exampleEn ?? '',
      item.meaningGroup ?? '',
      ...(item.tags ?? []),
      ...(item.visualAffordanceTags ?? []),
    );
  }

  for (const step of lesson.steps) {
    parts.push(
      step.id,
      step.type,
      (step as { prompt?: string }).prompt ?? '',
      (step as { promptTr?: string }).promptTr ?? '',
      (step as { title?: string }).title ?? '',
      (step as { subtitle?: string }).subtitle ?? '',
      (step as { sentenceKu?: string }).sentenceKu ?? '',
      (step as { sentenceTr?: string }).sentenceTr ?? '',
      (step as { correctOrderKu?: string[] }).correctOrderKu?.join(' ') ?? '',
      (step as { correctOrderTr?: string }).correctOrderTr ?? '',
      (step as { audioText?: string }).audioText ?? '',
    );
  }

  return parts.join(' ').toLocaleLowerCase('tr-TR');
}

function buildImagePrompt(item: CurriculumMediaItem, lesson: AdminLesson, revisionHint?: string): string {
  const affordances = item.visualAffordanceTags?.join(', ');
  const expressionVisual = isDialogueVisualItem(item);
  return [
    `Flat digital illustration for a children's language learning app.`,
    // ── IRON-CLAD TEXT BAN — checked first so the model never forgets ──
    `IRON-CLAD TEXT BAN: The image must contain ZERO text, letters, numbers, words, labels, captions, speech bubbles, thought bubbles, or signs that spell out the target word. Not even partial letters. If any text appears in the image the result is rejected. This rule overrides everything else.`,
    // ── Subject ──
    expressionVisual
      ? `Subject: the Kurdish expression "${item.ku}" (= "${item.tr}" in Turkish${item.en ? `, "${item.en}" in English` : ''}). Show meaning through scene and body language only — no text anywhere.`
      : `Subject: "${item.ku}" (= "${item.tr}" in Turkish${item.en ? `, "${item.en}" in English` : ''}). Show the subject visually — no text, no labels, no written word.`,
    item.emoji ? `Reference emoji (visual hint only): ${item.emoji}.` : '',
    affordances ? `Key visual elements: ${affordances}.` : '',
    // ── Location — smart indoor/outdoor ──
    buildLocationRule(item, lesson),
    // ── Characters ──
    buildCharacterDiversityRule(),
    buildGenderBalanceRule(item),
    buildPointingGestureRule(item),
    expressionVisual ? buildExpressionSceneRule(item) : '',
    // ── Style ──
    `Style: vibrant, friendly, simple, clean. Duolingo-inspired. Square 1:1 format.`,
    revisionHint ? `IMPORTANT REVISION REQUEST: ${revisionHint}` : '',
  ].filter(Boolean).join(' ');
}

function defaultStatus(): ItemMediaStatus {
  return { imageStatus: 'pending', audioStatus: 'missing' };
}

// ─── IMAGE STATUS BADGE ───
function ImageStatusBadge({ status }: { status: ImageGenStatus }) {
  const cfg: Record<ImageGenStatus, { label: string; color: string }> = {
    pending:    { label: '· Yok',       color: 'var(--text3)'  },
    generating: { label: '⏳ Üretiliyor', color: 'var(--blue)'  },
    generated:  { label: '👁 İnceleniyor', color: 'var(--orange)' },
    approved:   { label: '✓ Onaylı',    color: 'var(--green)'  },
    rejected:   { label: '✗ Reddedildi', color: 'var(--red)'   },
  };
  const c = cfg[status];
  return <span style={{ fontSize: 10, color: c.color, fontWeight: 600 }}>{c.label}</span>;
}

// ─── AUDIO STATUS BADGE ───
function AudioStatusBadge({ status }: { status: AudioItemStatus }) {
  const cfg: Record<AudioItemStatus, { label: string; color: string }> = {
    missing:   { label: '· Yok',       color: 'var(--text3)'  },
    uploading: { label: '⏳ Yükleniyor', color: 'var(--blue)'  },
    uploaded:  { label: '🎙 Yüklendi', color: 'var(--orange)' },
    verified:  { label: '✓ Doğrulı',  color: 'var(--green)'  },
  };
  const c = cfg[status];
  return <span style={{ fontSize: 10, color: c.color, fontWeight: 600 }}>{c.label}</span>;
}

// ─── AUDIO TRIMMER ───

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
  const nc = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const dataLen = buffer.length * nc * 2;
  const ab = new ArrayBuffer(44 + dataLen);
  const v = new DataView(ab);
  const ws = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + dataLen, true);
  ws(8, 'WAVE'); ws(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true);
  v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true);
  ws(36, 'data'); v.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < buffer.length; i++)
    for (let ch = 0; ch < nc; ch++) {
      const s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]!));
      v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true); off += 2;
    }
  return ab;
}

function AudioTrimmer({ audioUrl, onSave, onSkip }: {
  audioUrl: string;
  onSave: (blob: Blob) => Promise<void>;
  onSkip?: () => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufRef    = useRef<AudioBuffer | null>(null);
  const dragRef   = useRef<number | null>(null); // drag origin fraction

  const [duration, setDuration] = useState(0);
  const [sel, setSel] = useState<[number, number] | null>(null); // [start, end] fractions 0-1
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);

  // ── Load + draw base waveform ──
  useEffect(() => {
    let ac: AudioContext | null = new AudioContext();
    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => ac!.decodeAudioData(buf))
      .then(decoded => {
        bufRef.current = decoded;
        setDuration(decoded.duration);
        setLoading(false);
        requestAnimationFrame(() => drawCanvas(decoded, null));
      })
      .catch(() => setLoading(false));
    return () => { ac?.close(); ac = null; };
  }, [audioUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  function drawCanvas(buf: AudioBuffer, selection: [number, number] | null) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width, H = canvas.height, mid = H / 2;
    const data = buf.getChannelData(0);
    const step = Math.ceil(data.length / W);

    ctx.clearRect(0, 0, W, H);

    for (let i = 0; i < W; i++) {
      let peak = 0;
      for (let j = 0; j < step; j++) peak = Math.max(peak, Math.abs(data[i * step + j] ?? 0));
      const h = Math.max(1, peak * mid * 0.9);
      const frac = i / W;
      const inSel = selection && frac >= selection[0] && frac <= selection[1];
      ctx.fillStyle = inSel ? '#1cb0f6' : '#3a3a3a';
      ctx.fillRect(i, mid - h, 1, h * 2);
    }

    if (selection) {
      const [s, e] = selection;
      // selection overlay
      ctx.fillStyle = 'rgba(28,176,246,0.12)';
      ctx.fillRect(s * W, 0, (e - s) * W, H);
      // handles
      ctx.fillStyle = '#1cb0f6';
      ctx.fillRect(s * W - 1, 0, 2, H);
      ctx.fillRect(e * W - 1, 0, 2, H);
    }
  }

  function fracAt(e: React.MouseEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    dragRef.current = fracAt(e);
    setSel(null);
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragRef.current === null || !bufRef.current) return;
    const cur = fracAt(e);
    const s: [number, number] = [Math.min(dragRef.current, cur), Math.max(dragRef.current, cur)];
    setSel(s);
    drawCanvas(bufRef.current, s);
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (dragRef.current === null || !bufRef.current) return;
    const cur = fracAt(e);
    const s: [number, number] = [Math.min(dragRef.current, cur), Math.max(dragRef.current, cur)];
    dragRef.current = null;
    setSel(s[1] - s[0] > 0.01 ? s : null);
    drawCanvas(bufRef.current, s[1] - s[0] > 0.01 ? s : null);
  }

  async function handleCrop() {
    const buf = bufRef.current;
    if (!buf || !sel) return;
    setSaving(true);
    try {
      const startSec = sel[0] * buf.duration;
      const endSec   = sel[1] * buf.duration;
      const len = Math.ceil((endSec - startSec) * buf.sampleRate);
      const offline = new OfflineAudioContext(buf.numberOfChannels, len, buf.sampleRate);
      const src = offline.createBufferSource();
      src.buffer = buf;
      src.connect(offline.destination);
      src.start(0, startSec, endSec - startSec);
      const trimmed = await offline.startRendering();
      await onSave(new Blob([encodeWav(trimmed)], { type: 'audio/wav' }));
    } finally {
      setSaving(false);
    }
  }

  const fmt = (t: number) =>
    `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}.${String(Math.floor((t % 1) * 10))}`;

  const selSec = sel ? [sel[0] * duration, sel[1] * duration] as const : null;

  if (loading) return (
    <div style={{ fontSize: 10, color: 'var(--text3)', padding: '6px 0' }}>⏳ Dalga formu yükleniyor...</div>
  );

  return (
    <div style={{ marginTop: 8, background: 'var(--bg4)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>
        Kesmek istediğin bölgeyi sürükle, sonra kırp
      </div>
      <canvas
        ref={canvasRef}
        width={500} height={52}
        style={{ width: '100%', height: 52, display: 'block', borderRadius: 4, cursor: 'crosshair', marginBottom: 8, userSelect: 'none' }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 26 }}>
        <span style={{ fontSize: 11, color: selSec ? 'var(--text2)' : 'var(--text3)', flex: 1 }}>
          {selSec
            ? <><strong>{fmt(selSec[0])}</strong> → <strong>{fmt(selSec[1])}</strong> &nbsp;·&nbsp; {fmt(selSec[1] - selSec[0])} sn</>
            : 'Bölgeyi sürükle'}
        </span>
        {onSkip && (
          <button
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, flexShrink: 0 }}
            onClick={onSkip}
            disabled={saving}
          >
            Olduğu gibi yükle
          </button>
        )}
        <button
          className="btn btn-blue btn-sm"
          style={{ fontSize: 11, flexShrink: 0 }}
          onClick={handleCrop}
          disabled={!sel || saving}
        >
          {saving ? '⏳' : '✂️ Kırp & Yükle'}
        </button>
      </div>
    </div>
  );
}

// ─── VALIDATION ───

interface ValidationCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail?: string;
}

function runLessonValidation(lesson: AdminLesson): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const validIds = new Set(lesson.items.map(i => i.id));
  const reviewIds = new Set(lesson.reviewItemIds ?? []);
  const externalDistractorIds = new Set(lesson.externalDistractorItemIds ?? []);
  const coreItems = lesson.items.filter(i => !externalDistractorIds.has(i.id));
  const total = coreItems.length;
  const newTotal = coreItems.filter(i => !reviewIds.has(i.id)).length;
  const reviewTotal = coreItems.filter(i => reviewIds.has(i.id)).length;
  const lessonText = extractLessonText(lesson);

  // 1. Adım ID referansları geçerli
  const badRefs: string[] = [];
  for (const step of lesson.steps) {
    const ids: (string | undefined)[] = [];
    if ('correctItemId' in step) ids.push(step.correctItemId);
    if ('imageItemId' in step) ids.push((step as { imageItemId?: string }).imageItemId);
    if ('targetItemId' in step) ids.push((step as { targetItemId?: string }).targetItemId);
    if ('blankItemId' in step) ids.push((step as { blankItemId?: string }).blankItemId);
    if ('itemId' in step) ids.push((step as { itemId?: string }).itemId);
    if ('distractorItemIds' in step) ids.push(...((step as { distractorItemIds?: string[] }).distractorItemIds ?? []));
    if ('itemIds' in step) ids.push(...((step as { itemIds?: string[] }).itemIds ?? []));
    if ('oddItemId' in step) ids.push((step as { oddItemId?: string }).oddItemId);
    if ('pairs' in step) (step as { pairs?: { leftItemId: string; rightItemId: string }[] }).pairs?.forEach(p => { ids.push(p.leftItemId); ids.push(p.rightItemId); });
    for (const id of ids) {
      if (id && !validIds.has(id)) badRefs.push(`${step.id}: "${id}"`);
    }
  }
  checks.push({
    id: 'id_validity',
    label: 'Adım ID referansları geçerli',
    status: badRefs.length === 0 ? 'pass' : 'fail',
    detail: badRefs.length > 0 ? `${badRefs.length} geçersiz: ${badRefs.slice(0, 3).join(', ')}${badRefs.length > 3 ? '…' : ''}` : undefined,
  });

  // 2. Tüm öğeler learn_card ile öğretildi
  const taughtIds = new Set(lesson.steps.filter(s => s.type === 'learn_card').map(s => (s as { itemId?: string }).itemId).filter(Boolean));
  const untaught = coreItems.filter(i => !taughtIds.has(i.id));
  checks.push({
    id: 'all_items_taught',
    label: 'Tüm öğeler learn_card ile tanıtıldı',
    status: untaught.length === 0 ? 'pass' : 'warn',
    detail: untaught.length > 0 ? `${untaught.length} öğe eksik: ${untaught.map(i => i.ku).join(', ')}` : undefined,
  });

  // 3. Confusable çifti aynı adımda bir arada olmasın
  const confusableIssues: string[] = [];
  for (const item of lesson.items) {
    if (!item.confusableWithItemIds?.length) continue;
    for (const step of lesson.steps) {
      const correctId =
        (step as { correctItemId?: string }).correctItemId ??
        (step as { targetItemId?: string }).targetItemId ??
        (step as { blankItemId?: string }).blankItemId;
      const distractors = (step as { distractorItemIds?: string[] }).distractorItemIds ?? [];
      if (correctId === item.id && distractors.some(d => item.confusableWithItemIds!.includes(d))) {
        confusableIssues.push(`"${item.ku}" + karışık distraktör (${step.id})`);
      }
    }
  }
  checks.push({
    id: 'confusable_pairs',
    label: 'Karışıklık çiftleri ayrı adımlarda',
    status: confusableIssues.length === 0 ? 'pass' : 'warn',
    detail: confusableIssues.length > 0 ? confusableIssues.slice(0, 2).join('; ') : undefined,
  });

  // 4. Tekrar eden Kürtçe kelimeler
  const kuWords = lesson.items.map(i => i.ku.toLowerCase().trim());
  const dupeKu = [...new Set(kuWords.filter((k, i) => kuWords.indexOf(k) !== i))];
  checks.push({
    id: 'no_duplicates',
    label: 'Tekrar eden kelime yok',
    status: dupeKu.length === 0 ? 'pass' : 'fail',
    detail: dupeKu.length > 0 ? `Tekrar: ${dupeKu.join(', ')}` : undefined,
  });

  // 5. Emoji eksikleri
  const noEmoji = coreItems.filter(i => !i.emoji);
  checks.push({
    id: 'emoji_coverage',
    label: 'Tüm öğelerde emoji var',
    status: noEmoji.length === 0 ? 'pass' : 'warn',
    detail: noEmoji.length > 0 ? `Eksik: ${noEmoji.map(i => i.ku).join(', ')}` : undefined,
  });

  // 6. Görsel etiket (visualAffordanceTags) eksikleri
  const noTags = coreItems.filter(i => !i.visualAffordanceTags?.length);
  checks.push({
    id: 'visual_tags',
    label: 'Görsel etiketler (affordance) mevcut',
    status: noTags.length === 0 ? 'pass' : 'warn',
    detail: noTags.length > 0 ? `${noTags.length} öğede eksik: ${noTags.map(i => i.ku).join(', ')}` : undefined,
  });

  // 6b. Selamlaşma/ifade görselleri sahne formatında (balonSUZ)
  const expressionItems = coreItems.filter(isDialogueVisualItem);
  checks.push({
    id: 'expression_visual_policy',
    label: 'Selamlaşma/ifade görselleri sahne formatında (balonsuz)',
    status: 'pass',
    detail: expressionItems.length > 0
      ? `${expressionItems.length} ifade için vücut dili + jest sahnesi kullanılacak; metin/balon yok`
      : undefined,
  });

  const pointingItems = coreItems.filter(isPointingGestureItem);
  const missingPointTags = pointingItems.filter(item => {
    const tags = [
      ...(item.visualAffordanceTags ?? []),
      ...(item.tags ?? []),
      item.meaningGroup ?? '',
      item.partOfSpeech ?? '',
    ].join(' ').toLocaleLowerCase('tr-TR');
    return !/(point|pointing|self_pointing|other_pointing|gesture|near|far|deictic|pronoun|adposition)/.test(tags);
  });
  checks.push({
    id: 'pointing_gesture_policy',
    label: 'Zamir/edat/zarf kartlarında point ile ayrışma',
    status: missingPointTags.length === 0 ? 'pass' : 'warn',
    detail: missingPointTags.length > 0
      ? `${missingPointTags.map(i => i.ku).join(', ')} için pointing/gesture etiketi zayıf`
      : pointingItems.length > 0
      ? `${pointingItems.length} item point gesture promptuyla ayrıştırılacak`
      : undefined,
  });

  // 6c. Mekan atmosferi Kürdistan / ünite lokasyonu hissi taşımalı
  const placeTags = [
    ...(lesson.culturalFocusTags ?? []),
    ...lesson.items.flatMap(item => [...(item.tags ?? []), ...(item.visualAffordanceTags ?? [])]),
  ].join(' ').toLocaleLowerCase('tr-TR');
  const hasPlaceVibe = /(kurd|amed|diyarbak|van|sur|bazalt|avlu|çarşı|bazar|göl|lake|stone|courtyard|village|gund|setting:|place:|location:|culture:)/.test(placeTags);
  checks.push({
    id: 'kurdish_place_vibe',
    label: 'Görsellerde güvenli Kürdistan/yerel mekan hissi',
    status: hasPlaceVibe ? 'pass' : 'warn',
    detail: hasPlaceVibe
      ? 'Prompt motoru ünite lokasyonunu ve güvenli yerel atmosferi ekliyor'
      : 'location/culture/setting etiketi zayıf; görsel sahnede yerel mekan hissi azalabilir',
  });

  // 6d. Kadın/erkek dengesi ve anti-stereotip kontrolü
  const femaleHits = (lessonText.match(/\b(berfin|jin|keç|dayik|dê|xwişk|mother|woman|girl|anne|kadın|kız)\b/g) ?? []).length;
  const maleHits = (lessonText.match(/\b(baran|mêr|kur|bav|bira|father|man|boy|baba|erkek|oğlan)\b/g) ?? []).length;
  const genderTotal = femaleHits + maleHits;
  const balanceRatio = genderTotal > 0 ? Math.min(femaleHits, maleHits) / Math.max(femaleHits, maleHits) : 1;
  const stereotypePattern = /(kızlar\s+(mutfak|temizlik|ev)|kadınlar\s+(mutfak|temizlik|ev)|erkekler\s+(çalışır|güçlü|lider)|boys\s+are\s+strong|girls\s+(cook|clean)|women\s+(cook|clean)|men\s+(lead|work)|jin.*malê|keç.*paqi[jş]|mêr.*serok)/;
  const hasStereotypeRisk = stereotypePattern.test(lessonText);
  checks.push({
    id: 'gender_balance',
    label: 'Kadın/erkek dengesi ve cinsiyetçi rol yok',
    status: hasStereotypeRisk ? 'fail' : balanceRatio >= 0.4 ? 'pass' : 'warn',
    detail: hasStereotypeRisk
      ? 'Cinsiyet rolü/stereotip iması olabilir; örnekleri düzelt'
      : genderTotal > 0
      ? `kadın figür izi: ${femaleHits}, erkek figür izi: ${maleHits}`
      : 'Belirgin karakter/cinsiyet izi yok; görsel promptu denge kuralı ekliyor',
  });

  // 7. Kelime sayısı (hedef: ilk ders 8, sonra 5 yeni + 3 tekrar)
  const expectedMix = lesson.lessonOrder === 1
    ? total === 8
    : total === 8 && newTotal === 5 && reviewTotal === 3;
  checks.push({
    id: 'item_count',
    label: lesson.lessonOrder === 1
      ? `Kelime sayısı — ${total} yeni`
      : `Kelime sayısı — ${newTotal} yeni + ${reviewTotal} tekrar`,
    status: expectedMix ? 'pass' : total >= 6 && total <= 10 ? 'warn' : 'fail',
    detail: expectedMix ? undefined : lesson.lessonOrder === 1
      ? `${total} öğe, beklenen 8 yeni`
      : `${newTotal} yeni + ${reviewTotal} tekrar, beklenen 5 + 3`,
  });

  // 8. Adım sayısı (hedef: 30-80)
  const stepCount = lesson.steps.length;
  checks.push({
    id: 'step_count',
    label: `Adım sayısı — ${stepCount} adım`,
    status: stepCount >= 30 && stepCount <= 80 ? 'pass' : stepCount >= 20 ? 'warn' : 'fail',
    detail: stepCount < 30 ? `${stepCount} adım, az olabilir` : stepCount > 80 ? `${stepCount} adım, fazla olabilir` : undefined,
  });

  // 9. (Kaldırıldı: intro_scene ve complete adımları artık kullanılmıyor)

  // 10. Distraktör çeşitliliği — aynı set tekrar oranı
  const distSets = lesson.steps
    .filter(s => 'distractorItemIds' in s)
    .map(s => [...((s as { distractorItemIds?: string[] }).distractorItemIds ?? [])].sort().join('|'))
    .filter(Boolean);
  const repetitionRate = distSets.length > 1
    ? (distSets.length - new Set(distSets).size) / distSets.length
    : 0;
  checks.push({
    id: 'distractor_variety',
    label: 'Distraktör çeşitliliği',
    status: repetitionRate < 0.4 ? 'pass' : repetitionRate < 0.65 ? 'warn' : 'fail',
    detail: repetitionRate >= 0.4
      ? `Adımların %${Math.round(repetitionRate * 100)}'inde aynı distraktör seti`
      : undefined,
  });

  const historicalDistractorSteps = lesson.steps.filter(
    step => ['image_to_word', 'word_to_image', 'listen_to_word', 'listen_to_image', 'fill_blank'].includes(step.type)
      && 'distractorItemIds' in step,
  );
  const missingHistoricalDistractors = historicalDistractorSteps.filter(step => {
    const distractors = (step as { distractorItemIds?: string[] }).distractorItemIds ?? [];
    return distractors.filter(id => externalDistractorIds.has(id)).length < 2;
  });
  checks.push({
    id: 'historical_random_distractors',
    label: '2. dersten itibaren geçmiş kartlardan random şık',
    status: lesson.lessonOrder <= 1 || missingHistoricalDistractors.length === 0 ? 'pass' : 'fail',
    detail: lesson.lessonOrder <= 1
      ? 'İlk derste önceki kart havuzu yok'
      : missingHistoricalDistractors.length > 0
      ? `${missingHistoricalDistractors.length} soruda önceki derslerden en az 2 distractor yok`
      : `${historicalDistractorSteps.length} soruda geçmiş kartlardan en az 2 distractor var`,
  });

  // 11. Tekrar kelimeleri aynı ID üzerinden yürüsün; yeni kart/ses/görsel açılmasın
  const reviewItems = lesson.items.filter(item => reviewIds.has(item.id));
  const missingReviewItems = [...reviewIds].filter(id => !validIds.has(id));
  const duplicateReviewKu = reviewItems.filter(reviewItem =>
    lesson.items.some(item =>
      item.id !== reviewItem.id && normalizeText(item.ku) === normalizeText(reviewItem.ku),
    ),
  );
  const generatedReviewMedia = reviewItems.filter(item => {
    const status = lesson.mediaStatus?.[item.id];
    return Boolean(
      status?.imageStoragePath?.includes(`lessons/${lesson.id}/`) ||
      status?.audioStoragePath?.includes(`lessons/${lesson.id}/`),
    );
  });
  const reviewProblems = [
    ...missingReviewItems.map(id => `items içinde yok: ${id}`),
    ...duplicateReviewKu.map(item => `aynı kelime yeni ID ile tekrar etmiş: ${item.ku}`),
    ...generatedReviewMedia.map(item => `bu derste yeni medya açılmış: ${item.ku}`),
  ];
  checks.push({
    id: 'review_item_identity',
    label: 'Tekrar kelimeleri aynı ID ve eski medya üzerinden',
    status: reviewProblems.length === 0 ? 'pass' : 'fail',
    detail: reviewProblems.length > 0
      ? reviewProblems.slice(0, 3).join('; ')
      : reviewItems.length > 0
      ? `${reviewItems.length} tekrar item'ı üretim dışı tutuluyor`
      : undefined,
  });

  return checks;
}

function ValidationPanel({ lesson }: { lesson: AdminLesson }) {
  const [open, setOpen] = useState(false);
  const checks = runLessonValidation(lesson);
  const fails = checks.filter(c => c.status === 'fail').length;
  const warns = checks.filter(c => c.status === 'warn').length;
  const passes = checks.filter(c => c.status === 'pass').length;

  const overallColor = fails > 0 ? 'var(--red)' : warns > 0 ? 'var(--orange)' : 'var(--green)';
  const overallIcon = fails > 0 ? '❌' : warns > 0 ? '⚠️' : '✅';

  return (
    <div
      className="card card-sm"
      style={{ marginBottom: 16, borderLeft: `3px solid ${overallColor}`, cursor: 'pointer', userSelect: 'none' }}
      onClick={() => setOpen(o => !o)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>{overallIcon}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: overallColor }}>
          {fails === 0 && warns === 0
            ? 'Tüm kontroller geçti'
            : `${fails > 0 ? `${fails} hata` : ''}${fails > 0 && warns > 0 ? ' · ' : ''}${warns > 0 ? `${warns} uyarı` : ''}`}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)', marginLeft: 'auto' }}>
          {passes}/{checks.length} geçti {open ? '▲' : '▼'}
        </span>
      </div>

      {open && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }} onClick={e => e.stopPropagation()}>
          {checks.map(check => {
            const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
            const color = check.status === 'pass' ? 'var(--green)' : check.status === 'warn' ? 'var(--orange)' : 'var(--red)';
            return (
              <div key={check.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 11 }}>
                <span style={{ flexShrink: 0, fontSize: 12 }}>{icon}</span>
                <div>
                  <span style={{ color: check.status === 'pass' ? 'var(--text2)' : color, fontWeight: check.status !== 'pass' ? 600 : 400 }}>
                    {check.label}
                  </span>
                  {check.detail && (
                    <span style={{ color: 'var(--text3)', marginLeft: 6 }}>— {check.detail}</span>
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

// ─── MAIN COMPONENT ───
export default function ProductionPanel({
  lesson,
  onSave,
}: {
  lesson: AdminLesson;
  onSave: (lesson: AdminLesson) => Promise<void>;
}) {
  const { user } = useAuth();
  const imageProviderLabel = getImageProviderLabel();

  const [mediaStatus, setMediaStatus] = useState<Record<string, ItemMediaStatus>>(
    lesson.mediaStatus ?? {},
  );
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<string>>(new Set());
  const [bulkModal, setBulkModal] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<{ file: File; matchedItemId: string | null }[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [revisionTexts, setRevisionTexts] = useState<Record<string, string>>({});
  const [bulkRevision, setBulkRevision] = useState('');
  // pending: local file seçildi, henüz upload edilmedi → trimmer gösterilir
  const [pendingAudio, setPendingAudio] = useState<Record<string, { file: File; localUrl: string }>>({});
  const reviewIds = new Set(lesson.reviewItemIds ?? []);
  const externalDistractorIds = new Set(lesson.externalDistractorItemIds ?? []);

  // Extra guard: if an item has an approved imageUrl pointing to a DIFFERENT lesson's
  // storage path, it was inherited from a previous lesson — treat it as a review item
  // even if reviewItemIds was not set (e.g. lesson saved before the rule was enforced).
  for (const item of lesson.items) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) continue;
    const ms = mediaStatus[item.id] ?? (lesson.mediaStatus ?? {})[item.id];
    if (ms?.imageUrl && ms.imageStatus === 'approved') {
      const url = ms.imageUrl;
      if (!url.includes(`lessons/${lesson.id}`) && !url.includes(`lessons%2F${lesson.id}`)) {
        reviewIds.add(item.id);
      }
    }
  }

  const productionItems = lesson.items.filter(item => !reviewIds.has(item.id) && !externalDistractorIds.has(item.id));
  const reviewItems = lesson.items.filter(item => reviewIds.has(item.id));
  const externalDistractorItems = lesson.items.filter(item => externalDistractorIds.has(item.id));

  function getStatus(itemId: string): ItemMediaStatus {
    return mediaStatus[itemId] ?? defaultStatus();
  }

  async function persistStatus(itemId: string, updated: ItemMediaStatus) {
    setMediaStatus(prev => ({ ...prev, [itemId]: updated }));
    await updateLessonItemMedia(lesson.id, itemId, updated);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.all(lesson.items.map(async item => {
        if (externalDistractorIds.has(item.id)) return;
        const asset = await getSceneAsset(item.id).catch(() => null);
        if (!asset?.storageUrl && !asset?.audioUrl) {
          await upsertSceneAssetForLessonItem(lesson, item, mediaStatus[item.id] ?? lesson.mediaStatus?.[item.id]).catch(() => {});
          return;
        }
        if (cancelled) return;
        await markAssetUsedInLesson(asset.id, lesson.id).catch(() => {});
        const current = mediaStatus[item.id] ?? lesson.mediaStatus?.[item.id] ?? defaultStatus();
        const fromLibrary = mediaFromSceneAsset(asset);
        const merged: ItemMediaStatus = {
          ...current,
          ...(fromLibrary.imageUrl ? {
            imageUrl: fromLibrary.imageUrl,
            imageStoragePath: fromLibrary.imageStoragePath,
            imageStatus: fromLibrary.imageStatus,
          } : {}),
          ...(fromLibrary.audioUrl ? {
            audioUrl: fromLibrary.audioUrl,
            audioStoragePath: fromLibrary.audioStoragePath,
            audioStatus: fromLibrary.audioStatus,
          } : {}),
        };
        setMediaStatus(prev => ({ ...prev, [item.id]: merged }));
        await updateLessonItemMedia(lesson.id, item.id, merged).catch(() => {});
      }));
    })();
    return () => { cancelled = true; };
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function markImageBroken(item: CurriculumMediaItem) {
    if (imageLoadErrors.has(item.id)) return;
    setImageLoadErrors(prev => new Set(prev).add(item.id));

    const current = getStatus(item.id);
    const cleaned: ItemMediaStatus = {
      imageStatus: 'pending',
      audioStatus: current.audioStatus,
      ...(current.audioUrl ? { audioUrl: current.audioUrl } : {}),
      ...(current.audioStoragePath ? { audioStoragePath: current.audioStoragePath } : {}),
    };
    await persistStatus(item.id, cleaned).catch(() => {});
  }

  // ─── IMAGE ───
  async function generateImage(item: CurriculumMediaItem, revisionHint?: string) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) {
      setError(`"${item.ku}" önceki dersten gelen hazır kart; bu derste yeniden görsel üretilmez.`);
      return;
    }
    setGeneratingId(item.id);
    setError('');
    setImageLoadErrors(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });

    const working: ItemMediaStatus = { ...getStatus(item.id), imageStatus: 'generating' };
    setMediaStatus(prev => ({ ...prev, [item.id]: working }));

    try {
      if (!revisionHint) {
        const existingAsset = await getSceneAsset(item.id).catch(() => null);
        if (existingAsset?.storageUrl) {
          const reused = { ...getStatus(item.id), ...mediaFromSceneAsset(existingAsset) };
          await markAssetUsedInLesson(existingAsset.id, lesson.id).catch(() => {});
          await persistStatus(item.id, reused);
          return;
        }
      }

      const asset = await generateImageAsset(buildImagePrompt(item, lesson, revisionHint));
      const ext = asset.contentType.includes('jpeg') || asset.contentType.includes('jpg') ? 'jpg' : 'png';
      const path = `images/lessons/${lesson.id}/${item.id}_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, asset.blob, { contentType: asset.contentType });
      const url = await getDownloadURL(storageRef);

      const updated = {
        ...getStatus(item.id),
        imageUrl: url,
        imageStoragePath: path,
        imageStatus: 'generated',
      } satisfies ItemMediaStatus;
      await persistStatus(item.id, updated);
      await upsertSceneAssetForLessonItem(lesson, item, updated);
    } catch (e) {
      setError(`Görsel üretme hatası "${item.ku}" (${imageProviderLabel}): ${e instanceof Error ? e.message : String(e)}`);
      setMediaStatus(prev => ({ ...prev, [item.id]: { ...getStatus(item.id), imageStatus: 'pending' } }));
    } finally {
      setGeneratingId(null);
    }
  }

  async function generateAllImages(revisionHint?: string) {
    setGeneratingAll(true);
    const pending = productionItems.filter(item => {
      const s = getStatus(item.id).imageStatus;
      return s === 'pending' || s === 'rejected';
    });
    for (const item of pending) {
      await generateImage(item, revisionHint || undefined);
    }
    setGeneratingAll(false);
  }

  function handleRevise(item: CurriculumMediaItem) {
    const hint = revisionTexts[item.id]?.trim();
    if (!hint) return;
    generateImage(item, hint);
    setRevisionTexts(prev => ({ ...prev, [item.id]: '' }));
  }

  async function approveImage(item: CurriculumMediaItem) {
    await persistStatus(item.id, { ...getStatus(item.id), imageStatus: 'approved' });
  }

  async function rejectImage(item: CurriculumMediaItem) {
    await persistStatus(item.id, { ...getStatus(item.id), imageStatus: 'rejected' });
  }

  // Manuel görsel yükleme — admin kendi fotoğrafını yükler, doğrudan 'approved'
  async function uploadManualImage(item: CurriculumMediaItem, file: File) {
    setGeneratingId(item.id);
    setError('');
    try {
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `images/lessons/${lesson.id}/${item.id}_manual_${Date.now()}.${ext}`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, file, { contentType: file.type });
      const url = await getDownloadURL(storageRef);
      setImageLoadErrors(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      const updated = {
        ...getStatus(item.id),
        imageUrl: url,
        imageStoragePath: path,
        imageStatus: 'approved',
      } satisfies ItemMediaStatus;
      await persistStatus(item.id, updated);
      await upsertSceneAssetForLessonItem(lesson, item, updated);
    } catch (e) {
      setError(`Manuel yükleme hatası "${item.ku}": ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGeneratingId(null);
    }
  }

  // ─── AUDIO ───

  function handleAudioSelect(item: CurriculumMediaItem, file: File) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) {
      setError(`"${item.ku}" önceki dersten gelen hazır kart; bu derste yeniden ses yüklenmez.`);
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setPendingAudio(prev => ({ ...prev, [item.id]: { file, localUrl } }));
  }

  async function handleAudioApprove(item: CurriculumMediaItem, blob: Blob) {
    const pending = pendingAudio[item.id];
    if (pending) URL.revokeObjectURL(pending.localUrl);
    setPendingAudio(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    await uploadAudio(item, new File([blob], `${item.id}.wav`, { type: 'audio/wav' }));
  }

  async function uploadAudio(item: CurriculumMediaItem, file: File) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) {
      setError(`"${item.ku}" önceki dersten gelen hazır kart; bu derste yeniden ses yüklenmez.`);
      return;
    }
    setUploadingId(item.id);
    setUploadProgress(prev => ({ ...prev, [item.id]: 0 }));
    try {
      const path = `audio/lessons/${lesson.id}/${item.id}_${Date.now()}.mp3`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          'state_changed',
          snap => setUploadProgress(prev => ({
            ...prev,
            [item.id]: Math.round((snap.bytesTransferred / snap.totalBytes) * 100),
          })),
          reject,
          resolve,
        );
      });

      const url = await getDownloadURL(storageRef);
      const updated = {
        ...getStatus(item.id),
        audioUrl: url,
        audioStoragePath: path,
        audioStatus: 'uploaded',
      } satisfies ItemMediaStatus;
      await persistStatus(item.id, updated);
      await upsertSceneAssetForLessonItem(lesson, item, updated);
    } finally {
      setUploadingId(null);
      setUploadProgress(prev => { const n = { ...prev }; delete n[item.id]; return n; });
    }
  }

  async function verifyAudio(item: CurriculumMediaItem) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) return;
    const updated = { ...getStatus(item.id), audioStatus: 'verified' as const };
    await persistStatus(item.id, updated);
    await upsertSceneAssetForLessonItem(lesson, item, updated);
  }

  async function deleteAudioSilent(item: CurriculumMediaItem) {
    if (reviewIds.has(item.id) || externalDistractorIds.has(item.id)) return;
    const s = getStatus(item.id);
    if (s.audioStoragePath) {
      try {
        const { deleteObject } = await import('firebase/storage');
        await deleteObject(ref(storage, s.audioStoragePath));
      } catch { /* Storage silme başarısız — Firestore kaydını yine de temizle */ }
    }
    await persistStatus(item.id, { ...s, audioUrl: undefined, audioStoragePath: undefined, audioStatus: 'missing' });
  }

  async function deleteAudio(item: CurriculumMediaItem) {
    if (!confirm(`"${item.ku}" ses dosyasını silmek istediğine emin misin?`)) return;
    await deleteAudioSilent(item);
  }

  // ─── BULK AUDIO ───
  function handleBulkFileSelect(files: FileList) {
    const result: { file: File; matchedItemId: string | null }[] = [];
    for (const file of Array.from(files)) {
      const name = file.name.replace(/\.(mp3|wav|ogg|m4a|aac)$/i, '').toLowerCase().trim();
      const matched = productionItems.find(item =>
        item.ku.toLowerCase().trim() === name ||
        item.id.toLowerCase() === name ||
        (item.en?.toLowerCase().trim() === name),
      );
      result.push({ file, matchedItemId: matched?.id ?? null });
    }
    setBulkFiles(result);
    setBulkModal(true);
  }

  async function executeBulkUpload() {
    setBulkModal(false);
    for (const { file, matchedItemId } of bulkFiles) {
      if (!matchedItemId) continue;
      const item = productionItems.find(i => i.id === matchedItemId);
      if (item) await uploadAudio(item, file);
    }
    setBulkFiles([]);
  }

  // ─── PUBLISH ───
  const imgDone = (s: ImageGenStatus) => s === 'generated' || s === 'approved';
  const audDone = (s: AudioItemStatus) => s === 'uploaded' || s === 'verified';

  const imgDoneCount = productionItems.filter(i => {
    const status = getStatus(i.id);
    return imgDone(status.imageStatus) && Boolean(status.imageUrl) && !imageLoadErrors.has(i.id);
  }).length;
  const audDoneCount = productionItems.filter(i => audDone(getStatus(i.id).audioStatus)).length;
  const total = productionItems.length;
  const allDone = imgDoneCount === total && audDoneCount === total;

  async function handlePublish() {
    if (!confirm('Bu dersi yayına almak istediğinden emin misin? Bu işlem geri alınamaz.')) return;
    setPublishing(true);
    try {
      await updateLessonStatus(lesson.id, 'live', user?.uid ?? '', user?.email ?? '');
      await onSave({ ...lesson, status: 'live', mediaStatus });
    } finally {
      setPublishing(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await syncLessonToPublic(lesson.id);
      alert('✅ Ders uygulamaya gönderildi!');
    } catch (e: any) {
      alert('Hata: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  // ─── RENDER ───
  return (
    <div>
      {/* Progress + Bulk Actions */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'stretch' }}>
        <div className="card card-sm" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>🖼️ Görsel</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: imgDoneCount === total ? 'var(--green)' : 'var(--blue)' }}>
              {imgDoneCount}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>/ {total}</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2, marginTop: 6 }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.3s',
              width: `${total ? (imgDoneCount / total) * 100 : 0}%`,
              background: imgDoneCount === total ? 'var(--green)' : 'var(--blue)',
            }} />
          </div>
        </div>

        <div className="card card-sm" style={{ flex: '1 1 120px' }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>🎙️ Ses</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: audDoneCount === total ? 'var(--green)' : 'var(--orange)' }}>
              {audDoneCount}
            </span>
            <span style={{ fontSize: 13, color: 'var(--text2)' }}>/ {total}</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2, marginTop: 6 }}>
            <div style={{
              height: '100%', borderRadius: 2, transition: 'width 0.3s',
              width: `${total ? (audDoneCount / total) * 100 : 0}%`,
              background: audDoneCount === total ? 'var(--green)' : 'var(--orange)',
            }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={bulkRevision}
              onChange={e => setBulkRevision(e.target.value)}
              placeholder="Toplu revize notu (opsiyonel)..."
              style={{ flex: 1, fontSize: 11, minWidth: 0 }}
              onKeyDown={e => e.key === 'Enter' && !generatingAll && generateAllImages(bulkRevision || undefined)}
            />
            <button
              className="btn btn-blue btn-sm"
              onClick={() => generateAllImages(bulkRevision || undefined)}
              disabled={generatingAll || !!generatingId}
              title={`Görseli eksik ${productionItems.length} yeni kelimeyi üret. Tekrar kelimeleri (${reviewItems.length} adet) üretim dışıdır.`}
            >
              {generatingAll ? '⏳ Üretiliyor…' : `🎨 ${productionItems.length} Yeni Kelime Görseli Üret`}
            </button>
          </div>
          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer' }}>
            🎙️ Toplu Ses Yükle
            <input
              type="file"
              multiple
              accept="audio/*"
              style={{ display: 'none' }}
              onChange={e => e.target.files && handleBulkFileSelect(e.target.files)}
            />
          </label>
        </div>
      </div>

      {error && (
        <div className="validation-box validation-error" style={{ marginBottom: 16 }}>{error}</div>
      )}

      {reviewItems.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className="validation-box validation-ok" style={{ marginBottom: 8 }}>
            🔁 <strong>{reviewItems.length} tekrar kelimesi</strong> — Bu kelimeler orijinal ünitelerinden medya miras alıyor.
            Bu derste yeni görsel veya ses <strong>kesinlikle üretilmez</strong>.
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
            gap: 8,
          }}>
            {reviewItems.map(item => {
              const s = mediaStatus[item.id] ?? defaultStatus();
              const hasImage = Boolean(s.imageUrl);
              const hasAudio = Boolean(s.audioUrl);
              return (
                <div
                  key={item.id}
                  className="card card-sm"
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 4,
                    borderLeft: '3px solid var(--blue)',
                    opacity: 0.85,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt={item.ku}
                        style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    ) : (
                      <div style={{
                        width: 36, height: 36, borderRadius: 4, flexShrink: 0,
                        background: 'var(--bg4)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: 20,
                      }}>{item.emoji ?? '🖼️'}</div>
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.ku}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{item.tr}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, fontSize: 10 }}>
                    <span style={{ color: hasImage ? 'var(--green)' : 'var(--orange)' }}>
                      {hasImage ? '✓ Görsel' : '⚠ Görsel yok'}
                    </span>
                    <span style={{ color: hasAudio ? 'var(--green)' : 'var(--orange)' }}>
                      {hasAudio ? '✓ Ses' : '⚠ Ses yok'}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontStyle: 'italic' }}>
                    🔒 Üretim dışı
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {externalDistractorItems.length > 0 && (
        <div className="validation-box validation-ok" style={{ marginBottom: 16 }}>
          🎲 {externalDistractorItems.length} geçmiş kart yalnızca yanlış şık havuzunda kullanılıyor: {externalDistractorItems.map(item => item.ku).join(', ')}.
          Bu kartlar için yeni görsel veya ses üretilmeyecek.
        </div>
      )}

      <ValidationPanel lesson={lesson} />

      {/* Item Grid — 2 kolon, dikey kart (görsel üstte) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        {productionItems.map(item => {
          const s = getStatus(item.id);
          const isGen = generatingId === item.id;
          const isUp = uploadingId === item.id;
          const prog = uploadProgress[item.id] ?? 0;
          const imageBroken = Boolean(s.imageUrl && imageLoadErrors.has(item.id));
          const imageReady = imgDone(s.imageStatus) && Boolean(s.imageUrl) && !imageBroken;
          const audioReady = audDone(s.audioStatus);

          // App'teki imageFrame: width 100%, aspectRatio 1.06 — kare-yakın crop
          const imgBorderColor = s.imageStatus === 'approved'
            ? 'var(--green)'
            : s.imageStatus === 'generated'
            ? 'var(--orange)'
            : 'var(--border)';

          return (
            <div
              key={item.id}
              className="card"
              style={{
                padding: 0, overflow: 'hidden',
                borderColor: imageReady && audioReady ? 'var(--green)' : 'var(--border)',
                display: 'flex', flexDirection: 'column',
              }}
            >
              {/* ── Görsel Önizleme ──
                  learn_card: portrait ~0.86:1 (flex:1 içinde dikey)
                  image_to_word: 1.06:1 kutu
                  Kare (1:1) en iyi orta yol — 1024×1024 ile %7'den az kenar kırpma */}
              <div style={{
                width: '100%',
                aspectRatio: '1',
                background: 'var(--bg4)',
                position: 'relative',
                overflow: 'hidden',
                borderBottom: `2px solid ${imgBorderColor}`,
              }}>
                {s.imageUrl && imageReady ? (
                  <>
                    <img
                      src={s.imageUrl}
                      alt={item.ku}
                      onError={() => markImageBroken(item)}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {s.imageStatus === 'approved' && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        background: 'var(--green)', borderRadius: '50%',
                        width: 22, height: 22, fontSize: 13, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000',
                      }}>✓</div>
                    )}
                  </>
                ) : isGen ? (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <div style={{ fontSize: 28 }}>⏳</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{imageProviderLabel} üretiyor…</div>
                  </div>
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <div style={{ fontSize: 42 }}>{item.emoji ?? '🖼️'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                      {imageBroken ? 'Görsel yüklenmedi — yeniden üret' : s.imageStatus === 'rejected' ? '✗ Reddedildi — yeni üret' : 'Görsel yok'}
                    </div>
                  </div>
                )}
              </div>

              {/* ── İçerik + Aksiyonlar ── */}
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>

                {/* Kelime bilgisi */}
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {item.emoji} {item.ku}
                    {imageReady && audioReady && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {item.tr}{item.en ? ` · ${item.en}` : ''}
                  </div>
                  {item.partOfSpeech && (
                    <div style={{ fontSize: 10, color: 'var(--text3)' }}>{item.partOfSpeech}</div>
                  )}
                </div>

                {/* Görsel aksiyonlar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ImageStatusBadge status={s.imageStatus} />
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {/* Görsel üret */}
                    {(s.imageStatus === 'pending' || s.imageStatus === 'rejected' || imageBroken) && (
                      <button
                        className="btn btn-blue btn-sm"
                        style={{ fontSize: 11 }}
                        onClick={() => generateImage(item)}
                        disabled={!!generatingId || generatingAll}
                      >
                        🎨 {imageProviderLabel} ile Üret
                      </button>
                    )}
                    {s.imageStatus === 'generated' && !imageBroken && (
                      <>
                        <button className="btn btn-primary btn-sm" style={{ fontSize: 11 }} onClick={() => approveImage(item)}>✓ Onayla</button>
                        <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => generateImage(item)} disabled={!!generatingId}>🔄 Yeniden</button>
                        <button className="btn btn-red btn-sm" style={{ fontSize: 11 }} onClick={() => rejectImage(item)}>✗ Reddet</button>
                      </>
                    )}
                    {(s.imageStatus === 'approved') && (
                      <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={() => generateImage(item)} disabled={!!generatingId}>🔄 Yeniden Üret</button>
                    )}
                    {/* Manuel yükle — her durumda mevcut */}
                    <label
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: 11, cursor: 'pointer' }}
                      title="Kendi fotoğrafını yükle — doğrudan onaylanır"
                    >
                      📁 Manuel Yükle
                      <input
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={e => e.target.files?.[0] && uploadManualImage(item, e.target.files[0])}
                      />
                    </label>
                  </div>
                </div>

                {/* Revize satırı — görsel üretildikten sonra görünür */}
                {(s.imageStatus === 'generated' || s.imageStatus === 'approved' || s.imageStatus === 'rejected') && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                    <input
                      value={revisionTexts[item.id] ?? ''}
                      onChange={e => setRevisionTexts(prev => ({ ...prev, [item.id]: e.target.value }))}
                      placeholder="Revize: daha açık renk, arka plan beyaz, karakter ekle..."
                      style={{ flex: 1, fontSize: 11 }}
                      onKeyDown={e => { if (e.key === 'Enter') handleRevise(item); }}
                      disabled={!!generatingId || generatingAll}
                    />
                    <button
                      className="btn btn-blue btn-sm"
                      style={{ fontSize: 11, flexShrink: 0 }}
                      onClick={() => handleRevise(item)}
                      disabled={!revisionTexts[item.id]?.trim() || !!generatingId || generatingAll}
                    >
                      🔄
                    </button>
                  </div>
                )}

                {/* Ses bölümü */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <AudioStatusBadge status={s.audioStatus} />
                  <div style={{ marginTop: 5 }}>

                    {/* Dosya henüz seçilmedi → Yükle butonu */}
                    {s.audioStatus === 'missing' && !pendingAudio[item.id] && (
                      <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: 11 }}>
                        🎙️ Ses Yükle
                        <input type="file" accept="audio/*" style={{ display: 'none' }}
                          onChange={e => e.target.files?.[0] && handleAudioSelect(item, e.target.files[0])} />
                      </label>
                    )}

                    {/* Dosya seçildi, henüz upload edilmedi → Trimmer */}
                    {pendingAudio[item.id] && (
                      <AudioTrimmer
                        audioUrl={pendingAudio[item.id].localUrl}
                        onSave={blob => handleAudioApprove(item, blob)}
                        onSkip={() => handleAudioApprove(item, pendingAudio[item.id].file)}
                      />
                    )}

                    {/* Upload devam ediyor */}
                    {isUp && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--blue)', marginBottom: 3 }}>Yükleniyor… {prog}%</div>
                        <div style={{ height: 3, background: 'var(--bg4)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${prog}%`, background: 'var(--blue)', borderRadius: 2 }} />
                        </div>
                      </div>
                    )}

                    {/* Yüklendi → player + kontroller */}
                    {!isUp && s.audioUrl && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <audio src={s.audioUrl} controls style={{ height: 24, flex: 1, minWidth: 0 }} />
                          {s.audioStatus === 'uploaded' && (
                            <button className="btn btn-primary btn-sm" style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }} onClick={() => verifyAudio(item)}>✓</button>
                          )}
                          {s.audioStatus === 'verified' && <span style={{ fontSize: 14 }}>✅</span>}
                          {/* Değiştir: sil + yeni dosya seç → trimmer */}
                          <label className="btn btn-secondary btn-sm" style={{ cursor: 'pointer', fontSize: 10, padding: '2px 6px', flexShrink: 0 }} title="Değiştir">
                            🔁
                            <input type="file" accept="audio/*" style={{ display: 'none' }}
                              onChange={async e => {
                                if (!e.target.files?.[0]) return;
                                await deleteAudioSilent(item);
                                handleAudioSelect(item, e.target.files[0]);
                              }} />
                          </label>
                          <button className="btn btn-red btn-sm" style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }} title="Sil" onClick={() => deleteAudio(item)}>🗑️</button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Publish Section */}
      <div
        className="card"
        style={{
          background: allDone ? 'var(--green-dim)' : 'var(--bg3)',
          border: `1px solid ${allDone ? 'var(--green)' : 'var(--border)'}`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
              {lesson.status === 'live'
                ? '✅ Bu ders yayında'
                : allDone
                ? '🎉 Tüm medya hazır — yayına alabilirsin!'
                : 'Yayına Al'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              🖼️ {imgDoneCount}/{total} yeni kelime görseli
              {' · '}
              🎙️ {audDoneCount}/{total} yeni kelime sesi
              {reviewItems.length > 0 && ` · ${reviewItems.length} tekrar kelimesi eski medyayı kullanır`}
              {externalDistractorItems.length > 0 && ` · ${externalDistractorItems.length} geçmiş şık eski medyayı kullanır`}
              {!allDone && ' · Yayınlamak için tüm medyaların hazır olması gerekiyor'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            {lesson.status === 'live' && (
              <button
                className="btn btn-secondary"
                onClick={handleSync}
                disabled={syncing}
                title="publicLessons koleksiyonuna yeniden yaz — uygulamada görünmüyorsa buna bas"
              >
                {syncing ? '⏳ Gönderiliyor…' : '📲 Uygulamaya Gönder'}
              </button>
            )}
            <button
              className="btn btn-primary"
              style={{ opacity: lesson.status === 'live' ? 0.6 : 1 }}
              onClick={handlePublish}
              disabled={!allDone || publishing || lesson.status === 'live'}
            >
              {publishing ? '⏳ Yayınlanıyor…' : lesson.status === 'live' ? '✅ Yayında' : '🟢 Yayına Al'}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Audio Modal */}
      {bulkModal && (
        <div className="modal-overlay" onClick={() => setBulkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-title">🎙️ Toplu Ses Yükleme</div>
            <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 16 }}>
              Dosya adı kelimeyle eşleşirse otomatik atanır.
              Eşleşmeyenler için kelime seçin.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 320, overflowY: 'auto' }}>
              {bulkFiles.map((bf, i) => {
                const matched = productionItems.find(item => item.id === bf.matchedItemId);
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 10px', background: 'var(--bg4)', borderRadius: 6,
                      border: `1px solid ${matched ? 'var(--green)' : 'var(--border)'}`,
                    }}
                  >
                    <span style={{ fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      🎵 {bf.file.name}
                    </span>
                    {matched ? (
                      <span style={{ fontSize: 11, color: 'var(--green)', flexShrink: 0 }}>
                        → {matched.emoji} {matched.ku}
                      </span>
                    ) : (
                      <select
                        value={bf.matchedItemId ?? ''}
                        onChange={e => {
                          const updated = [...bulkFiles];
                          updated[i] = { ...bf, matchedItemId: e.target.value || null };
                          setBulkFiles(updated);
                        }}
                        style={{ width: 'auto', fontSize: 11, flexShrink: 0 }}
                      >
                        <option value="">— Kelime Seç —</option>
                        {productionItems.map(item => (
                          <option key={item.id} value={item.id}>
                            {item.emoji} {item.ku} ({item.tr})
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => { setBulkModal(false); setBulkFiles([]); }}
              >
                İptal
              </button>
              <button
                className="btn btn-primary"
                onClick={executeBulkUpload}
                disabled={bulkFiles.every(bf => !bf.matchedItemId)}
              >
                🎙️ {bulkFiles.filter(bf => bf.matchedItemId).length} Sesi Yükle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
