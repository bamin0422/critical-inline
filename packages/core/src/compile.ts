import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import type { CompileOptions, CompiledCritical } from './types';

const DEFAULT_MAX_BYTES = 8192;

export async function compileCritical(
  input: string,
  opts: CompileOptions = {},
): Promise<CompiledCritical> {
  const { maxBytes = DEFAULT_MAX_BYTES, onOversize = 'error', minify = true, define } = opts;
  const result = await build({
    entryPoints: [input],
    bundle: true,
    minify,
    format: 'iife',
    platform: 'browser',
    write: false,
    define,
    logLevel: 'silent',
  });
  const code = result.outputFiles[0].text.trim();
  const bytes = Buffer.byteLength(code, 'utf8');
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
  const warnings: string[] = [];
  if (bytes > maxBytes) {
    const msg = `critical script "${input}" is ${bytes}B, exceeds maxBytes ${maxBytes}B`;
    if (onOversize === 'error') throw new Error(msg);
    warnings.push(msg);
  }
  return { code, bytes, hash, warnings };
}
