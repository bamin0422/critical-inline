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
  // <head lang="ko"> 처럼 속성이 붙은 경우와 대소문자(<HEAD>)까지 허용한다.
  // replace 콜백을 써서 매치된 태그의 원본 표기를 보존하고, tag 안의 특수문자($&, $1 등)가
  // 치환 패턴으로 해석되는 것을 방지한다.
  const OPEN_HEAD = /<head[^>]*>/i;
  const CLOSE_HEAD = /<\/head>/i;
  if (position === 'head-top' && OPEN_HEAD.test(html)) {
    return html.replace(OPEN_HEAD, (m) => m + tag);
  }
  if (position === 'head-end' && CLOSE_HEAD.test(html)) {
    return html.replace(CLOSE_HEAD, (m) => tag + m);
  }
  return tag + html; // head 가 전혀 없을 때만 문서 앞에
}
