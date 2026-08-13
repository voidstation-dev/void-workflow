use super::executor::{ExecutionMode, NodeRegistry, PortKind};
use super::model::{Node, WorkflowGraph, WORKFLOW_SCHEMA_VERSION};
use crate::error::{AppError, Result};
use std::collections::{HashMap, HashSet};

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

    let node_types: HashMap<&str, &str> = graph
        .nodes
        .iter()
        .map(|node| (node.id.as_str(), node.node_type.as_str()))
        .collect();

    for edge in &mut graph.edges {
        let source_type = node_types.get(edge.source.as_str()).ok_or_else(|| {
            AppError::Internal(format!(
                "Edge {} references missing source {}",
                edge.id, edge.source
            ))
        })?;
        let target_type = node_types.get(edge.target.as_str()).ok_or_else(|| {
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

impl ExecutableGraph {
    pub fn build(graph: &WorkflowGraph, registry: &NodeRegistry) -> Result<Self> {
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
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::{Edge, NodeData};

    fn node(id: &str, node_type: &str) -> Node {
        Node {
            id: id.into(),
            node_type: node_type.into(),
            version: 1,
            data: NodeData::default(),
        }
    }
    fn edge(source: &str, target: &str) -> crate::workflow::model::Edge {
        Edge {
            id: format!("{source}-{target}"),
            source: source.into(),
            target: target.into(),
            source_handle: Some("out".into()),
            target_handle: Some("in".into()),
        }
    }

    #[test]
    fn legacy_single_port_edges_are_normalized() {
        let graph = WorkflowGraph {
            schema_version: 0,
            nodes: vec![node("a", "textInput"), node("b", "textTransform")],
            edges: vec![Edge {
                source_handle: None,
                target_handle: None,
                ..edge("a", "b")
            }],
        };
        let migrated = migrate_graph(graph, &crate::workflow::REGISTRY).unwrap();
        assert_eq!(migrated.schema_version, 2);
        assert_eq!(migrated.edges[0].source_handle.as_deref(), Some("out"));
        assert_eq!(migrated.edges[0].target_handle.as_deref(), Some("in"));
    }

    #[test]
    fn legacy_fixture_migrates_to_v2_without_guessing_ids() {
        let graph: WorkflowGraph = serde_json::from_str(include_str!(
            "../../../tests/fixtures/workflow-v1/single-port.json"
        ))
        .unwrap();
        let migrated = migrate_graph(graph, &crate::workflow::REGISTRY).unwrap();
        assert_eq!(migrated.schema_version, WORKFLOW_SCHEMA_VERSION);
        assert_eq!(migrated.edges[0].source_handle.as_deref(), Some("out"));
        assert_eq!(migrated.edges[0].target_handle.as_deref(), Some("in"));
        assert_eq!(migrated.nodes[0].version, 1);
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
            edges: vec![edge("a", "b"), edge("a", "viewer")],
        };
        let compiled = ExecutableGraph::build(&graph, &crate::workflow::REGISTRY).unwrap();
        assert!(!compiled.nodes.contains_key("note"));
        assert!(!compiled.nodes.contains_key("viewer"));
        assert_eq!(compiled.incoming_bindings["b"][0].target_port, "in");
        assert_eq!(compiled.incoming_bindings["b"][0].source_port, "out");
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
            nodes: vec![node("a", "multiSource"), node("b", "target")],
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
        let error = ExecutableGraph::build(&graph, &crate::workflow::REGISTRY)
            .unwrap_err()
            .to_string();
        assert!(error.contains("Required input orphan.in is not connected"));
    }
}
