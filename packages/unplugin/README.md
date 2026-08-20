# unplugin-critical-inline

[`critical-inline`](../core) 코어를 각 번들러에 연결하는 [unplugin](https://github.com/unjs/unplugin) 어댑터입니다. `?critical` 쿼리가 붙은 import를 컴파일된 `{ code, hash, bytes }`(타입: `CriticalModule`) 객체로 치환합니다.

```ts
// home.critical.ts
(window as any).__home = fetch('/api/home').then((r) => r.json());
```

```ts
import homeCritical from './home.critical?critical';
// homeCritical: { code: string; hash: string; bytes: number }
```

## 설치

```bash
pnpm add -D unplugin-critical-inline
```

`critical-inline`은 dependency로 함께 설치됩니다.

## 지원 대상

| export | 번들러 | 상태 |
| --- | --- | --- |
| `vite` | Vite | `?critical` 변환 + 자동 `<head>` 주입(`entries`) 통합 테스트 완료(`test/vite.test.ts`, `test/vite-inject.test.ts`) |
| `esbuild` | esbuild | `?critical` 변환 통합 테스트 완료(`test/esbuild.test.ts`). 자동 `<head>` 주입 미지원 |
| `webpack` | webpack | `?critical` 변환 + 자동 `<head>` 주입(`entries`, `html-webpack-plugin` 필요) 통합 테스트 완료(`test/webpack.test.ts`, `test/webpack-inject.test.ts`) |
| `rollup` | Rollup | `?critical` 변환 통합 테스트 완료(`test/rollup.test.ts`). 자동 `<head>` 주입 미지원 |
| `rspack` | Rspack | webpack과 동일한 unplugin 어댑터(webpack 호환) — 이 패키지 안에서 통합 테스트는 아직 없음 |
| `default` | 위 전체를 담은 unplugin 팩토리 | — |

## 사용

### Vite

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { vite as criticalVite } from 'unplugin-critical-inline';

export default defineConfig({
  plugins: [criticalVite({ maxBytes: 8192 })],
});
```

### esbuild

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

### webpack

```js
// webpack.config.js
import { webpack as criticalWebpack } from 'unplugin-critical-inline';

export default {
  plugins: [criticalWebpack({ maxBytes: 8192 })],
};
```

### Rollup / Rspack

```ts
import { rollup as criticalRollup } from 'unplugin-critical-inline';
// 또는
import { rspack as criticalRspack } from 'unplugin-critical-inline';
```

각각 `rollup.config.js`의 `plugins`, Rspack 설정의 `plugins`에 그대로 등록하면 됩니다.

### 자동 `<head>` 주입 (Vite / webpack) — `entries`

`?critical` import 대신 `entries`를 넘기면, Vite·webpack 어댑터가 빌드 시점에 지정한 HTML의 `<head>`에 컴파일된 크리티컬 스크립트를 직접 인라인합니다.

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

```js
// webpack.config.js — html-webpack-plugin은 optional peer, 별도 설치 필요
import HtmlWebpackPlugin from 'html-webpack-plugin';
import { webpack as criticalInline } from 'unplugin-critical-inline';

export default {
  plugins: [
    new HtmlWebpackPlugin(),
    criticalInline({ entries: [{ input: 'src/gw.critical.ts', injectInto: ['index.html'] }] }),
  ],
};
```

`entries`를 넘기지 않으면 두 어댑터 모두 기존처럼 `?critical` import 변환만 수행합니다(하위 호환). esbuild/Rollup/Rspack은 아직 `entries` 자동 주입을 지원하지 않습니다. 자세한 내용은 [루트 README의 "자동 `<head>` 주입" 절](../../README.md)을 참고하세요.

## Options

```ts
interface Options {
  maxBytes?: number;               // compileCritical로 전달. 기본 8192
  onOversize?: 'error' | 'warn';   // compileCritical로 전달. 기본 'error'
  entries?: CriticalEntry[];       // 지정 시 vite/webpack 어댑터가 자동 <head> 주입 수행
  nonce?: string;                  // entries 자동 주입 시 <script nonce="…">에 반영
}

interface CriticalEntry {
  input: string;              // 컴파일할 크리티컬 TS 엔트리 경로
  injectInto?: string[];      // 대상 HTML 파일명(끝 문자열 매칭). 생략 시 모든 HTML
  position?: 'head-top' | 'head-end'; // 기본 'head-top'
}
```

## 동작 방식

1. `?critical` 접미사가 붙은 id만 처리합니다(`resolveId`/`loadInclude`).
2. 상대 경로 import는 importer 기준 절대경로로 변환한 뒤 `?critical`을 다시 붙입니다 — CWD에 따라 엔트리 해석이 달라지지 않도록 하기 위함입니다.
3. `load` 훅에서 실제 파일 경로(`?critical` 제거)를 `critical-inline`의 `compileCritical`에 넘겨 컴파일하고, 그 결과를 `export default { code, hash, bytes };` 형태의 가상 모듈로 반환합니다.

## 테스트

```bash
pnpm test
```
