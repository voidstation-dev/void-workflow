import { Handle, Position } from '@xyflow/react';

type BaseNodeProps = {
  data: {
    label: string;
    [key: string]: any;
  };
  selected?: boolean;
};

export function BaseNode({ data, selected }: BaseNodeProps) {
  return (
    <div
      className={`min-w-[150px] bg-gray-900 border-2 rounded-xl shadow-lg transition-colors ${
        selected ? 'border-blue-500' : 'border-gray-700'
      }`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-blue-500 border-2 border-gray-900"
      />
      
      <div className="px-4 py-3">
        <div className="text-sm font-semibold text-gray-100">{data.label}</div>
        {/* We can add dynamic properties here later based on node type */}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-blue-500 border-2 border-gray-900"
      />
    </div>
  );
}
