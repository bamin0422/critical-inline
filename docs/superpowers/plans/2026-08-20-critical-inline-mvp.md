# critical-inline MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 번들러·프레임워크 중립적으로 TypeScript 크리티컬 코드를 압축된 인라인 `<script>`로 변환하는 라이브러리(`critical-inline`)와 unplugin 어댑터(`unplugin-critical-inline`)를 만든다.

**Architecture:** 순수 코어(`critical-inline`)가 esbuild로 TS→압축 IIFE 문자열을 만들고 HTML 주입 헬퍼를 제공한다. `unplugin-critical-inline`이 import 쿼리(`?critical`)를 가로채 코어로 컴파일해 모든 unplugin 지원 번들러(Vite/webpack/Rollup/esbuild/Rspack)에서 동일하게 동작시킨다. Next는 `critical-inline/next` 서브패스의 얇은 React 컴포넌트로 소비한다.

**Tech Stack:** TypeScript, esbuild(코어 컴파일), unplugin, tsup(빌드), vitest(테스트), pnpm workspace, changesets, GitHub Actions.

## Global Constraints

- 패키지 매니저: **pnpm** workspace. 의존성은 exact version 설치.
- 코어(`critical-inline`)는 런타임 의존성 **esbuild 하나만** 허용(React·번들러 의존 금지).
- 인라인 스크립트 크기 상한 기본 **8192 bytes(UTF-8)**, 초과 시 기본 error.
- 인라인 본문의 `</script>`는 반드시 `<\/script`로 이스케이프.
- npm 패키지명: 코어 `critical-inline`, 플러그인 `unplugin-critical-inline`(둘 다 unscoped, 확인 완료). Next는 `critical-inline/next` 서브패스.
- 라이선스 MIT. Node ≥ 18.
- 커밋 메시지 끝에 `AI-Assisted: claude` + `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` trailer.

---

## File Structure

```
critical-inline/
├─ package.json                       # workspace 루트 (private)
├─ pnpm-workspace.yaml
├─ tsconfig.base.json
├─ LICENSE                            # MIT
├─ README.md
├─ .github/workflows/ci.yml
├─ .changeset/config.json
├─ packages/
│  ├─ core/                           # name: critical-inline
│  │  ├─ package.json
│  │  ├─ tsup.config.ts
│  │  ├─ src/
│  │  │  ├─ index.ts                  # public exports
│  │  │  ├─ types.ts                  # CompileOptions, CompiledCritical, CriticalModule
│  │  │  ├─ compile.ts                # compileCritical()
│  │  │  ├─ inject.ts                 # renderScriptTag(), injectIntoHtml(), escapeScriptBody()
│  │  │  └─ next.tsx                  # <CriticalScript> (subpath: critical-inline/next)
│  │  └─ test/
│  │     ├─ compile.test.ts
│  │     ├─ inject.test.ts
│  │     └─ next.test.tsx
│  └─ unplugin/                       # name: unplugin-critical-inline
│     ├─ package.json
│     ├─ tsup.config.ts
│     ├─ src/index.ts                 # createUnplugin factory + per-bundler exports
│     └─ test/
│        ├─ vite.test.ts
│        └─ esbuild.test.ts
```

---

## Task 1: 레포 스캐폴딩 (pnpm workspace + 툴링)

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `LICENSE`, `.changeset/config.json`, `.github/workflows/ci.yml`
- Create: `packages/core/package.json`, `packages/unplugin/package.json`

**Interfaces:**
- Produces: workspace 2개 패키지(`critical-inline`, `unplugin-critical-inline`), `pnpm -r test`/`build` 파이프라인.

- [ ] **Step 1: workspace 루트 파일 작성**

`pnpm-workspace.yaml`:
```yaml
packages:
  - 'packages/*'
```

`package.json`:
```json
{
  "name": "critical-inline-monorepo",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "lint": "tsc -b --noEmit"
  },
  "devDependencies": {
    "@changesets/cli": "2.27.9",
    "tsup": "8.3.5",
    "typescript": "5.5.3",
    "vitest": "2.1.8"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "jsx": "react-jsx"
  }
}
```

- [ ] **Step 2: core/unplugin package.json 스텁 작성**

`packages/core/package.json`:
```json
{
  "name": "critical-inline",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./next": { "types": "./dist/next.d.ts", "import": "./dist/next.js" }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run"
  },
  "dependencies": { "esbuild": "0.25.4" },
  "peerDependencies": { "react": ">=18" },
  "peerDependenciesMeta": { "react": { "optional": true } },
  "devDependencies": {
    "react": "19.2.5",
    "@testing-library/react": "16.1.0",
    "@types/react": "19.2.14",
    "jsdom": "25.0.1"
  }
}
```

`packages/unplugin/package.json`:
```json
{
  "name": "unplugin-critical-inline",
  "version": "0.0.0",
  "type": "module",
  "license": "MIT",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" } },
  "files": ["dist"],
  "scripts": { "build": "tsup", "test": "vitest run" },
  "dependencies": { "unplugin": "1.16.0", "critical-inline": "workspace:*" },
  "devDependencies": { "vite": "5.3.4", "esbuild": "0.25.4" }
}
```

- [ ] **Step 3: LICENSE(MIT), 빈 tsup.config.ts, CI 워크플로 작성**

`packages/core/tsup.config.ts`:
```ts
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts', 'src/next.tsx'],
  format: ['esm'],
  dts: true,
  clean: true,
  external: ['react', 'react/jsx-runtime', 'esbuild'],
});
```

`.github/workflows/ci.yml`:
```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm build
```

- [ ] **Step 4: 설치 검증**

Run: `pnpm install`
Expected: 성공, `node_modules` 생성, workspace 링크됨.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm workspace, tooling, CI"
```

---

## Task 2: core — compileCritical()

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/compile.ts`
- Test: `packages/core/test/compile.test.ts`

**Interfaces:**
- Produces:
  - `interface CompileOptions { maxBytes?: number; onOversize?: 'error'|'warn'; minify?: boolean; define?: Record<string,string> }`
  - `interface CompiledCritical { code: string; bytes: number; hash: string; warnings: string[] }`
  - `interface CriticalModule { code: string; hash: string; bytes: number }`
  - `function compileCritical(input: string, opts?: CompileOptions): Promise<CompiledCritical>`

- [ ] **Step 1: types.ts 작성**

```ts
export interface CompileOptions {
  maxBytes?: number;
  onOversize?: 'error' | 'warn';
  minify?: boolean;
  define?: Record<string, string>;
}
export interface CompiledCritical {
  code: string;
  bytes: number;
  hash: string;
  warnings: string[];
}
export interface CriticalModule {
  code: string;
  hash: string;
  bytes: number;
}
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/core/test/compile.test.ts`:
```ts
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter critical-inline test`
Expected: FAIL — `compile` 모듈 없음.

- [ ] **Step 4: compile.ts 구현**

```ts
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import type { CompileOptions, CompiledCritical } from './types';

const DEFAULT_MAX_BYTES = 8192;

export async function compileCritical(
  input: string,
  opts: CompileOptions = {},
): Promise<CompiledCritical> {
  const { maxBytes = DEFAULT_MAX_BYTES, onOversize = 'error', minify = true, define } = opts;
  const result = await build({
    entryPoints: [input],
    bundle: true,
    minify,
    format: 'iife',
    platform: 'browser',
    write: false,
    define,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text.trim();
  const bytes = Buffer.byteLength(code, 'utf8');
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
  const warnings: string[] = [];
  if (bytes > maxBytes) {
    const msg = `critical script "${input}" is ${bytes}B, exceeds maxBytes ${maxBytes}B`;
    if (onOversize === 'error') throw new Error(msg);
    warnings.push(msg);
  }
  return { code, bytes, hash, warnings };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter critical-inline test`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/compile.ts packages/core/test/compile.test.ts
git commit -m "feat(core): add compileCritical with size cap and hash"
```

---

## Task 3: core — renderScriptTag() / injectIntoHtml() / escapeScriptBody()

**Files:**
- Create: `packages/core/src/inject.ts`
- Test: `packages/core/test/inject.test.ts`

**Interfaces:**
- Consumes: `CompiledCritical`(Task 2).
- Produces:
  - `function escapeScriptBody(code: string): string`
  - `function renderScriptTag(c: Pick<CompiledCritical,'code'|'hash'|'bytes'>, opts?: { nonce?: string }): string`
  - `function injectIntoHtml(html: string, c: Pick<CompiledCritical,'code'|'hash'|'bytes'>, opts?: { position?: 'head-top'|'head-end'; nonce?: string }): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/core/test/inject.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { escapeScriptBody, renderScriptTag, injectIntoHtml } from '../src/inject';

const c = { code: 'console.log(1)', hash: 'abcd1234', bytes: 14 };

describe('inject', () => {
  it('</script> 를 이스케이프한다', () => {
    expect(escapeScriptBody('a</script>b')).toBe('a<\\/script>b');
  });
  it('renderScriptTag 은 data 속성과 nonce 를 붙인다', () => {
    const tag = renderScriptTag(c, { nonce: 'n1' });
    expect(tag).toContain('data-critical-hash="abcd1234"');
    expect(tag).toContain('data-size="14"');
    expect(tag).toContain('nonce="n1"');
    expect(tag.startsWith('<script')).toBe(true);
  });
  it('injectIntoHtml 은 head 최상단에 주입한다', () => {
    const out = injectIntoHtml('<html><head></head><body></body></html>', c);
    expect(out).toMatch(/<head><script/);
  });
  it('head-end 위치 지원', () => {
    const out = injectIntoHtml('<html><head></head></html>', c, { position: 'head-end' });
    expect(out).toMatch(/<\/script><\/head>/);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `pnpm --filter critical-inline test inject`
Expected: FAIL — `inject` 없음.

- [ ] **Step 3: inject.ts 구현**

```ts
import type { CompiledCritical } from './types';

type Renderable = Pick<CompiledCritical, 'code' | 'hash' | 'bytes'>;

export function escapeScriptBody(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

export function renderScriptTag(c: Renderable, opts: { nonce?: string } = {}): string {
  const nonce = opts.nonce ? ` nonce="${opts.nonce}"` : '';
  return `<script data-critical-hash="${c.hash}" data-size="${c.bytes}"${nonce}>${escapeScriptBody(c.code)}</script>`;
}

export function injectIntoHtml(
  html: string,
  c: Renderable,
  opts: { position?: 'head-top' | 'head-end'; nonce?: string } = {},
): string {
  const tag = renderScriptTag(c, { nonce: opts.nonce });
  const position = opts.position ?? 'head-top';
  if (position === 'head-top' && html.includes('<head>')) {
    return html.replace('<head>', `<head>${tag}`);
  }
  if (position === 'head-end' && html.includes('</head>')) {
    return html.replace('</head>', `${tag}</head>`);
  }
  return tag + html; // head 없으면 문서 앞에
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `pnpm --filter critical-inline test`
Expected: PASS (compile 3 + inject 4).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/inject.ts packages/core/test/inject.test.ts
git commit -m "feat(core): add renderScriptTag/injectIntoHtml with </script> escaping"
```

---

## Task 4: core — public exports + 빌드

**Files:**
- Create: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: Task 2·3 심볼.
- Produces: `critical-inline` 공개 API — `compileCritical`, `renderScriptTag`, `injectIntoHtml`, `escapeScriptBody`, 타입들.

- [ ] **Step 1: index.ts 작성**

```ts
export { compileCritical } from './compile';
export { renderScriptTag, injectIntoHtml, escapeScriptBody } from './inject';
export type { CompileOptions, CompiledCritical, CriticalModule } from './types';
```

- [ ] **Step 2: 빌드 실행**

Run: `pnpm --filter critical-inline build`
Expected: `packages/core/dist/index.js` + `index.d.ts` 생성.

- [ ] **Step 3: dist export 스모크 검사**

Run: `node -e "import('critical-inline').then(m=>console.log(typeof m.compileCritical, typeof m.injectIntoHtml))"` (레포 루트에서)
Expected: `function function`

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat(core): public exports + build"
```

---

## Task 5: core — Next 컴포넌트 (`critical-inline/next`)

**Files:**
- Create: `packages/core/src/next.tsx`
- Test: `packages/core/test/next.test.tsx`

**Interfaces:**
- Consumes: `CriticalModule`(Task 2), `escapeScriptBody`(Task 3).
- Produces: `function CriticalScript(props: { critical: CriticalModule; nonce?: string }): JSX.Element`

- [ ] **Step 1: vitest jsdom 설정 추가**

`packages/core/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'jsdom' } });
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/core/test/next.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CriticalScript } from '../src/next';

describe('CriticalScript', () => {
  it('critical.code 를 인라인 script 로 렌더한다', () => {
    const { container } = render(
      <CriticalScript critical={{ code: 'window.__a=1', hash: 'h1', bytes: 11 }} nonce="n1" />,
    );
    const s = container.querySelector('script');
    expect(s?.getAttribute('data-critical-hash')).toBe('h1');
    expect(s?.getAttribute('nonce')).toBe('n1');
    expect(s?.innerHTML).toContain('window.__a=1');
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter critical-inline test next`
Expected: FAIL — `next` 없음.

- [ ] **Step 4: next.tsx 구현**

```tsx
import * as React from 'react';
import { escapeScriptBody } from './inject';
import type { CriticalModule } from './types';

export function CriticalScript(props: { critical: CriticalModule; nonce?: string }): React.JSX.Element {
  const { critical, nonce } = props;
  return (
    <script
      data-critical-hash={critical.hash}
      data-size={critical.bytes}
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: escapeScriptBody(critical.code) }}
    />
  );
}
```

- [ ] **Step 5: 테스트 통과 + 빌드 확인**

Run: `pnpm --filter critical-inline test && pnpm --filter critical-inline build`
Expected: PASS, `dist/next.js` + `dist/next.d.ts` 생성.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/next.tsx packages/core/test/next.test.tsx packages/core/vitest.config.ts
git commit -m "feat(core): add <CriticalScript> React component (critical-inline/next)"
```

---

## Task 6: unplugin — 팩토리 + import 쿼리(`?critical`)

**Files:**
- Create: `packages/unplugin/src/index.ts`, `packages/unplugin/tsup.config.ts`
- Test: `packages/unplugin/test/esbuild.test.ts`

**Interfaces:**
- Consumes: `compileCritical`(core).
- Produces:
  - `interface Options { maxBytes?: number; onOversize?: 'error'|'warn' }`
  - `const unpluginCriticalInline` (createUnplugin 결과) + named exports `vite`/`esbuild`/`webpack`/`rollup`/`rspack` + default.
  - `?critical` import → `export default { code, hash, bytes }` (CriticalModule).

- [ ] **Step 1: tsup.config.ts 작성**

```ts
import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/index.ts'], format: ['esm'], dts: true, clean: true, external: ['unplugin', 'critical-inline'] });
```

- [ ] **Step 2: 실패하는 통합 테스트 작성 (esbuild)**

`packages/unplugin/test/esbuild.test.ts`:
```ts
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
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `pnpm --filter unplugin-critical-inline test`
Expected: FAIL — `src/index` 없음.

- [ ] **Step 4: src/index.ts 구현**

```ts
import { createUnplugin } from 'unplugin';
import { compileCritical } from 'critical-inline';

export interface Options {
  maxBytes?: number;
  onOversize?: 'error' | 'warn';
}

const SUFFIX = '?critical';

export const unpluginCriticalInline = createUnplugin<Options | undefined>((options = {}) => ({
  name: 'unplugin-critical-inline',
  resolveId(id: string) {
    return id.endsWith(SUFFIX) ? id : undefined;
  },
  loadInclude(id: string) {
    return id.endsWith(SUFFIX);
  },
  async load(id: string) {
    const file = id.slice(0, -SUFFIX.length);
    const c = await compileCritical(file, { maxBytes: options.maxBytes, onOversize: options.onOversize });
    const mod = { code: c.code, hash: c.hash, bytes: c.bytes };
    return `export default ${JSON.stringify(mod)};`;
  },
}));

export const vite = unpluginCriticalInline.vite;
export const rollup = unpluginCriticalInline.rollup;
export const webpack = unpluginCriticalInline.webpack;
export const rspack = unpluginCriticalInline.rspack;
export const esbuild = unpluginCriticalInline.esbuild;
export default unpluginCriticalInline;
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter unplugin-critical-inline test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/unplugin/src/index.ts packages/unplugin/tsup.config.ts packages/unplugin/test/esbuild.test.ts
git commit -m "feat(unplugin): critical import-query transform via unplugin"
```

---

## Task 7: unplugin — Vite 통합 테스트

**Files:**
- Test: `packages/unplugin/test/vite.test.ts`

**Interfaces:**
- Consumes: `vite`(Task 6).

- [ ] **Step 1: 실패하는 Vite 통합 테스트 작성**

`packages/unplugin/test/vite.test.ts`:
```ts
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
```

- [ ] **Step 2: 테스트 실행**

Run: `pnpm --filter unplugin-critical-inline test vite`
Expected: PASS (Task 6 구현으로 이미 동작).

- [ ] **Step 3: Commit**

```bash
git add packages/unplugin/test/vite.test.ts
git commit -m "test(unplugin): vite integration for critical import-query"
```

---

## Task 8: README + 예제 + 배포 준비

**Files:**
- Create: `README.md`, `packages/core/README.md`, `packages/unplugin/README.md`
- Create: `.changeset/initial.md`

**Interfaces:**
- Consumes: 전체 공개 API.

- [ ] **Step 1: 루트 README 작성 (개요·설치·사용법·번들러 매트릭스)**

실제 사용 예를 포함한다 — 최소 3가지: (a) Vite/esbuild `?critical` import, (b) Next `<CriticalScript>`, (c) 순수 HTML 빌드(`compileCritical`+`injectIntoHtml`, dop-do-front 패턴). 각 예제는 Task 2·5·6의 실제 시그니처를 그대로 사용한다.

```md
## Pure HTML build (e.g. esbuild custom pipeline)
import { compileCritical, injectIntoHtml } from 'critical-inline';
import { readFileSync, writeFileSync } from 'node:fs';

const c = await compileCritical('src/gw.critical.ts', { maxBytes: 8192 });
const html = injectIntoHtml(readFileSync('contentViewer.html', 'utf8'), c);
writeFileSync('dist/contentViewer.html', html);
```

- [ ] **Step 2: changeset 생성**

`.changeset/initial.md`:
```md
---
'critical-inline': minor
'unplugin-critical-inline': minor
---

Initial MVP: framework-neutral core + unplugin adapter + Next component.
```

- [ ] **Step 3: 전체 검증**

Run: `pnpm install && pnpm -r build && pnpm -r test`
Expected: 전 패키지 빌드·테스트 통과.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "docs: README, usage examples, initial changeset"
git push
```

---

## Self-Review (작성자 체크)

- **Spec coverage**: core API(§4)→Task2·3·4, 저작모델(§5)→Task6, 호스트 주입(§6)→Task6·7 + README(§Task8, dop-do-front 프로그래매틱), 에러처리(§7)→Task2·3, 테스트(§8)→각 Task, 패키징(§9)→Task1·8. Next(§6)→Task5. 스코프 미scoped 반영(§10 갱신)→Task1 package.json.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음.
- **Type consistency**: `CompiledCritical`/`CriticalModule`/`CompileOptions`가 Task2에서 정의되고 Task3·5·6에서 동일 필드(`code`/`hash`/`bytes`)로 소비됨. `renderScriptTag`/`injectIntoHtml`는 `Pick<CompiledCritical,'code'|'hash'|'bytes'>`라 `CriticalModule`도 수용.

## 남은 확장(2차, 이 계획 밖)
- Vite `transformIndexHtml`/webpack `HtmlWebpackPlugin` 자동 index.html 주입.
- 설정 매니페스트(entries→injectInto) 편의 기능.
- webpack/rollup/rspack 통합 테스트.
- npm publish (`changeset publish`) 및 dop-do-front 실적용 PoC.
