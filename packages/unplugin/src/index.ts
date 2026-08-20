import { createUnplugin } from 'unplugin';
import { compileCritical, type CompiledCritical } from 'critical-inline';
import { dirname, isAbsolute, resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { compileEntries, injectEntriesIntoHtml, type CriticalEntry } from './inject-html';

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

export default unpluginCriticalInline;
