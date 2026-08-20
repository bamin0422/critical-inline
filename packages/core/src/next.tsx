import * as React from 'react';
import { escapeScriptBody } from './inject';
import type { CriticalModule } from './types';

export function CriticalScript(props: { critical: CriticalModule; nonce?: string }): React.JSX.Element {
  const { critical, nonce } = props;
  return (
    <script
      data-critical-hash={critical.hash}
      data-size={critical.bytes}
      nonce={nonce}
      dangerouslySetInnerHTML={{ __html: escapeScriptBody(critical.code) }}
    />
  );
}
