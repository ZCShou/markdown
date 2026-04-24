import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergeWorkspaceSnapshots as mergeWorkspaceSnapshotData } from '../src/workspace/snapshot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv(filePath) {
    if (!fs.existsSync(filePath)) return;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        if (!line || line.trim().startsWith('#')) continue;
        const separatorIndex = line.indexOf('=');
        if (separatorIndex === -1) continue;

        const key = line.slice(0, separatorIndex).trim();
        const rawValue = line.slice(separatorIndex + 1).trim();

        if (key && process.env[key] === undefined) {
            process.env[key] = rawValue;
        }
    }
}

loadDotEnv(path.resolve(__dirname, '..', '.env'));

const PORT = Number(process.env.OAUTH_BRIDGE_PORT || 3001);
const REQUEST_BODY_LIMIT = process.env.OAUTH_BRIDGE_BODY_LIMIT || '50mb';
const app = express();

app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    next();
});

function getProviderEnv(provider) {
    if (provider === 'github') {
        return {
            clientId: process.env.VITE_GITHUB_CLIENT_ID || '',
            clientSecret: process.env.VITE_GITHUB_CLIENT_SECRET || ''
        };
    }

    if (provider === 'gitee') {
        return {
            clientId: process.env.VITE_GITEE_CLIENT_ID || '',
            clientSecret: process.env.VITE_GITEE_CLIENT_SECRET || ''
        };
    }

    throw new Error(`Unsupported provider: ${provider}`);
}

function getProviderApi(provider) {
    if (provider === 'github') {
        return {
            userUrl: 'https://api.github.com/user',
            tokenUrl: 'https://github.com/login/oauth/access_token',
            createRepoUrl: 'https://api.github.com/user/repos'
        };
    }

    if (provider === 'gitee') {
        return {
            userUrl: 'https://gitee.com/api/v5/user',
            tokenUrl: 'https://gitee.com/oauth/token',
            createRepoUrl: 'https://gitee.com/api/v5/user/repos'
        };
    }

    throw new Error(`Unsupported provider: ${provider}`);
}

function makeJsonError(res, status, message, details) {
    res.status(status).json({
        message,
        ...(details ? { details } : {})
    });
}

async function parseJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    return { message: await response.text() };
}

function encodeBase64(value) {
    return Buffer.from(value, 'utf8').toString('base64');
}

function decodeBase64(value) {
    return Buffer.from(String(value || '').replace(/\s+/g, ''), 'base64').toString('utf8');
}

async function fetchUserLogin(provider, accessToken) {
    const api = getProviderApi(provider);

    const response =
        provider === 'github'
            ? await fetch(api.userUrl, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'markdown-workspace-bridge'
                }
            })
            : await fetch(`${api.userUrl}?access_token=${encodeURIComponent(accessToken)}`);

    const result = await parseJsonResponse(response);

    if (!response.ok) {
        throw new Error(result.message || result.error_description || '获取用户信息失败');
    }

    return result.login || result.name || '';
}

async function getExistingFileSha(provider, accessToken, owner, repo, pathName, branch) {
    const url =
        provider === 'github'
            ? `https://api.github.com/repos/${owner}/${repo}/contents/${pathName}?ref=${encodeURIComponent(branch)}`
            : `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${pathName}?access_token=${encodeURIComponent(accessToken)}&ref=${encodeURIComponent(branch)}`;

    const response = await fetch(url, {
        headers:
            provider === 'github'
                ? {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'markdown-workspace-bridge'
                }
                : undefined
    });

    if (response.status === 404) return null;

    const result = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(result.message || '读取远程文件信息失败');
    }

    return result.sha || null;
}

async function getFileContents(provider, accessToken, owner, repo, pathName, branch) {
    const url =
        provider === 'github'
            ? `https://api.github.com/repos/${owner}/${repo}/contents/${pathName}?ref=${encodeURIComponent(branch)}`
            : `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${pathName}?access_token=${encodeURIComponent(accessToken)}&ref=${encodeURIComponent(branch)}`;

    const response = await fetch(url, {
        headers:
            provider === 'github'
                ? {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${accessToken}`,
                    'User-Agent': 'markdown-workspace-bridge'
                }
                : undefined
    });

    if (response.status === 404) {
        return null;
    }

    const result = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(result.message || '读取远程工作空间文件失败');
    }

    if (!result?.content) {
        return null;
    }

    return decodeBase64(result.content);
}

async function putFileContents(provider, accessToken, owner, repo, branch, workspaceDir, fileName, content, message) {
    const pathName = `${workspaceDir}/${fileName}`;
    const sha = await getExistingFileSha(provider, accessToken, owner, repo, pathName, branch);
    const encodedContent = encodeBase64(content);

    if (provider === 'github') {
        const body = {
            message,
            content: encodedContent,
            branch
        };

        if (sha) body.sha = sha;

        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${pathName}`, {
            method: 'PUT',
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
                'User-Agent': 'markdown-workspace-bridge'
            },
            body: JSON.stringify(body)
        });

        const result = await parseJsonResponse(response);
        if (!response.ok) {
            throw new Error(result.message || '同步 GitHub 工作空间失败');
        }

        return result;
    }

    const params = new URLSearchParams({
        access_token: accessToken,
        content: encodedContent,
        message,
        branch
    });

    if (sha) params.set('sha', sha);

    const response = await fetch(`https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${pathName}`, {
        method: sha ? 'PUT' : 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params
    });

    const result = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(result.message || '同步 Gitee 工作空间失败');
    }

    return result;
}

app.get('/api/workspace/health', (_req, res) => {
    res.json({ ok: true });
});

app.get('/api/workspace/oauth/config', (req, res) => {
    try {
        const provider = String(req.query.provider || '');
        const { clientId } = getProviderEnv(provider);

        if (!clientId) {
            makeJsonError(
                res,
                400,
                `缺少 ${provider === 'github' ? 'GitHub' : 'Gitee'} Client ID 配置。`
            );
            return;
        }

        res.json({ clientId });
    } catch (error) {
        makeJsonError(res, 400, error.message || '读取 OAuth 配置失败');
    }
});

app.post('/api/workspace/oauth/exchange', async (req, res) => {
    try {
        const { provider, code, redirectUri } = req.body || {};
        const { clientId, clientSecret } = getProviderEnv(provider);

        if (!clientId || !clientSecret) {
            makeJsonError(res, 400, `缺少 ${provider} OAuth 配置，请检查 bridge 服务环境变量。`);
            return;
        }

        const api = getProviderApi(provider);

        const response =
            provider === 'github'
                ? await fetch(api.tokenUrl, {
                    method: 'POST',
                    headers: {
                        Accept: 'application/json',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        client_id: clientId,
                        client_secret: clientSecret,
                        code,
                        redirect_uri: redirectUri
                    })
                })
                : await fetch(api.tokenUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: new URLSearchParams({
                        grant_type: 'authorization_code',
                        code,
                        client_id: clientId,
                        client_secret: clientSecret,
                        redirect_uri: redirectUri
                    })
                });

        const result = await parseJsonResponse(response);

        if (!response.ok) {
            makeJsonError(res, response.status, result.message || result.error_description || 'OAuth token 交换失败', result);
            return;
        }

        const accessToken = result.access_token;
        if (!accessToken) {
            makeJsonError(res, 400, result.error_description || 'OAuth 响应中缺少 access_token', result);
            return;
        }

        const login = await fetchUserLogin(provider, accessToken);

        res.json({
            accessToken,
            login
        });
    } catch (error) {
        makeJsonError(res, 500, error.message || 'OAuth token 交换失败');
    }
});

app.post('/api/workspace/repo/ensure', async (req, res) => {
    try {
        const { provider, accessToken, repoName, repoDescription, repoPrivate, workspaceDir } = req.body || {};
        const owner = await fetchUserLogin(provider, accessToken);

        let repoResponse;

        if (provider === 'github') {
            repoResponse = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'markdown-workspace-bridge'
                },
                body: JSON.stringify({
                    name: repoName,
                    description: repoDescription,
                    private: repoPrivate,
                    auto_init: true
                })
            });
        } else {
            repoResponse = await fetch('https://gitee.com/api/v5/user/repos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    access_token: accessToken,
                    name: repoName,
                    description: repoDescription,
                    private: repoPrivate ? 'true' : 'false',
                    auto_init: 'true'
                })
            });
        }

        let repoResult = await parseJsonResponse(repoResponse);

        if (!repoResponse.ok && repoResponse.status !== 422) {
            makeJsonError(res, repoResponse.status, repoResult.message || '创建远程仓库失败', repoResult);
            return;
        }

        if (!repoResponse.ok && repoResponse.status === 422) {
            const existingUrl =
                provider === 'github'
                    ? `https://api.github.com/repos/${owner}/${repoName}`
                    : `https://gitee.com/api/v5/repos/${owner}/${repoName}?access_token=${encodeURIComponent(accessToken)}`;

            const existingResponse = await fetch(existingUrl, {
                headers:
                    provider === 'github'
                        ? {
                            Accept: 'application/vnd.github+json',
                            Authorization: `Bearer ${accessToken}`,
                            'User-Agent': 'markdown-workspace-bridge'
                        }
                        : undefined
            });

            repoResult = await parseJsonResponse(existingResponse);

            if (!existingResponse.ok) {
                makeJsonError(res, existingResponse.status, repoResult.message || '读取已有仓库失败', repoResult);
                return;
            }
        }

        const defaultBranch =
            repoResult.default_branch || (provider === 'gitee' ? 'master' : 'main');

        await putFileContents(
            provider,
            accessToken,
            owner,
            repoResult.name || repoName,
            defaultBranch,
            workspaceDir,
            '.gitkeep',
            'workspace placeholder',
            'chore: initialize markdown workspace'
        );

        res.json({
            owner,
            repo: repoResult.name || repoName,
            htmlUrl:
                repoResult.html_url ||
                (provider === 'github'
                    ? `https://github.com/${owner}/${repoName}`
                    : `https://gitee.com/${owner}/${repoName}`),
            defaultBranch
        });
    } catch (error) {
        makeJsonError(res, 500, error.message || '创建或初始化工作空间仓库失败');
    }
});

app.post('/api/workspace/snapshot/sync', async (req, res) => {
    try {
        const {
            provider,
            accessToken,
            owner,
            repo,
            branch,
            workspaceDir,
            snapshotJson
        } = req.body || {};

        const remoteSnapshotJson =
            (await getFileContents(
                provider,
                accessToken,
                owner,
                repo,
                `${workspaceDir}/workspace.json`,
                branch
            )) || '';

        const mergedSnapshotJson = JSON.stringify(
            mergeWorkspaceSnapshotData(snapshotJson, remoteSnapshotJson),
            null,
            2
        );

        await putFileContents(
            provider,
            accessToken,
            owner,
            repo,
            branch,
            workspaceDir,
            'workspace.json',
            mergedSnapshotJson,
            'chore: sync markdown workspace'
        );

        res.json({ success: true, snapshotJson: mergedSnapshotJson });
    } catch (error) {
        makeJsonError(res, 500, error.message || '同步工作空间快照失败');
    }
});

app.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') {
        makeJsonError(
            res,
            413,
            `请求体过大，已超过 bridge 限制（当前 ${REQUEST_BODY_LIMIT}）。`
        );
        return;
    }

    next(error);
});

app.listen(PORT, () => {
    console.warn(`OAuth bridge listening on http://localhost:${PORT}`);
});
