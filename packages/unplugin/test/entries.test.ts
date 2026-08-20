import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { compileEntries, injectEntriesIntoHtml } from '../src/inject-html';

function fixture(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'ent-'));
  const f = join(dir, 'x.critical.ts');
  writeFileSync(f, content);
  return f;
}

describe('entries 컴파일/주입', () => {
  it('엔트리를 컴파일해 input 키 맵으로 반환한다', async () => {
    const f = fixture('(window as any).__x = 7;');
    const map = await compileEntries([{ input: f }], {});
    expect(map.get(f)?.code).toContain('window');
  });

  it('injectInto 가 대상 HTML 이름과 매칭될 때만 주입한다', async () => {
    const f = fixture('(window as any).__x = 7;');
    const map = await compileEntries([{ input: f, injectInto: ['index.html'] }], {});
    const injected = injectEntriesIntoHtml('<html><head></head></html>', 'index.html', [{ input: f, injectInto: ['index.html'] }], map);
    expect(injected).toMatch(/<head><script/);
    const skipped = injectEntriesIntoHtml('<html><head></head></html>', 'other.html', [{ input: f, injectInto: ['index.html'] }], map);
    expect(skipped).not.toMatch(/<script/);
  });

  it('injectInto 미지정 시 모든 HTML 에 주입한다', async () => {
    const f = fixture('(window as any).__x = 7;');
    const map = await compileEntries([{ input: f }], {});
    const injected = injectEntriesIntoHtml('<html><head></head></html>', 'any.html', [{ input: f }], map);
    expect(injected).toMatch(/<head><script/);
  });
});
