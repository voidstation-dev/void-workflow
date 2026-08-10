import React, { useCallback, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  getOutgoers,
  Connection,
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { useWorkflowStore, AppNode } from '@/store/workflowStore';
import { BaseNode } from '@/components/nodes/BaseNode';

// Map all node types to BaseNode for MVP1 visual phase
const nodeTypes = {
  textInput: BaseNode,
  textTransform: BaseNode,
  delay: BaseNode,
  aiScript: BaseNode,
  fileInput: BaseNode,
  mediaInfo: BaseNode,
  saveArtifact: BaseNode,
  mediaMerge: BaseNode,
  preview: BaseNode,
  markdownNote: BaseNode,
};

function CanvasInner() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } = useWorkflowStore();
  const { screenToFlowPosition, getNodes, getEdges } = useReactFlow();

  const isValidConnection = useCallback(
    (connection: Connection | Edge) => {
      // Prevent self connection
      if (connection.source === connection.target) return false;
      
      const currentNodes = getNodes();
      const currentEdges = getEdges();
      const target = currentNodes.find((node) => node.id === connection.target);
      
      if (!target) return true;

      // Check if target is eventually a source for our current connection's source
      const hasCycle = (node: Node, visited: Set<string> = new Set()) => {
        if (visited.has(node.id)) return false;
        visited.add(node.id);

        const outgoers = getOutgoers(node, currentNodes, currentEdges);
        for (const outgoer of outgoers) {
          if (outgoer.id === connection.source) return true;
          if (hasCycle(outgoer, visited)) return true;
        }
        return false;
      };

      return !hasCycle(target);
    },
    [getNodes, getEdges]
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      const label = event.dataTransfer.getData('application/reactflow-label');

      // Check if the dropped element is valid
      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: AppNode = {
        id: uuidv4(),
        type,
        position,
        data: { label: label || type },
      };

      addNode(newNode);
    },
    [screenToFlowPosition, addNode]
  );

  return (
    <div className="flex-grow h-full w-full bg-gray-950" ref={reactFlowWrapper}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={isValidConnection}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        fitView
        colorMode="dark"
      >
        <Background color="#334155" gap={24} />
        <Controls className="bg-gray-800 border-gray-700 fill-gray-300" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
