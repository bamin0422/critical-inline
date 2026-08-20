# critical-inline Phase 2 (2차 확장) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** MVP(0.1.0) 위에 ① 설정 매니페스트(`entries`) ② Vite·webpack 빌드타임 자동 `<head>` 주입 ③ webpack·rollup 크로스번들러 통합 테스트를 추가해 0.2.0을 만든다.

**Architecture:** 코어(`critical-inline`)는 이미 `compileCritical`/`injectIntoHtml`/`renderScriptTag`를 제공한다. `unplugin-critical-inline`에 `entries` 옵션을 더해, buildStart에서 각 엔트리를 1회 컴파일해 캐시하고, Vite는 `transformIndexHtml`(unplugin의 `vite` 네임스페이스 훅), webpack은 `html-webpack-plugin`의 `beforeEmit` 훅으로 컴파일 결과를 `injectIntoHtml`/`renderScriptTag`로 HTML에 심는다. 기존 `?critical` import 동작은 그대로 유지한다.

**Tech Stack:** TypeScript, unplugin, esbuild(코어), vitest, tsup. 신규 devDeps: `webpack`, `html-webpack-plugin`, `rollup`, `memfs`(webpack 출력 검사용).

## Global Constraints

- pnpm workspace; 모든 의존성 exact 핀(caret/tilde 금지); `workspace:*` 예외.
- 코어(`critical-inline`) 런타임 의존성 = esbuild only. `unplugin-critical-inline` 런타임 의존성 = `unplugin` + `critical-inline`. `html-webpack-plugin`/`webpack`은 optional peer + devDep(테스트용).
- 인라인 스크립트 크기 상한 기본 8192 UTF-8, 초과 시 error; `</script>` 이스케이프 유지(core 헬퍼 재사용, 재구현 금지).
- 기존 `?critical` import 및 MVP 테스트(core 15 + unplugin 2)는 회귀 0로 유지.
- 커밋 트레일러 필수: `AI-Assisted: claude` / `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. 로컬 pnpm 래퍼가 `pnpm-workspace.yaml`에 `allowBuilds:`를 재주입하면 커밋 전 `git checkout -- pnpm-workspace.yaml`로 복원(커밋본은 `onlyBuiltDependencies`만).
- 브랜치는 `main`에서 분기. `git push` 금지(컨트롤러가 마무리).

---

## File Structure

```
packages/unplugin/
├─ src/index.ts            # Options 확장(entries) + buildStart 컴파일 캐시 + vite transformIndexHtml + webpack 훅
├─ src/inject-html.ts      # (신규) 엔트리 목록 → HTML 주입 공통 로직 (core injectIntoHtml 래핑)
├─ test/webpack.test.ts    # (신규) ?critical transform + 자동주입 통합
├─ test/rollup.test.ts     # (신규) ?critical transform 통합
├─ test/vite-inject.test.ts# (신규) transformIndexHtml 자동 head 주입 통합
└─ package.json            # 신규 devDeps + optional peer html-webpack-plugin
```

`packages/core`는 변경 없음(기존 API 재사용). 코어 API로 부족하면 그 태스크에서 최소 추가하고 사유를 리포트.

---

## Task 1: unplugin `entries` 옵션 + 엔트리 컴파일 캐시

**Files:**
- Modify: `packages/unplugin/src/index.ts`
- Create: `packages/unplugin/src/inject-html.ts`
- Test: `packages/unplugin/test/entries.test.ts`

**Interfaces:**
- Consumes: `compileCritical`, `renderScriptTag`, `injectIntoHtml` (from `critical-inline`).
- Produces:
  - 확장된 `interface Options { maxBytes?: number; onOversize?: 'error'|'warn'; nonce?: string; entries?: CriticalEntry[] }`
  - `interface CriticalEntry { input: string; injectInto?: string[]; position?: 'head-top'|'head-end' }`
  - `async function compileEntries(entries: CriticalEntry[], opts): Promise<Map<string, CompiledCritical>>` (in inject-html.ts; keyed by `entry.input`)
  - `function injectEntriesIntoHtml(html: string, htmlName: string, entries: CriticalEntry[], compiled: Map<string,CompiledCritical>, nonce?: string): string`

- [ ] **Step 1: 실패 테스트 작성** — `packages/unplugin/test/entries.test.ts`

```ts
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
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter unplugin-critical-inline test entries` → FAIL(`inject-html` 없음).

- [ ] **Step 3: `inject-html.ts` 구현**

```ts
import { compileCritical, injectIntoHtml, type CompiledCritical, type CompileOptions } from 'critical-inline';

export interface CriticalEntry {
  input: string;
  injectInto?: string[];
  position?: 'head-top' | 'head-end';
}

export async function compileEntries(
  entries: CriticalEntry[],
  opts: CompileOptions,
): Promise<Map<string, CompiledCritical>> {
  const map = new Map<string, CompiledCritical>();
  for (const e of entries) {
    if (!map.has(e.input)) {
      map.set(e.input, await compileCritical(e.input, opts));
    }
  }
  return map;
}

function targets(entry: CriticalEntry, htmlName: string): boolean {
  return !entry.injectInto || entry.injectInto.some((n) => htmlName.endsWith(n));
}

export function injectEntriesIntoHtml(
  html: string,
  htmlName: string,
  entries: CriticalEntry[],
  compiled: Map<string, CompiledCritical>,
  nonce?: string,
): string {
  let out = html;
  for (const e of entries) {
    if (!targets(e, htmlName)) continue;
    const c = compiled.get(e.input);
    if (!c) continue;
    out = injectIntoHtml(out, c, { position: e.position ?? 'head-top', nonce });
  }
  return out;
}
```

- [ ] **Step 4: `Options` 확장 + buildStart 컴파일** — `packages/unplugin/src/index.ts`에 `entries?: CriticalEntry[]` 추가, 모듈 상단에서 `import { compileEntries, injectEntriesIntoHtml, type CriticalEntry } from './inject-html'`, 팩토리 내부에 `let compiledEntries: Map<string, CompiledCritical> | null = null;` 캐시와 `buildStart` 훅 추가:

```ts
  async buildStart() {
    if (options.entries?.length) {
      compiledEntries = await compileEntries(options.entries, {
        maxBytes: options.maxBytes,
        onOversize: options.onOversize,
      });
    }
  },
```
(기존 `resolveId`/`loadInclude`/`load`는 그대로 둔다.)

- [ ] **Step 5: 통과 확인 + 회귀** — Run: `pnpm --filter unplugin-critical-inline test` → 신규 3 + 기존 esbuild/vite 2 통과. `pnpm -r --config.verify-deps-before-run=false build` 성공.

- [ ] **Step 6: Commit** — `git checkout -- pnpm-workspace.yaml 2>/dev/null; git add packages/unplugin/src/inject-html.ts packages/unplugin/src/index.ts packages/unplugin/test/entries.test.ts && git commit` (트레일러 포함).

---

## Task 2: Vite 자동 `<head>` 주입 (`transformIndexHtml`)

**Files:**
- Modify: `packages/unplugin/src/index.ts`
- Test: `packages/unplugin/test/vite-inject.test.ts`

**Interfaces:**
- Consumes: `compiledEntries`, `injectEntriesIntoHtml`, `options.entries`/`nonce` (Task 1).

- [ ] **Step 1: 실패 테스트 작성** — `packages/unplugin/test/vite-inject.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { writeFileSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vite as criticalVite } from '../src/index';

describe('vite 자동 head 주입', () => {
  it('entries 를 index.html <head> 에 인라인한다', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vinj-'));
    writeFileSync(join(dir, 'gw.critical.ts'), '(window as any).__gw = 99;');
    writeFileSync(join(dir, 'main.ts'), 'document.title="x";');
    writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head></head><body><script type="module" src="/main.ts"></script></body></html>');
    const outDir = join(dir, 'dist');
    await build({
      root: dir,
      logLevel: 'silent',
      plugins: [criticalVite({ entries: [{ input: join(dir, 'gw.critical.ts'), injectInto: ['index.html'] }] })],
      build: { outDir, emptyOutDir: true },
    });
    const html = readFileSync(join(outDir, 'index.html'), 'utf8');
    expect(html).toMatch(/<head><script data-critical-hash/);
    expect(html).toContain('99');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm --filter unplugin-critical-inline test vite-inject` → FAIL(주입 안 됨).

- [ ] **Step 3: 팩토리 반환에 `vite` 네임스페이스 훅 추가** — unplugin은 반환 객체의 `vite` 키에 Vite 전용 훅을 병합한다. `packages/unplugin/src/index.ts`의 `createUnplugin(...)` 반환 객체에 추가:

```ts
    vite: {
      transformIndexHtml: {
        order: 'post' as const,
        handler(html: string, ctx: { filename?: string; path?: string }) {
          if (!options.entries?.length || !compiledEntries) return html;
          const name = ctx.filename ?? ctx.path ?? 'index.html';
          return injectEntriesIntoHtml(html, name, options.entries, compiledEntries, options.nonce);
        },
      },
    },
```
(`compiledEntries`는 buildStart에서 채워진다. transformIndexHtml은 buildStart 이후 실행되므로 준비됨.)

- [ ] **Step 4: 통과 + 회귀 확인** — Run: `pnpm --filter unplugin-critical-inline test` → vite-inject 통과 + 기존 전체 통과.

- [ ] **Step 5: Commit** (트레일러; pnpm-workspace.yaml 복원 주의).

---

## Task 3: webpack `?critical` transform 통합 테스트

**Files:**
- Modify: `packages/unplugin/package.json` (devDeps: `webpack`, `memfs`)
- Test: `packages/unplugin/test/webpack.test.ts`

**Interfaces:**
- Consumes: `webpack`(Task 6 auto-inject와 공유) 어댑터(MVP에서 export됨).

- [ ] **Step 1: devDeps 추가** — `packages/unplugin/package.json` devDependencies에 exact 핀으로 `"webpack": "5.97.1"`, `"memfs": "4.15.1"` 추가(존재하지 않으면 가장 가까운 버전 선택 후 리포트). `pnpm install`(필요 시 `--config.verify-deps-before-run=false`).

- [ ] **Step 2: 실패 테스트 작성** — `packages/unplugin/test/webpack.test.ts`

```ts
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
```

- [ ] **Step 3: 실패/디버그** — Run: `pnpm --filter unplugin-critical-inline test webpack`. webpack 어댑터에서 `?critical`의 importer-relative 해석이 esbuild/vite와 다르게 동작할 수 있다. 실패 시 **테스트를 약화하지 말고** `src/index.ts`의 resolveId/load 경로를 webpack에서도 성립하도록 수정한다(단, 기존 esbuild/vite 테스트가 계속 통과해야 함). webpack의 `?query` 처리·`importer` 인자 유무를 확인해 절대경로화가 유지되게 한다.

- [ ] **Step 4: 통과 + 회귀** — webpack 통과 + 기존 전체 통과. `pnpm -r build` 성공.

- [ ] **Step 5: Commit** (트레일러).

---

## Task 4: rollup `?critical` transform 통합 테스트

**Files:**
- Modify: `packages/unplugin/package.json` (devDep: `rollup`)
- Test: `packages/unplugin/test/rollup.test.ts`

- [ ] **Step 1: devDep 추가** — `"rollup": "4.28.1"` exact(없으면 근사치+리포트). `pnpm install`.

- [ ] **Step 2: 실패 테스트 작성** — `packages/unplugin/test/rollup.test.ts`

```ts
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
```

- [ ] **Step 3: 실패/디버그** — Run: `pnpm --filter unplugin-critical-inline test rollup`. 실패 시 Task 3과 동일 원칙(테스트 약화 금지, src 수정 시 전 번들러 통과 유지). rollup의 `resolveId(source, importer)` 인자는 esbuild/vite와 유사하므로 대개 그대로 통과.

- [ ] **Step 4: 통과 + 회귀.** **Step 5: Commit** (트레일러).

---

## Task 5: webpack 자동 `<head>` 주입 (`html-webpack-plugin`)

**Files:**
- Modify: `packages/unplugin/src/index.ts`, `packages/unplugin/package.json` (optional peer + devDep `html-webpack-plugin`)
- Test: `packages/unplugin/test/webpack-inject.test.ts`

**Interfaces:**
- Consumes: `compiledEntries`, `injectEntriesIntoHtml`, `options.entries`/`nonce`.

- [ ] **Step 1: 의존성** — `packages/unplugin/package.json`: `peerDependencies`에 `"html-webpack-plugin": ">=5"` + `peerDependenciesMeta` optional, devDependencies에 exact `"html-webpack-plugin": "5.6.3"`(없으면 근사치+리포트). `pnpm install`.

- [ ] **Step 2: 실패 테스트 작성** — `packages/unplugin/test/webpack-inject.test.ts`

```ts
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
      context: dir, mode: 'development', entry: join(dir, 'entry.js'),
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
```

- [ ] **Step 3: webpack 훅 구현** — 팩토리 반환 객체에 `webpack` 네임스페이스(unplugin은 `webpack` 키에 `(compiler) => void` 형태의 확장을 지원)를 추가. `html-webpack-plugin`의 `beforeEmit` 훅에서 각 대상 HTML에 주입:

```ts
    webpack(compiler: any) {
      if (!options.entries?.length) return;
      const HtmlPlugin = require('html-webpack-plugin');
      compiler.hooks.compilation.tap('critical-inline', (compilation: any) => {
        const hooks = HtmlPlugin.getHooks(compilation);
        hooks.beforeEmit.tapPromise('critical-inline', async (data: any) => {
          if (compiledEntries) {
            data.html = injectEntriesIntoHtml(data.html, data.outputName, options.entries!, compiledEntries, options.nonce);
          }
          return data;
        });
      });
    },
```
(주의: `require('html-webpack-plugin')`는 optional peer이므로 try/catch로 감싸 미설치 시 경고 후 스킵. `data.outputName`이 대상 HTML 파일명이다. `buildStart`가 webpack에서도 실행되어 `compiledEntries`가 채워지는지 확인 — 안 되면 이 훅 내부에서 최초 1회 `await compileEntries(...)`로 지연 컴파일.)

- [ ] **Step 4: 실패/디버그** — Run: `pnpm --filter unplugin-critical-inline test webpack-inject`. html-webpack-plugin 훅 API(버전별 `getHooks`)·`compiledEntries` 준비 시점을 실증 확인하며 맞춘다. 테스트 약화 금지.

- [ ] **Step 5: 통과 + 회귀.** **Step 6: Commit** (트레일러).

---

## Task 6: README/docs 갱신 + changeset (0.2.0)

**Files:**
- Modify: `README.md`, `packages/unplugin/README.md`
- Create: `.changeset/phase2.md`

- [ ] **Step 1: README 갱신** — 번들러 매트릭스에 webpack·rollup "통합 테스트 완료" 반영, rspack은 "webpack 호환·미검증"으로 정직히 표기. 자동 `<head>` 주입 사용법 추가(실제 API로):

```md
## Automatic <head> injection (Vite / webpack)
import { vite as criticalInline } from 'unplugin-critical-inline/vite';
export default defineConfig({
  plugins: [criticalInline({ entries: [{ input: 'src/gw.critical.ts', injectInto: ['index.html'] }] })],
});
// → 빌드 결과 index.html <head> 최상단에 압축·이스케이프된 <script> 인라인
```
webpack 예제도 `new HtmlWebpackPlugin()` + `criticalInline({ entries: [...] })` 조합으로 추가. MVP의 `?critical` import 예제·pure-HTML 예제는 유지.

- [ ] **Step 2: changeset 작성** — `.changeset/phase2.md`:

```md
---
'critical-inline': minor
'unplugin-critical-inline': minor
---

Phase 2: config manifest `entries`, automatic <head> injection for Vite (transformIndexHtml) and webpack (html-webpack-plugin), and webpack/rollup integration tests.
```
(코어에 실제 API 변경이 없다면 `critical-inline`은 changeset에서 제외하고 `unplugin-critical-inline`만 minor로 둔다 — 구현 결과에 맞춰 조정.)

- [ ] **Step 3: 전체 검증** — Run: `pnpm install && pnpm -r --config.verify-deps-before-run=false build && pnpm lint && pnpm -r --config.verify-deps-before-run=false test` → 전부 green(신규 통합 테스트 포함).

- [ ] **Step 4: Commit** (트레일러; pnpm-workspace.yaml 복원 주의). push 금지.

---

## Self-Review (작성자 체크)

- **Spec coverage**: 설계 §10 2차(webpack·Rollup·Rspack 주입 경로 통합 테스트→Task3·4[+Rspack은 문서화로 축소], 설정 매니페스트→Task1, 자동 head 주입→Task2·5). rspack은 devDep·CI 비용 대비 낮은 우선순위로 "webpack 호환·미검증" 문서화로 대체(Task6). 필요 시 후속.
- **Placeholder scan**: 모든 코드 스텝에 실제 코드. webpack/html-webpack-plugin 훅은 버전별 API 편차가 있어 "실증 확인하며 맞춘다"로 명시(디버그 지침 포함) — 리뷰 루프가 실패를 잡는다.
- **Type consistency**: `CriticalEntry`/`Options.entries`/`compiledEntries: Map<string,CompiledCritical>`가 Task1에서 정의되고 Task2·5에서 동일 사용. `injectEntriesIntoHtml` 시그니처 일관.
- **회귀 안전**: 모든 태스크가 기존 `?critical` import + MVP 테스트 유지를 완료 조건에 포함.

## 리스크
- webpack 자동 주입(Task5)이 가장 불확실(html-webpack-plugin 훅 버전차·`compiledEntries` 준비 시점). 실패 시 지연 컴파일 폴백 명시.
- rspack은 이번 스코프에서 제외(문서화). 요구 시 Task 추가.
