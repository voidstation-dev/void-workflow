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
  | 'ScrollText'
  | 'Music'        // Audio & Cover node
  | 'Image'        // Background Media (image mode)
  | 'AudioWaveform'// Soundwave Visualizer
  | 'MonitorPlay'; // Preview & Export

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
  /**
   * Optional ordinal connector badge (1, 2, 3…) rendered beside the handle dot
   * on the node edge. Spec Tekna-style "Connector Badges" — opt-in per port.
   * Most nodes leave this undefined and rely on the shape/icon/color type cues;
   * the YouTube-automation nodes use it to make the input/output order explicit.
   */
  badge?: number;
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
  pickerMode?: 'file' | 'directory';
}

export type NodeCategory = 'INPUT' | 'TEXT' | 'AI' | 'RULES' | 'VIDEO' | 'AUDIO' | 'CAPTIONS' | 'MEDIA' | 'MARKETING' | 'UTILITY' | 'OUTPUT';
export type RegistryState = 'canonical' | 'frontend-only';
export type ExecutionMode = 'runtime' | 'annotation' | 'viewer' | 'planned';

/**
 * BodyRenderer key — a string identifier resolvable through the BODY_RENDERERS
 * map (see nodes/bodyRenderers/index.ts). The registry stays a plain data file
 * (no React imports → no circular deps with BaseNode); BaseNode looks the key
 * up and lazy-loads the component. When undefined, BaseNode falls back to the
 * default `summarize(data)` description + chips body (§27 single-renderer
 * contract preserved — the renderer is a pluggable slot, not a per-type node).
 *
 * The renderer receives the live node data + the updateNodeData callback so it
 * can drive two-way inline editing (file pickers, type selectors) directly on
 * the card, mirroring the Inspector's binding without a bespoke panel.
 */
export type BodyRendererKey =
  | 'audioCover'
  | 'backgroundMedia'
  | 'soundwaveVisualizer'
  | 'previewExport';

/** Props every body renderer receives. Defined here so the registry has no
 *  React import; the renderer components import this type. */
export interface BodyRendererProps {
  nodeId: string;
  data: Record<string, unknown>;
  /** Shallow merge into node.data (same action the Inspector uses). */
  updateNodeData: (patch: Record<string, unknown>) => void;
  selected: boolean;
}

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
  maturity?: 'stable' | 'beta' | 'design-only';
  /**
   * Optional inline card-body renderer key (pluggable slot, §27 preserved).
   * When present, BaseNode renders this component BETWEEN the header and the
   * ports row, replacing the default `summarize` description/chips body. Used
   * by the YouTube-automation nodes for inline file pickers, code-block
   * parameter previews, the visualizer type selector, and the preview canvas.
   */
  bodyRenderer?: BodyRendererKey;
  /**
   * Data fields that must be non-empty for the node to run. Surfaced as
   * WARNING problems by `deriveProblems` — advise-only, does NOT block the run
   * (the node will then fail at runtime with an honest error if the value is
   * still missing). Optional `when` predicate makes a field conditional on
   * other data (e.g. backgroundMedia requires videoPath only when mode='video').
   * Pure data inspection in the store — no IPC, contract-safe (inspects `data`,
   * not port shape).
   */
  requiredDataFields?: {
    key: string;
    label: string;
    hint?: string;
    when?: (data: Record<string, unknown>) => boolean;
  }[];
  /**
   * Derive a short card-body summary + compact metadata chips from the node's
   * configured data (spec §6/§7/§13). Returns { description, chips }. The card
   * renders this BELOW the title; configuration stays in the Inspector (§32).
   * Pure local derivation — the component calls this with `node.data`; it is
   * NOT a Zustand selector (so it never returns a fresh object on every store
   * snapshot, avoiding the infinite-loop trap). Only used when `bodyRenderer`
   * is undefined; renderers own their own body layout.
   */
  summarize?: (data: Record<string, unknown>) => { description?: string; chips?: string[] };
}

// Minimal but real port + schema entries. Full schemas/ports expand in Phase 5/6.
const textIn: Port = { id: 'text', label: 'Text', type: 'text', required: true };
const textOut: Port = { id: 'text', label: 'Text', type: 'text' };
const fileOut: Port = { id: 'file', label: 'File', type: 'file' };

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
    requiredDataFields: [
      { key: 'content', label: 'Text', hint: 'Add some text — an empty text source produces no output.' },
    ],
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
    ports: { in: [{ id: 'value', label: 'Value', type: 'any', required: true }], out: [{ id: 'value', label: 'Value', type: 'any' }] },
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
    ports: { in: [{ id: 'input', label: 'Input', type: 'any' }], out: [textOut, { id: 'json', label: 'JSON', type: 'json' }] },
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
    ports: { in: [{ id: 'media', label: 'Media', type: 'media', required: true }], out: [{ id: 'metadata', label: 'Metadata', type: 'json' }, { id: 'media', label: 'Media', type: 'media' }] },
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
    ports: { in: [textIn], out: [{ id: 'artifact', label: 'Artifact', type: 'artifact' }] },
    // Spec §48 Inspector: Filename / Output Directory / Overwrite behavior.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.txt', placeholder: 'output.txt' },
      { key: 'outputDir', label: 'Output Directory', type: 'file-picker', pickerMode: 'directory', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
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
    ports: { in: [{ id: 'json', label: 'JSON', type: 'json', required: true }], out: [{ id: 'artifact', label: 'Artifact', type: 'artifact' }] },
    // Spec §49 Inspector: Filename / Formatting (Pretty|Compact) / Output Directory.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'output.json', placeholder: 'output.json' },
      { key: 'formatting', label: 'Formatting', type: 'select', default: 'pretty', options: [
        { value: 'pretty', label: 'Pretty (indented)' },
        { value: 'compact', label: 'Compact (minified)' },
      ] },
      { key: 'outputDir', label: 'Output Directory', type: 'file-picker', pickerMode: 'directory', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
      { key: 'overwrite', label: 'Overwrite behavior', type: 'select', default: 'rename', options: [
        { value: 'rename', label: 'Rename if exists' },
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'skip', label: 'Skip' },
      ] },
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
    description: 'Persist a media/file artifact from the workflow.',
    keywords: ['save', 'artifact', 'output', 'media', 'file'],
    ports: { in: [{ id: 'artifact', label: 'Artifact', type: 'any', required: true }], out: [{ id: 'artifact', label: 'Artifact', type: 'artifact' }] },
    // Spec §50 Inspector: Filename / Location / Artifact type / Overwrite
    // behavior. `registryState='frontend-only'` — the backend handler is
    // pending, so the card + Inspector carry the "Not executable yet" badge
    // (Phase 4); the config fields are still editable so a graph is authored
    // correctly ahead of the backend landing.
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'artifact', placeholder: 'artifact' },
      { key: 'outputDir', label: 'Location', type: 'file-picker', pickerMode: 'directory', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
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
    registryState: 'canonical',
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
    description: 'Combine a video with an optional audio track.',
    keywords: ['media', 'merge', 'combine', 'concat', 'ffmpeg'],
    // Port model unchanged (single 'media' input) — the §35 two-input layout
    // is an illustrative example, not a Phase F mandate, and changing port
    // IDs would break saved graphs + the addNextStep/insertNodeBetween
    // first-port contract (§27 "visual redesign must not break runtime
    // behavior"). Phase F deep-designs the Inspector (§51), not the ports.
    ports: { in: [
      { id: 'video', label: 'Video', type: 'video', required: true },
      { id: 'audio', label: 'Audio', type: 'audio' },
    ], out: [{ id: 'video', label: 'Video', type: 'video' }] },
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
      { key: 'resolution', label: 'Resolution', type: 'select', default: 'source', options: [
        { value: '480p', label: '480p' },
        { value: '720p', label: '720p' },
        { value: '1080p', label: '1080p' },
        { value: 'source', label: 'Match source' },
      ] },
      { key: 'fps', label: 'Frame rate', type: 'select', default: 'source', options: [
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
      { key: 'bitrate', label: 'Bitrate', type: 'text', default: 'auto', placeholder: 'Auto or 8M', advanced: true, help: 'Auto keeps the encoder default.' },
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
    description: 'Capture and preview the latest upstream runtime value.',
    keywords: ['preview', 'view', 'inspect', 'media'],
    // Spec §52: accepts any single input and previews it by type (Text /
    // JSON / Image / Audio / Video). The `any` input port lets any upstream
    // node feed it. No config fields — it is a pure viewer, so the Configure
    // tab only shows the node Name. Double-click jumps straight to the
    // Preview tab (handled in NodeDetailPanel, §52).
    ports: { in: [{ id: 'input', label: 'Input', type: 'any', required: true }], out: [] },
    configSchema: [],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
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

  // ==========================================================================
  // YouTube Video Automation — 4-node pipeline (Light UI Minimalist, Tekna-style).
  // Phase 1 ships the frontend: registry + inline body renderers + Inspector
  // binding + edit-time FFprobe metadata + canvas→visualizer data propagation.
  // Phase 2 landed the Rust executors + FFmpeg filtergraph builder, so these
  // are now `canonical` + `executable:true` + `executionMode:'runtime'` (the
  // map below stamps the runtime mode). The controller's run guard lets them
  // through and `start_run` renders a real MP4. Sidecar packaging is Phase 3.
  // ==========================================================================
  {
    type: 'audioCover',
    label: 'Audio & Cover',
    category: 'AUDIO',
    icon: 'Music',
    description: 'Pick the audio track and cover art for the video.',
    keywords: ['audio', 'music', 'mp3', 'wav', 'cover', 'thumbnail', 'youtube'],
    ports: {
      in: [],
      out: [
        { id: 'audio', label: 'Audio', type: 'audio', badge: 1 },
        { id: 'metadata', label: 'Metadata', type: 'json', badge: 2 },
        { id: 'cover', label: 'Cover', type: 'media', badge: 3 },
      ],
    },
    configSchema: [
      { key: 'audioPath', label: 'Audio file', type: 'file-picker', default: '', placeholder: 'track.mp3', help: '.mp3 or .wav — duration + sample rate are probed automatically.' },
      { key: 'coverPath', label: 'Cover / thumbnail', type: 'file-picker', default: '', placeholder: 'cover.jpg', help: '.jpg or .png shown behind the visualizer.' },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    maturity: 'beta',
    bodyRenderer: 'audioCover',
    requiredDataFields: [
      { key: 'audioPath', label: 'Audio file', hint: 'Choose an audio file (.mp3 / .wav) before running.' },
    ],
    summarize: (data) => {
      const audio = String(data.audioPath ?? '').trim();
      const name = audio ? audio.split(/[\\/]/).pop() ?? audio : '';
      const durationMs = Number(data.durationMs ?? 0);
      const sampleRate = Number(data.sampleRate ?? 0);
      const chips: string[] = [];
      if (name) chips.push(name);
      if (durationMs > 0) chips.push(`${(durationMs / 1000).toFixed(1)}s`);
      if (sampleRate > 0) chips.push(`${(sampleRate / 1000).toFixed(1)}kHz`);
      return { description: 'Audio + cover source', chips: chips.length ? chips : ['No audio yet'] };
    },
  },
  {
    type: 'backgroundMedia',
    label: 'Background Media',
    category: 'MEDIA',
    icon: 'Image',
    description: 'Static image or short looping video behind the visualizer.',
    keywords: ['background', 'image', 'video', 'loop', 'cover', 'youtube'],
    ports: {
      in: [{ id: 'cover', label: 'Cover', type: 'media', required: true, badge: 1 }],
      out: [{ id: 'background', label: 'Background', type: 'media', badge: 1 }],
    },
    configSchema: [
      { key: 'mode', label: 'Background type', type: 'select', default: 'image', options: [
        { value: 'image', label: 'Static image' },
        { value: 'video', label: 'Looping video' },
      ], help: 'Image uses the incoming cover; Video loops a short .mp4 instead.' },
      { key: 'videoPath', label: 'Loop video', type: 'file-picker', default: '', placeholder: 'loop.mp4', help: 'Used when Background type is Looping video.' },
      { key: 'fit', label: 'Fit', type: 'select', default: 'cover', options: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain' },
        { value: 'stretch', label: 'Stretch' },
      ] },
      { key: 'scaleHeight', label: 'Output height', type: 'select', default: '1080', options: [
        { value: '1080', label: '1080p' },
        { value: '720', label: '720p' },
        { value: '480', label: '480p' },
      ], advanced: true },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    maturity: 'beta',
    bodyRenderer: 'backgroundMedia',
    // In image mode the background comes from the upstream `cover` edge (already
    // guarded by REQUIRED_INPUT_MISSING). In video mode the node needs a local
    // loop .mp4 — warn when that path is empty.
    requiredDataFields: [
      {
        key: 'videoPath',
        label: 'Loop video',
        hint: 'Choose a loop .mp4 when Background type is Looping video.',
        when: (data) => String(data.mode ?? 'image') === 'video',
      },
    ],
    summarize: (data) => {
      const mode = String(data.mode ?? 'image') === 'video' ? 'Video loop' : 'Static image';
      const fit = String(data.fit ?? 'cover');
      const fitLabel: Record<string, string> = { cover: 'Cover', contain: 'Contain', stretch: 'Stretch' };
      return { description: 'Background layer', chips: [mode, fitLabel[fit] ?? fit] };
    },
  },
  {
    type: 'soundwaveVisualizer',
    label: 'Soundwave Visualizer',
    category: 'AUDIO',
    icon: 'AudioWaveform',
    description: 'Render an audio-reactive visualizer over the background.',
    keywords: ['visualizer', 'waveform', 'spectrum', 'bars', 'audio', 'showwaves', 'showspectrum'],
    ports: {
      in: [
        { id: 'audio', label: 'Audio', type: 'audio', required: true, badge: 1 },
        { id: 'metadata', label: 'Metadata', type: 'json', badge: 2 },
        { id: 'background', label: 'Background', type: 'media', required: true, badge: 3 },
      ],
      out: [{ id: 'video', label: 'Video', type: 'video', badge: 1 }],
    },
    configSchema: [
      { key: 'visualizerType', label: 'Visualizer', type: 'select', default: 'frequencyBars', options: [
        { value: 'frequencyBars', label: 'Frequency Bars' },
        { value: 'waveform', label: 'Waveform' },
        { value: 'circularSpectrum', label: 'Circular Spectrum' },
      ], help: 'showwaves (Waveform), showspectrum (Circular Spectrum), or a bar approximation (Frequency Bars).' },
      { key: 'barCount', label: 'Bar count', type: 'number', default: 48, min: 4, max: 256, step: 1, help: 'Number of bars for Frequency Bars / resolution for the others.' },
      { key: 'colorAccent', label: 'Color accent', type: 'text', default: '#7669DE', placeholder: '#7669DE', help: 'Hex color for the visualizer stroke/fill.' },
      { key: 'sensitivity', label: 'Sensitivity', type: 'slider', default: 1, min: 0.25, max: 4, step: 0.05, help: 'Scales how strongly the visualizer reacts to the audio.' },
      { key: 'opacity', label: 'Opacity', type: 'slider', default: 0.85, min: 0.1, max: 1, step: 0.05, advanced: true },
      { key: 'position', label: 'Position', type: 'select', default: 'bottom', options: [
        { value: 'bottom', label: 'Bottom' },
        { value: 'center', label: 'Center' },
        { value: 'top', label: 'Top' },
      ], advanced: true },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    maturity: 'beta',
    bodyRenderer: 'soundwaveVisualizer',
    summarize: (data) => {
      const type = String(data.visualizerType ?? 'frequencyBars');
      const typeLabel: Record<string, string> = {
        frequencyBars: 'Frequency Bars', waveform: 'Waveform', circularSpectrum: 'Circular Spectrum',
      };
      const bars = Number(data.barCount ?? 48);
      return { description: 'Audio-reactive overlay', chips: [typeLabel[type] ?? type, `${bars} bars`] };
    },
  },
  {
    type: 'previewExport',
    label: 'Preview & Export',
    category: 'OUTPUT',
    icon: 'MonitorPlay',
    description: 'Live-preview the composed video and render it with FFmpeg.',
    keywords: ['preview', 'export', 'render', 'ffmpeg', 'output', 'youtube'],
    ports: {
      in: [{ id: 'video', label: 'Video', type: 'video', required: true, badge: 1 }],
      out: [{ id: 'artifact', label: 'Artifact', type: 'artifact', badge: 1 }],
    },
    configSchema: [
      { key: 'filename', label: 'Filename', type: 'text', default: 'visualizer.mp4', placeholder: 'visualizer.mp4' },
      { key: 'outputDir', label: 'Output directory', type: 'file-picker', pickerMode: 'directory', default: '', placeholder: 'runs/<id>/', help: 'Empty = the run output folder.' },
      { key: 'videoCodec', label: 'Video codec', type: 'select', default: 'h264', options: [
        { value: 'h264', label: 'H.264' },
        { value: 'h265', label: 'H.265 (HEVC)' },
      ], advanced: true },
      { key: 'fps', label: 'Frame rate', type: 'select', default: '30', options: [
        { value: '24', label: '24 fps' },
        { value: '30', label: '30 fps' },
        { value: '60', label: '60 fps' },
      ], advanced: true },
      { key: 'overwrite', label: 'Overwrite behavior', type: 'select', default: 'rename', options: [
        { value: 'rename', label: 'Rename if exists' },
        { value: 'overwrite', label: 'Overwrite' },
        { value: 'skip', label: 'Skip' },
      ] },
    ],
    inspectorTabs: ['Configuration'],
    executable: true,
    registryState: 'canonical',
    maturity: 'beta',
    bodyRenderer: 'previewExport',
    summarize: (data) => {
      const fn = String(data.filename ?? 'visualizer.mp4').trim();
      const fps = String(data.fps ?? '30');
      return { description: 'Preview + render', chips: [fn, `${fps}fps`] };
    },
  },
];

const plannedPort = (id: string, label: string, type: PortType, required = false): Port => ({ id, label, type, required });
const planned = (
  type: string,
  label: string,
  category: NodeCategory,
  description: string,
  ports: { in: Port[]; out: Port[] },
  configSchema: ConfigField[] = [],
  keywords: string[] = [],
): NodeDefinition => ({
  type,
  version: 1,
  executionMode: 'planned',
  label,
  category,
  icon: category === 'AI' || category === 'MARKETING' ? 'Sparkles' : category === 'OUTPUT' ? 'Save' : 'Layers',
  description,
  keywords: [label.toLowerCase(), ...keywords],
  ports,
  configSchema,
  inspectorTabs: ['Configuration'],
  executable: false,
  registryState: 'frontend-only',
  maturity: 'design-only',
  summarize: () => ({ description, chips: ['Coming later'] }),
});

const videoIn = [plannedPort('video', 'Video', 'video', true)];
const videoOut = [plannedPort('video', 'Video', 'video')];
const audioIn = [plannedPort('audio', 'Audio', 'audio', true)];
const audioOut = [plannedPort('audio', 'Audio', 'audio')];
const select = (key: string, label: string, values: string[], defaultValue = values[0]): ConfigField => ({
  key, label, type: 'select', default: defaultValue,
  options: values.map((value) => ({ value, label: value.replace(/(^|[-_])\w/g, (part) => part.replace(/[-_]/, ' ').toUpperCase()) })),
});

const PLANNED_NODE_DEFINITIONS: NodeDefinition[] = [
  planned('urlMediaInput', 'URL Media', 'INPUT', 'Reference downloadable media from a URL.', { in: [], out: [plannedPort('media', 'Media', 'media')] }, [
    { key: 'url', label: 'URL', type: 'text', default: '', placeholder: 'https://…' },
    select('quality', 'Quality', ['best', '1080p', '720p']),
  ], ['youtube', 'tiktok', 'download']),
  planned('batchFolderInput', 'Batch / Folder', 'INPUT', 'Select a folder and produce a batch manifest.', { in: [], out: [plannedPort('items', 'Items', 'json')] }, [
    { key: 'path', label: 'Folder', type: 'file-picker', pickerMode: 'directory', default: '' },
    { key: 'recursive', label: 'Include subfolders', type: 'toggle', default: false },
  ], ['folder', 'batch', 'files']),
  planned('trimClip', 'Trim Clip', 'VIDEO', 'Cut a video to a precise time range.', { in: videoIn, out: videoOut }, [
    { key: 'startSeconds', label: 'Start (s)', type: 'number', default: 0, min: 0, step: 0.1 },
    { key: 'endSeconds', label: 'End (s)', type: 'number', default: 10, min: 0, step: 0.1 },
  ], ['cut', 'shorts']),
  planned('smartReframe', 'Smart Reframe', 'VIDEO', 'Reframe video for portrait, square or landscape delivery.', { in: videoIn, out: videoOut }, [
    select('aspectRatio', 'Aspect ratio', ['9:16', '1:1', '16:9'], '9:16'),
    select('focus', 'Focus', ['auto', 'center', 'face']),
  ], ['crop', 'portrait', 'shorts']),
  planned('resizeCanvas', 'Resize / Canvas', 'VIDEO', 'Resize video and control canvas fit.', { in: videoIn, out: videoOut }, [
    select('size', 'Canvas', ['1080x1920', '1080x1080', '1920x1080']),
    select('fit', 'Fit', ['cover', 'contain', 'stretch']),
  ]),
  planned('videoConcat', 'Video Concat', 'VIDEO', 'Join a sequence of video clips.', { in: [plannedPort('clips', 'Clips', 'media', true)], out: videoOut }, [select('transition', 'Transition', ['none', 'crossfade'])], ['join', 'combine']),
  planned('overlay', 'Overlay', 'VIDEO', 'Place an image, video or graphic over a video.', { in: [plannedPort('video', 'Video', 'video', true), plannedPort('overlay', 'Overlay', 'media', true)], out: videoOut }, [select('position', 'Position', ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'])]),
  planned('speedRetime', 'Speed / Retime', 'VIDEO', 'Change playback speed while preserving timing intent.', { in: videoIn, out: videoOut }, [{ key: 'speed', label: 'Speed', type: 'slider', default: 1, min: 0.25, max: 4, step: 0.05 }], ['slow motion', 'timelapse']),
  planned('extractAudio', 'Extract Audio', 'AUDIO', 'Extract the audio stream from a video.', { in: videoIn, out: audioOut }, [select('format', 'Format', ['wav', 'mp3', 'aac'])]),
  planned('audioMix', 'Audio Mix', 'AUDIO', 'Mix two audio tracks with explicit levels.', { in: [plannedPort('primary', 'Primary', 'audio', true), plannedPort('secondary', 'Secondary', 'audio', true)], out: audioOut }, [
    { key: 'primaryVolume', label: 'Primary volume', type: 'slider', default: 1, min: 0, max: 2, step: 0.05 },
    { key: 'secondaryVolume', label: 'Secondary volume', type: 'slider', default: 0.5, min: 0, max: 2, step: 0.05 },
  ]),
  planned('loudnessNormalize', 'Loudness Normalize', 'AUDIO', 'Normalize audio to a target loudness.', { in: audioIn, out: audioOut }, [{ key: 'targetLufs', label: 'Target LUFS', type: 'number', default: -14, min: -24, max: -5, step: 1 }], ['volume', 'lufs']),
  planned('transcribe', 'Transcribe', 'CAPTIONS', 'Transcribe speech into timestamped text.', { in: audioIn, out: [plannedPort('transcript', 'Transcript', 'json')] }, [select('language', 'Language', ['auto', 'vi', 'en'])], ['speech', 'whisper']),
  planned('autoCaptions', 'Auto Captions', 'CAPTIONS', 'Turn a transcript into styled caption cues.', { in: [plannedPort('transcript', 'Transcript', 'json', true)], out: [plannedPort('captions', 'Captions', 'json')] }, [
    select('preset', 'Style', ['clean', 'bold', 'karaoke']),
    { key: 'maxWords', label: 'Words per cue', type: 'number', default: 6, min: 1, max: 12 },
  ], ['subtitles', 'shorts']),
  planned('subtitleBurnIn', 'Burn Subtitles', 'CAPTIONS', 'Render caption cues directly into a video.', { in: [plannedPort('video', 'Video', 'video', true), plannedPort('captions', 'Captions', 'json', true)], out: videoOut }, [select('safeArea', 'Safe area', ['shorts', 'reels', 'tiktok', 'standard'])]),
  planned('sceneDetect', 'Scene Detect', 'VIDEO', 'Detect shot boundaries and return scene timestamps.', { in: videoIn, out: [plannedPort('scenes', 'Scenes', 'json')] }, [{ key: 'threshold', label: 'Sensitivity', type: 'slider', default: 0.4, min: 0.1, max: 0.9, step: 0.05 }]),
  planned('clipSelector', 'Clip Selector', 'AI', 'Select promising moments from scenes or a transcript.', { in: [plannedPort('source', 'Source', 'json', true)], out: [plannedPort('clips', 'Clips', 'json')] }, [{ key: 'goal', label: 'Selection goal', type: 'textarea', default: '', placeholder: 'Find strong hooks…' }], ['highlights', 'shorts']),
  planned('shortComposer', 'Short Composer', 'VIDEO', 'Compose selected clips into a short-form sequence.', { in: [plannedPort('clips', 'Clips', 'json', true)], out: videoOut }, [
    { key: 'targetSeconds', label: 'Target duration (s)', type: 'number', default: 30, min: 5, max: 180 },
    select('aspectRatio', 'Aspect ratio', ['9:16', '1:1', '16:9'], '9:16'),
  ], ['shorts', 'reels']),
  planned('socialExport', 'Social Export', 'OUTPUT', 'Render a platform-ready social media file.', { in: videoIn, out: [plannedPort('artifact', 'Artifact', 'artifact')] }, [select('platform', 'Platform', ['youtube-shorts', 'tiktok', 'instagram-reels'])], ['shorts', 'reels']),
  planned('batchRender', 'Batch Render', 'OUTPUT', 'Render every item in a batch manifest.', { in: [plannedPort('items', 'Items', 'json', true)], out: [plannedPort('artifacts', 'Artifacts', 'json')] }, [{ key: 'outputDir', label: 'Output directory', type: 'file-picker', pickerMode: 'directory', default: '' }]),
  planned('contentBrief', 'Content Brief', 'MARKETING', 'Generate a structured campaign brief.', { in: [plannedPort('input', 'Input', 'any')], out: [plannedPort('brief', 'Brief', 'json')] }, [{ key: 'objective', label: 'Objective', type: 'textarea', default: '' }]),
  planned('hookGenerator', 'Hook Generator', 'MARKETING', 'Generate multiple opening hooks.', { in: [plannedPort('brief', 'Brief', 'any', true)], out: [plannedPort('hooks', 'Hooks', 'json')] }, [{ key: 'count', label: 'Variants', type: 'number', default: 5, min: 1, max: 20 }], ['shorts']),
  planned('shortScript', 'Short Script', 'MARKETING', 'Turn a brief and hook into a concise script.', { in: [plannedPort('brief', 'Brief', 'any', true)], out: [plannedPort('script', 'Script', 'text')] }, [{ key: 'durationSeconds', label: 'Target duration (s)', type: 'number', default: 30, min: 5, max: 180 }]),
  planned('titleCaptionGenerator', 'Title / Caption', 'MARKETING', 'Generate platform-aware titles and captions.', { in: [plannedPort('content', 'Content', 'any', true)], out: [plannedPort('copy', 'Copy', 'json')] }, [select('platform', 'Platform', ['youtube', 'tiktok', 'instagram'])]),
  planned('hashtagKeywordPack', 'Hashtag / Keywords', 'MARKETING', 'Generate a focused discoverability keyword pack.', { in: [plannedPort('content', 'Content', 'any', true)], out: [plannedPort('keywords', 'Keywords', 'json')] }, [{ key: 'count', label: 'Count', type: 'number', default: 12, min: 3, max: 30 }]),
  planned('ctaGenerator', 'CTA Generator', 'MARKETING', 'Generate calls to action for a campaign goal.', { in: [plannedPort('content', 'Content', 'any', true)], out: [plannedPort('ctas', 'CTAs', 'json')] }, [select('tone', 'Tone', ['direct', 'friendly', 'urgent'])]),
  planned('platformVariant', 'Platform Variant', 'MARKETING', 'Adapt copy for several social platforms.', { in: [plannedPort('copy', 'Copy', 'text', true)], out: [plannedPort('variants', 'Variants', 'json')] }, [select('platforms', 'Platforms', ['all', 'youtube', 'tiktok', 'instagram'])]),
  planned('utmBuilder', 'UTM Builder', 'MARKETING', 'Build a deterministic tracked campaign URL.', { in: [plannedPort('url', 'URL', 'text', true)], out: [plannedPort('url', 'Tracked URL', 'text')] }, [
    { key: 'source', label: 'Source', type: 'text', default: '' },
    { key: 'campaign', label: 'Campaign', type: 'text', default: '' },
  ]),
  planned('thumbnailCoverBrief', 'Thumbnail / Cover Brief', 'MARKETING', 'Create a visual brief for a cover or thumbnail.', { in: [plannedPort('content', 'Content', 'any', true)], out: [plannedPort('brief', 'Brief', 'json')] }, [select('platform', 'Platform', ['youtube', 'tiktok', 'instagram'])]),
  planned('publishYouTube', 'Publish YouTube', 'OUTPUT', 'Publish a rendered video to YouTube.', { in: [plannedPort('video', 'Video', 'video', true), plannedPort('metadata', 'Metadata', 'json')], out: [plannedPort('result', 'Result', 'json')] }, [select('privacy', 'Privacy', ['private', 'unlisted', 'public'])], ['shorts']),
  planned('publishTikTok', 'Publish TikTok', 'OUTPUT', 'Publish a rendered video to TikTok.', { in: [plannedPort('video', 'Video', 'video', true), plannedPort('metadata', 'Metadata', 'json')], out: [plannedPort('result', 'Result', 'json')] }, [select('privacy', 'Privacy', ['private', 'public'])]),
  planned('publishInstagramReels', 'Publish Instagram Reels', 'OUTPUT', 'Publish a rendered video as an Instagram Reel.', { in: [plannedPort('video', 'Video', 'video', true), plannedPort('metadata', 'Metadata', 'json')], out: [plannedPort('result', 'Result', 'json')] }, [], ['instagram', 'reels']),
  planned('schedulePublish', 'Schedule Publish', 'MARKETING', 'Schedule a prepared publishing action.', { in: [plannedPort('publication', 'Publication', 'json', true)], out: [plannedPort('schedule', 'Schedule', 'json')] }, [{ key: 'publishAt', label: 'Publish at', type: 'text', default: '', placeholder: '2026-08-14 09:00' }]),
  planned('analyticsSnapshot', 'Analytics Snapshot', 'MARKETING', 'Fetch a point-in-time performance snapshot.', { in: [plannedPort('publication', 'Publication', 'json', true)], out: [plannedPort('analytics', 'Analytics', 'json')] }, [select('window', 'Window', ['24h', '7d', '30d'])]),
  planned('compareVariants', 'Compare Variants', 'MARKETING', 'Compare content variants against a chosen metric.', { in: [plannedPort('variants', 'Variants', 'json', true)], out: [plannedPort('comparison', 'Comparison', 'json')] }, [select('metric', 'Metric', ['views', 'watch-time', 'engagement', 'clicks'])]),
];

/** Runtime Contract V2 metadata is assigned in one place so every node has an
 * explicit schema version and scheduler participation mode.
 *
 * The 4 YouTube-automation nodes (audioCover/backgroundMedia/soundwaveVisualizer/
 * previewExport) are full runtime nodes with inline body renderers AND Rust
 * executors (Phase 2): they run via `start_run` and produce a real MP4 through
 * the FFmpeg filtergraph engine. They keep `maturity: 'beta'` (the visualizer
 * pipeline is newer than the stable canonical nodes) but are `executionMode:
 * 'runtime'` + `registryState: 'canonical'`, mirroring the Rust REGISTRY's
 * execute_v2 specs with registered executors. */
const YOUTUBE_AUTOMATION_TYPES = new Set([
  'audioCover',
  'backgroundMedia',
  'soundwaveVisualizer',
  'previewExport',
]);

export const NODE_DEFINITIONS: NodeDefinition[] = [...RAW_NODE_DEFINITIONS.map((definition) => {
  if (definition.type === 'markdownNote') {
    return { ...definition, version: 2, executionMode: 'annotation' as ExecutionMode, maturity: 'stable' as const };
  }
  if (YOUTUBE_AUTOMATION_TYPES.has(definition.type)) {
    // Phase 2 landed the Rust executors + FFmpeg filtergraph builder, so these
    // are now full runtime nodes: the controller's run guard no longer blocks
    // them and `start_run` produces a real MP4. Keep the beta maturity the
    // definition declares; stamp the v2 schema version + the runtime execution
    // mode + flip registryState to canonical (the Rust REGISTRY now mirrors
    // them as execute_v2 specs with registered executors). RAW_NODE_DEFINITIONS
    // entries omit executionMode the way the canonical nodes do — it is assigned
    // here so the runtime-contract assertion sees 'runtime', matching the
    // shared fixture.
    return {
      ...definition,
      version: 2,
      executionMode: 'runtime' as ExecutionMode,
      executable: true,
      registryState: 'canonical' as RegistryState,
    };
  }
  return { ...definition, version: 2, executionMode: 'runtime' as ExecutionMode, maturity: 'stable' as const };
}), ...PLANNED_NODE_DEFINITIONS];

export const NODE_DEFINITION_MAP: Record<string, NodeDefinition> = Object.fromEntries(
  NODE_DEFINITIONS.map((def) => [def.type, def]),
);

export function getDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITION_MAP[type];
}
