import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

export interface ProjectSettings {
  imageBrief: string;
  textQualityRules: string;
  updatedAt?: string;
}

const EMPTY: ProjectSettings = { imageBrief: '', textQualityRules: '' };
let _cache: ProjectSettings | null = null;
let _cacheTime = 0;
const TTL = 60_000;

function ref() {
  return doc(db, 'admin_config', 'kurdigo_project');
}

export function invalidateProjectSettingsCache() {
  _cache = null;
}

export async function getProjectSettings(): Promise<ProjectSettings> {
  const now = Date.now();
  if (_cache && now - _cacheTime < TTL) return _cache;
  try {
    const snap = await getDoc(ref());
    _cache = snap.exists() ? (snap.data() as ProjectSettings) : EMPTY;
  } catch {
    _cache = EMPTY;
  }
  _cacheTime = Date.now();
  return _cache;
}

export async function saveProjectSettings(settings: Omit<ProjectSettings, 'updatedAt'>): Promise<void> {
  const payload: ProjectSettings = { ...settings, updatedAt: new Date().toISOString() };
  await setDoc(ref(), payload, { merge: true });
  _cache = payload;
  _cacheTime = Date.now();
}
