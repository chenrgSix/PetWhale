import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { CustomPetChoiceId } from './pet-settings';
import {
  LIVE2D_STATES,
  validateLive2DArchive,
  type Live2DMotionBinding,
  type Live2DMotionMap,
} from './live2d-package';

const REGISTRY_FILE = 'registry.json';
export const MAX_DESKTOP_CUSTOM_PET_BYTES = 10 * 1024 * 1024;

export type SupportedPetMime = 'image/png' | 'image/webp';

interface CustomPetRecordBase {
  id: CustomPetChoiceId;
  label: string;
}

export interface ImageCustomPetRecord extends CustomPetRecordBase {
  type: 'image';
  fileName: string;
  mime: SupportedPetMime;
}

export interface Live2DCustomPetRecord extends CustomPetRecordBase {
  type: 'live2d';
  directoryName: string;
  entry: string;
  motions: Live2DMotionMap;
}

export type CustomPetRecord = ImageCustomPetRecord | Live2DCustomPetRecord;

export interface ImageCustomPetRendererConfig {
  type: 'image';
  id: CustomPetChoiceId;
  label: string;
  src: string;
}

export interface Live2DCustomPetRendererConfig {
  type: 'live2d';
  id: CustomPetChoiceId;
  label: string;
  modelUrl: string;
  motions: Live2DMotionMap;
}

export type CustomPetRendererConfig =
  | ImageCustomPetRendererConfig
  | Live2DCustomPetRendererConfig;

export function detectPetImage(bytes: Uint8Array): SupportedPetMime | null {
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((byte, index) => bytes[index] === byte)) return 'image/png';
  const riff = String.fromCharCode(...bytes.slice(0, 4));
  const webp = String.fromCharCode(...bytes.slice(8, 12));
  return riff === 'RIFF' && webp === 'WEBP' ? 'image/webp' : null;
}

function isMotionBinding(value: unknown): value is Live2DMotionBinding {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const binding = value as Partial<Live2DMotionBinding>;
  return (
    typeof binding.group === 'string' &&
    binding.group.length > 0 &&
    (binding.index === undefined || (Number.isInteger(binding.index) && binding.index >= 0)) &&
    (binding.loop === undefined || typeof binding.loop === 'boolean')
  );
}

function normalizeRecord(value: unknown): CustomPetRecord | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== 'string' ||
    !/^custom:[a-zA-Z0-9][a-zA-Z0-9_-]{0,95}$/.test(record.id) ||
    typeof record.label !== 'string' ||
    record.label.trim().length === 0 ||
    record.label.length > 80
  ) return null;
  const id = record.id as CustomPetChoiceId;
  const label = record.label;
  if (
    (record.type === undefined || record.type === 'image') &&
    typeof record.fileName === 'string' &&
    /^[a-zA-Z0-9_-]{1,96}\.(png|webp)$/.test(record.fileName) &&
    (record.mime === 'image/png' || record.mime === 'image/webp')
  ) {
    return {
      type: 'image',
      id,
      label,
      fileName: record.fileName,
      mime: record.mime,
    };
  }
  if (
    record.type === 'live2d' &&
    typeof record.directoryName === 'string' &&
    /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(record.directoryName) &&
    typeof record.entry === 'string' &&
    record.entry.toLocaleLowerCase('en-US').endsWith('.model3.json') &&
    record.motions !== null &&
    typeof record.motions === 'object' &&
    !Array.isArray(record.motions)
  ) {
    const motions = record.motions as Record<string, unknown>;
    if (
      Object.keys(motions).every((state) =>
        (LIVE2D_STATES as readonly string[]).includes(state) && isMotionBinding(motions[state]),
      )
    ) {
      return {
        type: 'live2d',
        id,
        label,
        directoryName: record.directoryName,
        entry: record.entry,
        motions: motions as Live2DMotionMap,
      };
    }
  }
  return null;
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
      return parsed.flatMap((value) => {
        const record = normalizeRecord(value);
        if (record === null) return [];
        const storedPath = record.type === 'image' ? record.fileName : record.directoryName;
        return existsSync(join(this.root, storedPath)) ? [record] : [];
      });
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
      type: 'image',
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

  importLive2D(sourcePath: string): Live2DCustomPetRecord {
    const archive = readFileSync(sourcePath);
    const model = validateLive2DArchive(archive, basename(sourcePath));
    const token = randomUUID();
    const stagingName = `.import-${token}`;
    const staging = join(this.root, stagingName);
    const destination = join(this.root, token);
    mkdirSync(staging, { recursive: true });
    try {
      for (const [path, bytes] of model.files) {
        const output = join(staging, ...path.split('/'));
        mkdirSync(dirname(output), { recursive: true });
        writeFileSync(output, bytes, { flag: 'wx' });
      }
      renameSync(staging, destination);
      const record: Live2DCustomPetRecord = {
        type: 'live2d',
        id: `custom:${token}`,
        label: model.label,
        directoryName: token,
        entry: model.entry,
        motions: model.motions,
      };
      try {
        this.save([...this.load(), record]);
      } catch (error) {
        rmSync(destination, { recursive: true, force: true });
        throw error;
      }
      return record;
    } catch (error) {
      rmSync(staging, { recursive: true, force: true });
      throw error;
    }
  }

  remove(id: CustomPetChoiceId): boolean {
    const records = this.load();
    const record = records.find((candidate) => candidate.id === id);
    if (record === undefined) return false;
    try {
      if (record.type === 'image') unlinkSync(join(this.root, record.fileName));
      else rmSync(join(this.root, record.directoryName), { recursive: true, force: true });
    } catch {
      // Missing files are removed from the registry as well.
    }
    this.save(records.filter((candidate) => candidate.id !== id));
    return true;
  }

  rendererConfig(record: CustomPetRecord): CustomPetRendererConfig {
    if (record.type === 'live2d') {
      const entry = record.entry.split('/').map(encodeURIComponent).join('/');
      return {
        type: 'live2d',
        id: record.id,
        label: record.label,
        modelUrl: `petwhale-live2d://${record.directoryName}/${entry}`,
        motions: record.motions,
      };
    }
    return {
      type: 'image',
      id: record.id,
      label: record.label,
      src: pathToFileURL(join(this.root, record.fileName)).href,
    };
  }

  resolveLive2DResource(directoryName: string, requestPath: string): string | null {
    const record = this.load().find(
      (candidate): candidate is Live2DCustomPetRecord =>
        candidate.type === 'live2d' && candidate.directoryName === directoryName,
    );
    if (record === undefined) return null;
    try {
      const base = realpathSync(resolve(this.root, record.directoryName));
      const resource = realpathSync(resolve(base, ...requestPath.replaceAll('\\', '/').split('/')));
      const child = relative(base, resource);
      if (child === '' || child.startsWith('..') || resolve(base, child) !== resource) return null;
      return statSync(resource).isFile() ? resource : null;
    } catch {
      return null;
    }
  }

  private save(records: readonly CustomPetRecord[]): void {
    mkdirSync(this.root, { recursive: true });
    writeFileSync(join(this.root, REGISTRY_FILE), JSON.stringify(records, null, 2));
  }
}
