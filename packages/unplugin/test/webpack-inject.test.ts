import { describe, it, expect } from 'vitest';
import webpack from 'webpack';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { createFsFromVolume, Volume } from 'memfs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { webpack as criticalWebpack } from '../src/index';

describe('webpack 자동 head 주입', () => {
  it('entries 를 생성 HTML <head> 에 인라인한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wpi-'));
    writeFileSync(join(dir, 'gw.critical.ts'), '(window as any).__gw = 77;');
    writeFileSync(join(dir, 'entry.js'), 'console.log("app");');
    const outFs = createFsFromVolume(new Volume());
    const compiler = webpack({
      context: dir,
      mode: 'development',
      entry: join(dir, 'entry.js'),
      output: { path: '/out', filename: 'bundle.js' },
      plugins: [
        new HtmlWebpackPlugin(),
        criticalWebpack({ entries: [{ input: join(dir, 'gw.critical.ts') }] }),
      ],
    });
    compiler.outputFileSystem = outFs as never;
    const stats = await new Promise<webpack.Stats | undefined>((res, rej) =>
      compiler.run((err, s) => (err ? rej(err) : res(s))),
    );
    expect(stats?.hasErrors()).toBe(false);
    const html = outFs.readFileSync('/out/index.html', 'utf8') as string;
    expect(html).toMatch(/<head><script data-critical-hash/);
    expect(html).toContain('77');
  });
});
