import { describe, it, expect } from 'vitest';
import webpack from 'webpack';
import { createFsFromVolume, Volume } from 'memfs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { webpack as criticalWebpack } from '../src/index';

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
});
