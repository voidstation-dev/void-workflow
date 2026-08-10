pub mod artifact;
pub mod executor;
pub mod graph;
pub mod model;
pub mod nodes;

use executor::NodeRegistry;
use lazy_static::lazy_static;
use std::sync::Arc;

lazy_static! {
    pub static ref REGISTRY: Arc<NodeRegistry> = {
        let mut registry = NodeRegistry::new();
        registry.register("textInput", nodes::text_input::TextInputNode);
        registry.register("textTransform", nodes::text_transform::TextTransformNode);
        registry.register("delay", nodes::delay::DelayNode);
        registry.register("saveText", nodes::save_text::SaveTextNode);
        registry.register("saveJson", nodes::save_json::SaveJsonNode);
        registry.register("aiScript", nodes::ai_script::AIScriptNode);
        registry.register("fileInput", nodes::file_input::FileInputNode);
        registry.register("mediaInfo", nodes::media_info::MediaInfoNode);
        registry.register("mediaMerge", nodes::media_merge::MediaMergeNode);
        Arc::new(registry)
    };
}
