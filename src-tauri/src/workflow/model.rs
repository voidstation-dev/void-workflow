use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowGraph {
    #[serde(default)]
    pub nodes: Vec<Node>,
    #[serde(default)]
    pub edges: Vec<Edge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(default)]
    pub data: NodeData,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeData {
    #[serde(default)]
    pub label: String,
    #[serde(flatten)]
    pub extra: Value, // Catch-all for configuration properties
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[derive(Default)]
pub enum NodeState {
    #[default]
    Pending,
    Running,
    Success,
    Failed,
    Cancelled,
    Skipped, // If a dependency fails
}

