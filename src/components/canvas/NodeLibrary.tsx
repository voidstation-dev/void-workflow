import React from 'react';

const NODE_TYPES = [
  { type: 'textInput', label: 'Text Input' },
  { type: 'textTransform', label: 'Text Transform' },
  { type: 'delay', label: 'Delay' },
  { type: 'aiScript', label: 'AI Script (Gemini)' },
  { type: 'fileInput', label: 'Local File Input' },
  { type: 'mediaInfo', label: 'Media Info' },
  { type: 'saveText', label: 'Save Text' },
  { type: 'saveJson', label: 'Save JSON' },
  { type: 'saveArtifact', label: 'Save Artifact' },
  { type: 'mediaMerge', label: 'Media Merge' },
  { type: 'preview', label: 'Preview' },
  { type: 'markdownNote', label: 'Markdown Note' },
];

export function NodeLibrary() {
  const onDragStart = (event: React.DragEvent, nodeType: string, nodeLabel: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', nodeLabel);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="w-64 bg-gray-900 border-r border-gray-800 p-4 overflow-y-auto flex flex-col gap-2 h-full">
      <h2 className="text-gray-100 font-semibold mb-2">Node Library</h2>
      <div className="text-xs text-gray-400 mb-4">Drag nodes to canvas</div>
      
      {NODE_TYPES.map((node) => (
        <div
          key={node.type}
          className="p-3 bg-gray-800 border border-gray-700 rounded-lg cursor-grab hover:bg-gray-700 transition-colors text-sm text-gray-200"
          onDragStart={(event) => onDragStart(event, node.type, node.label)}
          draggable
        >
          {node.label}
        </div>
      ))}
    </aside>
  );
}
