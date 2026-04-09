#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use dotenvy::dotenv;
use reqwest::header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE, USER_AGENT};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const APP_USER_AGENT: &str = "markdown-workspace-sync";

#[derive(Clone, Copy, Debug)]
enum Provider {
    Github,
    Gitee,
}

impl Provider {
    fn parse(value: &str) -> Result<Self, String> {
        match value {
            "github" => Ok(Self::Github),
            "gitee" => Ok(Self::Gitee),
            _ => Err(format!("unsupported provider: {value}")),
        }
    }

    fn user_endpoint(self) -> &'static str {
        match self {
            Self::Github => "https://api.github.com/user",
            Self::Gitee => "https://gitee.com/api/v5/user",
        }
    }

    fn env_keys(self) -> (&'static str, &'static str) {
        match self {
            Self::Github => ("VITE_GITHUB_CLIENT_ID", "VITE_GITHUB_CLIENT_SECRET"),
            Self::Gitee => ("VITE_GITEE_CLIENT_ID", "VITE_GITEE_CLIENT_SECRET"),
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OAuthExchangeResponse {
    access_token: String,
    login: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct RepoEnsureResponse {
    owner: String,
    repo: String,
    html_url: String,
    default_branch: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceSyncResponse {
    success: bool,
    snapshot_json: String,
}

#[derive(Deserialize)]
struct GithubTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct GiteeTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Deserialize)]
struct UserResponse {
    login: Option<String>,
    name: Option<String>,
}

#[derive(Deserialize)]
struct RepoResponse {
    name: Option<String>,
    html_url: Option<String>,
    default_branch: Option<String>,
}

#[derive(Deserialize)]
struct WorkspaceSnapshot {
    #[serde(rename = "currentDocId")]
    current_doc_id: Option<String>,
    documents: Option<Vec<Value>>,
    tombstones: Option<Vec<Value>>,
    assets: Option<Vec<Value>>,
    #[serde(rename = "deletedDocs")]
    deleted_docs: Option<Vec<Value>>,
}

fn github_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .build()
        .map_err(|err| err.to_string())
}

fn read_env_value(key: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_default()
}

fn get_provider_oauth_credentials(provider: Provider) -> Result<(String, String), String> {
    let (client_id_key, client_secret_key) = provider.env_keys();

    let client_id = read_env_value(client_id_key);
    let client_secret = read_env_value(client_secret_key);

    if client_id.is_empty() || client_secret.is_empty() {
        return Err("missing OAuth client configuration in environment".to_string());
    }

    Ok((client_id, client_secret))
}

fn extract_http_error(prefix: &str, status: reqwest::StatusCode, body: &str) -> String {
    if let Ok(value) = serde_json::from_str::<Value>(body) {
        if let Some(message) = value.get("message").and_then(Value::as_str) {
            return format!("{prefix} ({status}): {message}");
        }

        if let Some(message) = value.get("error_description").and_then(Value::as_str) {
            return format!("{prefix} ({status}): {message}");
        }

        if let Some(message) = value.get("error").and_then(Value::as_str) {
            return format!("{prefix} ({status}): {message}");
        }
    }

    format!("{prefix} ({status}): {body}")
}

fn decode_base64_to_string(value: &str) -> Result<String, String> {
    let sanitized = value.replace(char::is_whitespace, "");
    let bytes = STANDARD.decode(sanitized).map_err(|err| err.to_string())?;
    String::from_utf8(bytes).map_err(|err| err.to_string())
}

fn parse_workspace_snapshot(snapshot_json: &str) -> WorkspaceSnapshot {
    serde_json::from_str(snapshot_json).unwrap_or(WorkspaceSnapshot {
        current_doc_id: None,
        documents: Some(Vec::new()),
        tombstones: Some(Vec::new()),
        assets: Some(Vec::new()),
        deleted_docs: Some(Vec::new()),
    })
}

fn normalize_workspace_documents(documents: Option<Vec<Value>>) -> Vec<Value> {
    documents
        .unwrap_or_default()
        .into_iter()
        .filter(|doc| doc.is_object() && doc.get("id").and_then(Value::as_str).is_some())
        .collect()
}

fn normalize_workspace_tombstones(
    tombstones: Option<Vec<Value>>,
    deleted_docs: Option<Vec<Value>>,
) -> Vec<Value> {
    tombstones
        .or(deleted_docs)
        .unwrap_or_default()
        .into_iter()
        .filter(|tombstone| {
            tombstone.is_object()
                && tombstone.get("id").and_then(Value::as_str).is_some()
                && tombstone.get("deletedAt").and_then(Value::as_str).is_some()
        })
        .collect()
}

fn normalize_workspace_assets(assets: Option<Vec<Value>>) -> Vec<Value> {
    assets
        .unwrap_or_default()
        .into_iter()
        .filter(|asset| {
            asset.is_object()
                && asset.get("path").and_then(Value::as_str).is_some()
                && asset.get("dataUrl").and_then(Value::as_str).is_some()
        })
        .collect()
}

fn get_doc_updated_at(doc: &Value) -> &str {
    doc.get("updatedAt").and_then(Value::as_str).unwrap_or("")
}

fn get_deleted_at(tombstone: &Value) -> &str {
    tombstone.get("deletedAt").and_then(Value::as_str).unwrap_or("")
}

fn get_asset_updated_at(asset: &Value) -> &str {
    asset.get("updatedAt").and_then(Value::as_str).unwrap_or("")
}

fn merge_workspace_tombstones(base: Vec<Value>, incoming: Vec<Value>) -> Vec<Value> {
    let mut merged = base;

    for tombstone in incoming {
        let Some(tombstone_id) = tombstone.get("id").and_then(Value::as_str) else {
            continue;
        };

        if let Some(index) = merged
            .iter()
            .position(|item| item.get("id").and_then(Value::as_str) == Some(tombstone_id))
        {
            if get_deleted_at(&tombstone) >= get_deleted_at(&merged[index]) {
                merged[index] = tombstone;
            }
            continue;
        }

        merged.push(tombstone);
    }

    merged
}

fn apply_workspace_tombstones(documents: Vec<Value>, tombstones: &[Value]) -> Vec<Value> {
    documents
        .into_iter()
        .filter(|doc| {
            let Some(doc_id) = doc.get("id").and_then(Value::as_str) else {
                return false;
            };

            let tombstone = tombstones
                .iter()
                .find(|item| item.get("id").and_then(Value::as_str) == Some(doc_id));

            match tombstone {
                Some(tombstone) => get_doc_updated_at(doc) > get_deleted_at(tombstone),
                None => true,
            }
        })
        .collect()
}

fn merge_workspace_assets(base: Vec<Value>, incoming: Vec<Value>) -> Vec<Value> {
    let mut merged = base;

    for asset in incoming {
        let Some(asset_path) = asset.get("path").and_then(Value::as_str) else {
            continue;
        };

        if let Some(index) = merged
            .iter()
            .position(|item| item.get("path").and_then(Value::as_str) == Some(asset_path))
        {
            if get_asset_updated_at(&asset) >= get_asset_updated_at(&merged[index]) {
                merged[index] = asset;
            }
            continue;
        }

        merged.push(asset);
    }

    merged
}

fn build_workspace_snapshot(
    documents: Vec<Value>,
    current_doc_id: Option<String>,
    tombstones: Vec<Value>,
    assets: Vec<Value>,
) -> Value {
    let visible_documents = apply_workspace_tombstones(documents, &tombstones);

    let valid_current_doc_id = current_doc_id.filter(|doc_id| {
        visible_documents
            .iter()
            .any(|doc| doc.get("id").and_then(Value::as_str) == Some(doc_id.as_str()))
    });

    let fallback_current_doc_id = visible_documents.iter().find_map(|doc| {
        if doc.get("type").and_then(Value::as_str) != Some("folder") {
            doc.get("id").and_then(Value::as_str).map(ToString::to_string)
        } else {
            None
        }
    });

    json!({
        "currentDocId": valid_current_doc_id.or(fallback_current_doc_id),
        "documents": visible_documents,
        "tombstones": tombstones,
        "assets": assets
    })
}

fn merge_workspace_snapshots(local_snapshot_json: &str, remote_snapshot_json: &str) -> Result<String, String> {
    let local = parse_workspace_snapshot(local_snapshot_json);
    let remote = parse_workspace_snapshot(remote_snapshot_json);
    let local_documents = normalize_workspace_documents(local.documents);
    let remote_documents = normalize_workspace_documents(remote.documents);
    let tombstones = merge_workspace_tombstones(
        normalize_workspace_tombstones(local.tombstones, local.deleted_docs),
        normalize_workspace_tombstones(remote.tombstones, remote.deleted_docs),
    );
    let assets = merge_workspace_assets(
        normalize_workspace_assets(local.assets),
        normalize_workspace_assets(remote.assets),
    );

    let mut merged_documents: Vec<Value> = Vec::new();

    let mut upsert = |doc: &Value| {
        let Some(doc_id) = doc.get("id").and_then(Value::as_str) else {
            return;
        };

        if let Some(index) = merged_documents
            .iter()
            .position(|item| item.get("id").and_then(Value::as_str) == Some(doc_id))
        {
            if get_doc_updated_at(doc) >= get_doc_updated_at(&merged_documents[index]) {
                merged_documents[index] = doc.clone();
            }
            return;
        }

        merged_documents.push(doc.clone());
    };

    for doc in local_documents.iter() {
        upsert(doc);
    }
    for doc in remote_documents.iter() {
        upsert(doc);
    }

    serde_json::to_string_pretty(&build_workspace_snapshot(
        merged_documents,
        local.current_doc_id.or(remote.current_doc_id),
        tombstones,
        assets,
    ))
    .map_err(|err| err.to_string())
}

async fn fetch_user_login(
    client: &reqwest::Client,
    provider: Provider,
    access_token: &str,
) -> Result<String, String> {
    let request = match provider {
        Provider::Github => client
            .get(provider.user_endpoint())
            .header(USER_AGENT, APP_USER_AGENT)
            .header(ACCEPT, "application/vnd.github+json")
            .header(AUTHORIZATION, format!("Bearer {access_token}")),
        Provider::Gitee => client
            .get(provider.user_endpoint())
            .query(&[("access_token", access_token)]),
    };

    let response = request.send().await.map_err(|err| err.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;

    if !status.is_success() {
        return Err(extract_http_error(
            "failed to fetch user profile",
            status,
            &body,
        ));
    }

    let user: UserResponse = serde_json::from_str(&body).map_err(|err| err.to_string())?;
    user.login
        .or(user.name)
        .ok_or_else(|| "unable to resolve account name from provider response".to_string())
}

async fn create_repo_if_needed(
    client: &reqwest::Client,
    provider: Provider,
    access_token: &str,
    owner: &str,
    repo_name: &str,
    repo_description: &str,
    repo_private: bool,
) -> Result<RepoEnsureResponse, String> {
    match provider {
        Provider::Github => {
            let response = client
                .post("https://api.github.com/user/repos")
                .header(USER_AGENT, APP_USER_AGENT)
                .header(ACCEPT, "application/vnd.github+json")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .json(&json!({
                    "name": repo_name,
                    "description": repo_description,
                    "private": repo_private,
                    "auto_init": true
                }))
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.is_success() {
                let repo: RepoResponse =
                    serde_json::from_str(&body).map_err(|err| err.to_string())?;
                return Ok(RepoEnsureResponse {
                    owner: owner.to_string(),
                    repo: repo.name.unwrap_or_else(|| repo_name.to_string()),
                    html_url: repo
                        .html_url
                        .unwrap_or_else(|| format!("https://github.com/{owner}/{repo_name}")),
                    default_branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
                });
            }

            if status.as_u16() != 422 {
                return Err(extract_http_error(
                    "failed to create GitHub repository",
                    status,
                    &body,
                ));
            }

            let existing = client
                .get(format!("https://api.github.com/repos/{owner}/{repo_name}"))
                .header(USER_AGENT, APP_USER_AGENT)
                .header(ACCEPT, "application/vnd.github+json")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let existing_status = existing.status();
            let existing_body = existing.text().await.map_err(|err| err.to_string())?;

            if !existing_status.is_success() {
                return Err(extract_http_error(
                    "failed to load existing GitHub repository",
                    existing_status,
                    &existing_body,
                ));
            }

            let repo: RepoResponse =
                serde_json::from_str(&existing_body).map_err(|err| err.to_string())?;
            Ok(RepoEnsureResponse {
                owner: owner.to_string(),
                repo: repo.name.unwrap_or_else(|| repo_name.to_string()),
                html_url: repo
                    .html_url
                    .unwrap_or_else(|| format!("https://github.com/{owner}/{repo_name}")),
                default_branch: repo.default_branch.unwrap_or_else(|| "main".to_string()),
            })
        }
        Provider::Gitee => {
            let response = client
                .post("https://gitee.com/api/v5/user/repos")
                .form(&[
                    ("access_token", access_token.to_string()),
                    ("name", repo_name.to_string()),
                    ("description", repo_description.to_string()),
                    (
                        "private",
                        if repo_private { "true" } else { "false" }.to_string(),
                    ),
                    ("auto_init", "true".to_string()),
                ])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.is_success() {
                let repo: RepoResponse =
                    serde_json::from_str(&body).map_err(|err| err.to_string())?;
                return Ok(RepoEnsureResponse {
                    owner: owner.to_string(),
                    repo: repo.name.unwrap_or_else(|| repo_name.to_string()),
                    html_url: repo
                        .html_url
                        .unwrap_or_else(|| format!("https://gitee.com/{owner}/{repo_name}")),
                    default_branch: repo.default_branch.unwrap_or_else(|| "master".to_string()),
                });
            }

            if status.as_u16() != 422 {
                return Err(extract_http_error(
                    "failed to create Gitee repository",
                    status,
                    &body,
                ));
            }

            let existing = client
                .get(format!(
                    "https://gitee.com/api/v5/repos/{owner}/{repo_name}"
                ))
                .query(&[("access_token", access_token)])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let existing_status = existing.status();
            let existing_body = existing.text().await.map_err(|err| err.to_string())?;

            if !existing_status.is_success() {
                return Err(extract_http_error(
                    "failed to load existing Gitee repository",
                    existing_status,
                    &existing_body,
                ));
            }

            let repo: RepoResponse =
                serde_json::from_str(&existing_body).map_err(|err| err.to_string())?;
            Ok(RepoEnsureResponse {
                owner: owner.to_string(),
                repo: repo.name.unwrap_or_else(|| repo_name.to_string()),
                html_url: repo
                    .html_url
                    .unwrap_or_else(|| format!("https://gitee.com/{owner}/{repo_name}")),
                default_branch: repo.default_branch.unwrap_or_else(|| "master".to_string()),
            })
        }
    }
}

async fn fetch_existing_sha(
    client: &reqwest::Client,
    provider: Provider,
    access_token: &str,
    owner: &str,
    repo: &str,
    path: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    match provider {
        Provider::Github => {
            let response = client
                .get(format!(
                    "https://api.github.com/repos/{owner}/{repo}/contents/{path}"
                ))
                .header(USER_AGENT, APP_USER_AGENT)
                .header(ACCEPT, "application/vnd.github+json")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .query(&[("ref", branch)])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.as_u16() == 404 {
                return Ok(None);
            }

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to inspect existing GitHub file",
                    status,
                    &body,
                ));
            }

            let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
            Ok(value
                .get("sha")
                .and_then(Value::as_str)
                .map(ToString::to_string))
        }
        Provider::Gitee => {
            let response = client
                .get(format!(
                    "https://gitee.com/api/v5/repos/{owner}/{repo}/contents/{path}"
                ))
                .query(&[("access_token", access_token), ("ref", branch)])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.as_u16() == 404 {
                return Ok(None);
            }

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to inspect existing Gitee file",
                    status,
                    &body,
                ));
            }

            let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
            Ok(value
                .get("sha")
                .and_then(Value::as_str)
                .map(ToString::to_string))
        }
    }
}

async fn fetch_file_contents(
    client: &reqwest::Client,
    provider: Provider,
    access_token: &str,
    owner: &str,
    repo: &str,
    path: &str,
    branch: &str,
) -> Result<Option<String>, String> {
    match provider {
        Provider::Github => {
            let response = client
                .get(format!(
                    "https://api.github.com/repos/{owner}/{repo}/contents/{path}"
                ))
                .header(USER_AGENT, APP_USER_AGENT)
                .header(ACCEPT, "application/vnd.github+json")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .query(&[("ref", branch)])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.as_u16() == 404 {
                return Ok(None);
            }

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to load GitHub workspace file",
                    status,
                    &body,
                ));
            }

            let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
            Ok(value
                .get("content")
                .and_then(Value::as_str)
                .map(decode_base64_to_string)
                .transpose()?)
        }
        Provider::Gitee => {
            let response = client
                .get(format!(
                    "https://gitee.com/api/v5/repos/{owner}/{repo}/contents/{path}"
                ))
                .query(&[("access_token", access_token), ("ref", branch)])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if status.as_u16() == 404 {
                return Ok(None);
            }

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to load Gitee workspace file",
                    status,
                    &body,
                ));
            }

            let value: Value = serde_json::from_str(&body).map_err(|err| err.to_string())?;
            Ok(value
                .get("content")
                .and_then(Value::as_str)
                .map(decode_base64_to_string)
                .transpose()?)
        }
    }
}

async fn put_file_contents(
    client: &reqwest::Client,
    provider: Provider,
    access_token: &str,
    owner: &str,
    repo: &str,
    branch: &str,
    path: &str,
    content: &str,
    message: &str,
) -> Result<(), String> {
    let sha = fetch_existing_sha(client, provider, access_token, owner, repo, path, branch).await?;
    let encoded = STANDARD.encode(content);

    match provider {
        Provider::Github => {
            let mut payload = json!({
                "message": message,
                "content": encoded,
                "branch": branch
            });

            if let Some(sha) = sha {
                payload["sha"] = Value::String(sha);
            }

            let response = client
                .put(format!(
                    "https://api.github.com/repos/{owner}/{repo}/contents/{path}"
                ))
                .header(USER_AGENT, APP_USER_AGENT)
                .header(ACCEPT, "application/vnd.github+json")
                .header(AUTHORIZATION, format!("Bearer {access_token}"))
                .json(&payload)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to sync GitHub file",
                    status,
                    &body,
                ));
            }
        }
        Provider::Gitee => {
            let method = if sha.is_some() {
                reqwest::Method::PUT
            } else {
                reqwest::Method::POST
            };

            let mut payload = vec![
                ("access_token", access_token.to_string()),
                ("content", encoded),
                ("message", message.to_string()),
                ("branch", branch.to_string()),
            ];

            if let Some(sha) = sha {
                payload.push(("sha", sha));
            }

            let response = client
                .request(
                    method,
                    format!("https://gitee.com/api/v5/repos/{owner}/{repo}/contents/{path}"),
                )
                .form(&payload)
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to sync Gitee file",
                    status,
                    &body,
                ));
            }
        }
    }

    Ok(())
}

#[tauri::command]
async fn workspace_exchange_oauth_code(
    provider: String,
    code: String,
    redirect_uri: String,
) -> Result<OAuthExchangeResponse, String> {
    let provider = Provider::parse(&provider)?;
    let client = github_client()?;
    let (client_id, client_secret) = get_provider_oauth_credentials(provider)?;

    let access_token = match provider {
        Provider::Github => {
            let response = client
                .post("https://github.com/login/oauth/access_token")
                .header(ACCEPT, "application/json")
                .header(CONTENT_TYPE, "application/json")
                .json(&json!({
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "code": code,
                    "redirect_uri": redirect_uri
                }))
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to exchange GitHub OAuth code",
                    status,
                    &body,
                ));
            }

            let token: GithubTokenResponse =
                serde_json::from_str(&body).map_err(|err| err.to_string())?;
            token.access_token.ok_or_else(|| {
                token
                    .error_description
                    .or(token.error)
                    .unwrap_or_else(|| "GitHub did not return an access token".to_string())
            })?
        }
        Provider::Gitee => {
            let response = client
                .post("https://gitee.com/oauth/token")
                .form(&[
                    ("grant_type", "authorization_code".to_string()),
                    ("code", code),
                    ("client_id", client_id),
                    ("client_secret", client_secret),
                    ("redirect_uri", redirect_uri),
                ])
                .send()
                .await
                .map_err(|err| err.to_string())?;

            let status = response.status();
            let body = response.text().await.map_err(|err| err.to_string())?;

            if !status.is_success() {
                return Err(extract_http_error(
                    "failed to exchange Gitee OAuth code",
                    status,
                    &body,
                ));
            }

            let token: GiteeTokenResponse =
                serde_json::from_str(&body).map_err(|err| err.to_string())?;
            token.access_token.ok_or_else(|| {
                token
                    .error_description
                    .or(token.error)
                    .unwrap_or_else(|| "Gitee did not return an access token".to_string())
            })?
        }
    };

    let login = fetch_user_login(&client, provider, &access_token).await?;

    Ok(OAuthExchangeResponse {
        access_token,
        login,
    })
}

#[tauri::command]
async fn workspace_ensure_repo(
    provider: String,
    access_token: String,
    repo_name: String,
    repo_description: String,
    repo_private: bool,
    workspace_dir: String,
) -> Result<RepoEnsureResponse, String> {
    let provider = Provider::parse(&provider)?;
    let client = github_client()?;
    let owner = fetch_user_login(&client, provider, &access_token).await?;

    let repo = create_repo_if_needed(
        &client,
        provider,
        &access_token,
        &owner,
        &repo_name,
        &repo_description,
        repo_private,
    )
    .await?;

    put_file_contents(
        &client,
        provider,
        &access_token,
        &repo.owner,
        &repo.repo,
        &repo.default_branch,
        &format!("{workspace_dir}/.gitkeep"),
        "workspace placeholder",
        "chore: initialize markdown workspace",
    )
    .await?;

    Ok(repo)
}

#[tauri::command]
async fn workspace_sync_snapshot(
    provider: String,
    access_token: String,
    owner: String,
    repo: String,
    branch: String,
    workspace_dir: String,
    snapshot_json: String,
) -> Result<WorkspaceSyncResponse, String> {
    let provider = Provider::parse(&provider)?;
    let client = github_client()?;
    let path = format!("{workspace_dir}/workspace.json");
    let remote_snapshot_json = fetch_file_contents(
        &client,
        provider,
        &access_token,
        &owner,
        &repo,
        &path,
        &branch,
    )
    .await?
    .unwrap_or_default();

    let merged_snapshot_json = merge_workspace_snapshots(&snapshot_json, &remote_snapshot_json)?;

    put_file_contents(
        &client,
        provider,
        &access_token,
        &owner,
        &repo,
        &branch,
        &path,
        &merged_snapshot_json,
        "chore: sync markdown workspace",
    )
    .await?;

    Ok(WorkspaceSyncResponse {
        success: true,
        snapshot_json: merged_snapshot_json,
    })
}

fn main() {
    dotenv().ok();

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            workspace_exchange_oauth_code,
            workspace_ensure_repo,
            workspace_sync_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
