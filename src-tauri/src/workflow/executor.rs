use super::artifact::ArtifactManager;
use super::graph::ExecutableGraph;
use super::model::{Node, NodeExecutionResult, NodeInputs, NodeState};
use crate::error::{AppError, Result};
use crate::runtime::RuntimeServices;
use async_trait::async_trait;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::Instant;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::{mpsc, Semaphore};
use tokio_util::sync::CancellationToken;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeStatusEvent {
    pub run_id: i64,
    pub node_id: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEvent {
    pub run_id: i64,
    pub node_id: Option<String>,
    pub message: String,
    pub level: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeResultEvent {
    pub run_id: i64,
    pub node_id: String,
    #[serde(flatten)]
    pub result: NodeExecutionResult,
    pub duration_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunStatusEvent {
    pub run_id: i64,
    pub status: String,
    pub error: Option<String>,
    pub duration_ms: u64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeProgressEvent {
    pub run_id: i64,
    pub node_id: String,
    pub progress: f32,
}

#[async_trait]
pub trait NodeExecutor: Send + Sync {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        artifact_manager: &ArtifactManager,
        runtime: &RuntimeServices,
        progress: ProgressReporter,
    ) -> Result<NodeExecutionResult>;
}

pub type ProgressReporter = Arc<dyn Fn(f32) + Send + Sync>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExecutionMode {
    Execute,
    Annotation,
    Viewer,
    Planned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PortKind {
    Text,
    Number,
    Boolean,
    Json,
    File,
    Media,
    Audio,
    Video,
    Artifact,
    Any,
}

#[derive(Debug, Clone)]
pub struct NodeSpec {
    pub version: u32,
    pub execution_mode: ExecutionMode,
    pub inputs: HashMap<String, PortKind>,
    pub required_inputs: HashSet<String>,
    pub outputs: HashMap<String, PortKind>,
}

impl NodeSpec {
    pub fn execute(inputs: &[(&str, PortKind)], outputs: &[(&str, PortKind)]) -> Self {
        Self::execute_v2(
            inputs,
            outputs,
            &inputs.iter().map(|(id, _)| *id).collect::<Vec<_>>(),
        )
    }

    pub fn execute_v2(
        inputs: &[(&str, PortKind)],
        outputs: &[(&str, PortKind)],
        required_inputs: &[&str],
    ) -> Self {
        Self {
            version: 2,
            execution_mode: ExecutionMode::Execute,
            inputs: inputs
                .iter()
                .map(|(id, kind)| ((*id).into(), *kind))
                .collect(),
            required_inputs: required_inputs.iter().map(|id| (*id).into()).collect(),
            outputs: outputs
                .iter()
                .map(|(id, kind)| ((*id).into(), *kind))
                .collect(),
        }
    }

    pub fn planned(
        inputs: &[(&str, PortKind)],
        outputs: &[(&str, PortKind)],
        required_inputs: &[&str],
    ) -> Self {
        Self {
            version: 1,
            execution_mode: ExecutionMode::Planned,
            inputs: inputs
                .iter()
                .map(|(id, kind)| ((*id).into(), *kind))
                .collect(),
            required_inputs: required_inputs.iter().map(|id| (*id).into()).collect(),
            outputs: outputs
                .iter()
                .map(|(id, kind)| ((*id).into(), *kind))
                .collect(),
        }
    }
}

pub struct NodeRegistry {
    executors: HashMap<String, Box<dyn NodeExecutor>>,
    specs: HashMap<String, NodeSpec>,
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
            specs: HashMap::new(),
        }
    }

    pub fn register<T: NodeExecutor + 'static>(
        &mut self,
        node_type: &str,
        spec: NodeSpec,
        executor: T,
    ) {
        self.specs.insert(node_type.to_string(), spec);
        self.executors
            .insert(node_type.to_string(), Box::new(executor));
    }

    pub fn register_non_runtime(&mut self, node_type: &str, spec: NodeSpec) {
        self.specs.insert(node_type.to_string(), spec);
    }

    pub fn get(&self, node_type: &str) -> Option<&dyn NodeExecutor> {
        self.executors.get(node_type).map(|value| value.as_ref())
    }

    pub fn spec(&self, node_type: &str) -> Option<&NodeSpec> {
        self.specs.get(node_type)
    }

    #[cfg(test)]
    pub fn specs(&self) -> &HashMap<String, NodeSpec> {
        &self.specs
    }
}

type TaskResult = (String, Result<NodeExecutionResult>, u64);

pub struct Scheduler {
    graph: ExecutableGraph,
    registry: Arc<NodeRegistry>,
    app_handle: AppHandle,
    run_id: i64,
    artifact_manager: ArtifactManager,
    semaphore: Arc<Semaphore>,
}

impl Scheduler {
    pub fn new(
        graph: ExecutableGraph,
        registry: Arc<NodeRegistry>,
        app_handle: AppHandle,
        run_id: i64,
    ) -> Result<Self> {
        let state = app_handle.state::<crate::AppState>();
        let artifact_manager = ArtifactManager::new_in(&state.runtime.output_root(), run_id)?;
        let semaphore = Arc::new(Semaphore::new(state.runtime.settings().concurrency));
        Ok(Self {
            graph,
            registry,
            app_handle,
            run_id,
            artifact_manager,
            semaphore,
        })
    }

    pub async fn run(&self, cancel_token: CancellationToken) -> Result<()> {
        let started = Instant::now();
        self.emit_run("running", None, 0);

        let mut states: HashMap<String, NodeState> = self
            .graph
            .nodes
            .keys()
            .map(|id| (id.clone(), NodeState::Pending))
            .collect();
        let mut outputs: HashMap<String, NodeExecutionResult> = HashMap::new();
        let mut in_degree: HashMap<String, usize> = self
            .graph
            .nodes
            .keys()
            .map(|id| {
                (
                    id.clone(),
                    self.graph.reverse_adjacency.get(id).map_or(0, Vec::len),
                )
            })
            .collect();
        let (tx, mut rx) = mpsc::channel::<TaskResult>(32);
        let mut active_tasks = 0usize;

        for node_id in self
            .graph
            .topological_order
            .iter()
            .filter(|id| in_degree[*id] == 0)
        {
            self.spawn_node(node_id.clone(), &outputs, tx.clone(), cancel_token.clone());
            active_tasks += 1;
        }

        while active_tasks > 0 {
            let Some((node_id, result, duration_ms)) = rx.recv().await else {
                break;
            };
            active_tasks -= 1;
            match result {
                Ok(result) => {
                    states.insert(node_id.clone(), NodeState::Success);
                    self.emit_node_status(&node_id, "success", None);
                    let _ = self.app_handle.emit(
                        "node-progress",
                        NodeProgressEvent {
                            run_id: self.run_id,
                            node_id: node_id.clone(),
                            progress: 1.0,
                        },
                    );
                    self.persist_node_result(&node_id, &result, duration_ms);
                    let event = NodeResultEvent {
                        run_id: self.run_id,
                        node_id: node_id.clone(),
                        result: result.clone(),
                        duration_ms,
                    };
                    let _ = self.app_handle.emit("node-result", &event);
                    outputs.insert(node_id.clone(), result);

                    for neighbor in self.graph.adjacency.get(&node_id).into_iter().flatten() {
                        let degree = in_degree.get_mut(neighbor).unwrap();
                        *degree -= 1;
                        if *degree == 0 && states.get(neighbor) == Some(&NodeState::Pending) {
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
                Err(error)
                    if matches!(error, AppError::Cancelled(_)) || cancel_token.is_cancelled() =>
                {
                    states.insert(node_id.clone(), NodeState::Cancelled);
                    self.emit_node_status(&node_id, "cancelled", Some(error.to_string()));
                }
                Err(error) => {
                    states.insert(node_id.clone(), NodeState::Failed);
                    let message = error.to_string();
                    self.emit_node_status(&node_id, "failed", Some(message.clone()));
                    let _ = self.app_handle.emit(
                        "node-failed",
                        NodeStatusEvent {
                            run_id: self.run_id,
                            node_id: node_id.clone(),
                            status: "failed".into(),
                            message: Some(message.clone()),
                        },
                    );
                    let _ = self.app_handle.emit(
                        "workflow-log",
                        LogEvent {
                            run_id: self.run_id,
                            node_id: Some(node_id.clone()),
                            message: message.clone(),
                            level: "error".into(),
                        },
                    );
                    self.persist_node_terminal(&node_id, "Failed", Some(&message));
                    self.cascade_skip(&node_id, &mut states);
                }
            }
        }

        let duration_ms = started.elapsed().as_millis() as u64;
        let (status, error) = if cancel_token.is_cancelled() {
            ("cancelled", None)
        } else if states.values().any(|state| *state == NodeState::Failed) {
            ("failed", Some("One or more nodes failed".to_string()))
        } else {
            ("completed", None)
        };
        self.persist_run_terminal(status);
        self.emit_run(status, error, duration_ms);
        let terminal_event = match status {
            "completed" => "run-completed",
            "failed" => "run-failed",
            _ => "run-cancelled",
        };
        let _ = self.app_handle.emit(
            terminal_event,
            RunStatusEvent {
                run_id: self.run_id,
                status: status.into(),
                error: None,
                duration_ms,
            },
        );
        self.app_handle
            .state::<crate::AppState>()
            .running_tasks
            .lock()
            .unwrap()
            .remove(&self.run_id);
        Ok(())
    }

    fn spawn_node(
        &self,
        node_id: String,
        outputs: &HashMap<String, NodeExecutionResult>,
        tx: mpsc::Sender<TaskResult>,
        cancel_token: CancellationToken,
    ) {
        let node = self.graph.nodes[&node_id].clone();
        let inputs_result = self.resolve_inputs(&node_id, outputs);
        let registry = self.registry.clone();
        let artifact_manager = self.artifact_manager.clone();
        let runtime = self.app_handle.state::<crate::AppState>().runtime.clone();
        let semaphore = self.semaphore.clone();
        let progress_app = self.app_handle.clone();
        let progress_node_id = node_id.clone();
        let progress_run_id = self.run_id;
        let progress: ProgressReporter = Arc::new(move |value| {
            let _ = progress_app.emit(
                "node-progress",
                NodeProgressEvent {
                    run_id: progress_run_id,
                    node_id: progress_node_id.clone(),
                    progress: value.clamp(0.0, 1.0),
                },
            );
        });
        self.emit_node_status(&node_id, "running", None);
        let _ = self.app_handle.emit(
            "node-progress",
            NodeProgressEvent {
                run_id: self.run_id,
                node_id: node_id.clone(),
                progress: 0.0,
            },
        );
        let _ = self.app_handle.emit(
            "node-started",
            NodeStatusEvent {
                run_id: self.run_id,
                node_id: node_id.clone(),
                status: "running".into(),
                message: None,
            },
        );
        self.persist_node_started(&node_id);

        tokio::spawn(async move {
            let started = Instant::now();
            let result = match inputs_result {
                Err(error) => Err(error),
                Ok(_inputs) if cancel_token.is_cancelled() => {
                    Err(AppError::Cancelled("Workflow cancelled".into()))
                }
                Ok(inputs) => match registry.get(&node.node_type) {
                    Some(executor) => {
                        let permit_result = tokio::select! {
                            permit = semaphore.acquire_owned() => permit.map_err(|_| AppError::Internal("Runtime concurrency limiter closed.".into())),
                            _ = cancel_token.cancelled() => Err(AppError::Cancelled("Workflow cancelled while waiting to execute.".into())),
                        };
                        match permit_result {
                            Ok(permit) => {
                                let result = executor
                                    .execute(
                                        &node,
                                        &inputs,
                                        cancel_token,
                                        &artifact_manager,
                                        &runtime,
                                        progress,
                                    )
                                    .await;
                                drop(permit);
                                result
                            }
                            Err(error) => Err(error),
                        }
                    }
                    None => Err(AppError::Internal(format!(
                        "No executor for {}",
                        node.node_type
                    ))),
                },
            };
            let _ = tx
                .send((node_id, result, started.elapsed().as_millis() as u64))
                .await;
        });
    }

    fn resolve_inputs(
        &self,
        node_id: &str,
        outputs: &HashMap<String, NodeExecutionResult>,
    ) -> Result<NodeInputs> {
        let mut inputs = NodeInputs::new();
        for binding in self
            .graph
            .incoming_bindings
            .get(node_id)
            .into_iter()
            .flatten()
        {
            let source_result = outputs.get(&binding.source).ok_or_else(|| {
                AppError::Internal(format!("Missing result for dependency {}", binding.source))
            })?;
            let value = source_result
                .outputs
                .get(&binding.source_port)
                .ok_or_else(|| {
                    AppError::Internal(format!(
                        "Node {} did not produce declared output port {}",
                        binding.source, binding.source_port
                    ))
                })?;
            if inputs
                .insert(binding.target_port.clone(), value.clone())
                .is_some()
            {
                return Err(AppError::Internal(format!(
                    "Duplicate value for input {}.{}",
                    node_id, binding.target_port
                )));
            }
        }
        Ok(inputs)
    }

    fn emit_node_status(&self, node_id: &str, status: &str, message: Option<String>) {
        let _ = self.app_handle.emit(
            "node-status",
            NodeStatusEvent {
                run_id: self.run_id,
                node_id: node_id.into(),
                status: status.into(),
                message,
            },
        );
    }

    fn emit_run(&self, status: &str, error: Option<String>, duration_ms: u64) {
        let event = RunStatusEvent {
            run_id: self.run_id,
            status: status.into(),
            error,
            duration_ms,
        };
        let _ = self.app_handle.emit("run-status", &event);
        if status == "running" {
            let _ = self.app_handle.emit("run-started", event);
        }
    }

    fn cascade_skip(&self, node_id: &str, states: &mut HashMap<String, NodeState>) {
        for neighbor in self.graph.adjacency.get(node_id).into_iter().flatten() {
            if states.get(neighbor) == Some(&NodeState::Pending) {
                states.insert(neighbor.clone(), NodeState::Skipped);
                self.emit_node_status(
                    neighbor,
                    "skipped",
                    Some("Upstream dependency failed".into()),
                );
                let _ = self.app_handle.emit(
                    "node-skipped",
                    NodeStatusEvent {
                        run_id: self.run_id,
                        node_id: neighbor.clone(),
                        status: "skipped".into(),
                        message: Some("Upstream dependency failed".into()),
                    },
                );
                self.persist_node_terminal(neighbor, "Skipped", None);
                self.cascade_skip(neighbor, states);
            }
        }
    }

    fn with_db(&self, action: impl FnOnce(&rusqlite::Connection)) {
        if let Ok(guard) = self.app_handle.state::<crate::AppState>().db.lock() {
            if let Some(db) = guard.as_ref() {
                action(&db.conn);
            }
        }
    }

    fn persist_node_started(&self, node_id: &str) {
        self.with_db(|conn| {
            let _ = conn.execute(
                "INSERT INTO node_executions (run_id, node_id, status) VALUES (?1, ?2, 'Running')",
                rusqlite::params![self.run_id, node_id],
            );
        });
    }

    fn persist_node_terminal(&self, node_id: &str, status: &str, error: Option<&str>) {
        self.with_db(|conn| { let _ = conn.execute("UPDATE node_executions SET status=?1, completed_at=CURRENT_TIMESTAMP, error=?2 WHERE run_id=?3 AND node_id=?4", rusqlite::params![status, error, self.run_id, node_id]); });
    }

    fn persist_node_result(&self, node_id: &str, result: &NodeExecutionResult, duration_ms: u64) {
        self.persist_node_terminal(node_id, "Success", None);
        let json = serde_json::to_string(result).unwrap_or_else(|_| "{}".into());
        self.with_db(|conn| {
            let _ = conn.execute("INSERT INTO node_results (run_id, node_id, result_json, duration_ms) VALUES (?1, ?2, ?3, ?4)", rusqlite::params![self.run_id, node_id, json, duration_ms as i64]);
            for artifact in &result.artifacts {
                let metadata = artifact.metadata.to_string();
                let _ = conn.execute("INSERT INTO run_artifacts (run_id, node_id, artifact_id, kind, path, mime, size, metadata_json) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)", rusqlite::params![self.run_id, node_id, artifact.id, artifact.kind, artifact.path, artifact.mime, artifact.size as i64, metadata]);
            }
        });
    }

    fn persist_run_terminal(&self, status: &str) {
        self.with_db(|conn| {
            let _ = conn.execute(
                "UPDATE runs SET status=?1, completed_at=CURRENT_TIMESTAMP WHERE id=?2",
                rusqlite::params![status, self.run_id],
            );
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::graph::EdgeBinding;
    use crate::workflow::model::NodeValue;

    #[test]
    fn declared_source_port_maps_to_declared_target_port() {
        let result = NodeExecutionResult::output("caption", NodeValue::Text("hello".into()));
        let binding = EdgeBinding {
            source: "source".into(),
            source_port: "caption".into(),
            target: "target".into(),
            target_port: "prompt".into(),
        };
        let mut inputs = NodeInputs::new();
        inputs.insert(
            binding.target_port,
            result.outputs[&binding.source_port].clone(),
        );
        assert_eq!(inputs["prompt"], NodeValue::Text("hello".into()));
        assert!(!inputs.contains_key("source"));
    }

    #[test]
    fn rust_registry_matches_shared_contract_fixture() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../../contracts/node-runtime-contract.json"
        ))
        .unwrap();
        let object = fixture.as_object().unwrap();
        assert_eq!(
            object.len(),
            crate::workflow::REGISTRY
                .specs()
                .values()
                .filter(|spec| spec.execution_mode != ExecutionMode::Planned)
                .count()
        );
        for (node_type, expected) in object {
            let spec = crate::workflow::REGISTRY.spec(node_type).unwrap();
            let mode = match spec.execution_mode {
                ExecutionMode::Execute => "runtime",
                ExecutionMode::Annotation => "annotation",
                ExecutionMode::Viewer => "viewer",
                ExecutionMode::Planned => "planned",
            };
            assert_eq!(expected["version"], spec.version);
            assert_eq!(expected["executionMode"], mode);
            let kind = |value: PortKind| match value {
                PortKind::Text => "text",
                PortKind::Number => "number",
                PortKind::Boolean => "boolean",
                PortKind::Json => "json",
                PortKind::File => "file",
                PortKind::Media => "media",
                PortKind::Audio => "audio",
                PortKind::Video => "video",
                PortKind::Artifact => "artifact",
                PortKind::Any => "any",
            };
            for (port, expected_kind) in expected["inputs"].as_object().unwrap() {
                assert_eq!(expected_kind, kind(spec.inputs[port]));
            }
            for (port, expected_kind) in expected["outputs"].as_object().unwrap() {
                assert_eq!(expected_kind, kind(spec.outputs[port]));
            }
            assert_eq!(
                expected["inputs"].as_object().unwrap().len(),
                spec.inputs.len()
            );
            let expected_required: HashSet<String> = expected["requiredInputs"]
                .as_array()
                .unwrap()
                .iter()
                .map(|value| value.as_str().unwrap().to_string())
                .collect();
            assert_eq!(expected_required, spec.required_inputs);
            assert_eq!(
                expected["outputs"].as_object().unwrap().len(),
                spec.outputs.len()
            );
        }
    }
}
