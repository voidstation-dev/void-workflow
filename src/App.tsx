import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { NodeLibrary } from "@/components/canvas/NodeLibrary";
import { WorkflowCanvas } from "@/components/canvas/WorkflowCanvas";
import { ConsolePanel } from "@/components/canvas/ConsolePanel";
import { useWorkflowStore } from "@/store/workflowStore";
import "./App.css";

function App() {
  const [dbPath, setDbPath] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [currentRunId, setCurrentRunId] = useState<number | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const path = await invoke<string>("init_project");
        setDbPath(path);
        
        // MVP1 Project ID is just 1 for now
        const graphJson = await invoke<string>("load_workflow", { projectId: 1 });
        const parsed = JSON.parse(graphJson);
        useWorkflowStore.getState().setNodes(parsed.nodes || []);
        useWorkflowStore.getState().setEdges(parsed.edges || []);
      } catch (err) {
        setError(String(err));
      }
    }
    init();
  }, []);

  const handleSave = async () => {
    try {
      const state = useWorkflowStore.getState();
      const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
      await invoke("save_workflow", { projectId: 1, graphJson });
      alert("Workflow saved successfully!");
    } catch (err) {
      alert("Failed to save workflow: " + String(err));
    }
  };

  const handleRun = async () => {
    try {
      const state = useWorkflowStore.getState();
      const graphJson = JSON.stringify({ nodes: state.nodes, edges: state.edges });
      const runId = await invoke<number>("start_run", { projectId: 1, graphJson });
      setCurrentRunId(runId);
    } catch (err) {
      alert("Failed to start workflow: " + String(err));
    }
  };

  const handleStop = async () => {
    if (currentRunId === null) return;
    try {
      await invoke("cancel_run", { runId: currentRunId });
      setCurrentRunId(null);
    } catch (err) {
      alert("Failed to cancel workflow: " + String(err));
    }
  };

  const handleOpenFolder = async () => {
    // For MVP1, just open run ID 1 since we hardcoded it in start_run.
    // When we make it dynamic, we'll store the latest completed run ID.
    const runId = currentRunId || 1;
    try {
      await invoke("open_run_folder", { runId });
    } catch (err) {
      alert("Failed to open folder: " + String(err));
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-gray-950 text-white overflow-hidden">
      {/* Header */}
      <header className="h-12 border-b border-gray-800 bg-gray-900 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-gray-100">Void Workflow</h1>
          
          <div className="flex items-center gap-2 text-xs">
            <div className={`w-2 h-2 rounded-full ${error ? 'bg-red-500' : dbPath ? 'bg-green-500' : 'bg-yellow-500'}`} />
            <span className="text-gray-400">
              {error ? 'Error' : dbPath ? 'Connected' : 'Initializing...'}
            </span>
          </div>
        </div>
        
        {/* We can put toolbar buttons here later */}
        <div className="flex gap-2">
           <button onClick={handleOpenFolder} className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors cursor-pointer">
              Open Output
           </button>
           <button onClick={handleSave} className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition-colors cursor-pointer">
              Save
           </button>
           {currentRunId ? (
             <button onClick={handleStop} className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition-colors cursor-pointer">
                Stop
             </button>
           ) : (
             <button onClick={handleRun} className="px-3 py-1 bg-green-600 hover:bg-green-500 text-white border border-green-500 text-sm rounded transition-colors cursor-pointer">
                Run
             </button>
           )}
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 flex overflow-hidden relative">
        <NodeLibrary />
        <div className="flex-1 flex flex-col relative overflow-hidden">
          <WorkflowCanvas />
          <ConsolePanel />
        </div>
      </main>
    </div>
  );
}

export default App;
