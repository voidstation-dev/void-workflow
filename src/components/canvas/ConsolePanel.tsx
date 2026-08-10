import { useEffect, useState, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';

interface LogEvent {
  run_id: number;
  node_id: string | null;
  message: string;
  level: string;
}

export function ConsolePanel() {
  const [logs, setLogs] = useState<LogEvent[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unlistenLogs = listen<LogEvent>('workflow-log', (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    return () => {
      unlistenLogs.then((f) => f());
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  return (
    <div className="h-48 bg-gray-900 border-t border-gray-800 flex flex-col w-full text-xs font-mono">
      <div className="bg-gray-800 px-4 py-1 border-b border-gray-700 text-gray-300 font-semibold shrink-0">
        Console
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {logs.length === 0 && (
          <div className="text-gray-500 italic">No logs yet. Run the workflow to see output.</div>
        )}
        {logs.map((log, i) => (
          <div key={i} className={`mb-1 ${log.level === 'error' ? 'text-red-400' : 'text-gray-300'}`}>
            <span className="text-gray-500">[{log.run_id}]</span>{' '}
            {log.node_id && <span className="text-blue-400">[{log.node_id}]</span>}{' '}
            {log.message}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
