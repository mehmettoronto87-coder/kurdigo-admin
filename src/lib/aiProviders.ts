import OpenAI from 'openai';
import { getProjectSettings } from './projectSettings';

type TextJsonArgs = {
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
};

export type ImageAsset =
  | { kind: 'blob'; blob: Blob; contentType: string };

function envValue(value: string | undefined): string {
  return (value ?? '').trim();
}

export function getTextProviderLabel(): string {
  return 'OpenAI';
}

export function getImageProviderLabel(): string {
  return 'OpenAI';
}

export function hasTextProviderConfig(): boolean {
  const key = envValue(import.meta.env.VITE_OPENAI_API_KEY);
  return Boolean(key && key !== 'sk-...');
}

function extractJsonText(value: string): string {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
}

export async function generateTextJson(args: TextJsonArgs): Promise<string> {
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

  const raw = completion.choices[0]?.message?.content ?? '';
  return extractJsonText(raw);
}

export async function generateImageAsset(prompt: string): Promise<ImageAsset> {
  const apiKey = envValue(import.meta.env.VITE_OPENAI_API_KEY);
  if (!apiKey || apiKey === 'sk-...') throw new Error('VITE_OPENAI_API_KEY tanımlı değil.');

  const settings = await getProjectSettings().catch(() => ({ imageBrief: '', textQualityRules: '' }));
  const fullPrompt = settings.imageBrief
    ? `${settings.imageBrief}\n\n---\n\n${prompt}`
    : prompt;

  const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const resp = await openai.images.generate({
    model: envValue(import.meta.env.VITE_OPENAI_IMAGE_MODEL) || 'gpt-image-1',
    prompt: fullPrompt,
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
