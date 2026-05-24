import OpenAI from 'openai';

type TextJsonArgs = {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
};

export type ImageAsset =
  | { kind: 'blob'; blob: Blob; contentType: string };

type TextProvider = 'gemini' | 'openai';
type ImageProvider = 'comfyui' | 'gemini' | 'pollinations' | 'openai';

function envValue(value: string | undefined): string {
  return (value ?? '').trim();
}

function configuredTextProvider(): TextProvider {
  const requested = envValue(import.meta.env.VITE_AI_TEXT_PROVIDER).toLowerCase();
  if (requested === 'openai' || requested === 'gemini') return requested;
  return envValue(import.meta.env.VITE_GEMINI_API_KEY) ? 'gemini' : 'openai';
}

function configuredImageProvider(): ImageProvider {
  const requested = envValue(import.meta.env.VITE_IMAGE_PROVIDER).toLowerCase();
  if (requested === 'openai' || requested === 'pollinations' || requested === 'gemini' || requested === 'comfyui') return requested;
  if (envValue(import.meta.env.VITE_GEMINI_API_KEY)) return 'gemini';
  return 'pollinations';
}

export function getTextProviderLabel(): string {
  return configuredTextProvider() === 'gemini' ? 'Gemini' : 'OpenAI';
}

export function getImageProviderLabel(): string {
  const provider = configuredImageProvider();
  if (provider === 'comfyui') return 'ComfyUI';
  if (provider === 'gemini') return 'Gemini';
  return provider === 'pollinations' ? 'Pollinations' : 'OpenAI';
}

export function hasTextProviderConfig(): boolean {
  const provider = configuredTextProvider();
  if (provider === 'gemini') return Boolean(envValue(import.meta.env.VITE_GEMINI_API_KEY));
  const key = envValue(import.meta.env.VITE_OPENAI_API_KEY);
  return Boolean(key && key !== 'sk-...');
}

function extractJsonText(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

async function generateWithOpenAI(args: TextJsonArgs): Promise<string> {
  const apiKey = envValue(import.meta.env.VITE_OPENAI_API_KEY);
  if (!apiKey || apiKey === 'sk-...') throw new Error('VITE_OPENAI_API_KEY tanımlı değil.');

  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const completion = await openai.chat.completions.create({
    model: envValue(import.meta.env.VITE_OPENAI_TEXT_MODEL) || 'gpt-4o',
    messages: [
      { role: 'system', content: args.system },
      { role: 'user', content: args.user },
    ],
    temperature: args.temperature,
    max_tokens: args.maxTokens,
    response_format: { type: 'json_object' },
  });

  return completion.choices[0]?.message?.content ?? '';
}

async function generateWithGemini(args: TextJsonArgs): Promise<string> {
  const apiKey = envValue(import.meta.env.VITE_GEMINI_API_KEY);
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY tanımlı değil.');

  const model = envValue(import.meta.env.VITE_GEMINI_TEXT_MODEL) || 'gemini-2.5-flash';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: args.system }] },
        contents: [{ role: 'user', parts: [{ text: args.user }] }],
        generationConfig: {
          temperature: args.temperature,
          maxOutputTokens: args.maxTokens,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gemini isteği başarısız: HTTP ${response.status}`);
  }

  return payload?.candidates?.[0]?.content?.parts?.map(part => part.text ?? '').join('\n') ?? '';
}

export async function generateTextJson(args: TextJsonArgs): Promise<string> {
  const provider = configuredTextProvider();
  const raw = provider === 'gemini'
    ? await generateWithGemini(args)
    : await generateWithOpenAI(args);
  return extractJsonText(raw);
}

function pollinationsPrompt(prompt: string): string {
  const normalized = prompt
    .replace(/\s+/g, ' ')
    .replace(/[^\S\r\n]+/g, ' ')
    .trim();
  const subject = normalized.match(/Subject:\s*([^.]*(?:\.[^.]*)?)/i)?.[0] ?? '';
  const visualElements = normalized.match(/Key visual elements:\s*[^.]*/i)?.[0] ?? '';
  const location = normalized.match(/Location[^.]*\./i)?.[0] ?? '';
  const compact = [
    'Friendly square illustration for a children language learning app.',
    subject || normalized.slice(0, 260),
    visualElements,
    location,
    'Simple colorful clean style. No text, no letters, no numbers, no labels, no speech bubbles.',
  ].filter(Boolean).join(' ');
  return compact.slice(0, 700);
}

async function generateWithPollinations(prompt: string): Promise<ImageAsset> {
  const model = envValue(import.meta.env.VITE_POLLINATIONS_IMAGE_MODEL) || 'flux';
  const seed = Math.floor(Math.random() * 1_000_000_000);

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 45_000);
  const response = await fetch('/api/pollinations-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: pollinationsPrompt(prompt), model, seed }),
    signal: controller.signal,
  }).catch(() => null);
  window.clearTimeout(timer);
  if (!response?.ok) {
    const detail = await response?.text().catch(() => '');
    throw new Error(`Pollinations görsel indirilemedi: HTTP ${response?.status ?? 'network'}${detail ? ` - ${detail}` : ''}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/png';
  if (!contentType.startsWith('image/')) {
    throw new Error('Pollinations görsel yerine farklı bir yanıt döndürdü.');
  }

  return { kind: 'blob', blob: await response.blob(), contentType };
}

async function generateWithComfyUI(prompt: string): Promise<ImageAsset> {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const response = await fetch('/api/comfyui-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, seed }),
  }).catch(() => null);

  if (!response?.ok) {
    const detail = await response?.text().catch(() => '');
    throw new Error(`ComfyUI görsel üretimi başarısız: HTTP ${response?.status ?? 'network'}${detail ? ` - ${detail}` : ''}`);
  }

  const contentType = response.headers.get('content-type') ?? 'image/png';
  if (!contentType.startsWith('image/')) throw new Error('ComfyUI görsel yerine farklı bir yanıt döndürdü.');
  return { kind: 'blob', blob: await response.blob(), contentType };
}

function numberFromPrompt(prompt: string): number | null {
  const text = prompt.toLocaleLowerCase('tr-TR');
  const entries: [number, string[]][] = [
    [1, [' yek ', ' bir ', ' one ', ' number one']],
    [2, [' du ', ' iki ', ' two ', ' number two']],
    [3, [' sê ', ' se ', ' üç ', ' uc ', ' three ', ' number three']],
    [4, [' çar ', ' car ', ' dört ', ' dort ', ' four ', ' number four']],
    [5, [' pênc ', ' penc ', ' beş ', ' bes ', ' five ', ' number five']],
    [6, [' şeş ', ' ses ', ' altı ', ' alti ', ' six ', ' number six']],
    [7, [' heft ', ' yedi ', ' seven ', ' number seven']],
    [8, [' heşt ', ' hest ', ' sekiz ', ' eight ', ' number eight']],
    [9, [' neh ', ' dokuz ', ' nine ', ' number nine']],
    [10, [' deh ', ' on ', ' ten ', ' number ten']],
  ];
  const padded = ` ${text} `;
  return entries.find(([, terms]) => terms.some(term => padded.includes(term)))?.[0] ?? null;
}

function emojiFromPrompt(prompt: string): string | null {
  return prompt.match(/\p{Extended_Pictographic}/u)?.[0] ?? null;
}

function includesAny(text: string, terms: string[]): boolean {
  return terms.some(term => text.includes(term));
}

function localStyleFromPrompt(prompt: string): {
  object: 'ball' | 'apple' | 'star' | 'flower' | 'cube';
  bg: 'soft' | 'white' | 'outdoor' | 'dark';
  palette: string[];
  scale: number;
  character: boolean;
} {
  const text = prompt.toLocaleLowerCase('tr-TR');
  const paletteMap: [string[], string[]][] = [
    [['kırmızı', 'kirmizi', 'red'], ['#ff5c5c', '#ff8a8a', '#d93b3b', '#ffb3b3']],
    [['mavi', 'blue'], ['#1cb0f6', '#4dd4ff', '#1976d2', '#9be7ff']],
    [['yeşil', 'yesil', 'green'], ['#58cc02', '#00c2a8', '#2eaf5d', '#b7f769']],
    [['sarı', 'sari', 'yellow'], ['#ffd43b', '#ffea70', '#ffb703', '#fff3bf']],
    [['mor', 'purple'], ['#7b61ff', '#ce82ff', '#9b59b6', '#e6ccff']],
    [['turuncu', 'orange'], ['#ff9600', '#ffb84d', '#f97316', '#ffd8a8']],
    [['pastel'], ['#a8dadc', '#ffd6a5', '#caffbf', '#bdb2ff', '#ffadad']],
  ];
  const palette = paletteMap.find(([terms]) => includesAny(text, terms))?.[1]
    ?? ['#58cc02', '#1cb0f6', '#ff9600', '#ce82ff', '#ff5c5c', '#00c2a8', '#ffd43b', '#7b61ff', '#ff7ab6', '#4dd4ff'];

  const object = includesAny(text, ['elma', 'apple'])
    ? 'apple'
    : includesAny(text, ['yıldız', 'yildiz', 'star'])
    ? 'star'
    : includesAny(text, ['çiçek', 'cicek', 'flower'])
    ? 'flower'
    : includesAny(text, ['küp', 'kup', 'cube', 'blok', 'block'])
    ? 'cube'
    : 'ball';

  const bg = includesAny(text, ['beyaz arka', 'white background', 'arka plan beyaz'])
    ? 'white'
    : includesAny(text, ['dış mekan', 'dis mekan', 'outdoor', 'çimen', 'cimen'])
    ? 'outdoor'
    : includesAny(text, ['koyu', 'dark'])
    ? 'dark'
    : 'soft';

  return {
    object,
    bg,
    palette,
    scale: includesAny(text, ['büyük', 'buyuk', 'large', 'bigger']) ? 1.22 : includesAny(text, ['küçük', 'kucuk', 'small']) ? 0.82 : 1,
    character: includesAny(text, ['karakter', 'baran', 'berfin', 'kurdo', 'person', 'child', 'çocuk', 'cocuk']),
  };
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    ctx.lineTo(x + Math.cos(angle) * r, y + Math.sin(angle) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function drawObject(ctx: CanvasRenderingContext2D, object: 'ball' | 'apple' | 'star' | 'flower' | 'cube', x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  if (object === 'star') {
    drawStar(ctx, x, y, size);
  } else if (object === 'cube') {
    ctx.beginPath();
    ctx.roundRect(x - size, y - size, size * 2, size * 2, 24);
    ctx.fill();
  } else if (object === 'flower') {
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI * 2 * i) / 6;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(angle) * size * 0.55, y + Math.sin(angle) * size * 0.55, size * 0.45, size * 0.28, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.arc(x, y, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (object === 'apple') {
      ctx.fillStyle = '#2eaf5d';
      ctx.beginPath();
      ctx.ellipse(x + size * 0.18, y - size * 0.95, size * 0.28, size * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(x - size * 0.34, y - size * 0.38, size * 0.28, 0, Math.PI * 2);
  ctx.fill();
}

function drawCharacter(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1f2937';
  ctx.beginPath();
  ctx.arc(806, 770, 42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#58cc02';
  ctx.beginPath();
  ctx.roundRect(750, 815, 112, 120, 38);
  ctx.fill();
  ctx.strokeStyle = '#1f2937';
  ctx.lineWidth = 16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(764, 848);
  ctx.lineTo(706, 792);
  ctx.moveTo(848, 848);
  ctx.lineTo(900, 802);
  ctx.stroke();
}

async function generateLocalIllustration(prompt: string): Promise<ImageAsset> {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas oluşturulamadı.');

  const style = localStyleFromPrompt(prompt);
  if (style.bg === 'white') {
    ctx.fillStyle = '#ffffff';
  } else if (style.bg === 'dark') {
    ctx.fillStyle = '#171923';
  } else if (style.bg === 'outdoor') {
    const bg = ctx.createLinearGradient(0, 0, 0, 1024);
    bg.addColorStop(0, '#bdeeff');
    bg.addColorStop(0.65, '#f7fbff');
    bg.addColorStop(0.66, '#b7f769');
    bg.addColorStop(1, '#58cc02');
    ctx.fillStyle = bg;
  } else {
    const bg = ctx.createLinearGradient(0, 0, 1024, 1024);
    bg.addColorStop(0, '#f7fbff');
    bg.addColorStop(1, '#e7f4ed');
    ctx.fillStyle = bg;
  }
  ctx.fillRect(0, 0, 1024, 1024);

  ctx.fillStyle = style.bg === 'dark' ? '#242938' : '#ffffff';
  ctx.beginPath();
  ctx.roundRect(86, 86, 852, 852, 64);
  ctx.fill();

  const count = numberFromPrompt(prompt);
  const emoji = emojiFromPrompt(prompt);

  if (count) {
    const cols = count <= 4 ? count : Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const gap = 170 * Math.min(1, 1 / style.scale);
    const startX = 512 - ((cols - 1) * gap) / 2;
    const startY = 512 - ((rows - 1) * gap) / 2;
    const size = 58 * style.scale;

    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * gap;
      const y = startY + row * gap;
      drawObject(ctx, style.object, x, y, size, style.palette[i % style.palette.length]);
    }
    if (style.character) drawCharacter(ctx);
  } else if (emoji) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '260px Apple Color Emoji, Segoe UI Emoji, sans-serif';
    ctx.fillText(emoji, 512, 500);
    if (style.character) drawCharacter(ctx);
  } else {
    for (let i = 0; i < 7; i++) {
      const angle = (Math.PI * 2 * i) / 7;
      const x = 512 + Math.cos(angle) * 220;
      const y = 512 + Math.sin(angle) * 180;
      drawObject(ctx, style.object, x, y, 70 * style.scale, style.palette[i % style.palette.length]);
    }
    if (style.character) drawCharacter(ctx);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('Canvas PNG üretmedi.')), 'image/png');
  });
  return { kind: 'blob', blob, contentType: 'image/png' };
}

async function generateImageWithGemini(prompt: string): Promise<ImageAsset> {
  const apiKey = envValue(import.meta.env.VITE_GEMINI_API_KEY);
  if (!apiKey) throw new Error('VITE_GEMINI_API_KEY tanımlı değil.');

  const model = envValue(import.meta.env.VITE_GEMINI_IMAGE_MODEL) || 'gemini-2.5-flash-image';
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
        },
      }),
    },
  );

  const payload = await response.json().catch(() => null) as {
    error?: { message?: string };
    candidates?: { content?: { parts?: { inlineData?: { data?: string; mimeType?: string } }[] } }[];
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `Gemini görsel isteği başarısız: HTTP ${response.status}`);
  }

  const inlineData = payload?.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData;
  if (!inlineData?.data) throw new Error('Gemini görsel verisi boş döndü.');

  const byteStr = atob(inlineData.data);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  return { kind: 'blob', blob: new Blob([ab], { type: inlineData.mimeType ?? 'image/png' }), contentType: inlineData.mimeType ?? 'image/png' };
}

async function generateImageWithOpenAI(prompt: string): Promise<ImageAsset> {
  const apiKey = envValue(import.meta.env.VITE_OPENAI_API_KEY);
  if (!apiKey || apiKey === 'sk-...') throw new Error('VITE_OPENAI_API_KEY tanımlı değil.');

  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const resp = await openai.images.generate({
    model: envValue(import.meta.env.VITE_OPENAI_IMAGE_MODEL) || 'gpt-image-1',
    prompt,
    n: 1,
    size: '1024x1024',
    quality: 'medium',
  });

  const b64 = resp.data?.[0]?.b64_json;
  if (!b64) throw new Error('Görsel verisi boş döndü');

  const byteStr = atob(b64);
  const ab = new ArrayBuffer(byteStr.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteStr.length; i++) ia[i] = byteStr.charCodeAt(i);
  return { kind: 'blob', blob: new Blob([ab], { type: 'image/png' }), contentType: 'image/png' };
}

export async function generateImageAsset(prompt: string): Promise<ImageAsset> {
  const provider = configuredImageProvider();
  if (provider === 'openai') return generateImageWithOpenAI(prompt);
  if (provider === 'comfyui') {
    try {
      return await generateWithComfyUI(prompt);
    } catch {
      return generateLocalIllustration(prompt);
    }
  }
  if (provider === 'gemini') {
    try {
      return await generateImageWithGemini(prompt);
    } catch {
      try {
        return await generateWithPollinations(prompt);
      } catch {
        return generateLocalIllustration(prompt);
      }
    }
  }
  try {
    return await generateWithPollinations(prompt);
  } catch {
    return generateLocalIllustration(prompt);
  }
}
