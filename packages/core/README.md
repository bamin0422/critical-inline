# critical-inline

번들러·프레임워크에 의존하지 않는 순수 코어입니다. TypeScript로 작성한 "critical script"를 esbuild로 압축된 IIFE 문자열로 컴파일하고, 그 문자열을 HTML `<script>`로 만들거나 임의 HTML에 주입하는 헬퍼를 제공합니다.

번들러 연동이 필요하면 [`unplugin-critical-inline`](../unplugin)을 함께 사용하세요.

## 설치

```bash
pnpm add critical-inline
```

`critical-inline/next`의 `<CriticalScript>`를 쓰려면 `react`가 필요합니다(peerDependency, optional — React를 쓰지 않는 프로젝트라면 설치하지 않아도 됩니다).

## 사용

### 컴파일 + HTML 주입 (프레임워크 무관)

```ts
import { compileCritical, injectIntoHtml } from 'critical-inline';
import { readFileSync, writeFileSync } from 'node:fs';

const c = await compileCritical('src/gw.critical.ts', { maxBytes: 8192 });
const html = injectIntoHtml(readFileSync('contentViewer.html', 'utf8'), c);
writeFileSync('dist/contentViewer.html', html);
```

### 스크립트 태그 문자열만 필요한 경우

```ts
import { compileCritical, renderScriptTag } from 'critical-inline';

const c = await compileCritical('src/home.critical.ts');
const tag = renderScriptTag(c, { nonce: 'abc123' });
// '<script data-critical-hash="…" data-size="…" nonce="abc123">…</script>'
```

### React / Next — `critical-inline/next`

```tsx
import { CriticalScript } from 'critical-inline/next';
import type { CriticalModule } from 'critical-inline';

function Head({ critical }: { critical: CriticalModule }) {
  return <CriticalScript critical={critical} nonce="abc123" />;
}
```

`CriticalModule`은 이미 컴파일된 `{ code, hash, bytes }`를 기대합니다 — 빌드타임에 `compileCritical`로 미리 만들어 두거나, `unplugin-critical-inline`의 `?critical` import 결과를 그대로 넘기면 됩니다.

## API

| export | 시그니처 | 설명 |
| --- | --- | --- |
| `compileCritical` | `(input: string, opts?: CompileOptions) => Promise<CompiledCritical>` | TS 엔트리를 esbuild(`bundle: true, format: 'iife', minify: true`)로 컴파일. |
| `renderScriptTag` | `(c: Pick<CompiledCritical, 'code'\|'hash'\|'bytes'>, opts?: { nonce?: string }) => string` | `<script>` 태그 문자열 생성. |
| `injectIntoHtml` | `(html: string, c: Pick<CompiledCritical, 'code'\|'hash'\|'bytes'>, opts?: { position?: 'head-top'\|'head-end'; nonce?: string }) => string` | HTML에 스크립트 태그 주입. 기본 위치는 `head-top`. |
| `escapeScriptBody` | `(code: string) => string` | `</script>` → `<\/script>` 치환. |
| `CriticalScript` (from `critical-inline/next`) | `(props: { critical: CriticalModule; nonce?: string }) => JSX.Element` | 인라인 스크립트를 렌더하는 React 컴포넌트. |

### 타입

```ts
interface CompileOptions {
  maxBytes?: number;               // 기본 8192. 초과 시 error(기본) 또는 warn
  onOversize?: 'error' | 'warn';   // 기본 'error'
  minify?: boolean;                 // 기본 true
  define?: Record<string, string>;  // esbuild define 주입
}

interface CompiledCritical {
  code: string;       // 압축된 IIFE 본문
  bytes: number;      // UTF-8 바이트 수
  hash: string;        // sha256 앞 8자
  warnings: string[]; // onOversize:'warn'일 때 크기 초과 메시지 등
}

interface CriticalModule {
  code: string;
  hash: string;
  bytes: number;
}
```

## 동작 방식 메모

- `bytes`는 UTF-8 바이트 기준으로 계산합니다(문자 길이 아님).
- `maxBytes` 초과 시 기본값 `onOversize: 'error'`이면 `compileCritical`이 reject됩니다. `'warn'`이면 정상적으로 결과를 반환하되 `warnings` 배열에 메시지가 담깁니다.
- 코어는 타입 검사를 하지 않습니다(esbuild transpile+minify만 수행). 타입 오류는 IDE/`tsc`/호스트 빌드 파이프라인에서 잡아야 합니다.

## 테스트

```bash
pnpm test
```
