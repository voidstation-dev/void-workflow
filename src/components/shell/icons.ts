import {
  Network,
  FolderTree,
  Clock,
  Settings,
  Type,
  Wand,
  Sparkles,
  FileInput,
  Info,
  FileText,
  Save,
  Layers,
  Eye,
  ScrollText,
  Music,
  Image,
  AudioWaveform,
  MonitorPlay,
  Hash,
  ToggleLeft,
  Braces,
  Asterisk,
  File,
  Film,
  AudioLines,
  Video,
  Package,
  type LucideIcon,
} from 'lucide-react';
import type { IconName, PortType } from '@/nodes/registry';

/**
 * Resolves a registry `IconName` string to its lucide-react component.
 * Single source for node-icon rendering (Node Library, BaseNode, future cards).
 * v1.31 renames: Wand2→Wand, AlertTriangle→TriangleAlert, MoreHorizontal→Ellipsis.
 */
export const NODE_ICONS: Record<IconName, LucideIcon> = {
  Network,
  FolderTree,
  Clock,
  Settings,
  Type,
  Wand,
  Sparkles,
  FileInput,
  Info,
  FileText,
  Save,
  Layers,
  Eye,
  ScrollText,
  Music,
  Image,
  AudioWaveform,
  MonitorPlay,
};

export function getNodeIcon(name: IconName): LucideIcon {
  return NODE_ICONS[name] ?? FileText;
}

/**
 * PORT_ICONS — the 10 typed-port family icons (plan §13, DS §10.2).
 * Icon is a PRIMARY type cue (shape is the other primary; color is secondary).
 * `File` collides with the node-icon `FileInput` only by name — imported here
 * as the port family icon, used only via getPortIcon.
 */
export const PORT_ICONS: Record<PortType, LucideIcon> = {
  text: Type,
  number: Hash,
  boolean: ToggleLeft,
  json: Braces,
  any: Asterisk,
  file: File,
  media: Film,
  audio: AudioLines,
  video: Video,
  artifact: Package,
};

export function getPortIcon(type: PortType): LucideIcon {
  return PORT_ICONS[type] ?? Asterisk;
}