import { inflateRawSync } from 'node:zlib';
import { basename, dirname, posix } from 'node:path';

export const MAX_LIVE2D_ARCHIVE_BYTES = 100 * 1024 * 1024;
export const MAX_LIVE2D_EXTRACTED_BYTES = 250 * 1024 * 1024;
export const MAX_LIVE2D_ENTRY_BYTES = 64 * 1024 * 1024;
export const MAX_LIVE2D_ENTRIES = 2048;

export const LIVE2D_STATES = [
  'idle',
  'thinking',
  'answering',
  'working',
  'waiting',
  'success',
  'error',
  'sleeping',
] as const;

export type Live2DPetState = (typeof LIVE2D_STATES)[number];

export interface Live2DMotionBinding {
  group: string;
  index?: number;
  loop?: boolean;
}

export type Live2DMotionMap = Partial<Record<Live2DPetState, Live2DMotionBinding>>;

export interface ValidatedLive2DPackage {
  files: ReadonlyMap<string, Buffer>;
  entry: string;
  label: string;
  motions: Live2DMotionMap;
}

interface CentralDirectoryEntry {
  path: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  crc32: number;
  localHeaderOffset: number;
}

interface PetWhaleLive2DManifest {
  name?: unknown;
  entry?: unknown;
  motions?: unknown;
}

const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL_FILE = 0x02014b50;
const ZIP_LOCAL_FILE = 0x04034b50;
const CRC32_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return crc >>> 0;
});

function readUInt16(bytes: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('ZIP 文件结构不完整');
  return bytes.readUInt16LE(offset);
}

function readUInt32(bytes: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('ZIP 文件结构不完整');
  return bytes.readUInt32LE(offset);
}

function safeArchivePath(value: string): string {
  const normalized = value.replaceAll('\\', '/');
  if (
    normalized.length === 0 ||
    normalized.includes('\0') ||
    normalized.includes('\uFFFD') ||
    normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized)
  ) {
    throw new Error(`ZIP 中包含不安全的路径：${value}`);
  }
  const segments = normalized.split('/').filter((segment) => segment.length > 0);
  if (
    normalized.length > 240 ||
    segments.some((segment) =>
      segment === '.' ||
      segment === '..' ||
      /[<>:"|?*\u0000-\u001f]/.test(segment) ||
      /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment) ||
      /[. ]$/.test(segment),
    )
  ) {
    throw new Error(`ZIP 中包含目录穿越路径：${value}`);
  }
  return segments.join('/');
}

function findEndOfCentralDirectory(bytes: Buffer): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (readUInt32(bytes, offset) === ZIP_EOCD) return offset;
  }
  throw new Error('不是有效的 ZIP 文件');
}

function parseCentralDirectory(bytes: Buffer): CentralDirectoryEntry[] {
  const eocd = findEndOfCentralDirectory(bytes);
  const disk = readUInt16(bytes, eocd + 4);
  const centralDisk = readUInt16(bytes, eocd + 6);
  const diskEntries = readUInt16(bytes, eocd + 8);
  const totalEntries = readUInt16(bytes, eocd + 10);
  const centralSize = readUInt32(bytes, eocd + 12);
  const centralOffset = readUInt32(bytes, eocd + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== totalEntries) {
    throw new Error('不支持分卷 ZIP');
  }
  if (totalEntries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new Error('不支持 ZIP64 模型包');
  }
  if (totalEntries > MAX_LIVE2D_ENTRIES) {
    throw new Error(`模型包文件数量不能超过 ${MAX_LIVE2D_ENTRIES}`);
  }
  if (centralOffset + centralSize > eocd) throw new Error('ZIP 中央目录损坏');

  const entries: CentralDirectoryEntry[] = [];
  const seen = new Set<string>();
  let offset = centralOffset;
  let extractedBytes = 0;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUInt32(bytes, offset) !== ZIP_CENTRAL_FILE) throw new Error('ZIP 中央目录损坏');
    const flags = readUInt16(bytes, offset + 8);
    const compression = readUInt16(bytes, offset + 10);
    const crc = readUInt32(bytes, offset + 16);
    const compressedSize = readUInt32(bytes, offset + 20);
    const uncompressedSize = readUInt32(bytes, offset + 24);
    const nameLength = readUInt16(bytes, offset + 28);
    const extraLength = readUInt16(bytes, offset + 30);
    const commentLength = readUInt16(bytes, offset + 32);
    const externalAttributes = readUInt32(bytes, offset + 38);
    const localHeaderOffset = readUInt32(bytes, offset + 42);
    const end = offset + 46 + nameLength + extraLength + commentLength;
    if (end > bytes.length) throw new Error('ZIP 文件名或扩展字段损坏');
    if ((flags & 0x0001) !== 0) throw new Error('不支持加密 ZIP');
    if (compression !== 0 && compression !== 8) throw new Error('ZIP 使用了不支持的压缩算法');
    const unixFileType = (externalAttributes >>> 16) & 0o170000;
    if (unixFileType === 0o120000) throw new Error('ZIP 中不能包含符号链接');

    const rawName = bytes.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const path = safeArchivePath(rawName);
    offset = end;
    if (rawName.endsWith('/')) continue;
    const collisionKey = path.toLocaleLowerCase('en-US');
    if (seen.has(collisionKey)) throw new Error(`ZIP 中存在重复路径：${path}`);
    seen.add(collisionKey);
    if (uncompressedSize > MAX_LIVE2D_ENTRY_BYTES) {
      throw new Error(`模型文件过大：${path}`);
    }
    extractedBytes += uncompressedSize;
    if (extractedBytes > MAX_LIVE2D_EXTRACTED_BYTES) {
      throw new Error('模型解压后不能超过 250 MB');
    }
    entries.push({
      path,
      compression,
      compressedSize,
      uncompressedSize,
      crc32: crc,
      localHeaderOffset,
    });
  }
  if (offset !== centralOffset + centralSize) throw new Error('ZIP 中央目录长度不一致');
  return entries;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function extractEntry(archive: Buffer, entry: CentralDirectoryEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (readUInt32(archive, offset) !== ZIP_LOCAL_FILE) throw new Error('ZIP 本地文件头损坏');
  const nameLength = readUInt16(archive, offset + 26);
  const extraLength = readUInt16(archive, offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > archive.length) throw new Error(`ZIP 文件内容不完整：${entry.path}`);
  const compressed = archive.subarray(dataOffset, dataEnd);
  const extracted = entry.compression === 0
    ? Buffer.from(compressed)
    : inflateRawSync(compressed, { maxOutputLength: entry.uncompressedSize + 1 });
  if (extracted.byteLength !== entry.uncompressedSize) {
    throw new Error(`ZIP 文件长度校验失败：${entry.path}`);
  }
  if (crc32(extracted) !== entry.crc32) throw new Error(`ZIP 文件校验失败：${entry.path}`);
  return extracted;
}

function parseJson(bytes: Buffer, label: string): Record<string, unknown> {
  try {
    const value = JSON.parse(bytes.toString('utf8')) as unknown;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new Error(`${label} 不是有效的 JSON 对象`);
  }
}

function resolveReference(entry: string, reference: unknown): string {
  if (typeof reference !== 'string' || reference.length === 0 || /^[a-z][a-z\d+.-]*:/i.test(reference)) {
    throw new Error(`${entry} 包含无效的外部资源引用`);
  }
  if (reference.startsWith('/') || /^[a-zA-Z]:/.test(reference)) {
    throw new Error(`${entry} 包含无效的绝对资源引用`);
  }
  return safeArchivePath(posix.join(dirname(entry), reference.replaceAll('\\', '/')));
}

function collectModelReferences(entry: string, model: Record<string, unknown>): {
  references: string[];
  moc: string;
  textures: string[];
  motionGroups: ReadonlyMap<string, number>;
} {
  const fileReferences = model.FileReferences;
  if (fileReferences === null || typeof fileReferences !== 'object' || Array.isArray(fileReferences)) {
    throw new Error(`${entry} 缺少 FileReferences`);
  }
  const refs = fileReferences as Record<string, unknown>;
  const moc = resolveReference(entry, refs.Moc);
  if (!moc.toLocaleLowerCase('en-US').endsWith('.moc3')) {
    throw new Error(`${entry} 的 Moc 必须指向 .moc3 文件`);
  }
  if (!Array.isArray(refs.Textures) || refs.Textures.length === 0) {
    throw new Error(`${entry} 至少需要一张纹理`);
  }
  const textures = refs.Textures.map((texture) => resolveReference(entry, texture));
  if (textures.some((texture) => !texture.toLocaleLowerCase('en-US').endsWith('.png'))) {
    throw new Error(`${entry} 的纹理必须是 PNG 文件`);
  }
  const references = [moc, ...textures];
  for (const key of ['Physics', 'Pose', 'UserData', 'DisplayInfo', 'MotionSync']) {
    if (refs[key] !== undefined) references.push(resolveReference(entry, refs[key]));
  }
  if (refs.Expressions !== undefined && !Array.isArray(refs.Expressions)) {
    throw new Error(`${entry} 的 Expressions 配置无效`);
  }
  if (Array.isArray(refs.Expressions)) {
    for (const expression of refs.Expressions) {
      if (expression !== null && typeof expression === 'object' && !Array.isArray(expression)) {
        references.push(resolveReference(entry, (expression as Record<string, unknown>).File));
      } else {
        throw new Error(`${entry} 的 Expressions 配置无效`);
      }
    }
  }
  const motionGroups = new Map<string, number>();
  if (refs.Motions !== undefined) {
    if (refs.Motions === null || typeof refs.Motions !== 'object' || Array.isArray(refs.Motions)) {
      throw new Error(`${entry} 的 Motions 配置无效`);
    }
    for (const [group, motions] of Object.entries(refs.Motions as Record<string, unknown>)) {
      if (!Array.isArray(motions)) throw new Error(`${entry} 的动作组 ${group} 配置无效`);
      motionGroups.set(group, motions.length);
      for (const motion of motions) {
        if (motion === null || typeof motion !== 'object' || Array.isArray(motion)) {
          throw new Error(`${entry} 的动作组 ${group} 配置无效`);
        }
        const record = motion as Record<string, unknown>;
        references.push(resolveReference(entry, record.File));
        if (record.Sound !== undefined) references.push(resolveReference(entry, record.Sound));
      }
    }
  }
  return { references, moc, textures, motionGroups };
}

function parseMotionBinding(value: unknown, state: Live2DPetState): Live2DMotionBinding {
  if (typeof value === 'string' && value.length > 0) return { group: value };
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`petwhale.json 中 ${state} 的动作映射无效`);
  }
  const record = value as Record<string, unknown>;
  if (typeof record.group !== 'string' || record.group.length === 0) {
    throw new Error(`petwhale.json 中 ${state} 缺少动作组`);
  }
  if (record.index !== undefined && (!Number.isInteger(record.index) || (record.index as number) < 0)) {
    throw new Error(`petwhale.json 中 ${state} 的动作序号无效`);
  }
  if (record.loop !== undefined && typeof record.loop !== 'boolean') {
    throw new Error(`petwhale.json 中 ${state} 的 loop 必须是布尔值`);
  }
  return {
    group: record.group,
    ...(record.index === undefined ? {} : { index: record.index as number }),
    ...(record.loop === undefined ? {} : { loop: record.loop }),
  };
}

const DEFAULT_GROUP_NAMES: Record<Live2DPetState, readonly string[]> = {
  idle: ['Idle'],
  thinking: ['Thinking', 'Think'],
  answering: ['Answering', 'Talking', 'Talk'],
  working: ['Working', 'Work'],
  waiting: ['Waiting', 'Wait'],
  success: ['Success', 'Happy'],
  error: ['Error', 'Sad'],
  sleeping: ['Sleeping', 'Sleep'],
};

function motionMap(
  configured: unknown,
  groups: ReadonlyMap<string, number>,
): Live2DMotionMap {
  const result: Live2DMotionMap = {};
  if (configured !== undefined) {
    if (configured === null || typeof configured !== 'object' || Array.isArray(configured)) {
      throw new Error('petwhale.json 的 motions 必须是对象');
    }
    const unknownState = Object.keys(configured).find(
      (state) => !(LIVE2D_STATES as readonly string[]).includes(state),
    );
    if (unknownState !== undefined) {
      throw new Error(`petwhale.json 包含未知的 Agent 状态：${unknownState}`);
    }
    for (const state of LIVE2D_STATES) {
      const value = (configured as Record<string, unknown>)[state];
      if (value !== undefined) result[state] = parseMotionBinding(value, state);
    }
  }
  for (const state of LIVE2D_STATES) {
    if (result[state] !== undefined) continue;
    const candidate = DEFAULT_GROUP_NAMES[state].find((name) =>
      [...groups.keys()].some((group) => group.toLocaleLowerCase('en-US') === name.toLocaleLowerCase('en-US')),
    );
    if (candidate !== undefined) {
      const actual = [...groups.keys()].find(
        (group) => group.toLocaleLowerCase('en-US') === candidate.toLocaleLowerCase('en-US'),
      );
      if (actual !== undefined) result[state] = { group: actual };
    }
  }
  for (const [state, binding] of Object.entries(result) as [Live2DPetState, Live2DMotionBinding][]) {
    const count = groups.get(binding.group);
    if (count === undefined || count === 0) {
      throw new Error(`动作状态 ${state} 引用了不存在的动作组：${binding.group}`);
    }
    if (binding.index !== undefined && binding.index >= count) {
      throw new Error(`动作状态 ${state} 的动作序号超出 ${binding.group} 范围`);
    }
  }
  return result;
}

export function validateLive2DArchive(archive: Buffer, sourceName: string): ValidatedLive2DPackage {
  if (archive.byteLength > MAX_LIVE2D_ARCHIVE_BYTES) throw new Error('Live2D ZIP 不能超过 100 MB');
  const entries = parseCentralDirectory(archive);
  const files = new Map(entries.map((entry) => [entry.path, extractEntry(archive, entry)]));
  const manifestBytes = files.get('petwhale.json');
  const manifest = manifestBytes === undefined
    ? {}
    : parseJson(manifestBytes, 'petwhale.json') as PetWhaleLive2DManifest;
  if (manifest.entry !== undefined && typeof manifest.entry !== 'string') {
    throw new Error('petwhale.json 的 entry 必须是字符串');
  }
  const modelEntries = [...files.keys()].filter((path) => path.toLocaleLowerCase('en-US').endsWith('.model3.json'));
  const entry = manifest.entry === undefined
    ? modelEntries.length === 1
      ? modelEntries[0]
      : undefined
    : safeArchivePath(manifest.entry);
  if (entry === undefined) {
    throw new Error('模型包必须包含唯一的 .model3.json，或在 petwhale.json 中指定 entry');
  }
  const modelBytes = files.get(entry);
  if (modelBytes === undefined || !entry.toLocaleLowerCase('en-US').endsWith('.model3.json')) {
    throw new Error(`找不到 Live2D 模型入口：${entry}`);
  }
  const model = parseJson(modelBytes, entry);
  if (model.Version !== 3) throw new Error(`${entry} 不是 Cubism 3/4/5 model3 配置`);
  const { references, moc, textures, motionGroups } = collectModelReferences(entry, model);
  for (const reference of references) {
    if (!files.has(reference)) throw new Error(`模型引用的文件不存在：${reference}`);
  }
  if (files.get(moc)?.subarray(0, 4).toString('ascii') !== 'MOC3') {
    throw new Error(`模型文件不是有效的 MOC3：${moc}`);
  }
  const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (const texture of textures) {
    if (!files.get(texture)?.subarray(0, 8).equals(pngMagic)) {
      throw new Error(`模型纹理不是有效的 PNG：${texture}`);
    }
  }
  for (const reference of references) {
    const bytes = files.get(reference);
    if (bytes !== undefined && reference.toLocaleLowerCase('en-US').endsWith('.json')) {
      parseJson(bytes, reference);
    }
  }
  const configuredName = typeof manifest.name === 'string' ? manifest.name.trim().slice(0, 80) : '';
  const fallbackName = basename(sourceName, '.zip').trim().slice(0, 80);
  return {
    files,
    entry,
    label: configuredName || fallbackName || 'Live2D 宠物',
    motions: motionMap(manifest.motions, motionGroups),
  };
}
