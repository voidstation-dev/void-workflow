use crate::error::Result;
use crate::runtime::RuntimeServices;
use crate::workflow::artifact::ArtifactManager;
use crate::workflow::executor::{NodeExecutor, ProgressReporter};
use crate::workflow::model::{Node, NodeExecutionResult, NodeInputs, NodeValue};
use async_trait::async_trait;
use serde_json::Value;
use tokio::time::{sleep, Duration};
use tokio_util::sync::CancellationToken;

pub struct DelayNode;

#[async_trait]
impl NodeExecutor for DelayNode {
    async fn execute(
        &self,
        node: &Node,
        inputs: &NodeInputs,
        cancel_token: CancellationToken,
        _artifact_manager: &ArtifactManager,
        _runtime: &RuntimeServices,
        _progress: ProgressReporter,
    ) -> Result<NodeExecutionResult> {
        let seconds = node
            .data
            .extra
            .get("seconds")
            .and_then(Value::as_f64)
            .or_else(|| {
                node.data
                    .extra
                    .get("duration")
                    .and_then(Value::as_f64)
                    .map(|milliseconds| milliseconds / 1000.0)
            })
            .unwrap_or(1.0);
        if !seconds.is_finite() || !(0.0..=86_400.0).contains(&seconds) {
            return Err(crate::error::AppError::validation(
                "DELAY_OUT_OF_RANGE",
                "Delay must be a finite value between 0 and 86,400 seconds.",
                serde_json::json!({ "nodeId": node.id, "seconds": seconds }),
            ));
        }

        tokio::select! {
            _ = sleep(Duration::from_secs_f64(seconds)) => {
                let pass_through = inputs.get("value").cloned().unwrap_or(NodeValue::Any(Value::Null));
                Ok(NodeExecutionResult::output("value", pass_through))
            }
            _ = cancel_token.cancelled() => {
                Err(crate::error::AppError::Cancelled("Cancelled during delay".to_string()))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workflow::test_support::{harness, node, progress};

    #[tokio::test]
    async fn passes_value_through_and_honors_cancellation() {
        let (_directory, runtime, artifacts) = harness();
        let inputs = [("value".into(), NodeValue::Text("hello".into()))].into();
        let result = DelayNode
            .execute(
                &node("delay", serde_json::json!({ "seconds": 0 })),
                &inputs,
                CancellationToken::new(),
                &artifacts,
                &runtime,
                progress(),
            )
            .await
            .unwrap();
        assert_eq!(result.outputs["value"], NodeValue::Text("hello".into()));

        let cancelled = CancellationToken::new();
        cancelled.cancel();
        assert!(matches!(
            DelayNode
                .execute(
                    &node("delay", serde_json::json!({ "seconds": 10 })),
                    &inputs,
                    cancelled,
                    &artifacts,
                    &runtime,
                    progress(),
                )
                .await,
            Err(crate::error::AppError::Cancelled(_))
        ));
    }
}
