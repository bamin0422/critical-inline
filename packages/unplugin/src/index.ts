import { createUnplugin, type WebpackCompiler } from 'unplugin';
import { compileCritical, type CompiledCritical } from 'critical-inline';
import { dirname, isAbsolute, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import type HtmlWebpackPlugin from 'html-webpack-plugin';
import { compileEntries, injectEntriesIntoHtml, type CriticalEntry } from './inject-html';

// dist 산출물은 ESM 이라 전역 `require` 가 없다(Node 는 ESM 스코프에 require 를 주입하지
// 않는다). tsup 의 자동 `__require` 셈은 `typeof require`가 항상 "undefined"로 평가돼
// 매번 throw 하므로 optional peer 를 절대 로드하지 못한다(dist 빌드로 직접 검증함).
// `createRequire`는 ESM 에서 CJS 모듈을 동기적으로 불러오도록 Node 가 제공하는 정식 방법이라
// 이 문제를 피한다.
const require = createRequire(import.meta.url);

export interface Options {
  maxBytes?: number;
  onOversize?: 'error' | 'warn';
  entries?: CriticalEntry[];
  nonce?: string;

}

export { type CriticalEntry, compileEntries, injectEntriesIntoHtml } from './inject-html';

const SUFFIX = '?critical';

export const unpluginCriticalInline = createUnplugin<Options | undefined>((options = {}) => {
  let compiledEntries: Map<string, CompiledCritical> | null = null;
  let compiling: Promise<Map<string, CompiledCritical>> | null = null;

  // 정상 경로에서는 buildStart 가 transformIndexHtml 보다 먼저 끝나므로 캐시가 준비돼 있다.
  // 다만 훅 순서를 가정하지 않도록, 아직 비어 있으면 그 자리에서 컴파일한다.
  // 진행 중 Promise 를 공유해 한 빌드 안에서 HTML 이 여러 개일 때 중복 컴파일을 막는다.
  // 빌드 간 재사용(watch)은 buildStart 가 캐시를 비워 처리한다.
  async function ensureCompiledEntries(entries: CriticalEntry[]): Promise<Map<string, CompiledCritical>> {
    if (compiledEntries?.size) return compiledEntries;
    compiling ??= compileEntries(entries, {
      maxBytes: options.maxBytes,
      onOversize: options.onOversize,
    });
    compiledEntries = await compiling;
    return compiledEntries;
  }

  return {
    name: 'unplugin-critical-inline',
    async buildStart() {
      if (!options.entries?.length) return;
      // watch 모드처럼 같은 플러그인 인스턴스로 여러 번 빌드될 때 이전 결과가 남으면
      // 소스 변경이 반영되지 않는다. 빌드 시작마다 캐시를 버리고 새로 컴파일한다.
      compiledEntries = null;
      compiling = null;
      await ensureCompiledEntries(options.entries);
    },
    resolveId(id: string, importer?: string) {
      if (!id.endsWith(SUFFIX)) return undefined;
      const raw = id.slice(0, -SUFFIX.length);
      // 번들러/esbuild 는 커스텀 네임스페이스로 넘어온 id 를 자동으로 절대경로화하지 않으므로,
      // importer 기준으로 직접 절대경로를 만들어야 이후 compileCritical 의 entryPoints 해석이 CWD 에 좌우되지 않는다.
      if (isAbsolute(raw)) return id;
      if (!importer) return id;
      return resolve(dirname(importer), raw) + SUFFIX;
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
    // unplugin 은 반환 객체의 `vite` 키를 생성된 Vite 플러그인에 그대로 병합한다.
    // order: 'post' 라서 Vite 가 번들 스크립트를 넣은 뒤에 실행되고, head-top 주입이
    // 모듈 스크립트보다 앞자리를 차지한다.
    vite: {
      transformIndexHtml: {
        order: 'post' as const,
        async handler(html: string, ctx: { filename?: string; path?: string }) {
          const entries = options.entries;
          if (!entries?.length) return html;
          const compiled = await ensureCompiledEntries(entries);
          const name = ctx.filename ?? ctx.path ?? 'index.html';
          return injectEntriesIntoHtml(html, name, entries, compiled, options.nonce);
        },
      },
    },
    // html-webpack-plugin 은 optional peer 이므로, 존재하지 않으면 훅을 등록하지 않고 경고 후
    // 스킵한다(필수 peer 로 만들면 html-webpack-plugin 을 안 쓰는 webpack 사용자도 설치해야 함).
    // unplugin 의 `webpack` 키는 (compiler) => void 형태로, 반환된 webpack 플러그인의
    // apply() 안에서 호출된다 — Task3 의 apply-wrapper(realpath 정규화)와는 서로 다른 관심사라
    // 함께 실행돼도 충돌하지 않는다(둘 다 같은 compiler.hooks 에 등록만 할 뿐 서로를 덮어쓰지 않음).
    webpack(compiler: WebpackCompiler) {
      const entries = options.entries;
      if (!entries?.length) return;

      let HtmlPlugin: typeof HtmlWebpackPlugin | undefined;
      try {
        HtmlPlugin = require('html-webpack-plugin') as typeof HtmlWebpackPlugin;
      } catch {
        // html-webpack-plugin 이 설치돼 있지 않으면(옵셔널 peer) 자동 주입을 건너뛴다.
        // entries 를 설정했다는 건 자동 <head> 주입을 기대했다는 뜻이므로, 조용히 무시하지 않고
        // 경고를 남겨 사용자가 누락된 peer 를 알아챌 수 있게 한다(위 !options.entries?.length
        // 가드가 이미 통과한 뒤라 이 catch 는 entries 가 실제로 설정된 경우에만 도달한다).
        console.warn(
          '[critical-inline] html-webpack-plugin not found; skipping automatic <head> injection.',
        );
        return;
      }

      compiler.hooks.compilation.tap('critical-inline', (compilation) => {
        const hooks = HtmlPlugin!.getHooks(compilation);
        hooks.beforeEmit.tapPromise('critical-inline', async (data) => {
          // buildStart(rollup/unplugin 라이프사이클 훅)가 webpack 빌드에서도 실행돼
          // compiledEntries 를 채워두지만, 훅 실행 순서를 가정하지 않기 위해
          // 비어 있으면 이 자리에서 지연 컴파일한다(compileEntries 로직 재사용).
          const compiled = await ensureCompiledEntries(entries);
          data.html = injectEntriesIntoHtml(data.html, data.outputName, entries, compiled, options.nonce);
          return data;
        });
      });
    },
  };
});

export const vite = unpluginCriticalInline.vite;
export const rollup = unpluginCriticalInline.rollup;
export const rspack = unpluginCriticalInline.rspack;
export const esbuild = unpluginCriticalInline.esbuild;

// webpack(enhanced-resolve) 은 symlinks 옵션 기본값(true)으로 인해 진입점을 해석한 뒤
// importer 로 넘어오는 경로를 realpath 로 정규화한다(예: macOS `/var` → `/private/var`,
// pnpm 심볼릭 링크 워크스페이스). 반면 unplugin 의 webpack 어댑터는 `?critical` 처럼 실제
// 파일로 존재하지 않는 id 를 가상 모듈로 우회 처리할 때, 그 가상 모듈 경로의 접두사를
// `compiler.options.context` 스냅샷으로 만들어 둔다(unplugin apply() 진입 직후, 우리
// 플러그인 팩토리가 실행되기도 전에 캡처됨). context 가 realpath 되지 않은 채로 남아있으면
// 두 경로의 접두사가 서로 달라져(`/var/...` vs `/private/var/...`) 가상 모듈을 등록한 경로와
// webpack 이 실제로 읽으려는 경로가 어긋나 ENOENT 로 빌드가 실패한다.
// unplugin 이 VIRTUAL_MODULE_PREFIX 를 캡처하기 전에 개입해야 하므로, factory 내부(buildStart 등)가
// 아니라 webpack 플러그인 인스턴스의 `apply`를 감싸 compiler 가 넘어오는 즉시(afterEnvironment
// 훅보다 먼저) context 를 정규화한다.
export const webpack: typeof unpluginCriticalInline.webpack = (userOptions?: Options) => {
  const plugin = unpluginCriticalInline.webpack(userOptions);
  const originalApply = plugin.apply.bind(plugin);
  plugin.apply = (compiler) => {
    if (compiler.options.context) {
      try {
        compiler.options.context = realpathSync(compiler.options.context);
      } catch {
        // no-op: context 가 없거나 realpath 불가(가상 FS 등)하면 원본 값을 그대로 사용한다.
      }
    }
    originalApply(compiler);
  };
  return plugin;
};

// `unpluginCriticalInline`(createUnplugin 반환값)의 각 번들러 키는 getter 로 정의돼 있고
// setter 가 없다 — 이 파일은 ESM(항상 strict mode)이라 `unpluginCriticalInline.webpack = webpack`
// 처럼 직접 대입하면 "Cannot set property webpack of # which has only a getter" TypeError 가
// 난다. 그래서 default export 는 원본 객체를 그대로 내보내는 대신, 스프레드로 나머지 번들러
// 키(esbuild/rollup/vite/rspack/farm/raw 등)는 그대로 옮기고 `webpack` 만 위 realpath
// 래퍼로 덮어쓴 새 객체를 만든다 — `import u from 'unplugin-critical-inline'; u.webpack(...)`
// 도 named export `webpack`과 동일하게 realpath 정규화가 적용되게 하기 위함이다.
export default { ...unpluginCriticalInline, webpack };
