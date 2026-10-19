'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [state, setState] = useState('');
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState('Copied');
    } catch {
      setState('Copy unavailable — select the text manually.');
    }
  }
  return (
    <span className="copy-control">
      <button type="button" onClick={() => void copy()}>
        {state === 'Copied' ? <Check size={14} /> : <Copy size={14} />}
        {label}
      </button>
      <span className="muted" role="status">
        {state}
      </span>
    </span>
  );
}
