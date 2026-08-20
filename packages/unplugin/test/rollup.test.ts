import { describe, it, expect } from 'vitest';
import { rollup } from 'rollup';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rollup as criticalRollup } from '../src/index';

describe('unplugin rollup', () => {
  it('?critical import 를 컴파일 코드로 인라인한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-'));
    writeFileSync(join(dir, 'x.critical.ts'), '(window as any).__x = 33;');
    writeFileSync(join(dir, 'entry.js'), "import c from './x.critical?critical'; export const h = c.hash; console.log(c.code);");
    const bundle = await rollup({ input: join(dir, 'entry.js'), plugins: [criticalRollup()] });
    const { output } = await bundle.generate({ format: 'es' });
    const code = output[0].code;
    expect(code).toContain('33');
    await bundle.close();
  });
});
