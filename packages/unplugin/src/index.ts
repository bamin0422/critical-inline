import { createUnplugin } from 'unplugin';
import { compileCritical, type CompiledCritical } from 'critical-inline';
import { dirname, isAbsolute, resolve } from 'node:path';
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
  // 진행 중 Promise 를 공유해 다중 HTML 주입 시 중복 컴파일을 막는다.
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
      if (options.entries?.length) {
        await ensureCompiledEntries(options.entries);
      }
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
export const webpack = unpluginCriticalInline.webpack;
export const rspack = unpluginCriticalInline.rspack;
export const esbuild = unpluginCriticalInline.esbuild;
export default unpluginCriticalInline;
