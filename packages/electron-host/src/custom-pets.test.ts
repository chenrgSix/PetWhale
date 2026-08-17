import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

describe('reusable CustomPetStore', () => {
  it('copies, reloads, resolves and removes an imported pet', () => {
    const root = temporaryRoot();
    const source = join(root, 'My Whale.not-really-png');
    writeFileSync(source, Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]));
    const store = new CustomPetStore(join(root, 'library'));

    const imported = store.importFile(source);
    expect(imported.label).toBe('My Whale');
    expect(store.load()).toEqual([imported]);
    const config = store.rendererConfig(imported);
    expect(config.type).toBe('image');
    if (config.type !== 'image') throw new Error('expected image renderer config');
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

  it('keeps image pets imported before the typed registry migration', () => {
    const root = temporaryRoot();
    const library = join(root, 'library');
    mkdirSync(library);
    writeFileSync(join(library, 'legacy.png'), Uint8Array.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(join(library, 'registry.json'), JSON.stringify([{
      id: 'custom:legacy',
      label: 'Legacy Pet',
      fileName: 'legacy.png',
      mime: 'image/png',
    }]));

    expect(new CustomPetStore(library).load()).toEqual([{
      type: 'image',
      id: 'custom:legacy',
      label: 'Legacy Pet',
      fileName: 'legacy.png',
      mime: 'image/png',
    }]);
  });

  it('resolves Live2D files only inside the registered model directory', () => {
    const root = temporaryRoot();
    const library = join(root, 'library');
    const token = '550e8400-e29b-41d4-a716-446655440000';
    const modelDirectory = join(library, token);
    mkdirSync(modelDirectory, { recursive: true });
    writeFileSync(join(modelDirectory, 'model.model3.json'), '{}');
    writeFileSync(join(library, 'registry.json'), JSON.stringify([{
      type: 'live2d',
      id: `custom:${token}`,
      label: 'Sandboxed Model',
      directoryName: token,
      entry: 'model.model3.json',
      motions: {},
    }]));
    const store = new CustomPetStore(library);

    expect(store.resolveLive2DResource(token, 'model.model3.json'))
      .toBe(realpathSync(join(modelDirectory, 'model.model3.json')));
    expect(store.resolveLive2DResource(token, '../registry.json')).toBeNull();
    expect(store.resolveLive2DResource('00000000-0000-4000-8000-000000000000', 'model.model3.json'))
      .toBeNull();
    expect(store.remove(`custom:${token}`)).toBe(true);
    expect(existsSync(modelDirectory)).toBe(false);
    expect(store.load()).toEqual([]);
  });
});
