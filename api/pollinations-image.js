function compactPollinationsPrompt(prompt) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).end('Method Not Allowed');
    return;
  }

  try {
    const body = req.body;
    const prompt = compactPollinationsPrompt(body?.prompt ?? '');
    if (!prompt) {
      res.status(400).end('Missing prompt');
      return;
    }

    const seed = Number.isFinite(body.seed)
      ? String(body.seed)
      : String(Math.floor(Math.random() * 1000000000));

    const models = [...new Set([body.model, 'sana', 'turbo', ''].filter((m) => m !== undefined))];
    let lastError = 'No model attempted';

    for (const model of models) {
      const params = new URLSearchParams({ width: '1024', height: '1024', nologo: 'true', seed });
      if (model) params.set('model', model);
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?${params.toString()}`;

      let upstream;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          upstream = await fetch(url, {
            signal: controller.signal,
            headers: {
              accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
              'user-agent': 'KurdigoAdmin/1.0 image proxy',
            },
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (err) {
        lastError = `${model || 'default'}: ${err instanceof Error ? err.message : 'network error'}`;
        continue;
      }

      const contentType = upstream.headers.get('content-type') ?? 'application/octet-stream';
      if (!upstream.ok || !contentType.startsWith('image/')) {
        lastError = `${model || 'default'}: HTTP ${upstream.status}`;
        continue;
      }

      const bytes = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Pollinations-Model', model || 'default');
      res.status(200).send(bytes);
      return;
    }

    res.status(502).end(`Pollinations failed after fallbacks: ${lastError}`);
  } catch (err) {
    res.status(500).end(err instanceof Error ? err.message : 'Image proxy failed');
  }
}
