import { compileCritical, injectIntoHtml, type CompiledCritical, type CompileOptions } from 'critical-inline';

export interface CriticalEntry {
  input: string;
  injectInto?: string[];
  position?: 'head-top' | 'head-end';
}

export async function compileEntries(
  entries: CriticalEntry[],
  opts: CompileOptions,
): Promise<Map<string, CompiledCritical>> {
  const map = new Map<string, CompiledCritical>();
  for (const e of entries) {
    if (!map.has(e.input)) {
      map.set(e.input, await compileCritical(e.input, opts));
    }
  }
  return map;
}

function targets(entry: CriticalEntry, htmlName: string): boolean {
  return !entry.injectInto || entry.injectInto.some((n) => htmlName.endsWith(n));
}

export function injectEntriesIntoHtml(
  html: string,
  htmlName: string,
  entries: CriticalEntry[],
  compiled: Map<string, CompiledCritical>,
  nonce?: string,
): string {
  let out = html;
  for (const e of entries) {
    if (!targets(e, htmlName)) continue;
    const c = compiled.get(e.input);
    if (!c) continue;
    out = injectIntoHtml(out, c, { position: e.position ?? 'head-top', nonce });
  }
  return out;
}
