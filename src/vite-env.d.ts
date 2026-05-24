/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPENAI_API_KEY: string;
  readonly VITE_OPENAI_TEXT_MODEL?: string;
  readonly VITE_OPENAI_IMAGE_MODEL?: string;
  readonly VITE_AI_TEXT_PROVIDER?: string;
  readonly VITE_IMAGE_PROVIDER?: string;
  readonly VITE_COMFYUI_URL?: string;
  readonly VITE_COMFYUI_CHECKPOINT?: string;
  readonly VITE_COMFYUI_TIMEOUT_MS?: string;
  readonly VITE_COMFYUI_IMAGE_SIZE?: string;
  readonly VITE_GEMINI_API_KEY?: string;
  readonly VITE_GEMINI_TEXT_MODEL?: string;
  readonly VITE_GEMINI_IMAGE_MODEL?: string;
  readonly VITE_POLLINATIONS_IMAGE_MODEL?: string;
  readonly VITE_ADMIN_EMAIL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
