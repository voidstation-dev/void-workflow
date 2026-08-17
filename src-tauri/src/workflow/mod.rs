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
            NodeSpec::execute_v2(&[], &[("text", Text)], &[]),
            nodes::text_input::TextInputNode,
        );
        registry.register(
            "textTransform",
            NodeSpec::execute_v2(&[("text", Text)], &[("text", Text)], &["text"]),
            nodes::text_transform::TextTransformNode,
        );
        registry.register(
            "delay",
            NodeSpec::execute_v2(&[("value", Any)], &[("value", Any)], &["value"]),
            nodes::delay::DelayNode,
        );
        registry.register(
            "aiScript",
            NodeSpec::execute_v2(&[("input", Any)], &[("text", Text), ("json", Json)], &[]),
            nodes::ai_script::AIScriptNode,
        );
        registry.register(
            "fileInput",
            NodeSpec::execute_v2(&[], &[("file", File)], &[]),
            nodes::file_input::FileInputNode,
        );
        registry.register(
            "mediaInfo",
            NodeSpec::execute_v2(
                &[("media", Media)],
                &[("metadata", Json), ("media", Media)],
                &["media"],
            ),
            nodes::media_info::MediaInfoNode,
        );
        registry.register(
            "saveText",
            NodeSpec::execute_v2(&[("text", Text)], &[("artifact", Artifact)], &["text"]),
            nodes::save_text::SaveTextNode,
        );
        registry.register(
            "saveJson",
            NodeSpec::execute_v2(&[("json", Json)], &[("artifact", Artifact)], &["json"]),
            nodes::save_json::SaveJsonNode,
        );
        registry.register(
            "mediaMerge",
            NodeSpec::execute_v2(
                &[("video", Video), ("audio", Audio)],
                &[("video", Video)],
                &["video"],
            ),
            nodes::media_merge::MediaMergeNode,
        );
        registry.register(
            "saveArtifact",
            NodeSpec::execute_v2(
                &[("artifact", Any)],
                &[("artifact", Artifact)],
                &["artifact"],
            ),
            nodes::save_artifact::SaveArtifactNode,
        );
        registry.register(
            "preview",
            NodeSpec {
                version: 2,
                execution_mode: ExecutionMode::Execute,
                inputs: [("input".into(), Any)].into(),
                required_inputs: ["input".into()].into(),
                outputs: Default::default(),
            },
            nodes::preview::PreviewNode,
        );
        registry.register_non_runtime(
            "markdownNote",
            NodeSpec {
                version: 2,
                execution_mode: ExecutionMode::Annotation,
                inputs: Default::default(),
                required_inputs: Default::default(),
                outputs: Default::default(),
            },
        );
        // YouTube Video Automation pipeline — 4 nodes. Phase 2 lands the Rust
        // executors + the FFmpeg filtergraph builder, so these are now full
        // runtime nodes: migrate_graph/validate_graph accept them, the scheduler
        // executes them, and `start_run` produces a real MP4. Port contracts are
        // pinned to schema v2 (execute_v2) so they stay asserted against the
        // shared contract fixture on both sides, identical to the canonical
        // nodes above. The frontend registry mirrors this flip (planned →
        // runtime, frontend-only → canonical).
        registry.register(
            "audioCover",
            NodeSpec::execute_v2(
                &[],
                &[("audio", Audio), ("metadata", Json), ("cover", Media)],
                &[],
            ),
            nodes::audio_cover::AudioCoverNode,
        );
        registry.register(
            "backgroundMedia",
            NodeSpec::execute_v2(&[("cover", Media)], &[("background", Media)], &["cover"]),
            nodes::background_media::BackgroundMediaNode,
        );
        registry.register(
            "soundwaveVisualizer",
            NodeSpec::execute_v2(
                &[("audio", Audio), ("metadata", Json), ("background", Media)],
                &[("video", Video)],
                &["audio", "background"],
            ),
            nodes::soundwave_visualizer::SoundwaveVisualizerNode,
        );
        registry.register(
            "previewExport",
            NodeSpec::execute_v2(&[("video", Video)], &[("artifact", Artifact)], &["video"]),
            nodes::preview_export::PreviewExportNode,
        );
        type PlannedSpec = (
            &'static str,
            &'static [(&'static str, PortKind)],
            &'static [(&'static str, PortKind)],
            &'static [&'static str],
        );
        let planned_specs: &[PlannedSpec] = &[
            ("urlMediaInput", &[], &[("media", Media)], &[]),
            ("batchFolderInput", &[], &[("items", Json)], &[]),
            (
                "trimClip",
                &[("video", Video)],
                &[("video", Video)],
                &["video"],
            ),
            (
                "smartReframe",
                &[("video", Video)],
                &[("video", Video)],
                &["video"],
            ),
            (
                "resizeCanvas",
                &[("video", Video)],
                &[("video", Video)],
                &["video"],
            ),
            (
                "videoConcat",
                &[("clips", Media)],
                &[("video", Video)],
                &["clips"],
            ),
            (
                "overlay",
                &[("video", Video), ("overlay", Media)],
                &[("video", Video)],
                &["video", "overlay"],
            ),
            (
                "speedRetime",
                &[("video", Video)],
                &[("video", Video)],
                &["video"],
            ),
            (
                "extractAudio",
                &[("video", Video)],
                &[("audio", Audio)],
                &["video"],
            ),
            (
                "audioMix",
                &[("primary", Audio), ("secondary", Audio)],
                &[("audio", Audio)],
                &["primary", "secondary"],
            ),
            (
                "loudnessNormalize",
                &[("audio", Audio)],
                &[("audio", Audio)],
                &["audio"],
            ),
            (
                "transcribe",
                &[("audio", Audio)],
                &[("transcript", Json)],
                &["audio"],
            ),
            (
                "autoCaptions",
                &[("transcript", Json)],
                &[("captions", Json)],
                &["transcript"],
            ),
            (
                "subtitleBurnIn",
                &[("video", Video), ("captions", Json)],
                &[("video", Video)],
                &["video", "captions"],
            ),
            (
                "sceneDetect",
                &[("video", Video)],
                &[("scenes", Json)],
                &["video"],
            ),
            (
                "clipSelector",
                &[("source", Json)],
                &[("clips", Json)],
                &["source"],
            ),
            (
                "shortComposer",
                &[("clips", Json)],
                &[("video", Video)],
                &["clips"],
            ),
            (
                "socialExport",
                &[("video", Video)],
                &[("artifact", Artifact)],
                &["video"],
            ),
            (
                "batchRender",
                &[("items", Json)],
                &[("artifacts", Json)],
                &["items"],
            ),
            ("contentBrief", &[("input", Any)], &[("brief", Json)], &[]),
            (
                "hookGenerator",
                &[("brief", Any)],
                &[("hooks", Json)],
                &["brief"],
            ),
            (
                "shortScript",
                &[("brief", Any)],
                &[("script", Text)],
                &["brief"],
            ),
            (
                "titleCaptionGenerator",
                &[("content", Any)],
                &[("copy", Json)],
                &["content"],
            ),
            (
                "hashtagKeywordPack",
                &[("content", Any)],
                &[("keywords", Json)],
                &["content"],
            ),
            (
                "ctaGenerator",
                &[("content", Any)],
                &[("ctas", Json)],
                &["content"],
            ),
            (
                "platformVariant",
                &[("copy", Text)],
                &[("variants", Json)],
                &["copy"],
            ),
            ("utmBuilder", &[("url", Text)], &[("url", Text)], &["url"]),
            (
                "thumbnailCoverBrief",
                &[("content", Any)],
                &[("brief", Json)],
                &["content"],
            ),
            (
                "publishYouTube",
                &[("video", Video), ("metadata", Json)],
                &[("result", Json)],
                &["video"],
            ),
            (
                "publishTikTok",
                &[("video", Video), ("metadata", Json)],
                &[("result", Json)],
                &["video"],
            ),
            (
                "publishInstagramReels",
                &[("video", Video), ("metadata", Json)],
                &[("result", Json)],
                &["video"],
            ),
            (
                "schedulePublish",
                &[("publication", Json)],
                &[("schedule", Json)],
                &["publication"],
            ),
            (
                "analyticsSnapshot",
                &[("publication", Json)],
                &[("analytics", Json)],
                &["publication"],
            ),
            (
                "compareVariants",
                &[("variants", Json)],
                &[("comparison", Json)],
                &["variants"],
            ),
        ];
        for (node_type, inputs, outputs, required) in planned_specs {
            registry.register_non_runtime(node_type, NodeSpec::planned(inputs, outputs, required));
        }
        Arc::new(registry)
    };
}

#[cfg(test)]
pub mod test_support {
    use super::artifact::ArtifactManager;
    use super::executor::ProgressReporter;
    use super::model::{Node, NodeData};
    use crate::runtime::RuntimeServices;
    use serde_json::Value;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tempfile::TempDir;

    pub fn harness() -> (TempDir, RuntimeServices, ArtifactManager) {
        let directory = tempfile::tempdir().unwrap();
        let runtime = RuntimeServices::new(directory.path().to_path_buf()).unwrap();
        let artifacts = ArtifactManager::new(directory.path(), 1).unwrap();
        (directory, runtime, artifacts)
    }

    pub fn node(node_type: &str, config: Value) -> Node {
        Node {
            id: format!("{node_type}-test"),
            node_type: node_type.into(),
            version: 2,
            data: NodeData {
                label: node_type.into(),
                extra: config,
            },
            extra: HashMap::new(),
        }
    }

    pub fn progress() -> ProgressReporter {
        Arc::new(|_| {})
    }
}
