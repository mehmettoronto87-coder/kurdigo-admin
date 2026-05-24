import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function compactPollinationsPrompt(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  const subject = normalized.match(/Subject:\s*([^.]*(?:\.[^.]*)?)/i)?.[0] ?? '';
  const visualElements = normalized.match(/Key visual elements:\s*[^.]*/i)?.[0] ?? '';
  const location = normalized.match(/Location[^.]*\./i)?.[0] ?? '';
  return [
    'Friendly square illustration for a children language learning app.',
    subject || normalized.slice(0, 260),
    visualElements,
    location,
    'Simple colorful clean style. No text, no letters, no numbers, no labels, no speech bubbles.',
  ].filter(Boolean).join(' ').slice(0, 700);
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        'user-agent': 'KurdigoAdmin/1.0 local image proxy',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function pollinationsProxyPlugin(): Plugin {
  return {
    name: 'kurdigo-pollinations-proxy',
    configureServer(server) {
      server.middlewares.use('/api/pollinations-image', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          const body = JSON.parse(await readBody(req)) as { prompt?: string; model?: string; seed?: number };
          const prompt = compactPollinationsPrompt(body.prompt ?? '');
          if (!prompt) {
            res.statusCode = 400;
            res.end('Missing prompt');
            return;
          }

          const seed = Number.isFinite(body.seed) ? String(body.seed) : String(Math.floor(Math.random() * 1_000_000_000));
          const models = [...new Set([body.model, 'sana', 'turbo', ''].filter(model => model !== undefined))] as string[];
          let lastError = 'No model attempted';

          for (const model of models) {
            const params = new URLSearchParams({
              width: '1024',
              height: '1024',
              nologo: 'true',
              seed,
            });
            if (model) params.set('model', model);

            const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;
            let upstream: Response;
            try {
              upstream = await fetchWithTimeout(url, 20_000);
            } catch (error) {
              lastError = `${model || 'default'}: ${error instanceof Error ? error.message : 'network error'}`;
              continue;
            }

            const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
            if (!upstream.ok || !contentType.startsWith('image/')) {
              lastError = `${model || 'default'}: HTTP ${upstream.status}`;
              continue;
            }

            const bytes = Buffer.from(await upstream.arrayBuffer());
            res.statusCode = 200;
            res.setHeader('Content-Type', contentType);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('X-Pollinations-Model', model || 'default');
            res.end(bytes);
            return;
          }

          res.statusCode = 502;
          res.end(`Pollinations failed after fallbacks: ${lastError}`);
        } catch (error) {
          res.statusCode = 500;
          res.end(error instanceof Error ? error.message : 'Image proxy failed');
        }
      });
    },
  };
}

type ComfyImageRef = {
  filename: string;
  subfolder?: string;
  type?: string;
};

async function readJson(response: Response): Promise<any> {
  return response.json().catch(() => null);
}

function comfyWorkflow(prompt: string, checkpoint: string, seed: number, size: number): Record<string, any> {
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: checkpoint },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: `${prompt}, friendly high quality children's language learning app illustration, clean composition, no text, no letters, no watermark`,
        clip: ['1', 1],
      },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: 'text, letters, words, watermark, logo, blurry, scary, violent, weapon, low quality, distorted hands, extra fingers',
        clip: ['1', 1],
      },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: size, height: size, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps: 24,
        cfg: 7,
        sampler_name: 'euler',
        scheduler: 'normal',
        denoise: 1,
        model: ['1', 0],
        positive: ['2', 0],
        negative: ['3', 0],
        latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'kurdigo_admin', images: ['6', 0] },
    },
  };
}

async function resolveComfyCheckpoint(baseUrl: string, configured: string): Promise<string> {
  if (configured) return configured;

  const response = await fetch(`${baseUrl}/object_info/CheckpointLoaderSimple`);
  const payload = await readJson(response);
  const checkpoints = payload?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0];
  if (Array.isArray(checkpoints) && typeof checkpoints[0] === 'string') return checkpoints[0];

  throw new Error('ComfyUI checkpoint bulunamadı. ComfyUI içine bir SDXL/Flux checkpoint modeli ekle veya VITE_COMFYUI_CHECKPOINT ayarla.');
}

async function pollComfyHistory(baseUrl: string, promptId: string, timeoutMs: number): Promise<any> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    const payload = await readJson(response);
    const item = payload?.[promptId];
    if (item?.outputs) return item;
    await new Promise(resolve => setTimeout(resolve, 1200));
  }
  throw new Error('ComfyUI üretimi zaman aşımına uğradı.');
}

function firstComfyImage(historyItem: any): ComfyImageRef | null {
  const outputs = historyItem?.outputs ?? {};
  for (const output of Object.values(outputs) as any[]) {
    const image = output?.images?.[0];
    if (image?.filename) return image;
  }
  return null;
}

function comfyProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'kurdigo-comfyui-proxy',
    configureServer(server) {
      server.middlewares.use('/api/comfyui-image', async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end('Method Not Allowed');
          return;
        }

        try {
          const body = JSON.parse(await readBody(req)) as { prompt?: string; seed?: number };
          const prompt = (body.prompt ?? '').replace(/\s+/g, ' ').trim();
          if (!prompt) {
            res.statusCode = 400;
            res.end('Missing prompt');
            return;
          }

          const baseUrl = (env.VITE_COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/$/, '');
          const checkpoint = await resolveComfyCheckpoint(baseUrl, env.VITE_COMFYUI_CHECKPOINT || '');
          const seed = Number.isFinite(body.seed) ? Number(body.seed) : Math.floor(Math.random() * 1_000_000_000);
          const clientId = `kurdigo-admin-${Date.now()}`;
          const size = Number(env.VITE_COMFYUI_IMAGE_SIZE || 512);
          const workflow = comfyWorkflow(prompt, checkpoint, seed, size);

          const queueResponse = await fetch(`${baseUrl}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: workflow, client_id: clientId }),
          });
          const queuePayload = await readJson(queueResponse);
          if (!queueResponse.ok || !queuePayload?.prompt_id) {
            res.statusCode = queueResponse.status || 502;
            res.end(queuePayload?.error?.message ?? queuePayload?.error ?? 'ComfyUI prompt queue failed');
            return;
          }

          const historyItem = await pollComfyHistory(baseUrl, queuePayload.prompt_id, Number(env.VITE_COMFYUI_TIMEOUT_MS || 180_000));
          const image = firstComfyImage(historyItem);
          if (!image) {
            res.statusCode = 502;
            res.end('ComfyUI çıktı görseli bulunamadı.');
            return;
          }

          const params = new URLSearchParams({
            filename: image.filename,
            subfolder: image.subfolder ?? '',
            type: image.type ?? 'output',
          });
          const imageResponse = await fetch(`${baseUrl}/view?${params.toString()}`);
          const contentType = imageResponse.headers.get('content-type') ?? 'image/png';
          if (!imageResponse.ok || !contentType.startsWith('image/')) {
            res.statusCode = imageResponse.status || 502;
            res.end(`ComfyUI image fetch failed: HTTP ${imageResponse.status}`);
            return;
          }

          const bytes = Buffer.from(await imageResponse.arrayBuffer());
          res.statusCode = 200;
          res.setHeader('Content-Type', contentType);
          res.setHeader('Cache-Control', 'no-store');
          res.end(bytes);
        } catch (error) {
          res.statusCode = 502;
          res.end(error instanceof Error ? error.message : 'ComfyUI image proxy failed');
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), pollinationsProxyPlugin(), comfyProxyPlugin(env)],
    server: {
      port: 3001,
      host: 'localhost',
    },
  };
});
