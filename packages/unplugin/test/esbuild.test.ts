import { describe, it, expect } from 'vitest';
import { build } from 'esbuild';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { esbuild as criticalEsbuild } from '../src/index';

describe('unplugin esbuild', () => {
  it('?critical import 를 CriticalModule 로 변환한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'up-'));
    writeFileSync(join(dir, 'x.critical.ts'), `(window as any).__x = 1;`);
    writeFileSync(join(dir, 'entry.ts'), `import c from './x.critical?critical'; console.log(c.code, c.hash);`);
    const res = await build({
      entryPoints: [join(dir, 'entry.ts')],
      bundle: true, write: false, format: 'esm',
      plugins: [criticalEsbuild()],
    });
    const out = res.outputFiles[0].text;
    expect(out).toContain('window'); // 컴파일된 critical code 가 인라인됨
    expect(out).toMatch(/hash/);
  });
});
