import { createUnplugin } from 'unplugin';
import { compileCritical, type CompiledCritical } from 'critical-inline';
import { dirname, isAbsolute, resolve } from 'node:path';
import { compileEntries, type CriticalEntry } from './inject-html';

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

  return {
    name: 'unplugin-critical-inline',
    async buildStart() {
      if (options.entries?.length) {
        compiledEntries = await compileEntries(options.entries, {
          maxBytes: options.maxBytes,
          onOversize: options.onOversize,
        });
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
  };
});

export const vite = unpluginCriticalInline.vite;
export const rollup = unpluginCriticalInline.rollup;
export const webpack = unpluginCriticalInline.webpack;
export const rspack = unpluginCriticalInline.rspack;
export const esbuild = unpluginCriticalInline.esbuild;
export default unpluginCriticalInline;
