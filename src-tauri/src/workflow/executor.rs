use super::artifact::ArtifactManager;
use super::graph::ExecutableGraph;
use super::model::{Node, NodeState};
use crate::error::Result;
use async_trait::async_trait;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
pub struct NodeStatusEvent {
    pub run_id: i64,
    pub node_id: String,
    pub status: String,
}

#[derive(Clone, Serialize)]
pub struct LogEvent {
    pub run_id: i64,
    pub node_id: Option<String>,
    pub message: String,
    pub level: String,
}

#[async_trait]
pub trait NodeExecutor: Send + Sync {
    async fn execute(
        &self,
        node: &Node,
        inputs: &HashMap<String, serde_json::Value>,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
    ) -> Result<serde_json::Value>;
}

pub struct NodeRegistry {
    executors: HashMap<String, Box<dyn NodeExecutor>>,
}

impl Default for NodeRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl NodeRegistry {
    pub fn new() -> Self {
        Self {
            executors: HashMap::new(),
        }
    }

    pub fn register<T: NodeExecutor + 'static>(&mut self, node_type: &str, executor: T) {
        self.executors
            .insert(node_type.to_string(), Box::new(executor));
    }

    pub fn get(&self, node_type: &str) -> Option<&dyn NodeExecutor> {
        self.executors.get(node_type).map(|b| b.as_ref())
    }
}

pub struct Scheduler {
    graph: ExecutableGraph,
    registry: Arc<NodeRegistry>,
    app_handle: AppHandle,
    run_id: i64,
    artifact_manager: ArtifactManager,
}

impl Scheduler {
    pub fn new(
        graph: ExecutableGraph,
        registry: Arc<NodeRegistry>,
        app_handle: AppHandle,
        run_id: i64,
    ) -> Result<Self> {
        let state = app_handle.state::<crate::AppState>();
        let artifact_manager = ArtifactManager::new(&state.app_dir, run_id)?;
        Ok(Self {
            graph,
            registry,
            app_handle,
            run_id,
            artifact_manager,
        })
    }

    pub async fn run(&self, cancel_token: CancellationToken) -> Result<()> {
        let mut states: HashMap<String, NodeState> = HashMap::new();
        let mut outputs: HashMap<String, serde_json::Value> = HashMap::new();
        let mut in_degree = HashMap::new();

        for node_id in self.graph.nodes.keys() {
            states.insert(node_id.clone(), NodeState::Pending);
            in_degree.insert(
                node_id.clone(),
                self.graph.reverse_adjacency.get(node_id).unwrap().len(),
            );
        }

        let (tx, mut rx) = mpsc::channel(32);
        let mut active_tasks = 0;

        // Start nodes with 0 in-degree
        for (node_id, deg) in &in_degree {
            if *deg == 0 {
                self.spawn_node(node_id.clone(), &outputs, tx.clone(), cancel_token.clone());
                active_tasks += 1;
            }
        }

        while active_tasks > 0 {
            if let Some((node_id, result)) = rx.recv().await {
                active_tasks -= 1;

                match result {
                    Ok(val) => {
                        states.insert(node_id.clone(), NodeState::Success);
                        outputs.insert(node_id.clone(), val);

                        let _ = self.app_handle.emit(
                            "node-status",
                            NodeStatusEvent {
                                run_id: self.run_id,
                                node_id: node_id.clone(),
                                status: "Success".to_string(),
                            },
                        );

                        // Save to DB
                        let state = self.app_handle.state::<crate::AppState>();
                        if let Ok(db_guard) = state.db.lock() {
                            if let Some(db) = db_guard.as_ref() {
                                let _ = db.conn.execute(
                                    "UPDATE node_executions SET status = 'Success', completed_at = CURRENT_TIMESTAMP WHERE run_id = ?1 AND node_id = ?2",
                                    rusqlite::params![self.run_id, node_id],
                                );
                            }
                        }

                        // Decrement in-degree of neighbors
                        if let Some(neighbors) = self.graph.adjacency.get(&node_id) {
                            for neighbor in neighbors {
                                let deg = in_degree.get_mut(neighbor).unwrap();
                                *deg -= 1;
                                if *deg == 0 {
                                    self.spawn_node(
                                        neighbor.clone(),
                                        &outputs,
                                        tx.clone(),
                                        cancel_token.clone(),
                                    );
                                    active_tasks += 1;
                                }
                            }
                        }
                    }
                    Err(e) => {
                        states.insert(node_id.clone(), NodeState::Failed);

                        let _ = self.app_handle.emit(
                            "node-status",
                            NodeStatusEvent {
                                run_id: self.run_id,
                                node_id: node_id.clone(),
                                status: "Failed".to_string(),
                            },
                        );

                        let _ = self.app_handle.emit(
                            "workflow-log",
                            LogEvent {
                                run_id: self.run_id,
                                node_id: Some(node_id.clone()),
                                message: format!("Node failed: {}", e),
                                level: "error".to_string(),
                            },
                        );

                        // Save to DB
                        let state = self.app_handle.state::<crate::AppState>();
                        if let Ok(db_guard) = state.db.lock() {
                            if let Some(db) = db_guard.as_ref() {
                                let _ = db.conn.execute(
                                    "UPDATE node_executions SET status = 'Failed', completed_at = CURRENT_TIMESTAMP WHERE run_id = ?1 AND node_id = ?2",
                                    rusqlite::params![self.run_id, node_id],
                                );
                                let _ = db.conn.execute(
                                    "INSERT INTO run_logs (run_id, node_id, message, level) VALUES (?1, ?2, ?3, 'error')",
                                    rusqlite::params![self.run_id, node_id, format!("Node failed: {}", e)],
                                );
                            }
                        }

                        // Cascade skip
                        self.cascade_skip(&node_id, &mut states);
                    }
                }
            }
        }

        let mut final_status = "Completed";
        for state in states.values() {
            if *state == NodeState::Failed {
                final_status = "Failed";
                break;
            }
        }

        if cancel_token.is_cancelled() {
            final_status = "Cancelled";
        }

        // Save final run status
        let state = self.app_handle.state::<crate::AppState>();
        if let Ok(db_guard) = state.db.lock() {
            if let Some(db) = db_guard.as_ref() {
                let _ = db.conn.execute(
                    "UPDATE runs SET status = ?1, completed_at = CURRENT_TIMESTAMP WHERE id = ?2",
                    rusqlite::params![final_status, self.run_id],
                );
            }
        }

        {
            let mut tasks = state.running_tasks.lock().unwrap();
            tasks.remove(&self.run_id);
        }

        Ok(())
    }

    fn spawn_node(
        &self,
        node_id: String,
        outputs: &HashMap<String, serde_json::Value>,
        tx: mpsc::Sender<(String, Result<serde_json::Value>)>,
        cancel_token: CancellationToken,
    ) {
        let node = self.graph.nodes.get(&node_id).unwrap().clone();
        let registry = self.registry.clone();

        // Prepare inputs from dependencies
        let mut inputs = HashMap::new();
        if let Some(deps) = self.graph.reverse_adjacency.get(&node_id) {
            for dep_id in deps {
                if let Some(out) = outputs.get(dep_id) {
                    inputs.insert(dep_id.clone(), out.clone());
                }
            }
        }

        let run_id = self.run_id;
        let app_handle = self.app_handle.clone();

        let _ = app_handle.emit(
            "node-status",
            NodeStatusEvent {
                run_id,
                node_id: node_id.clone(),
                status: "Running".to_string(),
            },
        );

        // Save to DB
        let state = app_handle.state::<crate::AppState>();
        if let Ok(db_guard) = state.db.lock() {
            if let Some(db) = db_guard.as_ref() {
                let _ = db.conn.execute(
                    "INSERT INTO node_executions (run_id, node_id, status) VALUES (?1, ?2, 'Running')",
                    rusqlite::params![run_id, node_id],
                );
            }
        }

        let artifact_manager = self.artifact_manager.clone();

        tokio::spawn(async move {
            let res = if cancel_token.is_cancelled() {
                Err(crate::error::AppError::Internal(
                    "Workflow Cancelled".to_string(),
                ))
            } else if let Some(executor) = registry.get(&node.node_type) {
                // Here we could pass an event emitter down to the node so it can stream progress
                executor
                    .execute(&node, &inputs, cancel_token, &artifact_manager)
                    .await
            } else {
                Err(crate::error::AppError::Internal(format!(
                    "No executor for {}",
                    node.node_type
                )))
            };
            let _ = tx.send((node_id, res)).await;
        });
    }

    fn cascade_skip(&self, node_id: &str, states: &mut HashMap<String, NodeState>) {
        if let Some(neighbors) = self.graph.adjacency.get(node_id) {
            for neighbor in neighbors {
                if states.get(neighbor) == Some(&NodeState::Pending) {
                    states.insert(neighbor.clone(), NodeState::Skipped);

                    let _ = self.app_handle.emit(
                        "node-status",
                        NodeStatusEvent {
                            run_id: self.run_id,
                            node_id: neighbor.clone(),
                            status: "Skipped".to_string(),
                        },
                    );

                    // Save to DB
                    let state = self.app_handle.state::<crate::AppState>();
                    if let Ok(db_guard) = state.db.lock() {
                        if let Some(db) = db_guard.as_ref() {
                            let _ = db.conn.execute(
                                "INSERT INTO node_executions (run_id, node_id, status, completed_at) VALUES (?1, ?2, 'Skipped', CURRENT_TIMESTAMP)",
                                rusqlite::params![self.run_id, neighbor],
                            );
                        }
                    }

                    self.cascade_skip(neighbor, states);
                }
            }
        }
    }
}
