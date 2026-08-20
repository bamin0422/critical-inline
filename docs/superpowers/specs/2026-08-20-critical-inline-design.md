# critical-inline — 번들러 중립 critical-script 설계

- **작성일**: 2026-08-20
- **상태**: 설계 승인 (구현 계획 대기)
- **저자**: 민대인 / Claude (Opus 4.8)

## 1. 개요와 동기

우아한형제들의 [`@woowabros/vite-plugin-critical-script`](https://github.com/woowabros/critical-script)는 TypeScript 모듈을 prerender된 HTML 안의 인라인 `<script>`로 변환해, 메인 JS 번들보다 먼저 크리티컬 작업(API 프리페치·리소스 프리로드·웹뷰 브릿지 초기화·LCP 최적화)을 실행시키는 도구입니다. 배민 웹뷰 화면에서 LCP를 30~40% 개선한 실전 검증 패턴입니다.

그러나 이 도구는 **Vite 전용**이며 Vite 기반 React 프레임워크의 HTML prerender(react-router 프레임워크 모드·@tanstack/react-start)를 전제로 합니다. 우리의 실사용 대상인 **dop-do-front는 esbuild + Next.js 셸 + 레거시 AMD/RequireJS** 구조라 원조를 직접 쓸 수 없습니다.

`critical-inline`은 동일한 가치를 **번들러·프레임워크 중립적으로** 제공하는 것을 목표로 합니다. 핵심 아이디어: "크리티컬 TS를 압축된 인라인 `<script>` 문자열로 컴파일한다"는 순수 코어를 분리하고, 각 호스트(Vite/webpack/Rollup/esbuild/Rspack/Next)에는 그 문자열을 HTML에 주입하는 얇은 어댑터만 둔다.

## 2. 목표 / 비목표

**목표**
- 하나의 코어로 여러 번들러에서 동작한다(unplugin 활용).
- React에 종속되지 않는다 — 순수 HTML(예: gw `contentViewer.html`)에도 인라인 가능.
- dop-do-front(비표준 esbuild + Next)를 1급으로 지원한다.
- 인라인 스크립트 크기 상한, `</script>` 이스케이프, CSP nonce 등 실무 안전장치를 기본 제공.

**비목표(초기)**
- Astro·SvelteKit 등 비-React SSR 프레임워크 전용 어댑터(확장 여지만 남김).
- 크리티컬 코드의 자동 코드 분할/의존성 그래프 최적화(사용자가 명시적으로 작성).
- 런타임 주입(빌드타임 인라인만 다룸).

## 3. 아키텍처 (모노레포, A안)

```
critical-inline/                       ← 독립 OSS 레포 (pnpm workspace)
├─ packages/core       @critical-inline/core      순수 컴파일 코어 (번들러·프레임워크 무관)
├─ packages/unplugin   unplugin-critical-inline    Vite/webpack/Rollup/esbuild/Rspack HTML 주입
└─ packages/next       @critical-inline/next       Next 전용 <CriticalScript> 컴포넌트
```

- **core**가 유일한 두뇌다. unplugin·next 패키지와 dop-do-front 프로그래매틱 경로 모두 core를 호출한다.
- 각 단위의 책임:
  - `core`: TS 엔트리 → 압축 IIFE 문자열 + 메타(바이트·해시) 생성, HTML 주입 헬퍼. 외부 번들러/프레임워크 의존 없음.
  - `unplugin`: 호스트 번들러의 HTML 훅에 core 결과를 주입. unplugin이 플러그인 "형태"를 통일한다.
  - `next`: 빌드타임 컴파일된 문자열을 emit하는 React 컴포넌트.

## 4. 코어 API (프레임워크 중립 두뇌)

```ts
interface CompileOptions {
  maxBytes?: number;                 // 기본 8192. 초과 시 error(기본) 또는 warn
  onOversize?: 'error' | 'warn';     // 기본 'error'
  minify?: boolean;                  // 기본 true
  define?: Record<string, string>;   // esbuild define 주입
}

interface CompiledCritical {
  code: string;      // 압축된 IIFE 본문
  bytes: number;     // UTF-8 바이트 수
  hash: string;      // sha256 앞 8자 (캐싱/데이터 속성)
  warnings: string[];
}

// TS 엔트리를 esbuild로 bundle+minify하여 IIFE 문자열로 반환
function compileCritical(input: string, opts?: CompileOptions): Promise<CompiledCritical>;

// 임의 HTML 문자열에 <script> 주입 (</script> 이스케이프 포함)
function injectIntoHtml(
  html: string,
  compiled: CompiledCritical,
  opts?: { position?: 'head-top' | 'head-end'; nonce?: string }
): string;

// 인라인용 <script> 태그 문자열만 생성 (컴포넌트/수동 삽입용)
function renderScriptTag(compiled: CompiledCritical, opts?: { nonce?: string }): string;
```

- esbuild로 `format: 'iife'`, `bundle: true`, `minify: true` 컴파일. `write: false`로 문자열만 취득.
- `bytes`는 UTF-8 기준(원조가 최근 커밋에서 UTF-8 바이트로 교정한 것과 동일한 함정 회피).
- `renderScriptTag`는 `<script data-critical-hash="…" data-size="N" [nonce]>…</script>` 형태.

## 5. 저작 모델 & 데이터 흐름

```ts
// home.critical.ts — 메인 번들보다 먼저 실행할 평범한 TS
window.__home = fetch('/api/home').then((r) => r.json());
```

선언 방식 두 가지를 지원한다.

**(a) import 쿼리 — 콜로케이션 (번들러 어댑터 사용 시)**
```ts
import homeCritical from './home.critical?critical'; // 컴파일된 인라인 문자열
// React: <CriticalScript entry={homeCritical} /> 또는
//        <script dangerouslySetInnerHTML={{ __html: homeCritical }} />
```

**(b) 설정 매니페스트 — 정적 HTML/gw용 (콜로케이션 불필요)**
```ts
criticalInline({
  entries: [{ id: 'gw', input: 'gw.critical.ts', injectInto: ['contentViewer.html'] }],
  maxBytes: 8192,
});
```

**빌드 흐름**: 플러그인이 critical 엔트리를 감지 → `compileCritical` 호출 → 크기 상한 검사 → 대상 HTML `<head>` 최상단에 `<script>` 주입.

## 6. 호스트별 주입 전략

| 호스트 | 주입 방식 |
|---|---|
| Vite | `transformIndexHtml` 훅 + import-쿼리 가상 모듈 |
| webpack | `HtmlWebpackPlugin` 훅(`alterAssetTagGroups` / `beforeEmit`) |
| Rollup / esbuild(표준) | `generateBundle` / `onEnd`에서 대상 HTML 재작성 |
| **dop-do-front(비표준 esbuild)** | `esbuild.config.js`에서 `compileCritical()` + `injectIntoHtml()` 직접 호출 → `public/gw/contentViewer.html` |
| **Next.js** | `<CriticalScript>` 컴포넌트가 빌드타임 컴파일된 문자열을 `app/layout.tsx` `<head>`에 emit |

**정직한 제약 — Next**: Next(Turbopack/webpack)는 빌드타임 정적 HTML `<head>` 주입 훅을 SPA 번들러처럼 노출하지 않는다. 따라서 Next 소비는 **인라인 문자열을 렌더하는 얇은 React 컴포넌트** 형태가 현실적이다. React는 "출력 싱크"일 뿐 코어는 여전히 중립이다.

## 7. 에러 처리 / 보장

- **크기 상한**(`maxBytes`, 기본 8192B): 초과 시 빌드 실패(`onOversize: 'warn'`으로 완화 가능).
- **`</script>` 이스케이프**: 인라인 본문의 `</script>`를 `<\/script>`로 치환해 조기 종료 방지.
- **CSP nonce**: `nonce` 옵션 시 `<script nonce="…">` 부여(인라인 스크립트 CSP 대응).
- **결정성**: 동일 입력 → 동일 해시(빌드 캐싱·중복 주입 방지에 활용).
- **타입 체크(정직한 지점)**: 코어는 esbuild transpile+minify이므로 타입 검사를 하지 않는다. 타입 오류는 **호스트의 기존 TS 파이프라인**(IDE·`tsc`·프레임워크 빌드)에서 잡히도록 문서화한다(원조도 사실상 Vite/TS에 위임).

## 8. 테스트 전략

- **core**: 단위 테스트 — 컴파일 결과·크기 상한(error/warn)·해시 결정성·`</script>` 이스케이프·nonce 부여·UTF-8 바이트 계산.
- **unplugin**: 번들러별 통합 테스트 — 픽스처 프로젝트를 각 번들러 프로그래매틱 API로 빌드 후 출력 HTML에 `<script>`가 주입됐는지 검증. **우선순위: Vite + esbuild**, 이후 webpack.
- **next**: 컴포넌트 렌더 테스트 — 인라인 스크립트가 head에 출력되는지.

## 9. 패키징 / 레포 / CI

- TypeScript, `tsup` 번들, `vitest` 테스트, `changesets` 버전 관리.
- MIT 라이선스, README(EN/KO), 사용 예제(각 번들러 + dop-do-front 패턴).
- GitHub Actions: lint · test(다중 Node) · build.
- pnpm workspace 모노레포.

## 10. 초기 스코프 (MVP) 와 단계

**1차(MVP)**: `@critical-inline/core` + `unplugin-critical-inline`(Vite·esbuild 주입) + `@critical-inline/next` 컴포넌트 + dop-do-front 프로그래매틱 경로 예제.

**2차(확장)**: webpack·Rollup·Rspack 주입 경로 통합 테스트, 설정 매니페스트 편의 기능 강화, 문서 사이트.

## 11. 위험 요소 / 열린 질문

- **Next 주입**: 컴포넌트 방식이 beforeInteractive 시점 보장을 충분히 주는지 실측 필요(스트리밍 SSR에서 head 위치 검증).
- **호스트별 HTML 훅 차이**: unplugin은 플러그인 형태만 통일할 뿐 HTML 주입 API는 번들러마다 다르므로, 어댑터별 코드 경로와 테스트가 각각 필요하다(초기엔 Vite·esbuild만 완결).
- **dop-do-front 실적용**: `contentViewer.html` 주입이 gw 레거시 로더 순서와 충돌하지 않는지 별도 PoC로 확인(본 설계 범위 밖, 후속 티켓).
- **이름 충돌 확인**: npm에 `critical-inline` / `unplugin-critical-inline` 가용성 확인 필요(구현 착수 전 점검).
