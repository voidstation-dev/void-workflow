/**
 * Void Workflow — Node Registry (single source of truth)
 *
 * Phase 3 deliverable (spec §14 / audit §5.1): reconciles the three previously
 * disagreeing node lists (Rust `NodeRegistry` 9 types, frontend palette 12,
 * frontend `nodeTypes` map 10) into ONE frontend-owned list. The Canvas
 * `nodeTypes` map is GENERATED from this (see nodeTypes.ts); the Node Library
 * reads from this; the Inspector config form will be generated from
 * `configSchema` in Phase 6.
 *
 * `registryState` flags which nodes the Rust executor recognises:
 *   - 'canonical'       → backend has a handler; runs fine.
 *   - 'frontend-only'   → no backend handler. If `executable`, the controller
 *                         blocks a Run and surfaces a Problems entry. If not
 *                         `executable` (e.g. markdownNote), it never blocks.
 *
 * No Rust edits happen here — adding the frontend-only types to the backend is
 * a separate backend decision (audit §11 Q2). When that lands, flip
 * `registryState` to 'canonical' with no UI changes elsewhere.
 */

// --- Icon names (lucide-react). Keep in sync with the ICONS map in NodeLibrary. ---
export type IconName =
  | 'Network'
  | 'FolderTree'
  | 'Clock'
  | 'Settings'
  | 'Type'
  | 'Wand'
  | 'Sparkles'
  | 'FileInput'
  | 'Info'
  | 'FileText'
  | 'Save'
  | 'Layers'
  | 'Eye'
  | 'ScrollText';

// --- Port system (full visual system lands in Phase 5; shape/icon mapping here) ---
export type PortType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'json'
  | 'file'
  | 'media'
  | 'audio'
  | 'video'
  | 'artifact'
  | 'any';

export interface Port {
  id: string;
  label: string;
  type: PortType;
  required?: boolean;
}

// --- Config schema (drives the generic Inspector form in Phase 6) ---
export type ConfigFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'toggle'
  | 'slider'
  | 'file-picker';

export interface ConfigField {
  key: string;
  label: string;
  type: ConfigFieldType;
  default: string | number | boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
}

export type NodeCategory = 'INPUT' | 'TEXT' | 'AI' | 'MEDIA' | 'UTILITY' | 'OUTPUT';
export type RegistryState = 'canonical' | 'frontend-only';

export interface NodeDefinition {
  type: string;
  label: string;
  category: NodeCategory;
  icon: IconName;
  description: string;
  keywords: string[];
  ports: { in: Port[]; out: Port[] };
  configSchema: ConfigField[];
  inspectorTabs: string[];
  /** false = never executes (e.g. markdownNote is a documentation node). */
  executable: boolean;
  registryState: RegistryState;
}

// Minimal but real port + schema entries. Full schemas/ports expand in Phase 5/6.
const textIn: Port = { id: 'in', label: 'Input', type: 'text', required: true };
const textOut: Port = { id: 'out', label: 'Output', type: 'text' };
const anyOut: Port = { id: 'out', label: 'Output', type: 'any' };
const fileOut: Port = { id: 'out', label: 'Files', type: 'file' };
const mediaOut: Port = { id: 'out', label: 'Media', type: 'media' };

export const NODE_DEFINITIONS: NodeDefinition[] = [
  {
    type: 'textInput',
    label: 'Text Input',
    category: 'INPUT',
    icon: 'Type',
    description: 'Provide static or typed text to the workflow.',
    keywords: ['text', 'input', 'string', 'source'],
    ports: { in: [], out: [textOut] },
    configSchema: [
      { key: 'content', label: 'Content', type: 'textarea', default: '', placeholder: 'Type text…' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'textTransform',
    label: 'Text Transform',
    category: 'TEXT',
    icon: 'Wand',
    description: 'Apply a transformation to incoming text.',
    keywords: ['text', 'transform', 'replace', 'case', 'trim'],
    ports: { in: [textIn], out: [textOut] },
    configSchema: [
      { key: 'operation', label: 'Operation', type: 'select', default: 'trim', options: [
        { value: 'trim', label: 'Trim' },
        { value: 'uppercase', label: 'Uppercase' },
        { value: 'lowercase', label: 'Lowercase' },
        { value: 'replace', label: 'Replace' },
      ] },
      { key: 'find', label: 'Find', type: 'text', default: '' },
      { key: 'replace', label: 'Replace with', type: 'text', default: '' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'UTILITY',
    icon: 'Clock',
    description: 'Pause workflow execution for a number of seconds.',
    keywords: ['delay', 'wait', 'pause', 'sleep', 'timer'],
    ports: { in: [textIn], out: [textOut] },
    configSchema: [
      { key: 'seconds', label: 'Delay (s)', type: 'number', default: 1, min: 0, step: 0.1 },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'aiScript',
    label: 'AI Script (Gemini)',
    category: 'AI',
    icon: 'Sparkles',
    description: 'Run a prompt through the Gemini model.',
    keywords: ['ai', 'gemini', 'llm', 'prompt', 'gpt'],
    ports: { in: [textIn], out: [textOut] },
    configSchema: [
      { key: 'prompt', label: 'Prompt', type: 'textarea', default: '' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'fileInput',
    label: 'Local File Input',
    category: 'INPUT',
    icon: 'FileInput',
    description: 'Read a local file from disk into the workflow.',
    keywords: ['file', 'input', 'read', 'disk', 'local'],
    ports: { in: [], out: [fileOut] },
    configSchema: [
      { key: 'path', label: 'File path', type: 'file-picker', default: '' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'mediaInfo',
    label: 'Media Info',
    category: 'MEDIA',
    icon: 'Info',
    description: 'Probe media metadata (duration, codec, resolution).',
    keywords: ['media', 'info', 'ffprobe', 'metadata', 'video', 'audio'],
    ports: { in: [{ id: 'in', label: 'Media', type: 'media', required: true }], out: [anyOut] },
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'saveText',
    label: 'Save Text',
    category: 'OUTPUT',
    icon: 'FileText',
    description: 'Write incoming text to an output file.',
    keywords: ['save', 'text', 'output', 'write', 'file'],
    ports: { in: [textIn], out: [] },
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.txt' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'saveJson',
    label: 'Save JSON',
    category: 'OUTPUT',
    icon: 'FileText',
    description: 'Write incoming JSON to an output file.',
    keywords: ['save', 'json', 'output', 'write', 'file'],
    ports: { in: [{ id: 'in', label: 'Input', type: 'json', required: true }], out: [] },
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.json' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'saveArtifact',
    label: 'Save Artifact',
    category: 'OUTPUT',
    icon: 'Save',
    description: 'Persist a media/file artifact from the workflow. (Not executable yet — backend handler pending.)',
    keywords: ['save', 'artifact', 'output', 'media', 'file'],
    ports: { in: [{ id: 'in', label: 'Artifact', type: 'artifact', required: true }], out: [] },
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'artifact' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'frontend-only',
  },
  {
    type: 'mediaMerge',
    label: 'Media Merge',
    category: 'MEDIA',
    icon: 'Layers',
    description: 'Combine multiple media inputs into one output.',
    keywords: ['media', 'merge', 'combine', 'concat', 'ffmpeg'],
    ports: { in: [{ id: 'in', label: 'Media', type: 'media', required: true }], out: [mediaOut] },
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
  },
  {
    type: 'preview',
    label: 'Preview',
    category: 'MEDIA',
    icon: 'Eye',
    description: 'Preview media or text inline. (Not executable yet — backend handler pending.)',
    keywords: ['preview', 'view', 'inspect', 'media'],
    ports: { in: [{ id: 'in', label: 'Input', type: 'any', required: true }], out: [] },
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'frontend-only',
  },
  {
    type: 'markdownNote',
    label: 'Markdown Note',
    category: 'UTILITY',
    icon: 'ScrollText',
    description: 'A documentation note. Does not execute — for annotating the canvas.',
    keywords: ['note', 'markdown', 'doc', 'comment', 'annotation'],
    ports: { in: [], out: [] },
    configSchema: [
      { key: 'content', label: 'Markdown', type: 'textarea', default: '' },
    ],
    inspectorTabs: ['Note'],
    executable: false,
    registryState: 'frontend-only',
  },
];

export const NODE_DEFINITION_MAP: Record<string, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((def) => [def.type, def]),
);

export function getDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITION_MAP[type];
}