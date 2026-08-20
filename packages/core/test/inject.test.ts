import { describe, it, expect } from 'vitest';
import { escapeScriptBody, renderScriptTag, injectIntoHtml } from '../src/inject';

const c = { code: 'console.log(1)', hash: 'abcd1234', bytes: 14 };

describe('inject', () => {
  it('</script> 를 이스케이프한다', () => {
    expect(escapeScriptBody('a</script>b')).toBe('a<\\/script>b');
  });
  it('renderScriptTag 은 data 속성과 nonce 를 붙인다', () => {
    const tag = renderScriptTag(c, { nonce: 'n1' });
    expect(tag).toContain('data-critical-hash="abcd1234"');
    expect(tag).toContain('data-size="14"');
    expect(tag).toContain('nonce="n1"');
    expect(tag.startsWith('<script')).toBe(true);
  });
  it('injectIntoHtml 은 head 최상단에 주입한다', () => {
    const out = injectIntoHtml('<html><head></head><body></body></html>', c);
    expect(out).toMatch(/<head><script/);
  });
  it('head-end 위치 지원', () => {
    const out = injectIntoHtml('<html><head></head></html>', c, { position: 'head-end' });
    expect(out).toMatch(/<\/script><\/head>/);
  });
  it('head-top: <head lang="ko"> 처럼 속성이 있어도 여는 태그 직후에 주입한다', () => {
    const out = injectIntoHtml('<!doctype html><html><head lang="ko"></head><body></body></html>', c);
    expect(out).toMatch(/<head lang="ko"><script/);
    // 여는 <head> 앞에 주입되어 quirks mode 로 밀리지 않아야 한다.
    expect(out.startsWith('<!doctype html>')).toBe(true);
  });
  it('head-end: <head lang="ko"> 처럼 속성이 있어도 </head> 앞에 주입한다', () => {
    const out = injectIntoHtml('<html><head lang="ko"></head></html>', c, { position: 'head-end' });
    expect(out).toMatch(/<\/script><\/head>/);
    expect(out).toContain('<head lang="ko">');
  });
  it('여러 개의 </script> 를 모두 이스케이프한다', () => {
    expect(escapeScriptBody('a</script>b</script>c')).toBe('a<\\/script>b<\\/script>c');
  });
  it('대소문자 무관하게 </SCRIPT> 도 이스케이프한다', () => {
    const out = escapeScriptBody('a</SCRIPT>b');
    expect(out).not.toMatch(/<\/script/i); // 살아있는 종료 시퀀스가 없어야 한다
    expect(out).toContain('<\\/'); // 이스케이프된 형태로 존재
  });
  it('<head> 가 전혀 없으면 문서 맨 앞에 붙인다 (fallback)', () => {
    const out = injectIntoHtml('<div>no head</div>', c);
    expect(out.startsWith('<script')).toBe(true);
    expect(out.endsWith('<div>no head</div>')).toBe(true);
  });
});
