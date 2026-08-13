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
  /**
   * Advanced fields render inside a collapsible "Advanced" InspectorSection
   * (spec §8.2), collapsed by default. Use for rarely-tweaked options so the
   * Basic section stays low-noise. Default false (Basic).
   */
  advanced?: boolean;
}

export type NodeCategory = 'INPUT' | 'TEXT' | 'AI' | 'RULES' | 'MEDIA' | 'UTILITY' | 'OUTPUT';
export type RegistryState = 'canonical' | 'frontend-only';
export type ExecutionMode = 'runtime' | 'annotation' | 'viewer';

export interface NodeDefinition {
  type: string;
  version: number;
  executionMode: ExecutionMode;
  label: string;
  category: NodeCategory;
  icon: IconName;
  description: string;
  keywords: string[];
  ports: { in: Port[]; out: Port[] };
  configSchema: ConfigField[];
  inspectorTabs: string[];
  /** Legacy UI capability. Scheduler participation is owned by executionMode. */
  executable: boolean;
  registryState: RegistryState;
  /**
   * Derive a short card-body summary + compact metadata chips from the node's
   * configured data (spec §6/§7/§13). Returns { description, chips }. The card
   * renders this BELOW the title; configuration stays in the Inspector (§32).
   * Pure local derivation — the component calls this with `node.data`; it is
   * NOT a Zustand selector (so it never returns a fresh object on every store
   * snapshot, avoiding the infinite-loop trap).
   */
  summarize?: (data: Record<string, unknown>) => { description?: string; chips?: string[] };
}

// Minimal but real port + schema entries. Full schemas/ports expand in Phase 5/6.
const textIn: Port = { id: 'in', label: 'Input', type: 'text', required: true };
const textOut: Port = { id: 'out', label: 'Output', type: 'text' };
const fileOut: Port = { id: 'out', label: 'Files', type: 'file' };
const mediaOut: Port = { id: 'out', label: 'Media', type: 'media' };

const RAW_NODE_DEFINITIONS: Omit<NodeDefinition, 'version' | 'executionMode'>[] = [
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
    summarize: (data) => {
      const content = String(data.content ?? '').trim();
      return {
        description: 'Static workflow text',
        chips: content ? [`“${content.slice(0, 28)}${content.length > 28 ? '…' : ''}”`] : undefined,
      };
    },
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
    summarize: (data) => {
      const op = String(data.operation ?? 'trim');
      const opLabel: Record<string, string> = {
        trim: 'Trim', uppercase: 'UPPERCASE', lowercase: 'lowercase', replace: 'Replace',
      };
      return { description: 'Transform text', chips: [opLabel[op] ?? op] };
    },
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'UTILITY',
    icon: 'Clock',
    description: 'Pause workflow execution for a number of seconds.',
    keywords: ['delay', 'wait', 'pause', 'sleep', 'timer'],
    ports: { in: [{ id: 'in', label: 'Input', type: 'any', required: true }], out: [{ id: 'out', label: 'Output', type: 'any' }] },
    configSchema: [
      { key: 'seconds', label: 'Delay (s)', type: 'number', default: 1, min: 0, step: 0.1 },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const s = Number(data.seconds ?? 1);
      return { description: 'Pause workflow', chips: [`${s} second${s === 1 ? '' : 's'}`] };
    },
  },
  {
    type: 'aiScript',
    label: 'AI Script (Gemini)',
    category: 'AI',
    icon: 'Sparkles',
    description: 'Run a prompt through the Gemini model.',
    keywords: ['ai', 'gemini', 'llm', 'prompt', 'gpt'],
    ports: { in: [textIn], out: [textOut] },
    // Spec §45 Inspector: Provider / Model / Prompt / System Instructions /
    // Output (Text|JSON|Structured) / Temperature, plus Advanced: Timeout,
    // Schema. Delivered through the shared configSchema + PropertyRow +
    // InspectorSection("Advanced") mechanism (no bespoke panel, §61).
    configSchema: [
      { key: 'provider', label: 'Provider', type: 'select', default: 'gemini', options: [
        { value: 'gemini', label: 'Google Gemini' },
      ], help: 'Only Gemini is wired in the backend.' },
      { key: 'model', label: 'Model', type: 'select', default: 'gemini-2.5-flash', options: [
        { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
        { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      ] },
      { key: 'prompt', label: 'Prompt', type: 'textarea', default: '', placeholder: 'Describe what to generate…', help: 'Sent to the model. Upstream input is appended at run time.' },
      { key: 'systemInstructions', label: 'System Instructions', type: 'textarea', default: '', placeholder: 'Optional persona / rules…', help: 'Prepended to steer model behavior.' },
      { key: 'outputFormat', label: 'Output', type: 'select', default: 'text', options: [
        { value: 'text', label: 'Text' },
        { value: 'json', label: 'JSON' },
        { value: 'structured', label: 'Structured' },
      ], help: 'Structured/JSON ask the model for a parseable result.' },
      { key: 'temperature', label: 'Temperature', type: 'slider', default: 0.7, min: 0, max: 2, step: 0.1, help: 'Higher is more creative.' },
      { key: 'timeout', label: 'Timeout (s)', type: 'number', default: 60, min: 1, step: 1, advanced: true, help: 'Aborts the request after this many seconds.' },
      { key: 'schema', label: 'Response Schema', type: 'textarea', default: '', placeholder: '{"type":"object","properties":{…}}', advanced: true, help: 'JSON Schema for structured/JSON output.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const model = String(data.model ?? 'gemini-2.5-flash').replace('gemini-', 'Gemini ');
      const fmt = String(data.outputFormat ?? 'text');
      const fmtLabel: Record<string, string> = { text: 'Text', json: 'JSON', structured: 'Structured JSON' };
      return { description: 'Generate content with Gemini', chips: [model, fmtLabel[fmt] ?? fmt] };
    },
  },
  {
    type: 'fileInput',
    label: 'Local File Input',
    category: 'INPUT',
    icon: 'FileInput',
    description: 'Read a local file from disk into the workflow.',
    keywords: ['file', 'input', 'read', 'disk', 'local'],
    ports: { in: [], out: [fileOut] },
    // Spec §46 Inspector: Selected File / Path / Type / Size + Choose File +
    // Reveal in Folder. `path` is the only persisted field (the file-picker
    // row renders the path input + a Browse button that stays disabled until
    // the Tauri dialog bridge is wired — no false affordance). MIME type and
    // byte size are NOT probed by the frontend (no `.rs` IPC), so they render
    // as honest "unknown until read" rows in the Inspector, not fake values.
    configSchema: [
      { key: 'path', label: 'Path', type: 'file-picker', default: '', placeholder: 'C:\\…\\sample.mp4', help: 'Choose a file or paste an absolute path.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const path = String(data.path ?? '').trim();
      const name = path ? path.split(/[\\/]/).pop() ?? path : '';
      // Infer a coarse type from the extension for the card chip (display
      // only; the backend does the authoritative probe at run time).
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
      const kind = ext && ['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext) ? 'Video'
        : ext && ['mp3', 'wav', 'aac', 'flac', 'm4a'].includes(ext) ? 'Audio'
        : ext && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext) ? 'Image'
        : ext ? ext.toUpperCase() : '';
      return { description: 'Read a local file', chips: name ? [name, ...(kind ? [kind] : [])] : undefined };
    },
  },
  {
    type: 'mediaInfo',
    label: 'Media Info',
    category: 'MEDIA',
    icon: 'Info',
    description: 'Probe media metadata (duration, codec, resolution).',
    keywords: ['media', 'info', 'ffprobe', 'metadata', 'video', 'audio'],
    ports: { in: [{ id: 'in', label: 'Media', type: 'media', required: true }], out: [{ id: 'out', label: 'Metadata', type: 'json' }] },
    // Spec §47: the Inspector shows Summary / Video / Audio / Raw sub-tabs,
    // with Raw FFprobe output as Advanced only. This is the one per-node
    // structural exception — rendered as nested Radix Tabs inside the generic
    // NodeDetailPanel Configure tab (§61 still holds: no bespoke sheet). The
    // sub-tab bodies are honest empty states until a run delivers probed
    // metadata to the frontend (no `.rs` IPC today). `configSchema` stays
    // empty — there are no user-tunable config fields, only result views.
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: () => ({ description: 'Inspect media', chips: ['ffprobe'] }),
  },
  {
    type: 'saveText',
    label: 'Save Text',
    category: 'OUTPUT',
    icon: 'FileText',
    description: 'Write incoming text to an output file.',
    keywords: ['save', 'text', 'output', 'write', 'file'],
    ports: { in: [textIn], out: [] },
    // Spec §48 Inspector: Filename / Output Directory / Overwrite behavior.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.txt', placeholder: 'output.txt' },
      { key: 'outputDir', label: 'Output Directory', type: 'file-picker', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
      { key: 'overwrite', label: 'Overwrite behavior', type: 'select', default: 'rename', options: [
        { value: 'rename', label: 'Rename if exists' },
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'skip', label: 'Skip' },
      ], help: 'How to handle an existing file of the same name.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const fn = String(data.filename ?? 'output.txt').trim();
      return { description: 'Write text to a file', chips: [fn] };
    },
  },
  {
    type: 'saveJson',
    label: 'Save JSON',
    category: 'OUTPUT',
    icon: 'FileText',
    description: 'Write incoming JSON to an output file.',
    keywords: ['save', 'json', 'output', 'write', 'file'],
    ports: { in: [{ id: 'in', label: 'Input', type: 'json', required: true }], out: [] },
    // Spec §49 Inspector: Filename / Formatting (Pretty|Compact) / Output Directory.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.json', placeholder: 'output.json' },
      { key: 'formatting', label: 'Formatting', type: 'select', default: 'pretty', options: [
        { value: 'pretty', label: 'Pretty (indented)' },
        { value: 'compact', label: 'Compact (minified)' },
      ] },
      { key: 'outputDir', label: 'Output Directory', type: 'file-picker', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const fn = String(data.filename ?? 'output.json').trim();
      const fmt = String(data.formatting ?? 'pretty') === 'compact' ? 'Compact' : 'Pretty';
      return { description: 'Write JSON to a file', chips: [fn, fmt] };
    },
  },
  {
    type: 'saveArtifact',
    label: 'Save Artifact',
    category: 'OUTPUT',
    icon: 'Save',
    description: 'Persist a media/file artifact from the workflow. (Not executable yet — backend handler pending.)',
    keywords: ['save', 'artifact', 'output', 'media', 'file'],
    ports: { in: [{ id: 'in', label: 'Artifact', type: 'artifact', required: true }], out: [] },
    // Spec §50 Inspector: Filename / Location / Artifact type / Overwrite
    // behavior. `registryState='frontend-only'` — the backend handler is
    // pending, so the card + Inspector carry the "Not executable yet" badge
    // (Phase 4); the config fields are still editable so a graph is authored
    // correctly ahead of the backend landing.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'artifact', placeholder: 'artifact' },
      { key: 'outputDir', label: 'Location', type: 'file-picker', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
      { key: 'artifactType', label: 'Artifact type', type: 'select', default: 'auto', options: [
        { value: 'auto', label: 'Automatic (from input)' },
        { value: 'video', label: 'Video' },
        { value: 'audio', label: 'Audio' },
        { value: 'image', label: 'Image' },
        { value: 'file', label: 'File' },
      ], help: 'Forces the output kind; Automatic infers from the upstream port.' },
      { key: 'overwrite', label: 'Overwrite behavior', type: 'select', default: 'rename', options: [
        { value: 'rename', label: 'Rename if exists' },
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'skip', label: 'Skip' },
      ] },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'frontend-only',
    summarize: (data) => {
      const at = String(data.artifactType ?? 'auto');
      const atLabel: Record<string, string> = { auto: 'Automatic type', video: 'Video', audio: 'Audio', image: 'Image', file: 'File' };
      const fn = String(data.filename ?? 'artifact').trim();
      const chips: string[] = at === 'auto'
        ? (fn ? [fn] : [atLabel.auto])
        : [fn || atLabel[at], atLabel[at]];
      return { description: 'Persist a media/file artifact', chips };
    },
  },
  {
    type: 'mediaMerge',
    label: 'Media Merge',
    category: 'MEDIA',
    icon: 'Layers',
    description: 'Combine multiple media inputs into one output.',
    keywords: ['media', 'merge', 'combine', 'concat', 'ffmpeg'],
    // Port model unchanged (single 'media' input) — the §35 two-input layout
    // is an illustrative example, not a Phase F mandate, and changing port
    // IDs would break saved graphs + the addNextStep/insertNodeBetween
    // first-port contract (§27 "visual redesign must not break runtime
    // behavior"). Phase F deep-designs the Inspector (§51), not the ports.
    ports: { in: [{ id: 'in', label: 'Media', type: 'media', required: true }], out: [mediaOut] },
    // Spec §51 Inspector: Audio Mode (Replace|Mix) / Duration
    // (Shortest|Video|Audio) / Output (resolution + fps) + Advanced: Video
    // codec / Audio codec / Bitrate.
    configSchema: [
      { key: 'audioMode', label: 'Audio Mode', type: 'select', default: 'replace', options: [
        { value: 'replace', label: 'Replace' },
        { value: 'mix', label: 'Mix' },
      ], help: 'Replace swaps the video audio; Mix layers it over the original.' },
      { key: 'duration', label: 'Duration', type: 'select', default: 'shortest', options: [
        { value: 'shortest', label: 'Shortest' },
        { value: 'video', label: 'Match Video' },
        { value: 'audio', label: 'Match Audio' },
      ] },
      { key: 'resolution', label: 'Resolution', type: 'select', default: '1080p', options: [
        { value: '480p', label: '480p' },
        { value: '720p', label: '720p' },
        { value: '1080p', label: '1080p' },
        { value: 'source', label: 'Match source' },
      ] },
      { key: 'fps', label: 'Frame rate', type: 'select', default: '30', options: [
        { value: '24', label: '24 fps' },
        { value: '30', label: '30 fps' },
        { value: '60', label: '60 fps' },
        { value: 'source', label: 'Match source' },
      ] },
      { key: 'videoCodec', label: 'Video codec', type: 'select', default: 'h264', options: [
        { value: 'h264', label: 'H.264' },
        { value: 'h265', label: 'H.265 (HEVC)' },
        { value: 'vp9', label: 'VP9' },
        { value: 'av1', label: 'AV1' },
      ], advanced: true },
      { key: 'audioCodec', label: 'Audio codec', type: 'select', default: 'aac', options: [
        { value: 'aac', label: 'AAC' },
        { value: 'mp3', label: 'MP3' },
        { value: 'opus', label: 'Opus' },
      ], advanced: true },
      { key: 'bitrate', label: 'Bitrate', type: 'text', default: '8M', placeholder: '8M', advanced: true, help: 'Target video bitrate, e.g. 8M, 12M.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    summarize: (data) => {
      const res = String(data.resolution ?? '1080p');
      const fps = String(data.fps ?? '30');
      const vc = String(data.videoCodec ?? 'h264').toUpperCase();
      const ac = String(data.audioCodec ?? 'aac').toUpperCase();
      return { description: 'Combine media', chips: [`${vc} · ${ac}`, `${res} · ${fps}fps`] };
    },
  },
  {
    type: 'preview',
    label: 'Preview',
    category: 'MEDIA',
    icon: 'Eye',
    description: 'Preview the latest upstream result without entering the runtime DAG.',
    keywords: ['preview', 'view', 'inspect', 'media'],
    // Spec §52: accepts any single input and previews it by type (Text /
    // JSON / Image / Audio / Video). The `any` input port lets any upstream
    // node feed it. No config fields — it is a pure viewer, so the Configure
    // tab only shows the node Name. Double-click jumps straight to the
    // Preview tab (handled in NodeDetailPanel, §52).
    ports: { in: [{ id: 'in', label: 'Input', type: 'any', required: true }], out: [] },
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'frontend-only',
    summarize: () => ({ description: 'Inspect workflow output', chips: undefined }),
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
    summarize: (data) => {
      const content = String(data.content ?? '').trim();
      return {
        description: 'Documentation note',
        chips: content ? [`${content.slice(0, 24)}${content.length > 24 ? '…' : ''}`] : ['Note'],
      };
    },
  },
];

/** Runtime Contract V2 metadata is assigned in one place so every node has an
 * explicit schema version and scheduler participation mode. */
export const NODE_DEFINITIONS: NodeDefinition[] = RAW_NODE_DEFINITIONS.map((definition) => ({
  ...definition,
  version: 1,
  executionMode:
    definition.type === 'markdownNote'
      ? 'annotation'
      : definition.type === 'preview'
        ? 'viewer'
        : 'runtime',
}));

export const NODE_DEFINITION_MAP: Record<string, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((def) => [def.type, def]),
);

export function getDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITION_MAP[type];
}
