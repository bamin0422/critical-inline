import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { writeFileSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vite as criticalVite } from '../src/index';

function fixtureProject(): { dir: string; entry: string; outDir: string } {
  // macOS 의 /var -> /private/var 심볼릭 링크 때문에 root 와 실제 파일 경로가 어긋나면
  // vite:build-html 이 index.html 을 root 밖으로 판단한다. realpath 로 정규화한다.
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'vinj-')));
  const entry = join(dir, 'gw.critical.ts');
  writeFileSync(entry, '(window as any).__gw = 99;');
  writeFileSync(join(dir, 'main.ts'), 'document.title = "x";');
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>',
  );
  return { dir, entry, outDir: join(dir, 'dist') };
}

function head(html: string): string {
  return html.slice(html.search(/<head(?:\s[^>]*)?>/i), html.search(/<\/head>/i));
}

describe('vite 자동 head 주입', () => {
  it('entries 를 실제 빌드 산출물 index.html <head> 에 인라인한다', async () => {
    const { dir, entry, outDir } = fixtureProject();
    await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite({ entries: [{ input: entry, injectInto: ['index.html'] }] })],
      build: { outDir, emptyOutDir: true },
    });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    const h = head(html);
    expect(h).toContain('data-critical-hash');
    expect(h).toContain('99');
    // head-top 이므로 Vite 가 주입하는 모듈 스크립트보다 앞에 온다.
    expect(html).toMatch(/<head><script data-critical-hash/);
  });

  it('nonce 옵션이 주입된 스크립트 태그에 반영된다', async () => {
    const { dir, entry, outDir } = fixtureProject();
    await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite({ entries: [{ input: entry }], nonce: 'n-abc' })],
      build: { outDir, emptyOutDir: true },
    });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(head(html)).toContain('nonce="n-abc"');
  });

  it('injectInto 가 매칭되지 않으면 주입하지 않는다', async () => {
    const { dir, entry, outDir } = fixtureProject();
    await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite({ entries: [{ input: entry, injectInto: ['other.html'] }] })],
      build: { outDir, emptyOutDir: true },
    });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(html).not.toContain('data-critical-hash');
  });

  it('entries 미지정 시 HTML 을 건드리지 않는다', async () => {
    const { dir, outDir } = fixtureProject();
    await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite()],
      build: { outDir, emptyOutDir: true },
    });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(html).not.toContain('data-critical-hash');
  });

  it('buildStart 없이 훅이 먼저 불려도 지연 컴파일로 주입한다', async () => {
    const { dir, entry } = fixtureProject();
    // buildStart 를 호출하지 않은 상태의 플러그인 인스턴스에서 훅만 직접 실행한다.
    const plugin = criticalVite({ entries: [{ input: entry }] }) as unknown as {
      transformIndexHtml: { handler: (html: string, ctx: unknown) => Promise<string> };
    };
    const out = await plugin.transformIndexHtml.handler('<html><head></head></html>', {
      path: '/index.html',
      filename: join(dir, 'index.html'),
    });
    expect(out).toMatch(/<head><script data-critical-hash/);
    expect(out).toContain('99');
  });
});
