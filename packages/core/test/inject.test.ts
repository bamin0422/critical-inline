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
});
