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
) -> Result<(), String> {
    let provider = Provider::parse(&provider)?;
    let client = github_client()?;

    put_file_contents(
        &client,
        provider,
        &access_token,
        &owner,
        &repo,
        &branch,
        &format!("{workspace_dir}/workspace.json"),
        &snapshot_json,
        "chore: sync markdown workspace",
    )
    .await
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
