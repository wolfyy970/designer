import { useMemo } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import { NODE_TYPES } from '../constants/canvas';
import { getModelNodeData } from '../lib/canvas-node-data';
import { DEFAULT_COMPILER_PROVIDER } from '../lib/constants';
import {
  LOCKDOWN_MODEL_ID,
  LOCKDOWN_PROVIDER_ID,
} from '../lib/lockdown-model';
import { useAppConfig } from './useAppConfig';

const PACK = '\u001e';

/**
 * First Model node on the canvas (document order). Section nodes are not edge-connected to models;
 * this matches the fallback used in canvas auto-connect.
 */
export function useFirstCanvasModel() {
  const { data: appConfig } = useAppConfig();
  const lockdown = appConfig?.lockdown === true;

  const packed = useCanvasStore((s) => {
    const m = s.nodes.find((n) => n.type === NODE_TYPES.MODEL);
    if (!m) return '';
    const d = getModelNodeData(m);
    const pid = (d?.providerId?.trim() || DEFAULT_COMPILER_PROVIDER).trim();
    const mid = (d?.modelId ?? '').trim();
    if (!mid) return '';
    return `${pid}${PACK}${mid}`;
  });

  return useMemo(() => {
    if (!packed) {
      return {
        providerId: null as string | null,
        modelId: null as string | null,
        hasModel: false,
      };
    }
    const i = packed.indexOf(PACK);
    if (i < 0) {
      return {
        providerId: null as string | null,
        modelId: null as string | null,
        hasModel: false,
      };
    }
    const rawProvider = packed.slice(0, i);
    const rawModel = packed.slice(i + PACK.length);
    if (lockdown) {
      return {
        providerId: LOCKDOWN_PROVIDER_ID,
        modelId: LOCKDOWN_MODEL_ID,
        hasModel: true,
      };
    }
    return {
      providerId: rawProvider,
      modelId: rawModel,
      hasModel: true,
    };
  }, [packed, lockdown]);
}
