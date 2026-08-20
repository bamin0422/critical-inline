import { describe, it, expect } from 'vitest';
import webpack from 'webpack';
import { createFsFromVolume, Volume } from 'memfs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { webpack as criticalWebpack } from '../src/index';
import unpluginCriticalInlineDefault from '../src/index';

describe('unplugin webpack', () => {
  it('?critical import 를 컴파일 코드로 인라인한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wp-'));
    writeFileSync(join(dir, 'x.critical.ts'), '(window as any).__x = 55;');
    writeFileSync(join(dir, 'entry.js'), "import c from './x.critical?critical'; console.log(c.code, c.hash);");
    const outFs = createFsFromVolume(new Volume());
    const compiler = webpack({
      context: dir,
      mode: 'development',
      entry: join(dir, 'entry.js'),
      output: { path: '/out', filename: 'bundle.js' },
      plugins: [criticalWebpack()],
    });
    compiler.outputFileSystem = outFs as never;
    const stats = await new Promise<webpack.Stats | undefined>((res, rej) =>
      compiler.run((err, s) => (err ? rej(err) : res(s))),
    );
    expect(stats?.hasErrors()).toBe(false);
    const out = outFs.readFileSync('/out/bundle.js', 'utf8') as string;
    expect(out).toContain('55');
  });

  it('default export 의 .webpack 도 named export 와 동일하게 realpath 래퍼가 적용된다(symlinked tmpdir)', async () => {
    // macOS tmpdir() 은 `/var/...`(→ `/private/var/...` 심볼릭 링크)를 반환한다. named `webpack`
    // export 는 apply() 진입 시 compiler.options.context 를 realpath 로 정규화해 이 케이스를
    // 처리하는데(Task3), default export 의 `.webpack` 이 래핑되지 않은 원본 팩토리를 그대로
    // 노출하던 회귀가 있었다면 이 테스트가 ENOENT 로 실패해야 한다.
    const dir = mkdtempSync(join(tmpdir(), 'wp-default-'));
    writeFileSync(join(dir, 'x.critical.ts'), '(window as any).__x = 66;');
    writeFileSync(join(dir, 'entry.js'), "import c from './x.critical?critical'; console.log(c.code, c.hash);");
    const outFs = createFsFromVolume(new Volume());
    const compiler = webpack({
      context: dir,
      mode: 'development',
      entry: join(dir, 'entry.js'),
      output: { path: '/out', filename: 'bundle.js' },
      plugins: [unpluginCriticalInlineDefault.webpack()],
    });
    compiler.outputFileSystem = outFs as never;
    const stats = await new Promise<webpack.Stats | undefined>((res, rej) =>
      compiler.run((err, s) => (err ? rej(err) : res(s))),
    );
    expect(stats?.hasErrors()).toBe(false);
    const out = outFs.readFileSync('/out/bundle.js', 'utf8') as string;
    expect(out).toContain('66');
  });
});
