import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CustomPetChoiceId } from '../shared/pet-settings';

const REGISTRY_FILE = 'registry.json';
export const MAX_DESKTOP_CUSTOM_PET_BYTES = 10 * 1024 * 1024;

export type SupportedPetMime = 'image/png' | 'image/webp';

export interface CustomPetRecord {
  id: CustomPetChoiceId;
  label: string;
  fileName: string;
  mime: SupportedPetMime;
}

export interface CustomPetRendererConfig {
  id: CustomPetChoiceId;
  label: string;
  src: string;
}

export function detectPetImage(bytes: Uint8Array): SupportedPetMime | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  return riff === 'RIFF' && webp === 'WEBP' ? 'image/webp' : null;
}

function isRecord(value: unknown): value is CustomPetRecord {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<CustomPetRecord>;
  return (
    typeof record.id === 'string' &&
    /^custom:[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(record.id) &&
    typeof record.label === 'string' &&
    record.label.trim().length > 0 &&
    record.label.length <= 80 &&
    typeof record.fileName === 'string' &&
    /^[a-zA-Z0-9_-]{1,96}\.(png|webp)$/.test(record.fileName) &&
    (record.mime === 'image/png' || record.mime === 'image/webp')
  );
}

function labelFromPath(path: string): string {
  const label = basename(path, extname(path)).trim().slice(0, 80);
  return label || '自定义宠物';
}

export class CustomPetStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  load(): CustomPetRecord[] {
    try {
      const parsed = JSON.parse(readFileSync(join(this.root, REGISTRY_FILE), 'utf8')) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (record): record is CustomPetRecord =>
          isRecord(record) && existsSync(join(this.root, record.fileName)),
      );
    } catch {
      return [];
    }
  }

  importFile(sourcePath: string): CustomPetRecord {
    const bytes = readFileSync(sourcePath);
    if (bytes.byteLength > MAX_DESKTOP_CUSTOM_PET_BYTES) {
      throw new Error('图片不能超过 10 MB');
    }
    const mime = detectPetImage(bytes);
    if (mime === null) throw new Error('仅支持 PNG、APNG 或 WebP 图片');

    mkdirSync(this.root, { recursive: true });
    const token = randomUUID();
    const fileName = `${token}.${mime === 'image/png' ? 'png' : 'webp'}`;
    const record: CustomPetRecord = {
      id: `custom:${token}`,
      label: labelFromPath(sourcePath),
      fileName,
      mime,
    };
    const destination = join(this.root, fileName);
    writeFileSync(destination, bytes, { flag: 'wx' });
    try {
      this.save([...this.load(), record]);
    } catch (error) {
      unlinkSync(destination);
      throw error;
    }
    return record;
  }

  remove(id: CustomPetChoiceId): boolean {
    const records = this.load();
    const record = records.find((candidate) => candidate.id === id);
    if (record === undefined) return false;
    try {
      unlinkSync(join(this.root, record.fileName));
    } catch {
      // Missing files are removed from the registry as well.
    }
    this.save(records.filter((candidate) => candidate.id !== id));
    return true;
  }

  rendererConfig(record: CustomPetRecord): CustomPetRendererConfig {
    return {
      id: record.id,
      label: record.label,
      src: pathToFileURL(join(this.root, record.fileName)).href,
    };
  }

  private save(records: readonly CustomPetRecord[]): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(join(this.root, REGISTRY_FILE), JSON.stringify(records, null, 2));
  }
}
