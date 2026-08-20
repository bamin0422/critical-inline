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
| `vite` | Vite | 통합 테스트 완료(`test/vite.test.ts`) |
| `esbuild` | esbuild | 통합 테스트 완료(`test/esbuild.test.ts`) |
| `webpack` | webpack | unplugin이 생성하는 표준 어댑터(이 패키지 안에서 통합 테스트는 아직 없음) |
| `rollup` | Rollup | 위와 동일 |
| `rspack` | Rspack | 위와 동일 |
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

## Options

```ts
interface Options {
  maxBytes?: number;               // compileCritical로 전달. 기본 8192
  onOversize?: 'error' | 'warn';   // compileCritical로 전달. 기본 'error'
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
