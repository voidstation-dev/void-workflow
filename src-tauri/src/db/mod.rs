use crate::error::Result;
use rusqlite::Connection;
use std::path::Path;

pub struct Db {
    pub conn: Connection,
}

impl Db {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let conn = Connection::open(path)?;

        let db = Self { conn };
        db.init_migrations()?;

        Ok(db)
    }

    fn init_migrations(&self) -> Result<()> {
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS projects (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS workflows (
                id INTEGER PRIMARY KEY,
                project_id INTEGER,
                graph_json TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS runs (
                id INTEGER PRIMARY KEY,
                project_id INTEGER,
                status TEXT NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                error TEXT
            )",
            [],
        )?;
        // Existing MVP databases predate the error column. SQLite has no
        // `ADD COLUMN IF NOT EXISTS`; duplicate-column is intentionally ignored.
        let _ = self
            .conn
            .execute("ALTER TABLE node_executions ADD COLUMN error TEXT", []);

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS node_executions (
                id INTEGER PRIMARY KEY,
                run_id INTEGER,
                node_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS node_results (
                id INTEGER PRIMARY KEY,
                run_id INTEGER NOT NULL,
                node_id TEXT NOT NULL,
                result_json TEXT NOT NULL,
                duration_ms INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS run_artifacts (
                id INTEGER PRIMARY KEY,
                run_id INTEGER NOT NULL,
                node_id TEXT NOT NULL,
                artifact_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                path TEXT NOT NULL,
                mime TEXT,
                size INTEGER NOT NULL,
                metadata_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS run_logs (
                id INTEGER PRIMARY KEY,
                run_id INTEGER,
                node_id TEXT,
                message TEXT NOT NULL,
                level TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )",
            [],
        )?;

        Ok(())
    }

    pub fn save_workflow(&self, project_id: i64, graph_json: &str) -> Result<()> {
        self.conn.execute(
            "INSERT INTO workflows (project_id, graph_json) VALUES (?1, ?2)
             ON CONFLICT(id) DO UPDATE SET graph_json=?2, updated_at=CURRENT_TIMESTAMP",
            rusqlite::params![project_id, graph_json],
        )?;
        Ok(())
    }

    pub fn load_workflow(&self, project_id: i64) -> Result<String> {
        let mut stmt = self.conn.prepare(
            "SELECT graph_json FROM workflows WHERE project_id = ?1 ORDER BY updated_at DESC LIMIT 1"
        )?;

        let graph_json: std::result::Result<String, _> =
            stmt.query_row(rusqlite::params![project_id], |row| row.get(0));

        match graph_json {
            Ok(json) => Ok(json),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(String::from(
                "{\"schemaVersion\":2,\"nodes\":[],\"edges\":[]}",
            )),
            Err(e) => Err(crate::error::AppError::Db(e)),
        }
    }
}
