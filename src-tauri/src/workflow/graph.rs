use super::model::{Node, WorkflowGraph};
use crate::error::{AppError, Result};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct ExecutableGraph {
    pub nodes: HashMap<String, Node>,
    /// Maps node_id -> list of node_ids that depend on it
    pub adjacency: HashMap<String, Vec<String>>,
    /// Maps node_id -> list of node_ids it depends on
    pub reverse_adjacency: HashMap<String, Vec<String>>,
    /// Sorted nodes for sequential fallback, though we will mainly use dependencies for scheduler
    pub topological_order: Vec<String>,
}

impl ExecutableGraph {
    pub fn build(graph: &WorkflowGraph) -> Result<Self> {
        let mut nodes_map = HashMap::new();
        for node in &graph.nodes {
            nodes_map.insert(node.id.clone(), node.clone());
        }

        let mut adjacency: HashMap<String, Vec<String>> = HashMap::new();
        let mut reverse_adjacency: HashMap<String, Vec<String>> = HashMap::new();
        let mut in_degree: HashMap<String, usize> = HashMap::new();

        // Initialize maps for all nodes
        for node_id in nodes_map.keys() {
            adjacency.insert(node_id.clone(), Vec::new());
            reverse_adjacency.insert(node_id.clone(), Vec::new());
            in_degree.insert(node_id.clone(), 0);
        }

        // Populate edges
        for edge in &graph.edges {
            if !nodes_map.contains_key(&edge.source) || !nodes_map.contains_key(&edge.target) {
                return Err(AppError::Internal(format!(
                    "Edge references missing node: source={} target={}",
                    edge.source, edge.target
                )));
            }

            adjacency
                .get_mut(&edge.source)
                .unwrap()
                .push(edge.target.clone());
            reverse_adjacency
                .get_mut(&edge.target)
                .unwrap()
                .push(edge.source.clone());

            *in_degree.get_mut(&edge.target).unwrap() += 1;
        }

        // Topological sort (Kahn's algorithm) & Cycle Detection
        let mut topo_order = Vec::new();
        let mut zero_in_degree = Vec::new();

        for (node_id, &deg) in &in_degree {
            if deg == 0 {
                zero_in_degree.push(node_id.clone());
            }
        }

        let mut processed_edges = 0;

        while let Some(u) = zero_in_degree.pop() {
            topo_order.push(u.clone());
            if let Some(neighbors) = adjacency.get(&u) {
                for v in neighbors {
                    let deg = in_degree.get_mut(v).unwrap();
                    *deg -= 1;
                    if *deg == 0 {
                        zero_in_degree.push(v.clone());
                    }
                    processed_edges += 1;
                }
            }
        }

        if processed_edges != graph.edges.len() {
            return Err(AppError::Internal(
                "Cycle detected in workflow graph".to_string(),
            ));
        }

        Ok(Self {
            nodes: nodes_map,
            adjacency,
            reverse_adjacency,
            topological_order: topo_order,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::model::{NodeData, NodeState, Edge};

    fn make_node(id: &str) -> Node {
        Node {
            id: id.to_string(),
            node_type: "textInput".to_string(),
            data: NodeData::default(),
        }
    }

    fn make_edge(source: &str, target: &str) -> Edge {
        Edge {
            id: format!("{}-{}", source, target),
            source: source.to_string(),
            target: target.to_string(),
        }
    }

    #[test]
    fn test_valid_dag_topological_sort() {
        // A -> B -> C
        // A -> C
        let graph = WorkflowGraph {
            nodes: vec![make_node("A"), make_node("B"), make_node("C")],
            edges: vec![
                make_edge("A", "B"),
                make_edge("B", "C"),
                make_edge("A", "C"),
            ],
        };

        let exec_graph = ExecutableGraph::build(&graph).unwrap();
        assert_eq!(exec_graph.topological_order.len(), 3);

        let pos_a = exec_graph
            .topological_order
            .iter()
            .position(|x| x == "A")
            .unwrap();
        let pos_b = exec_graph
            .topological_order
            .iter()
            .position(|x| x == "B")
            .unwrap();
        let pos_c = exec_graph
            .topological_order
            .iter()
            .position(|x| x == "C")
            .unwrap();

        assert!(pos_a < pos_b);
        assert!(pos_b < pos_c);
    }

    #[test]
    fn test_cycle_detection() {
        // A -> B -> C -> A
        let graph = WorkflowGraph {
            nodes: vec![make_node("A"), make_node("B"), make_node("C")],
            edges: vec![
                make_edge("A", "B"),
                make_edge("B", "C"),
                make_edge("C", "A"),
            ],
        };

        let err = ExecutableGraph::build(&graph).unwrap_err();
        assert!(matches!(err, AppError::Internal(msg) if msg.contains("Cycle detected")));
    }
}
