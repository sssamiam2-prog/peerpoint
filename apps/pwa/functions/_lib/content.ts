/**
 * Self Help catalog + Resource Gallery (KV-backed).
 * Gallery files are stored as binary blobs in KV (max 8 MiB per file).
 */

import type { Env } from './store';
import { newId } from './store';

const SELF_HELP_KEY = 'peerpoint:self_help';
const RESOURCES_KEY = 'peerpoint:resources';
const resourceBlobKey = (id: string): string => `peerpoint:resource-blob:${id}`;

export const MAX_RESOURCE_BYTES = 8 * 1024 * 1024;

export type SelfHelpArticle = {
  id: string;
  title: string;
  category: string;
  body: string;
  url?: string;
  /** YouTube, Vimeo, or direct video URL — embedded for members. */
  videoUrl?: string;
  sortOrder: number;
  isPublished: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

export type GalleryResource = {
  id: string;
  title: string;
  description?: string;
  kind: 'file' | 'link';
  fileName?: string;
  contentType?: string;
  size?: number;
  /** External link when kind === 'link'. */
  url?: string;
  uploadedAt: string;
  uploadedBy: string;
  uploadedByDisplay: string;
};

let memorySelfHelp: SelfHelpArticle[] | null = null;
let memoryResources: GalleryResource[] = [];
const memoryBlobs = new Map<string, ArrayBuffer>();

export async function loadSelfHelp(env: Env): Promise<SelfHelpArticle[] | null> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(SELF_HELP_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as SelfHelpArticle[]) : null;
    } catch {
      return null;
    }
  }
  return memorySelfHelp;
}

export async function saveSelfHelp(env: Env, items: SelfHelpArticle[]): Promise<void> {
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(SELF_HELP_KEY, JSON.stringify(sorted));
    return;
  }
  memorySelfHelp = sorted;
}

export async function loadResources(env: Env): Promise<GalleryResource[]> {
  if (env.PEERPOINT_KV) {
    const raw = await env.PEERPOINT_KV.get(RESOURCES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? (parsed as GalleryResource[]) : [];
    } catch {
      return [];
    }
  }
  return memoryResources;
}

export async function saveResources(env: Env, list: GalleryResource[]): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(RESOURCES_KEY, JSON.stringify(list));
    return;
  }
  memoryResources = list;
}

export async function putResourceBlob(env: Env, id: string, data: ArrayBuffer): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.put(resourceBlobKey(id), data);
    return;
  }
  memoryBlobs.set(id, data);
}

export async function getResourceBlob(env: Env, id: string): Promise<ArrayBuffer | null> {
  if (env.PEERPOINT_KV) {
    const val = await env.PEERPOINT_KV.get(resourceBlobKey(id), 'arrayBuffer');
    return val;
  }
  return memoryBlobs.get(id) ?? null;
}

export async function deleteResourceBlob(env: Env, id: string): Promise<void> {
  if (env.PEERPOINT_KV) {
    await env.PEERPOINT_KV.delete(resourceBlobKey(id));
    return;
  }
  memoryBlobs.delete(id);
}

export function createResourceId(): string {
  return newId();
}
