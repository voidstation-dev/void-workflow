use super::executor::{ExecutionMode, NodeRegistry, PortKind};
use super::model::{Node, WorkflowGraph, WORKFLOW_SCHEMA_VERSION};
use crate::error::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationProblem {
    pub id: String,
    pub severity: String,
    pub code: String,
    pub title: String,
    pub message: String,
    pub hint: Option<String>,
    pub node_id: Option<String>,
    pub edge_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub problems: Vec<ValidationProblem>,
}

impl ValidationProblem {
    fn node(node_id: &str, code: &str, title: &str, message: String, hint: &str) -> Self {
        Self {
            id: format!("node-{node_id}-{code}"),
            severity: "error".into(),
            code: code.into(),
            title: title.into(),
            message,
            hint: Some(hint.into()),
            node_id: Some(node_id.into()),
            edge_id: None,
        }
    }

    fn edge(edge_id: &str, code: &str, title: &str, message: String, hint: &str) -> Self {
        Self {
            id: format!("edge-{edge_id}-{code}"),
            severity: "error".into(),
            code: code.into(),
            title: title.into(),
            message,
            hint: Some(hint.into()),
            node_id: None,
            edge_id: Some(edge_id.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EdgeBinding {
    pub source: String,
    pub source_port: String,
    pub target: String,
    pub target_port: String,
}

#[derive(Debug, Clone)]
pub struct ExecutableGraph {
    pub nodes: HashMap<String, Node>,
    pub adjacency: HashMap<String, Vec<String>>,
    pub reverse_adjacency: HashMap<String, Vec<String>>,
    pub incoming_bindings: HashMap<String, Vec<EdgeBinding>>,
    pub topological_order: Vec<String>,
}

pub fn migrate_graph(mut graph: WorkflowGraph, registry: &NodeRegistry) -> Result<WorkflowGraph> {
    if graph.schema_version > WORKFLOW_SCHEMA_VERSION {
        return Err(AppError::Internal(format!(
            "Unsupported workflow schemaVersion {}; maximum supported is {}",
            graph.schema_version, WORKFLOW_SCHEMA_VERSION
        )));
    }

    let legacy_nodes: HashMap<String, (String, u32)> = graph
        .nodes
        .iter()
        .map(|node| (node.id.clone(), (node.node_type.clone(), node.version)))
        .collect();

    for node in &mut graph.nodes {
        let spec = registry.spec(&node.node_type).ok_or_else(|| {
            AppError::validation(
                "UNKNOWN_NODE_TYPE",
                format!("Unknown node type {}.", node.node_type),
                serde_json::json!({ "nodeId": node.id, "nodeType": node.node_type }),
            )
        })?;
        if node.version <= 1 {
            migrate_node_config(node)?;
            node.version = spec.version;
        }
    }

    for edge in &mut graph.edges {
        let (source_type, source_version) = legacy_nodes.get(&edge.source).ok_or_else(|| {
            AppError::Internal(format!(
                "Edge {} references missing source {}",
                edge.id, edge.source
            ))
        })?;
        let (target_type, target_version) = legacy_nodes.get(&edge.target).ok_or_else(|| {
            AppError::Internal(format!(
                "Edge {} references missing target {}",
                edge.id, edge.target
            ))
        })?;
        let source_spec = registry.spec(source_type).ok_or_else(|| {
            AppError::Internal(format!(
                "Unknown node type {source_type} while migrating edge {}",
                edge.id
            ))
        })?;
        let target_spec = registry.spec(target_type).ok_or_else(|| {
            AppError::Internal(format!(
                "Unknown node type {target_type} while migrating edge {}",
                edge.id
            ))
        })?;

        if *source_version <= 1 {
            edge.source_handle =
                migrate_legacy_port(source_type, edge.source_handle.as_deref(), false);
        }
        if *target_version <= 1 {
            edge.target_handle =
                migrate_legacy_port(target_type, edge.target_handle.as_deref(), true);
        }

        if edge.source_handle.is_none() {
            if source_spec.outputs.len() == 1 {
                edge.source_handle = source_spec.outputs.keys().next().cloned();
            } else {
                return Err(AppError::Internal(format!(
                    "Legacy edge {} has no sourceHandle and {} has {} output ports; migration is ambiguous",
                    edge.id, source_type, source_spec.outputs.len()
                )));
            }
        }
        if edge.target_handle.is_none() {
            if target_spec.inputs.len() == 1 {
                edge.target_handle = target_spec.inputs.keys().next().cloned();
            } else {
                return Err(AppError::Internal(format!(
                    "Legacy edge {} has no targetHandle and {} has {} input ports; migration is ambiguous",
                    edge.id, target_type, target_spec.inputs.len()
                )));
            }
        }
    }

    graph.schema_version = WORKFLOW_SCHEMA_VERSION;
    Ok(graph)
}

fn migrate_node_config(node: &mut Node) -> Result<()> {
    let Some(config) = node.data.extra.as_object_mut() else {
        node.data.extra = serde_json::json!({});
        return Ok(());
    };
    let move_key =
        |config: &mut serde_json::Map<String, serde_json::Value>, old: &str, new: &str| {
            if !config.contains_key(new) {
                if let Some(value) = config.remove(old) {
                    config.insert(new.into(), value);
                }
            }
        };
    match node.node_type.as_str() {
        "textInput" => move_key(config, "text", "content"),
        "delay" if !config.contains_key("seconds") => {
            if let Some(milliseconds) = config.remove("duration").and_then(|value| value.as_f64()) {
                config.insert("seconds".into(), serde_json::json!(milliseconds / 1000.0));
            }
        }
        "fileInput" => move_key(config, "file_path", "path"),
        "aiScript" => {
            move_key(config, "system_prompt", "systemInstructions");
            move_key(config, "user_prompt", "prompt");
        }
        _ => {}
    }
    Ok(())
}

fn migrate_legacy_port(node_type: &str, port: Option<&str>, input: bool) -> Option<String> {
    let legacy = port.unwrap_or(if input { "in" } else { "out" });
    let migrated = match (node_type, input, legacy) {
        ("textInput", false, "out") => Some("text"),
        ("textTransform", _, "in" | "out") => Some("text"),
        ("delay", _, "in" | "out") => Some("value"),
        ("aiScript", true, "in") => Some("input"),
        ("aiScript", false, "out") => Some("text"),
        ("fileInput", false, "out") => Some("file"),
        ("mediaInfo", true, "in") => Some("media"),
        ("mediaInfo", false, "out") => Some("metadata"),
        ("saveText", true, "in") => Some("text"),
        ("saveJson", true, "in") => Some("json"),
        ("saveArtifact", true, "in") => Some("artifact"),
        ("saveArtifact", false, "out") => Some("artifact"),
        ("mediaMerge", true, "in") => Some("video"),
        ("mediaMerge", false, "out") => Some("video"),
        ("preview", true, "in") => Some("input"),
        _ => None,
    };
    migrated
        .map(str::to_string)
        .or_else(|| port.map(str::to_string))
}

pub fn validate_graph(graph: &WorkflowGraph, registry: &NodeRegistry) -> ValidationReport {
    let mut problems = Vec::new();
    if graph.schema_version != WORKFLOW_SCHEMA_VERSION {
        problems.push(ValidationProblem::node(
            "graph",
            "UNSUPPORTED_SCHEMA_VERSION",
            "Workflow version is unsupported",
            format!(
                "Expected schemaVersion {}, received {}.",
                WORKFLOW_SCHEMA_VERSION, graph.schema_version
            ),
            "Save or import the workflow again to run its migration.",
        ));
    }

    let mut nodes: HashMap<&str, &Node> = HashMap::new();
    for node in &graph.nodes {
        if nodes.insert(&node.id, node).is_some() {
            problems.push(ValidationProblem::node(
                &node.id,
                "DUPLICATE_NODE_ID",
                "Duplicate node ID",
                format!("More than one node uses ID {}.", node.id),
                "Duplicate the node from the editor instead of copying its raw ID.",
            ));
        }
        match registry.spec(&node.node_type) {
            None => problems.push(ValidationProblem::node(
                &node.id,
                "UNKNOWN_NODE_TYPE",
                "Unknown node type",
                format!("{} is not registered.", node.node_type),
                "Remove the node or install a version of the app that supports it.",
            )),
            Some(spec) => {
                if node.version != spec.version {
                    problems.push(ValidationProblem::node(
                        &node.id,
                        "UNSUPPORTED_NODE_VERSION",
                        "Node version is unsupported",
                        format!(
                            "{} uses version {}, but version {} is supported.",
                            node.node_type, node.version, spec.version
                        ),
                        "Reload the workflow so its node configuration can migrate.",
                    ));
                }
                if spec.execution_mode == ExecutionMode::Execute
                    && registry.get(&node.node_type).is_none()
                {
                    problems.push(ValidationProblem::node(
                        &node.id,
                        "EXECUTOR_UNAVAILABLE",
                        "Node cannot execute",
                        format!("No runtime executor is registered for {}.", node.node_type),
                        "Remove this UI-only node before running the workflow.",
                    ));
                }
                if spec.execution_mode == ExecutionMode::Planned {
                    problems.push(ValidationProblem::node(
                        &node.id,
                        "PLANNED_NODE_UNAVAILABLE",
                        "Node is available for design only",
                        format!("{} does not have a runtime executor yet.", node.node_type),
                        "Remove this Coming later node before running the workflow.",
                    ));
                }
            }
        }
    }

    let mut occupied_inputs = HashSet::new();
    let mut adjacency: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    for node in &graph.nodes {
        if registry
            .spec(&node.node_type)
            .is_some_and(|spec| spec.execution_mode == ExecutionMode::Execute)
        {
            adjacency.entry(&node.id).or_default();
            in_degree.entry(&node.id).or_default();
        }
    }

    for edge in &graph.edges {
        let Some(source) = nodes.get(edge.source.as_str()).copied() else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "MISSING_SOURCE_NODE",
                "Connection source is missing",
                format!(
                    "Connection {} references missing node {}.",
                    edge.id, edge.source
                ),
                "Delete the broken connection and reconnect the nodes.",
            ));
            continue;
        };
        let Some(target) = nodes.get(edge.target.as_str()).copied() else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "MISSING_TARGET_NODE",
                "Connection target is missing",
                format!(
                    "Connection {} references missing node {}.",
                    edge.id, edge.target
                ),
                "Delete the broken connection and reconnect the nodes.",
            ));
            continue;
        };
        let (Some(source_spec), Some(target_spec)) = (
            registry.spec(&source.node_type),
            registry.spec(&target.node_type),
        ) else {
            continue;
        };
        let Some(source_port) = edge.source_handle.as_deref() else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "MISSING_SOURCE_PORT",
                "Output port is missing",
                "The connection has no sourceHandle.".into(),
                "Reconnect the edge from a visible output port.",
            ));
            continue;
        };
        let Some(target_port) = edge.target_handle.as_deref() else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "MISSING_TARGET_PORT",
                "Input port is missing",
                "The connection has no targetHandle.".into(),
                "Reconnect the edge to a visible input port.",
            ));
            continue;
        };
        let Some(source_kind) = source_spec.outputs.get(source_port) else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "UNKNOWN_SOURCE_PORT",
                "Output port is unknown",
                format!("{}.{} is not a declared output.", source.id, source_port),
                "Reconnect the edge using a current output port.",
            ));
            continue;
        };
        let Some(target_kind) = target_spec.inputs.get(target_port) else {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "UNKNOWN_TARGET_PORT",
                "Input port is unknown",
                format!("{}.{} is not a declared input.", target.id, target_port),
                "Reconnect the edge using a current input port.",
            ));
            continue;
        };
        if !ports_compatible(*source_kind, *target_kind) {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "INCOMPATIBLE_PORT_TYPES",
                "Port types do not match",
                format!(
                    "{} cannot feed {}.",
                    port_kind_name(*source_kind),
                    port_kind_name(*target_kind)
                ),
                "Connect ports with matching types or use a transform node.",
            ));
            continue;
        }
        if !occupied_inputs.insert((target.id.as_str(), target_port)) {
            problems.push(ValidationProblem::edge(
                &edge.id,
                "INPUT_CARDINALITY_EXCEEDED",
                "Input has multiple connections",
                format!("{}.{} accepts one connection.", target.id, target_port),
                "Remove the extra connection.",
            ));
            continue;
        }
        if source_spec.execution_mode == ExecutionMode::Execute
            && target_spec.execution_mode == ExecutionMode::Execute
        {
            adjacency.entry(&source.id).or_default().push(&target.id);
            *in_degree.entry(&target.id).or_default() += 1;
        }
    }

    for node in &graph.nodes {
        if let Some(spec) = registry.spec(&node.node_type) {
            for port in &spec.required_inputs {
                if !occupied_inputs.contains(&(node.id.as_str(), port.as_str())) {
                    problems.push(ValidationProblem::node(
                        &node.id,
                        "REQUIRED_INPUT_MISSING",
                        "Required input is not connected",
                        format!("{}.{} needs an incoming connection.", node.id, port),
                        "Connect a compatible upstream output.",
                    ));
                }
            }
        }
    }

    let mut queue: Vec<&str> = in_degree
        .iter()
        .filter_map(|(id, degree)| (*degree == 0).then_some(*id))
        .collect();
    let mut visited = 0usize;
    while let Some(node_id) = queue.pop() {
        visited += 1;
        for target in adjacency.get(node_id).into_iter().flatten() {
            if let Some(degree) = in_degree.get_mut(target) {
                *degree -= 1;
                if *degree == 0 {
                    queue.push(target);
                }
            }
        }
    }
    if visited != in_degree.len() {
        problems.push(ValidationProblem::node(
            "graph",
            "CYCLE_DETECTED",
            "Workflow contains a cycle",
            "Executable nodes must form a directed acyclic graph.".into(),
            "Remove one connection from the cycle.",
        ));
    }

    ValidationReport {
        valid: problems.is_empty(),
        problems,
    }
}

impl ExecutableGraph {
    pub fn build(graph: &WorkflowGraph, registry: &NodeRegistry) -> Result<Self> {
        let report = validate_graph(graph, registry);
        if !report.valid {
            return Err(AppError::validation(
                "GRAPH_INVALID",
                format!(
                    "The workflow has {} validation problem(s).",
                    report.problems.len()
                ),
                serde_json::to_value(report).unwrap_or(serde_json::Value::Null),
            ));
        }
        if graph.schema_version != WORKFLOW_SCHEMA_VERSION {
            return Err(AppError::Internal(format!(
                "Workflow must be normalized to schemaVersion {} before compilation",
                WORKFLOW_SCHEMA_VERSION
            )));
        }

        let mut nodes = HashMap::new();
        for node in &graph.nodes {
            if nodes.contains_key(&node.id) {
                return Err(AppError::Internal(format!("Duplicate node id {}", node.id)));
            }
            let spec = registry.spec(&node.node_type).ok_or_else(|| {
                AppError::Internal(format!("Unknown node type {}", node.node_type))
            })?;
            if spec.version != node.version {
                return Err(AppError::Internal(format!(
                    "Unsupported {} node version {}; expected {}",
                    node.node_type, node.version, spec.version
                )));
            }
            if spec.execution_mode == ExecutionMode::Execute {
                if registry.get(&node.node_type).is_none() {
                    return Err(AppError::Internal(format!(
                        "No runtime executor for {}",
                        node.node_type
                    )));
                }
                nodes.insert(node.id.clone(), node.clone());
            }
        }

        let mut adjacency = HashMap::new();
        let mut reverse_adjacency = HashMap::new();
        let mut incoming_bindings: HashMap<String, Vec<EdgeBinding>> = HashMap::new();
        let mut in_degree = HashMap::new();
        for node_id in nodes.keys() {
            adjacency.insert(node_id.clone(), Vec::new());
            reverse_adjacency.insert(node_id.clone(), Vec::new());
            incoming_bindings.insert(node_id.clone(), Vec::new());
            in_degree.insert(node_id.clone(), 0usize);
        }

        let all_nodes: HashMap<&str, &Node> =
            graph.nodes.iter().map(|n| (n.id.as_str(), n)).collect();
        let mut occupied_inputs = HashSet::new();
        let mut executable_edge_count = 0usize;

        for edge in &graph.edges {
            let source_node = all_nodes.get(edge.source.as_str()).ok_or_else(|| {
                AppError::Internal(format!(
                    "Edge {} references missing source {}",
                    edge.id, edge.source
                ))
            })?;
            let target_node = all_nodes.get(edge.target.as_str()).ok_or_else(|| {
                AppError::Internal(format!(
                    "Edge {} references missing target {}",
                    edge.id, edge.target
                ))
            })?;
            let source_spec = registry.spec(&source_node.node_type).unwrap();
            let target_spec = registry.spec(&target_node.node_type).unwrap();

            let source_port = edge.source_handle.as_deref().ok_or_else(|| {
                AppError::Internal(format!("Edge {} is missing sourceHandle", edge.id))
            })?;
            let target_port = edge.target_handle.as_deref().ok_or_else(|| {
                AppError::Internal(format!("Edge {} is missing targetHandle", edge.id))
            })?;
            let source_kind = source_spec.outputs.get(source_port).ok_or_else(|| {
                AppError::Internal(format!(
                    "Edge {} references unknown output port {}.{}",
                    edge.id, source_node.id, source_port
                ))
            })?;
            let target_kind = target_spec.inputs.get(target_port).ok_or_else(|| {
                AppError::Internal(format!(
                    "Edge {} references unknown input port {}.{}",
                    edge.id, target_node.id, target_port
                ))
            })?;
            if !ports_compatible(*source_kind, *target_kind) {
                return Err(AppError::Internal(format!(
                    "Edge {} has incompatible ports {:?} -> {:?}",
                    edge.id, source_kind, target_kind
                )));
            }
            if !occupied_inputs.insert((edge.target.clone(), target_port.to_string())) {
                return Err(AppError::Internal(format!(
                    "Input {}.{} has more than one connection",
                    edge.target, target_port
                )));
            }

            // Viewer edges are validated like all other edges, but remain UI
            // result bindings rather than scheduler dependencies. Annotation
            // nodes declare no ports, so an attempted annotation edge fails
            // the authoritative port lookup above.
            if source_spec.execution_mode != ExecutionMode::Execute
                || target_spec.execution_mode != ExecutionMode::Execute
            {
                continue;
            }

            adjacency
                .get_mut(&edge.source)
                .unwrap()
                .push(edge.target.clone());
            reverse_adjacency
                .get_mut(&edge.target)
                .unwrap()
                .push(edge.source.clone());
            incoming_bindings
                .get_mut(&edge.target)
                .unwrap()
                .push(EdgeBinding {
                    source: edge.source.clone(),
                    source_port: source_port.to_string(),
                    target: edge.target.clone(),
                    target_port: target_port.to_string(),
                });
            *in_degree.get_mut(&edge.target).unwrap() += 1;
            executable_edge_count += 1;
        }

        for node in &graph.nodes {
            let spec = registry.spec(&node.node_type).unwrap();
            for port in &spec.required_inputs {
                if !occupied_inputs.contains(&(node.id.clone(), port.clone())) {
                    return Err(AppError::Internal(format!(
                        "Required input {}.{} is not connected",
                        node.id, port
                    )));
                }
            }
        }

        let mut topological_order = Vec::new();
        let mut zero_in_degree: Vec<String> = in_degree
            .iter()
            .filter_map(|(id, degree)| (*degree == 0).then_some(id.clone()))
            .collect();
        let mut processed_edges = 0usize;
        while let Some(source) = zero_in_degree.pop() {
            topological_order.push(source.clone());
            for target in adjacency.get(&source).into_iter().flatten() {
                let degree = in_degree.get_mut(target).unwrap();
                *degree -= 1;
                if *degree == 0 {
                    zero_in_degree.push(target.clone());
                }
                processed_edges += 1;
            }
        }
        if processed_edges != executable_edge_count {
            return Err(AppError::Internal(
                "Cycle detected in executable workflow graph".into(),
            ));
        }

        Ok(Self {
            nodes,
            adjacency,
            reverse_adjacency,
            incoming_bindings,
            topological_order,
        })
    }
}

fn ports_compatible(source: PortKind, target: PortKind) -> bool {
    source == target
        || source == PortKind::Any
        || target == PortKind::Any
        || (target == PortKind::Media
            && matches!(
                source,
                PortKind::File | PortKind::Audio | PortKind::Video | PortKind::Artifact
            ))
        || (matches!(target, PortKind::Audio | PortKind::Video)
            && matches!(
                source,
                PortKind::File | PortKind::Media | PortKind::Artifact
            ))
        || (target == PortKind::Artifact
            && matches!(
                source,
                PortKind::File | PortKind::Media | PortKind::Audio | PortKind::Video
            ))
}

fn port_kind_name(kind: PortKind) -> &'static str {
    match kind {
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
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::{Edge, NodeData};

    fn node(id: &str, node_type: &str) -> Node {
        Node {
            id: id.into(),
            node_type: node_type.into(),
            version: 2,
            data: NodeData::default(),
            extra: Default::default(),
        }
    }
    fn edge(source: &str, target: &str) -> crate::workflow::model::Edge {
        Edge {
            id: format!("{source}-{target}"),
            source: source.into(),
            target: target.into(),
            source_handle: Some("text".into()),
            target_handle: Some("text".into()),
        }
    }

    #[test]
    fn legacy_single_port_edges_are_normalized() {
        let graph = WorkflowGraph {
            schema_version: 0,
            nodes: vec![
                Node {
                    version: 1,
                    ..node("a", "textInput")
                },
                Node {
                    version: 1,
                    ..node("b", "textTransform")
                },
            ],
            edges: vec![Edge {
                source_handle: None,
                target_handle: None,
                ..edge("a", "b")
            }],
        };
        let migrated = migrate_graph(graph, &crate::workflow::REGISTRY).unwrap();
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.edges[0].source_handle.as_deref(), Some("text"));
        assert_eq!(migrated.edges[0].target_handle.as_deref(), Some("text"));
    }

    #[test]
    fn legacy_fixture_migrates_to_v2_without_guessing_ids() {
        let graph: WorkflowGraph = serde_json::from_str(include_str!(
            "../../../tests/fixtures/workflow-v1/single-port.json"
        ))
        .unwrap();
        let migrated = migrate_graph(graph, &crate::workflow::REGISTRY).unwrap();
        assert_eq!(migrated.schema_version, WORKFLOW_SCHEMA_VERSION);
        assert_eq!(migrated.edges[0].source_handle.as_deref(), Some("text"));
        assert_eq!(migrated.edges[0].target_handle.as_deref(), Some("text"));
        assert_eq!(migrated.nodes[0].version, 2);
    }

    #[test]
    fn target_port_binding_is_preserved_and_annotations_are_excluded() {
        let graph = WorkflowGraph {
            schema_version: 2,
            nodes: vec![
                node("a", "textInput"),
                node("b", "textTransform"),
                node("note", "markdownNote"),
                node("viewer", "preview"),
            ],
            edges: vec![
                edge("a", "b"),
                Edge {
                    target_handle: Some("input".into()),
                    ..edge("a", "viewer")
                },
            ],
        };
        let compiled = ExecutableGraph::build(&graph, &crate::workflow::REGISTRY).unwrap();
        assert!(!compiled.nodes.contains_key("note"));
        assert!(compiled.nodes.contains_key("viewer"));
        assert_eq!(compiled.incoming_bindings["b"][0].target_port, "text");
        assert_eq!(compiled.incoming_bindings["b"][0].source_port, "text");
    }

    #[test]
    fn legacy_migration_rejects_ambiguous_multi_port_nodes() {
        let mut registry = NodeRegistry::new();
        registry.register_non_runtime(
            "multiSource",
            super::super::executor::NodeSpec::execute(
                &[],
                &[("left", PortKind::Text), ("right", PortKind::Text)],
            ),
        );
        registry.register_non_runtime(
            "target",
            super::super::executor::NodeSpec::execute(&[("in", PortKind::Text)], &[]),
        );
        let graph = WorkflowGraph {
            schema_version: 0,
            nodes: vec![
                Node {
                    version: 1,
                    ..node("a", "multiSource")
                },
                Node {
                    version: 1,
                    ..node("b", "target")
                },
            ],
            edges: vec![crate::workflow::model::Edge {
                id: "ambiguous".into(),
                source: "a".into(),
                target: "b".into(),
                source_handle: None,
                target_handle: None,
            }],
        };
        let error = migrate_graph(graph, &registry).unwrap_err().to_string();
        assert!(error.contains("migration is ambiguous"));
    }

    #[test]
    fn required_runtime_inputs_are_authoritatively_validated() {
        let graph = WorkflowGraph {
            schema_version: WORKFLOW_SCHEMA_VERSION,
            nodes: vec![node("orphan", "textTransform")],
            edges: vec![],
        };
        let report = validate_graph(&graph, &crate::workflow::REGISTRY);
        assert!(!report.valid);
        assert!(report.problems.iter().any(|problem| {
            problem.code == "REQUIRED_INPUT_MISSING" && problem.node_id.as_deref() == Some("orphan")
        }));
    }

    #[test]
    fn v2_smoke_fixtures_validate_text_annotation_and_multi_port_media() {
        for fixture in [
            include_str!("../../../tests/fixtures/workflows/text-preview-v2.json"),
            include_str!("../../../tests/fixtures/workflows/annotation-safe-v2.json"),
            include_str!("../../../tests/fixtures/workflows/media-multi-port-v2.json"),
        ] {
            let graph: WorkflowGraph = serde_json::from_str(fixture).unwrap();
            let report = validate_graph(&graph, &crate::workflow::REGISTRY);
            assert!(report.valid, "{:?}", report.problems);
            ExecutableGraph::build(&graph, &crate::workflow::REGISTRY).unwrap();
        }
    }

    #[test]
    fn planned_nodes_are_saved_but_explicitly_block_execution() {
        let graph: WorkflowGraph = serde_json::from_value(serde_json::json!({
            "schemaVersion": 2,
            "nodes": [{
                "id": "future", "type": "autoCaptions", "version": 1,
                "position": { "x": 1, "y": 2 }, "data": { "label": "Auto Captions" }
            }],
            "edges": []
        }))
        .unwrap();
        let report = validate_graph(&graph, &crate::workflow::REGISTRY);
        assert!(report
            .problems
            .iter()
            .any(|problem| problem.code == "PLANNED_NODE_UNAVAILABLE"));
    }
}
