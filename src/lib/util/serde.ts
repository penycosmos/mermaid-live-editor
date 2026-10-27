import type { State } from '$lib/types';
import { fromBase64, fromUint8Array, toBase64, toUint8Array } from 'js-base64';
import { deflate, inflate } from 'pako';

interface Serde {
  serialize: (state: string) => string;
  deserialize: (state: string) => string;
}

const base64Serde: Serde = {
  serialize: (state: string): string => {
    return toBase64(state, true);
  },
  deserialize: (state: string): string => {
    return fromBase64(state);
  }
};

export const pakoSerde: Serde = {
  serialize: (state: string): string => {
    const data = new TextEncoder().encode(state);
    const compressed = deflate(data, { level: 9 });
    return fromUint8Array(compressed, true);
  },
  deserialize: (state: string): string => {
    const data = toUint8Array(state);
    return inflate(data, { to: 'string' });
  }
};

export type SerdeType = 'base64' | 'pako';

const serdes: Record<SerdeType, Serde> = {
  base64: base64Serde,
  pako: pakoSerde
};

export const serializeState = (state: State, serde: SerdeType = 'pako'): string => {
  if (!(serde in serdes)) {
    throw new Error(`Unknown serde type: ${serde}`);
  }
  const json = JSON.stringify(state);
  const serialized = serdes[serde].serialize(json);
  return `${serde}:${serialized}`;
};

export const deserializeState = (state: string): State => {
  let type: SerdeType, serialized: string;
  if (state.includes(':')) {
    let tempType: string;
    [tempType, serialized] = state.split(':');
    if (tempType in serdes) {
      type = tempType as SerdeType;
    } else {
      throw new Error(`Unknown serde type: ${tempType}`);
    }
  } else {
    type = 'base64';
    serialized = state;
  }
  const json = serdes[type].deserialize(serialized);
  const parsed: unknown = JSON.parse(json);
  // Early share links stored config as an object instead of a JSON string.
  if (
    parsed &&
    typeof parsed === 'object' &&
    'mermaid' in parsed &&
    parsed.mermaid &&
    typeof parsed.mermaid === 'object' &&
    !Array.isArray(parsed.mermaid)
  ) {
    parsed.mermaid = JSON.stringify(parsed.mermaid, undefined, 2);
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !('code' in parsed) ||
    typeof parsed.code !== 'string' ||
    ('mermaid' in parsed && typeof parsed.mermaid !== 'string')
  ) {
    throw new Error('图表数据格式无效');
  }
  return parsed as State;
};
