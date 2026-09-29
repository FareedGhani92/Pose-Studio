import { useEffect, useRef } from 'react';
import type { PoseResult } from './pose';

type Registry = { registerTool: (tool: Record<string, unknown>, options: { signal: AbortSignal }) => void | Promise<void> };

/** Optional browser standard: expose the same result and reset action as the UI. */
export function usePoseTools(result: PoseResult | null, reset: () => void) {
  const current = useRef({ result, reset });
  current.current = { result, reset };
  useEffect(() => {
    const registry = (document as Document & { modelContext?: Registry }).modelContext;
    if (!registry?.registerTool) return;
    const lifecycle = new AbortController();
    const validate = (input: unknown) => {
      if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length) throw new Error('Pass an empty object.');
    };
    const register = (name: string, description: string, readOnly: boolean, execute: (input: unknown) => unknown) => {
      try {
        void Promise.resolve(registry.registerTool({
          name, description,
          inputSchema: { type: 'object', properties: {}, additionalProperties: false },
          annotations: { readOnlyHint: readOnly, untrustedContentHint: false },
          execute,
        }, { signal: lifecycle.signal })).catch(() => { /* Optional API; regular controls remain available. */ });
      } catch { /* Browser does not support this optional API version. */ }
    };
    register('get_pose_result', 'Read the currently displayed pose landmarks and processing time. Does not start capture or upload.', true, input => {
      validate(input);
      if (!current.current.result) throw new Error('Analyze an image or camera frame first.');
      return current.current.result;
    });
    register('reset_pose_workspace', 'Stop the camera and clear the displayed image and pose result.', false, async input => {
      validate(input); current.current.reset();
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      return { cleared: true };
    });
    return () => lifecycle.abort();
  }, []);
}
