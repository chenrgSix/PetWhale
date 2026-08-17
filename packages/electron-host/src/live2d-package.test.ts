import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { validateLive2DArchive } from './live2d-package';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Record<string, string | Uint8Array>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let localOffset = 0;
  for (const [path, value] of Object.entries(entries)) {
    const name = Buffer.from(path);
    const data = typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + compressed.length;
  }
  const localBytes = Buffer.concat(locals);
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  const count = Object.keys(entries).length;
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(count, 8);
  eocd.writeUInt16LE(count, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(localBytes.length, 16);
  return Buffer.concat([localBytes, centralBytes, eocd]);
}

function modelJson(): string {
  return JSON.stringify({
    Version: 3,
    FileReferences: {
      Moc: 'Mao.moc3',
      Textures: ['textures/texture_00.png'],
      Motions: {
        Idle: [{ File: 'motions/idle.motion3.json' }],
        Talk: [{ File: 'motions/talk.motion3.json' }],
      },
    },
  });
}

describe('reusable validateLive2DArchive', () => {
  it('validates model references and PetWhale state mappings', () => {
    const archive = zip({
      'petwhale.json': JSON.stringify({
        name: 'Mao Assistant',
        entry: 'Mao.model3.json',
        motions: { answering: { group: 'Talk', index: 0 }, idle: 'Idle' },
      }),
      'Mao.model3.json': modelJson(),
      'Mao.moc3': 'MOC3-test',
      'textures/texture_00.png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      'motions/idle.motion3.json': '{}',
      'motions/talk.motion3.json': '{}',
    });

    const result = validateLive2DArchive(archive, 'mao.zip');
    expect(result.entry).toBe('Mao.model3.json');
    expect(result.label).toBe('Mao Assistant');
    expect(result.motions).toEqual({
      idle: { group: 'Idle' },
      answering: { group: 'Talk', index: 0 },
    });
    expect(result.files.has('textures/texture_00.png')).toBe(true);
  });

  it('rejects missing model resources', () => {
    const archive = zip({
      'Mao.model3.json': modelJson(),
      'Mao.moc3': 'MOC3-test',
      'textures/texture_00.png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      'motions/idle.motion3.json': '{}',
    });
    expect(() => validateLive2DArchive(archive, 'mao.zip')).toThrow(
      '模型引用的文件不存在：motions/talk.motion3.json',
    );
  });

  it('rejects archive path traversal before extraction', () => {
    const archive = zip({ '../outside.model3.json': '{}' });
    expect(() => validateLive2DArchive(archive, 'unsafe.zip')).toThrow('目录穿越');
  });

  it('rejects motion mappings that point outside the model groups', () => {
    const archive = zip({
      'petwhale.json': JSON.stringify({ motions: { success: 'Celebrate' } }),
      'Mao.model3.json': modelJson(),
      'Mao.moc3': 'MOC3-test',
      'textures/texture_00.png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      'motions/idle.motion3.json': '{}',
      'motions/talk.motion3.json': '{}',
    });
    expect(() => validateLive2DArchive(archive, 'mao.zip')).toThrow(
      '动作状态 success 引用了不存在的动作组：Celebrate',
    );
  });

  it('rejects misspelled Agent states instead of silently ignoring them', () => {
    const archive = zip({
      'petwhale.json': JSON.stringify({ motions: { answer: 'Talk' } }),
      'Mao.model3.json': modelJson(),
      'Mao.moc3': 'MOC3-test',
      'textures/texture_00.png': Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
      'motions/idle.motion3.json': '{}',
      'motions/talk.motion3.json': '{}',
    });
    expect(() => validateLive2DArchive(archive, 'mao.zip')).toThrow(
      'petwhale.json 包含未知的 Agent 状态：answer',
    );
  });
});
