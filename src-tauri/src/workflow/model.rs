use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub const WORKFLOW_SCHEMA_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowGraph {
    /// Missing means a legacy v1 graph and is normalized before validation.
    #[serde(default)]
    pub schema_version: u32,
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
    #[serde(default = "default_node_version")]
    pub version: u32,
    #[serde(default)]
    pub data: NodeData,
}

fn default_node_version() -> u32 {
    1
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct NodeData {
    #[serde(default)]
    pub label: String,
    #[serde(flatten)]
    pub extra: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub id: String,
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub source_handle: Option<String>,
    #[serde(default)]
    pub target_handle: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum NodeState {
    #[default]
    Pending,
    Running,
    Success,
    Failed,
    Cancelled,
    Skipped,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value", rename_all = "camelCase")]
pub enum NodeValue {
    Text(String),
    Number(f64),
    Boolean(bool),
    Json(Value),
    File(FileRef),
    Media(MediaRef),
    Audio(MediaRef),
    Video(MediaRef),
    Artifact(ArtifactRef),
    Any(Value),
}

impl NodeValue {
    pub fn as_text(&self) -> String {
        match self {
            Self::Text(value) => value.clone(),
            Self::Number(value) => value.to_string(),
            Self::Boolean(value) => value.to_string(),
            Self::Json(value) | Self::Any(value) => value.to_string(),
            Self::File(value) => value.path.clone(),
            Self::Media(value) | Self::Audio(value) | Self::Video(value) => value.path.clone(),
            Self::Artifact(value) => value.path.clone(),
        }
    }

    pub fn as_path(&self) -> Option<&str> {
        match self {
            Self::File(value) => Some(&value.path),
            Self::Media(value) | Self::Audio(value) | Self::Video(value) => Some(&value.path),
            Self::Artifact(value) => Some(&value.path),
            Self::Text(value) => Some(value),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileRef {
    pub path: String,
    pub name: String,
    pub size: u64,
    pub mime: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaRef {
    pub path: String,
    pub mime: Option<String>,
    #[serde(default)]
    pub metadata: Value,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArtifactRef {
    pub id: String,
    pub kind: String,
    pub path: String,
    pub mime: Option<String>,
    pub size: u64,
    #[serde(default)]
    pub metadata: Value,
    pub created_by_node: String,
}

pub type NodeInputs = HashMap<String, NodeValue>;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct NodeExecutionResult {
    #[serde(default)]
    pub outputs: HashMap<String, NodeValue>,
    #[serde(default)]
    pub artifacts: Vec<ArtifactRef>,
    #[serde(default)]
    pub metadata: Value,
    #[serde(default)]
    pub warnings: Vec<String>,
}

impl NodeExecutionResult {
    pub fn output(port: impl Into<String>, value: NodeValue) -> Self {
        Self {
            outputs: HashMap::from([(port.into(), value)]),
            ..Self::default()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn edge_handles_and_typed_values_round_trip() {
        let graph = WorkflowGraph {
            schema_version: WORKFLOW_SCHEMA_VERSION,
            nodes: vec![],
            edges: vec![Edge {
                id: "e".into(),
                source: "a".into(),
                target: "b".into(),
                source_handle: Some("out".into()),
                target_handle: Some("in".into()),
            }],
        };
        let json = serde_json::to_value(&graph).unwrap();
        assert_eq!(json["schemaVersion"], 2);
        assert_eq!(json["edges"][0]["sourceHandle"], "out");
        assert_eq!(json["edges"][0]["targetHandle"], "in");

        let value = NodeValue::Text("hello".into());
        assert_eq!(serde_json::to_value(value).unwrap()["kind"], "text");
    }
}
