pub mod db;
pub mod error;
pub mod project;
pub mod runtime;
pub mod workflow;

use db::Db;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};
use tokio_util::sync::CancellationToken;

pub struct AppState {
    pub db: Mutex<Option<Db>>,
    pub app_dir: PathBuf,
    pub running_tasks: Mutex<HashMap<i64, CancellationToken>>,
    pub runtime: Arc<runtime::RuntimeServices>,
}

#[tauri::command]
fn init_project(app_handle: AppHandle) -> Result<String, error::AppError> {
    let state = app_handle.state::<AppState>();

    // Ensure the app directory exists
    if !state.app_dir.exists() {
        fs::create_dir_all(&state.app_dir)?;
    }

    let db_path = state.app_dir.join("void_workflow.db");
    let db = Db::new(&db_path)?;

    let mut state_db = state.db.lock().unwrap();
    *state_db = Some(db);

    Ok(db_path.to_string_lossy().into_owned())
}

#[tauri::command]
fn save_workflow(
    app_handle: AppHandle,
    project_id: i64,
    graph_json: String,
) -> Result<(), error::AppError> {
    let graph: workflow::model::WorkflowGraph = serde_json::from_str(&graph_json)
        .map_err(|e| error::AppError::Internal(format!("Invalid graph JSON: {e}")))?;
    let graph = workflow::graph::migrate_graph(graph, &workflow::REGISTRY)?;
    let normalized_json = serde_json::to_string(&graph)
        .map_err(|e| error::AppError::Internal(format!("Failed to serialize graph: {e}")))?;
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        db.save_workflow(project_id, &normalized_json)?;
    } else {
        return Err(error::AppError::Internal(
            "Database not initialized".to_string(),
        ));
    }
    Ok(())
}

#[tauri::command]
fn load_workflow(app_handle: AppHandle, project_id: i64) -> Result<String, error::AppError> {
    let state = app_handle.state::<AppState>();
    let db_guard = state.db.lock().unwrap();
    if let Some(db) = db_guard.as_ref() {
        let json = db.load_workflow(project_id)?;
        let graph: workflow::model::WorkflowGraph = serde_json::from_str(&json)
            .map_err(|e| error::AppError::Internal(format!("Invalid saved graph JSON: {e}")))?;
        let graph = workflow::graph::migrate_graph(graph, &workflow::REGISTRY)?;
        serde_json::to_string(&graph)
            .map_err(|e| error::AppError::Internal(format!("Failed to serialize graph: {e}")))
    } else {
        Err(error::AppError::Internal(
            "Database not initialized".to_string(),
        ))
    }
}

#[tauri::command]
async fn start_run(
    app_handle: AppHandle,
    project_id: i64,
    graph_json: String,
) -> Result<i64, error::AppError> {
    // Deserialize graph to validate
    let graph: workflow::model::WorkflowGraph = serde_json::from_str(&graph_json)
        .map_err(|e| error::AppError::Internal(format!("Invalid graph JSON: {}", e)))?;
    let graph = workflow::graph::migrate_graph(graph, &workflow::REGISTRY)?;
    let exec_graph = workflow::graph::ExecutableGraph::build(&graph, &workflow::REGISTRY)?;
    let cancel_token = CancellationToken::new();

    let run_id = {
        let state = app_handle.state::<AppState>();
        let db_guard = state.db.lock().unwrap();
        if let Some(db) = db_guard.as_ref() {
            db.conn.execute(
                "INSERT INTO runs (project_id, status) VALUES (?1, 'Running')",
                rusqlite::params![project_id],
            )?;
            db.conn.last_insert_rowid()
        } else {
            return Err(error::AppError::Internal(
                "Database not initialized".to_string(),
            ));
        }
    };

    let scheduler = workflow::executor::Scheduler::new(
        exec_graph,
        workflow::REGISTRY.clone(),
        app_handle.clone(),
        run_id,
    )?;

    {
        let state = app_handle.state::<AppState>();
        let mut tasks = state.running_tasks.lock().unwrap();
        tasks.insert(run_id, cancel_token.clone());
    }

    // Spawn the scheduler in the background
    tauri::async_runtime::spawn(async move {
        let _ = scheduler.run(cancel_token).await;
        // In a real app, clean up from running_tasks after completion
    });

    Ok(run_id)
}

#[tauri::command]
fn validate_workflow(
    graph_json: String,
) -> Result<workflow::graph::ValidationReport, error::AppError> {
    let graph: workflow::model::WorkflowGraph =
        serde_json::from_str(&graph_json).map_err(|error| {
            error::AppError::validation(
                "INVALID_GRAPH_JSON",
                format!("The workflow JSON could not be parsed: {error}"),
                serde_json::Value::Null,
            )
        })?;
    let graph = workflow::graph::migrate_graph(graph, &workflow::REGISTRY)?;
    Ok(workflow::graph::validate_graph(&graph, &workflow::REGISTRY))
}

#[tauri::command]
fn cancel_run(app_handle: AppHandle, run_id: i64) -> Result<(), error::AppError> {
    let state = app_handle.state::<AppState>();
    let tasks = state.running_tasks.lock().unwrap();
    if let Some(token) = tasks.get(&run_id) {
        token.cancel();
    }
    Ok(())
}

#[tauri::command]
fn open_run_folder(app_handle: AppHandle, run_id: i64) -> Result<(), error::AppError> {
    use tauri_plugin_opener::OpenerExt;

    let state = app_handle.state::<AppState>();
    let run_dir = state.runtime.output_root().join(run_id.to_string());

    if run_dir.exists() {
        let _ = app_handle
            .opener()
            .open_path(run_dir.to_string_lossy().into_owned(), None::<String>);
    }

    Ok(())
}

#[tauri::command]
fn get_runtime_settings(app_handle: AppHandle) -> runtime::RuntimeSettings {
    app_handle.state::<AppState>().runtime.settings()
}

#[tauri::command]
fn update_runtime_settings(
    app_handle: AppHandle,
    settings: runtime::RuntimeSettings,
) -> Result<runtime::RuntimeSettings, error::AppError> {
    app_handle
        .state::<AppState>()
        .runtime
        .update_settings(settings)
}

#[tauri::command]
fn set_gemini_api_key(app_handle: AppHandle, api_key: String) -> Result<(), error::AppError> {
    app_handle
        .state::<AppState>()
        .runtime
        .set_gemini_api_key(&api_key)
}

#[tauri::command]
fn clear_gemini_api_key(app_handle: AppHandle) -> Result<(), error::AppError> {
    app_handle
        .state::<AppState>()
        .runtime
        .clear_gemini_api_key()
}

#[tauri::command]
async fn probe_environment(app_handle: AppHandle) -> runtime::EnvironmentHealth {
    let state = app_handle.state::<AppState>();
    let sqlite_ready = state
        .db
        .lock()
        .ok()
        .and_then(|guard| {
            guard
                .as_ref()
                .map(|db| db.conn.query_row("SELECT 1", [], |_| Ok(())).is_ok())
        })
        .unwrap_or(false);
    state.runtime.probe_environment(sqlite_ready).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| PathBuf::from("./.void_data"));

            if !app_dir.exists() {
                fs::create_dir_all(&app_dir).expect("Failed to create app data directory");
            }

            let db_path = app_dir.join("void_workflow.db");
            let db = Db::new(&db_path).expect("Failed to initialize SQLite database");
            let runtime = Arc::new(
                runtime::RuntimeServices::new(app_dir.clone())
                    .expect("Failed to initialize runtime services"),
            );

            app.manage(AppState {
                db: Mutex::new(Some(db)),
                app_dir,
                running_tasks: Mutex::new(HashMap::new()),
                runtime,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            init_project,
            save_workflow,
            load_workflow,
            start_run,
            validate_workflow,
            cancel_run,
            open_run_folder,
            get_runtime_settings,
            update_runtime_settings,
            set_gemini_api_key,
            clear_gemini_api_key,
            probe_environment
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
