import type { CompiledCritical } from './types';

type Renderable = Pick<CompiledCritical, 'code' | 'hash' | 'bytes'>;

export function escapeScriptBody(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script');
}

export function renderScriptTag(c: Renderable, opts: { nonce?: string } = {}): string {
  const nonce = opts.nonce ? ` nonce="${opts.nonce}"` : '';
  return `<script data-critical-hash="${c.hash}" data-size="${c.bytes}"${nonce}>${escapeScriptBody(c.code)}</script>`;
}

export function injectIntoHtml(
  html: string,
  c: Renderable,
  opts: { position?: 'head-top' | 'head-end'; nonce?: string } = {},
): string {
  const tag = renderScriptTag(c, { nonce: opts.nonce });
  const position = opts.position ?? 'head-top';
  if (position === 'head-top' && html.includes('<head>')) {
    return html.replace('<head>', `<head>${tag}`);
  }
  if (position === 'head-end' && html.includes('</head>')) {
    return html.replace('</head>', `${tag}</head>`);
  }
  return tag + html; // head 없으면 문서 앞에
}
