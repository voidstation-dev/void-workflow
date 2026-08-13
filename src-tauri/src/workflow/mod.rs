pub mod artifact;
pub mod executor;
pub mod graph;
pub mod model;
pub mod nodes;

use executor::{ExecutionMode, NodeRegistry, NodeSpec, PortKind};
use lazy_static::lazy_static;
use std::sync::Arc;

lazy_static! {
    pub static ref REGISTRY: Arc<NodeRegistry> = {
        let mut registry = NodeRegistry::new();
        use PortKind::*;
        registry.register(
            "textInput",
            NodeSpec::execute(&[], &[("out", Text)]),
            nodes::text_input::TextInputNode,
        );
        registry.register(
            "textTransform",
            NodeSpec::execute(&[("in", Text)], &[("out", Text)]),
            nodes::text_transform::TextTransformNode,
        );
        registry.register(
            "delay",
            NodeSpec::execute(&[("in", Any)], &[("out", Any)]),
            nodes::delay::DelayNode,
        );
        registry.register(
            "aiScript",
            NodeSpec::execute(&[("in", Text)], &[("out", Text)]),
            nodes::ai_script::AIScriptNode,
        );
        registry.register(
            "fileInput",
            NodeSpec::execute(&[], &[("out", File)]),
            nodes::file_input::FileInputNode,
        );
        registry.register(
            "mediaInfo",
            NodeSpec::execute(&[("in", Media)], &[("out", Json)]),
            nodes::media_info::MediaInfoNode,
        );
        registry.register(
            "saveText",
            NodeSpec::execute(&[("in", Text)], &[]),
            nodes::save_text::SaveTextNode,
        );
        registry.register(
            "saveJson",
            NodeSpec::execute(&[("in", Json)], &[]),
            nodes::save_json::SaveJsonNode,
        );
        registry.register(
            "mediaMerge",
            NodeSpec::execute(&[("in", Media)], &[("out", Media)]),
            nodes::media_merge::MediaMergeNode,
        );
        registry.register_non_runtime("saveArtifact", NodeSpec::execute(&[("in", Artifact)], &[]));
        registry.register_non_runtime(
            "preview",
            NodeSpec {
                version: 1,
                execution_mode: ExecutionMode::Viewer,
                inputs: [("in".into(), Any)].into(),
                required_inputs: ["in".into()].into(),
                outputs: Default::default(),
            },
        );
        registry.register_non_runtime(
            "markdownNote",
            NodeSpec {
                version: 1,
                execution_mode: ExecutionMode::Annotation,
                inputs: Default::default(),
                required_inputs: Default::default(),
                outputs: Default::default(),
            },
        );
        Arc::new(registry)
    };
}
