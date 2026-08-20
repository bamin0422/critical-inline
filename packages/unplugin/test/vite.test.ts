import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vite as criticalVite } from '../src/index';

describe('unplugin vite', () => {
  it('?critical import 가 번들에 CriticalModule 로 인라인된다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vt-'));
    writeFileSync(join(dir, 'x.critical.ts'), `(window as any).__x = 42;`);
    writeFileSync(join(dir, 'main.ts'), `import c from './x.critical?critical'; document.title = c.hash;`);
    const result: any = await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite()],
      build: {
        write: false,
        lib: { entry: join(dir, 'main.ts'), formats: ['es'], fileName: 'out' },
      },
    });
    const chunk = result[0].output.find((o: any) => o.type === 'chunk');
    expect(chunk.code).toContain('42'); // 컴파일된 critical code 포함
  });
});
