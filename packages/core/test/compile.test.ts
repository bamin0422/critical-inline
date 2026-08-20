import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileCritical } from '../src/compile';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ci-'));
  const file = join(dir, 'entry.critical.ts');
  writeFileSync(file, content);
  return file;
}

describe('compileCritical', () => {
  it('컴파일 결과를 압축된 IIFE 문자열로 반환한다', async () => {
    const f = fixture(`const x: number = 1; (window as any).__x = x;`);
    const r = await compileCritical(f);
    expect(r.code).toContain('window');
    expect(r.code).not.toContain(': number'); // 타입 제거
    expect(r.bytes).toBe(Buffer.byteLength(r.code, 'utf8'));
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('maxBytes 초과 시 기본 error', async () => {
    const big = `(window as any).__b = "${'a'.repeat(9000)}";`;
    const f = fixture(big);
    await expect(compileCritical(f, { maxBytes: 8192 })).rejects.toThrow(/exceeds maxBytes/);
  });

  it("onOversize:'warn' 이면 throw 대신 warnings", async () => {
    const big = `(window as any).__b = "${'a'.repeat(9000)}";`;
    const f = fixture(big);
    const r = await compileCritical(f, { maxBytes: 8192, onOversize: 'warn' });
    expect(r.warnings.length).toBe(1);
  });
});
