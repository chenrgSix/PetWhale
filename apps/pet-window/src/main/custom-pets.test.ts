import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CustomPetStore, detectPetImage } from './custom-pets';

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'petwhale-custom-pets-'));
  temporaryRoots.push(root);
  return root;
}

describe('detectPetImage', () => {
  it('detects PNG/APNG and WebP by magic bytes rather than extension', () => {
    expect(detectPetImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10])))
      .toBe('image/png');
    expect(detectPetImage(Buffer.from('RIFF0000WEBP'))).toBe('image/webp');
    expect(detectPetImage(Buffer.from('<svg></svg>'))).toBeNull();
  });
});

describe('CustomPetStore', () => {
  it('copies, reloads, resolves and removes an imported pet', () => {
    const root = temporaryRoot();
    const source = join(root, 'My Whale.not-really-png');
    writeFileSync(source, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    const store = new CustomPetStore(join(root, 'library'));

    const imported = store.importFile(source);
    expect(imported.label).toBe('My Whale');
    expect(store.load()).toEqual([imported]);
    const config = store.rendererConfig(imported);
    expect(config.src).toMatch(/^file:/);
    expect(readFileSync(new URL(config.src))).toHaveLength(8);

    expect(store.remove(imported.id)).toBe(true);
    expect(store.load()).toEqual([]);
  });

  it('rejects unsupported content even when the filename looks valid', () => {
    const root = temporaryRoot();
    const source = join(root, 'fake.png');
    writeFileSync(source, 'not an image');
    expect(() => new CustomPetStore(join(root, 'library')).importFile(source)).toThrow(
      '仅支持 PNG、APNG 或 WebP 图片',
    );
  });
});
