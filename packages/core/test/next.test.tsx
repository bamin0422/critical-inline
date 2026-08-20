import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CriticalScript } from '../src/next';

describe('CriticalScript', () => {
  it('critical.code 를 인라인 script 로 렌더한다', () => {
    const { container } = render(
      <CriticalScript critical={{ code: 'window.__a=1', hash: 'h1', bytes: 11 }} nonce="n1" />,
    );
    const s = container.querySelector('script');
    expect(s?.getAttribute('data-critical-hash')).toBe('h1');
    expect(s?.getAttribute('nonce')).toBe('n1');
    expect(s?.innerHTML).toContain('window.__a=1');
  });
});
