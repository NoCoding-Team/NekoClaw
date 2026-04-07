use std::sync::Arc;

use async_trait::async_trait;
use serde_json::{Value, json};
use zeroclaw_security_layer::{
    secured_tool::{SecuredTool, Tool, ToolResult},
    ws_client::SecurityWsClient,
};

struct EchoTool;

#[async_trait]
impl Tool for EchoTool {
    fn name(&self) -> &str {
        "echo"
    }

    fn description(&self) -> &str {
        "Returns the input text unchanged"
    }

    fn parameters(&self) -> Value {
        json!({
            "type": "object",
            "properties": {
                "text": { "type": "string", "description": "Text to echo" }
            },
            "required": ["text"]
        })
    }

    async fn execute(&self, args: Value) -> ToolResult {
        let text = args["text"].as_str().unwrap_or("(empty)").to_owned();
        ToolResult {
            success: true,
            output: text,
            error: None,
        }
    }
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let client = Arc::new(SecurityWsClient::new());

    println!("Attempting to connect to security WS endpoint...");
    println!(
        "  Set SECURITY_WS_ENDPOINT or NEKOCLAW_BACKEND_URL to point at the backend."
    );
    client.connect().await;

    let secured = SecuredTool::new(EchoTool, Arc::clone(&client));

    println!("\nCalling tool 'echo' with allowed input:");
    let result = secured.execute(json!({ "text": "hello from zeroclaw" })).await;
    println!("  success={} output={:?}", result.success, result.output);

    println!("\nCalling tool 'echo' with potentially sensitive input:");
    let result = secured.execute(json!({ "text": "DROP TABLE users;" })).await;
    println!(
        "  success={} output={:?} error={:?}",
        result.success, result.output, result.error
    );

    println!("\nDone.");
}
