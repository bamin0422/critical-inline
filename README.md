# critical-inline

번들러·프레임워크 중립적으로 "critical script"를 인라인 `<script>`로 컴파일해 넣어주는 도구 모음입니다.

메인 JS 번들이 실행되기 전에 먼저 돌아야 하는 코드(API 프리페치, 리소스 프리로드, 웹뷰 브릿지 초기화, LCP 최적화용 초기 작업 등)를 평범한 TypeScript 파일로 작성하면, 빌드 시 esbuild로 압축된 IIFE 문자열로 컴파일하여 HTML `<head>`에 직접 심어줍니다.

[`@woowabros/vite-plugin-critical-script`](https://github.com/woowabros/critical-script)와 동일한 아이디어를 Vite 전용이 아니라 **Vite·webpack·Rollup·esbuild·Rspack·Next.js·순수 HTML 빌드 파이프라인**에서 공통으로 쓸 수 있게 만든 프로젝트입니다.

## 왜 필요한가

- 크리티컬 코드는 **순수 TypeScript**로 작성 — 특별한 문법이나 매크로가 없습니다.
- 코어(`critical-inline`)는 어떤 번들러·프레임워크에도 의존하지 않습니다 — esbuild로 컴파일한 문자열과 HTML 주입 헬퍼만 제공합니다.
- 번들러별 어댑터(`unplugin-critical-inline`), React/Next 어댑터(`critical-inline/next`)는 이 코어를 호출하는 얇은 래퍼일 뿐입니다.
- 인라인 스크립트 크기 상한(`maxBytes`), `</script>` 이스케이프, CSP `nonce` 속성을 기본으로 처리합니다.

## 패키지 구성

| 패키지 | 설명 |
| --- | --- |
| [`critical-inline`](./packages/core) | 프레임워크 중립 코어. `compileCritical`/`renderScriptTag`/`injectIntoHtml`/`escapeScriptBody` + `critical-inline/next`의 `<CriticalScript>`. |
| [`unplugin-critical-inline`](./packages/unplugin) | [unplugin](https://github.com/unjs/unplugin) 기반 번들러 어댑터. `import x from './foo.critical?critical'` 형태의 import-쿼리를 컴파일된 `{ code, hash, bytes }` 객체로 변환합니다. |

## 설치

```bash
pnpm add critical-inline
# 번들러 import-쿼리(?critical)를 쓸 경우
pnpm add -D unplugin-critical-inline
```

React/Next에서 `<CriticalScript>`를 쓰려면 `react`가 필요합니다(`peerDependency`, optional).

## 번들러 지원 매트릭스

| 대상 | 사용 방법 | 상태 |
| --- | --- | --- |
| Vite | `unplugin-critical-inline`의 `vite` export | `?critical` import 변환 + **자동 `<head>` 주입**(`entries` 옵션) 통합 테스트 완료 |
| esbuild | `unplugin-critical-inline`의 `esbuild` export | `?critical` import 변환 통합 테스트 완료(자동 `<head>` 주입은 미지원) |
| webpack | `unplugin-critical-inline`의 `webpack` export | `?critical` import 변환 + **자동 `<head>` 주입**(`entries` 옵션, `html-webpack-plugin` 필요) 통합 테스트 완료 |
| Rollup | `unplugin-critical-inline`의 `rollup` export | `?critical` import 변환 통합 테스트 완료(자동 `<head>` 주입은 미지원) |
| Rspack | `unplugin-critical-inline`의 `rspack` export | webpack과 동일한 unplugin 어댑터(webpack 호환) — 이 레포 안에서 통합 테스트는 아직 없음 |
| Next.js | `critical-inline/next`의 `<CriticalScript>` (+ 빌드타임 프리컴파일) | 컴포넌트 렌더 테스트 완료 |
| 순수 HTML / 커스텀 빌드 파이프라인(dop-do-front 패턴) | `critical-inline`의 `compileCritical` + `injectIntoHtml` 직접 호출 | 단위 테스트 완료 |

> Vite·webpack 어댑터는 `entries` 옵션을 주면 빌드타임에 HTML `<head>`에 자동으로 주입합니다(Vite는 `transformIndexHtml`, webpack은 `html-webpack-plugin`의 `beforeEmit` 훅 경유 — 아래 "자동 `<head>` 주입" 절 참고). `entries`를 생략하면(esbuild/Rollup/Rspack은 항상) 기존처럼 `?critical` import 변환만 수행하고 HTML은 건드리지 않습니다 — 이 경우 자동 주입이 필요하면 Next(`<CriticalScript>`) 또는 순수 HTML 패턴(`injectIntoHtml`)을 쓰세요.

## 사용 예제

### (a) Vite / esbuild — `?critical` import

`unplugin-critical-inline`을 번들러 설정에 등록하면, `?critical` 쿼리가 붙은 import가 컴파일된 `{ code, hash, bytes }` 객체(타입: `CriticalModule`, **아직 이스케이프되지 않은 원본 코드**)로 치환됩니다. 클라이언트에서 이 코드를 **실제로 실행**시키려면 `<script>` 엘리먼트를 직접 만들어 `textContent`에 `critical.code`를 넣으세요 — `insertAdjacentHTML`/`innerHTML`로 삽입한 `<script>`는 브라우저가 실행하지 않습니다. (서버에서 HTML 문자열을 조립하는 경우라면 코어의 `renderScriptTag`를 쓰세요 — `</script>` 이스케이프와 `data-critical-hash`/`data-size` 속성을 대신 처리해줍니다.)

> **정직한 한계**: 이 `?critical` import 패턴 자체는 빌드타임 `index.html` 자동 주입을 하지 않습니다 — 그건 아래 "자동 `<head>` 주입" 절에서 다루는 `entries` 옵션 기반의 별도 기능입니다. 여기 (a)처럼 앱 코드(`main.ts`) 안에서 스크립트 태그를 만들어 삽입하면 그 코드는 **메인 번들의 일부로 실행**됩니다 — 메인 번들보다 먼저 실행되는 것을 보장하지 않습니다. 진짜로 메인 번들 이전 실행이 필요하다면 아래 "자동 `<head>` 주입"(Vite/webpack) 또는 (c) 순수 HTML 빌드타임 주입 패턴을 쓰세요.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { vite as criticalVite } from 'unplugin-critical-inline';

export default defineConfig({
  plugins: [criticalVite({ maxBytes: 8192 })],
});
```

```ts
// home.critical.ts — critical 모듈로 컴파일할 평범한 TS
(window as any).__home = fetch('/api/home').then((r) => r.json());
```

```ts
// main.ts
import homeCritical from './home.critical?critical'; // { code, hash, bytes }

// insertAdjacentHTML/innerHTML 로 넣은 <script> 는 실행되지 않는다.
// script 엘리먼트를 만들어 textContent 에 코드를 넣어야 실제로 실행된다.
const s = document.createElement('script');
s.textContent = homeCritical.code; // 컴파일된 IIFE 본문
document.head.prepend(s);
```

esbuild를 직접 쓰는 경우도 동일한 패턴이며, `vite` 대신 `esbuild` export만 바꿔주면 됩니다.

```ts
// build.ts
import { build } from 'esbuild';
import { esbuild as criticalEsbuild } from 'unplugin-critical-inline';

await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'dist/main.js',
  plugins: [criticalEsbuild({ maxBytes: 8192 })],
});
```

### (a-1) 자동 `<head>` 주입 (Vite / webpack) — `entries` 옵션

`?critical` import 대신, `Options.entries`를 넘기면 Vite·webpack 어댑터가 **빌드 시점에 지정한 HTML 파일의 `<head>`에 컴파일된 크리티컬 스크립트를 직접 인라인**합니다. 앱 코드에서 `<script>` 엘리먼트를 만들어 삽입할 필요가 없고, 메인 번들 스크립트보다 앞에 오는 것도 보장됩니다((a)의 `?critical` import 패턴과 달리 실제 HTML 파일 자체가 바뀝니다).

```ts
interface CriticalEntry {
  input: string; // 컴파일할 크리티컬 TS 엔트리 경로
  injectInto?: string[]; // 대상 HTML 파일명(끝 문자열 매칭). 생략 시 모든 HTML에 주입
  position?: 'head-top' | 'head-end'; // 기본 'head-top'
}
```

**Vite** — `transformIndexHtml`을 통해 `vite build`(및 `vite dev`)가 만드는 `index.html`에 주입합니다.

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { vite as criticalInline } from 'unplugin-critical-inline';

export default defineConfig({
  plugins: [
    criticalInline({ entries: [{ input: 'src/gw.critical.ts', injectInto: ['index.html'] }] }),
  ],
});
```

빌드 결과 `index.html`의 `<head>` 최상단에 압축·이스케이프된 `<script data-critical-hash="…" data-size="…">…</script>`가 인라인됩니다.

**webpack** — `html-webpack-plugin`(옵션 peer, 별도 설치 필요)이 생성하는 HTML의 `beforeEmit` 훅에 주입합니다. 설치돼 있지 않으면 `console.warn`으로 경고를 남긴 뒤 자동 주입을 스킵하고 `?critical` import 변환만 남습니다.

```js
// webpack.config.js
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { webpack as criticalInline } from 'unplugin-critical-inline';

export default {
  // ...
  plugins: [
    new HtmlWebpackPlugin(),
    criticalInline({ entries: [{ input: 'src/gw.critical.ts', injectInto: ['index.html'] }] }),
  ],
};
```

두 어댑터 모두 최상위 `nonce` 옵션을 함께 지원합니다(`criticalInline({ entries: [...], nonce: 'n-abc' })` → 주입된 `<script>`에 `nonce="n-abc"`가 붙습니다). `entries`를 넘기지 않으면 두 어댑터 모두 (a)처럼 `?critical` import 변환만 수행하고 HTML은 건드리지 않습니다(하위 호환). esbuild/Rollup/Rspack 어댑터는 아직 `entries` 자동 주입을 지원하지 않습니다.

### (b) Next.js — `<CriticalScript>`

Next.js(App Router)는 번들러(Turbopack/webpack)의 HTML `<head>` 주입 훅을 SPA 번들러처럼 노출하지 않으므로, **빌드 전에 크리티컬 코드를 컴파일해 일반 모듈로 import**하고 `<CriticalScript>`로 렌더하는 방식을 씁니다.

```ts
// scripts/build-critical.mjs — package.json의 "prebuild" 스크립트로 등록
import { compileCritical } from 'critical-inline';
import { writeFileSync } from 'node:fs';

const c = await compileCritical('./src/critical/home.critical.ts', { maxBytes: 8192 });
writeFileSync(
  './src/critical/home.critical.generated.ts',
  `export const homeCritical = ${JSON.stringify({ code: c.code, hash: c.hash, bytes: c.bytes })};\n`,
);
```

```tsx
// app/layout.tsx
import { CriticalScript } from 'critical-inline/next';
import { homeCritical } from '../src/critical/home.critical.generated';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <CriticalScript critical={homeCritical} nonce={process.env.CSP_NONCE} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

webpack 빌더를 그대로 쓰는 Next 프로젝트라면, `next.config.js`의 `webpack()` 커스터마이즈 훅에 `unplugin-critical-inline`의 `webpack` export를 등록해 `?critical` import를 앱 코드에서 바로 쓸 수도 있습니다.

```js
// next.config.mjs
import { webpack as criticalWebpack } from 'unplugin-critical-inline';

/** @type {import('next').NextConfig} */
export default {
  webpack(config) {
    config.plugins.push(criticalWebpack());
    return config;
  },
};
```

### (c) 순수 HTML 빌드 (예: esbuild 커스텀 파이프라인 / dop-do-front 패턴)

번들러 통합 없이, 빌드 스크립트에서 `compileCritical` + `injectIntoHtml`을 직접 호출해 정적 HTML 파일에 주입할 수 있습니다.

```ts
import { compileCritical, injectIntoHtml } from 'critical-inline';
import { readFileSync, writeFileSync } from 'node:fs';

const c = await compileCritical('src/gw.critical.ts', { maxBytes: 8192 });
const html = injectIntoHtml(readFileSync('contentViewer.html', 'utf8'), c);
writeFileSync('dist/contentViewer.html', html);
```

`injectIntoHtml`은 기본으로 `<head>` 최상단에 주입합니다(`opts.position: 'head-end'`로 변경 가능). CSP를 쓰는 환경이면 `opts.nonce`를 넘기세요.

## API 개요

### `critical-inline`

| export | 설명 |
| --- | --- |
| `compileCritical(input: string, opts?: CompileOptions): Promise<CompiledCritical>` | TS 엔트리를 esbuild로 bundle+minify하여 압축 IIFE 문자열로 컴파일. |
| `renderScriptTag(c, opts?: { nonce?: string }): string` | `<script data-critical-hash="…" data-size="…" [nonce]>…</script>` 문자열 생성. |
| `injectIntoHtml(html, c, opts?: { position?: 'head-top' \| 'head-end'; nonce?: string }): string` | 임의 HTML 문자열에 위 스크립트 태그를 주입. |
| `escapeScriptBody(code: string): string` | `</script>`를 `<\/script>`로 치환해 조기 종료를 방지. |
| `CompileOptions` / `CompiledCritical` / `CriticalModule` | 타입. `CompiledCritical`은 `{ code, bytes, hash, warnings }`, `CriticalModule`은 그중 `{ code, hash, bytes }`만 가진 서브셋. |

### `critical-inline/next`

| export | 설명 |
| --- | --- |
| `CriticalScript(props: { critical: CriticalModule; nonce?: string }): JSX.Element` | 빌드타임에 컴파일된 `CriticalModule`을 인라인 `<script>`로 렌더. |

### `unplugin-critical-inline`

| export | 설명 |
| --- | --- |
| `default` / `vite` / `rollup` / `webpack` / `rspack` / `esbuild` | [unplugin](https://github.com/unjs/unplugin) 팩토리로 생성된 번들러별 플러그인. `import x from './foo.critical?critical'`을 `compileCritical` 결과(`{ code, hash, bytes }`)로 치환. `vite`/`webpack`은 `entries`를 주면 추가로 HTML `<head>` 자동 주입도 수행. |
| `Options` | `{ maxBytes?: number; onOversize?: 'error' \| 'warn'; entries?: CriticalEntry[]; nonce?: string }`. `entries`/`nonce`는 Vite·webpack의 자동 `<head>` 주입 전용(위 (a-1) 절 참고). |
| `CriticalEntry` | `{ input: string; injectInto?: string[]; position?: 'head-top' \| 'head-end' }`. `entries` 배열의 원소 타입. |
| `compileEntries` / `injectEntriesIntoHtml` | `entries` 컴파일·HTML 주입에 쓰는 하위 헬퍼(직접 export도 됨) — 커스텀 통합(예: 아직 자동 주입이 없는 Rspack에 수동으로 연결)에 활용 가능. |

## 에러 처리 / 안전장치

- **크기 상한**: `maxBytes`(기본 8192B) 초과 시 기본은 빌드 실패. `onOversize: 'warn'`으로 완화 가능(대신 `warnings` 배열에 메시지가 담깁니다).
- **`</script>` 이스케이프**: 인라인 스크립트 본문에 `</script>`가 있어도 조기 종료되지 않도록 자동 치환.
- **CSP nonce**: `nonce` 옵션을 넘기면 `<script nonce="…">`가 붙습니다.
- **결정성**: 동일 입력은 항상 동일 `hash`(sha256 앞 8자)를 생성합니다 — 캐싱/중복 주입 감지에 활용 가능.
- **타입 체크는 하지 않음**: 코어는 esbuild transpile+minify만 수행하므로 타입 오류는 잡지 않습니다. IDE/`tsc`/호스트 프레임워크의 기존 타입 체크 파이프라인에 맡기세요.

## 개발

```bash
pnpm install
pnpm -r build
pnpm -r test
```

## 라이선스

MIT
