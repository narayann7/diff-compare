export class AuthRequiredError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AuthRequiredError'
  }
}

export type FileDisplayMode = 'tabs' | 'stacked'

export interface CommitFile {
  filename: string
  previousFilename?: string
  status: 'added' | 'removed' | 'modified' | 'renamed' | 'copied' | 'changed' | 'unchanged'
  additions: number
  deletions: number
  original: string
  modified: string
  rawPatch?: string
}

export interface CommitInfo {
  sha: string
  shortSha: string
  message: string
  author: string
  date: string
  files: CommitFile[]
  repoUrl: string
  platform: 'github' | 'gitlab'
}

function parsePatch(patch: string | undefined): { original: string; modified: string } {
  if (!patch) return { original: '', modified: '' }

  const originalLines: string[] = []
  const modifiedLines: string[] = []

  for (const line of patch.split('\n')) {
    if (line.startsWith('@@') || line.startsWith('\\ ')) continue
    if (line.startsWith('-')) {
      originalLines.push(line.slice(1))
    } else if (line.startsWith('+')) {
      modifiedLines.push(line.slice(1))
    } else {
      const content = line.startsWith(' ') ? line.slice(1) : line
      originalLines.push(content)
      modifiedLines.push(content)
    }
  }

  return {
    original: originalLines.join('\n'),
    modified: modifiedLines.join('\n'),
  }
}

function countPatchChanges(patch: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of patch.split('\n')) {
    if (line.startsWith('+') && !line.startsWith('+++')) additions++
    else if (line.startsWith('-') && !line.startsWith('---')) deletions++
  }
  return { additions, deletions }
}

// ─── Token helpers ─────────────────────────────────────────────────────────

function getGitHubToken(): string | null {
  try { return localStorage.getItem('gh_token') } catch { return null }
}

function getGitLabToken(baseUrl: string): string | null {
  try {
    const hostname = new URL(baseUrl).hostname
    return localStorage.getItem(`gl_token_${hostname}`)
  } catch { return null }
}

// ─── GitHub ────────────────────────────────────────────────────────────────

function parseGitHubCommitUrl(url: string): { owner: string; repo: string; sha: string } | null {
  const match = url.match(/github\.com\/([^/?#]+)\/([^/?#]+)\/commit\/([a-f0-9]+)/i)
  if (!match) return null
  return { owner: match[1], repo: match[2], sha: match[3] }
}

async function fetchGitHubCommit(url: string): Promise<CommitInfo> {
  const parsed = parseGitHubCommitUrl(url)
  if (!parsed) {
    throw new Error('Invalid GitHub commit URL. Expected: https://github.com/owner/repo/commit/sha')
  }

  const { owner, repo, sha } = parsed
  const token = getGitHubToken()
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${sha}`,
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  )

  if (!response.ok) {
    if (response.status === 404) {
      if (!token) throw new AuthRequiredError('Repository not found or private. Add a GitHub token to access it.')
      throw new Error('Commit not found or your token lacks access to this repository')
    }
    if (response.status === 403) {
      const body = await response.json().catch(() => ({}))
      const msg: string = (body as { message?: string })?.message ?? ''
      if (msg.includes('API rate limit exceeded')) {
        throw new AuthRequiredError('GitHub API rate limit exceeded. Add a token for higher limits.')
      }
      throw new AuthRequiredError('Access denied. Check your GitHub token has repo scope.')
    }
    if (response.status === 401) {
      throw new AuthRequiredError('Authentication failed. Check your GitHub token.')
    }
    throw new Error(`GitHub API error (${response.status})`)
  }

  const data = await response.json()

  const files: CommitFile[] = (data.files ?? []).map((f: {
    filename: string
    previous_filename?: string
    status: string
    additions: number
    deletions: number
    patch?: string
  }) => {
    const { original, modified } = parsePatch(f.patch)
    return {
      filename: f.filename,
      previousFilename: f.previous_filename,
      status: f.status as CommitFile['status'],
      additions: f.additions,
      deletions: f.deletions,
      original,
      modified,
      rawPatch: f.patch,
    }
  })

  return {
    sha: data.sha,
    shortSha: (data.sha as string).slice(0, 7),
    message: data.commit.message as string,
    author: data.commit.author.name as string,
    date: data.commit.author.date as string,
    files,
    repoUrl: `https://github.com/${owner}/${repo}`,
    platform: 'github',
  }
}

// ─── GitLab ────────────────────────────────────────────────────────────────

function parseGitLabCommitUrl(url: string): { baseUrl: string; projectPath: string; sha: string } | null {
  // Supports: https://gitlab.com/owner/repo/-/commit/sha  (any depth of groups)
  const match = url.match(/^(https?:\/\/[^/]+)\/(.+?)\/-\/commit\/([a-f0-9]+)/i)
  if (!match) return null
  return { baseUrl: match[1], projectPath: match[2], sha: match[3] }
}

async function fetchGitLabCommit(url: string): Promise<CommitInfo> {
  const parsed = parseGitLabCommitUrl(url)
  if (!parsed) {
    throw new Error('Invalid GitLab commit URL. Expected: https://gitlab.com/owner/repo/-/commit/sha')
  }

  const { baseUrl, projectPath, sha } = parsed
  const encodedPath = encodeURIComponent(projectPath)
  const apiBase = `${baseUrl}/api/v4/projects/${encodedPath}/repository`
  const token = getGitLabToken(baseUrl)
  const headers: Record<string, string> = token ? { 'PRIVATE-TOKEN': token } : {}

  const [commitRes, diffsRes] = await Promise.all([
    fetch(`${apiBase}/commits/${sha}`, { headers }),
    fetch(`${apiBase}/commits/${sha}/diff`, { headers }),
  ])

  if (!commitRes.ok) {
    if (commitRes.status === 401) throw new AuthRequiredError('This repository requires authentication. Add a GitLab token to access it.')
    if (commitRes.status === 403) throw new AuthRequiredError('Access denied. Verify your GitLab token has read_repository scope.')
    if (commitRes.status === 404) {
      if (!token) throw new AuthRequiredError('Repository not found or private. Add a GitLab token to access it.')
      throw new Error('Commit not found or your token lacks access to this repository')
    }
    throw new Error(`GitLab API error (${commitRes.status})`)
  }

  const commitData = await commitRes.json()
  const diffsData: {
    old_path: string
    new_path: string
    new_file: boolean
    renamed_file: boolean
    deleted_file: boolean
    diff: string
  }[] = diffsRes.ok ? await diffsRes.json() : []

  const files: CommitFile[] = diffsData.map((d) => {
    const { original, modified } = parsePatch(d.diff)
    const { additions, deletions } = countPatchChanges(d.diff)
    const status: CommitFile['status'] = d.new_file
      ? 'added'
      : d.deleted_file
      ? 'removed'
      : d.renamed_file
      ? 'renamed'
      : 'modified'
    return {
      filename: d.new_path,
      previousFilename: d.renamed_file ? d.old_path : undefined,
      status,
      additions,
      deletions,
      original,
      modified,
      rawPatch: d.diff,
    }
  })

  return {
    sha: commitData.id,
    shortSha: commitData.short_id,
    message: commitData.title,
    author: commitData.author_name,
    date: commitData.authored_date,
    files,
    repoUrl: `${baseUrl}/${projectPath}`,
    platform: 'gitlab',
  }
}

// ─── Unified entry point ────────────────────────────────────────────────────

export function detectPlatform(url: string): 'github' | 'gitlab' | null {
  if (url.includes('github.com')) return 'github'
  if (url.match(/gitlab\./i)) return 'gitlab'
  return null
}

export async function fetchCommit(url: string): Promise<CommitInfo> {
  const trimmed = url.trim()
  const platform = detectPlatform(trimmed)
  if (platform === 'github') return fetchGitHubCommit(trimmed)
  if (platform === 'gitlab') return fetchGitLabCommit(trimmed)
  throw new Error('Unsupported URL. Paste a GitHub or GitLab commit URL.')
}

export interface LineComment {
  id: string | number
  filename: string
  lineNumber: number
  side: 'left' | 'right'
  body: string
  author: string
  createdAt: string
  url: string
}

function buildPatchPositionMap(rawPatch: string): {
  posToLine: Map<number, { lineLeft: number | null; lineRight: number | null; type: string }>
  lineToPos: Map<string, number>
} {
  const posToLine = new Map<number, { lineLeft: number | null; lineRight: number | null; type: string }>()
  const lineToPos = new Map<string, number>()
  let pos = 0
  // Use content-relative counters (start at 0, increment per content line)
  // so they match DiffLine.lineNumberLeft/Right produced by computeLineDiff
  let left = 0
  let right = 0

  for (const line of rawPatch.split('\n')) {
    if (line.startsWith('@@')) {
      pos++
      // Do NOT reset left/right from the hunk header — keep content-relative counting
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      right++
      pos++
      posToLine.set(pos, { lineLeft: null, lineRight: right, type: 'added' })
      lineToPos.set(`right:${right}`, pos)
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      left++
      pos++
      posToLine.set(pos, { lineLeft: left, lineRight: null, type: 'removed' })
      lineToPos.set(`left:${left}`, pos)
    } else if (line !== '' && !line.startsWith('\\')) {
      left++
      right++
      pos++
      posToLine.set(pos, { lineLeft: left, lineRight: right, type: 'equal' })
      lineToPos.set(`left:${left}`, pos)
      lineToPos.set(`right:${right}`, pos)
    }
  }

  return { posToLine, lineToPos }
}

export async function postCommitComment(
  commitInfo: CommitInfo,
  filename: string,
  rawPatch: string | undefined,
  diffLine: import('./diff-utils').DiffLine,
  body: string
): Promise<LineComment> {
  if (commitInfo.platform === 'github') {
    return postGitHubCommitComment(commitInfo, filename, rawPatch, diffLine, body)
  }
  return postGitLabCommitComment(commitInfo, filename, diffLine, body)
}

async function postGitHubCommitComment(
  commitInfo: CommitInfo,
  filename: string,
  rawPatch: string | undefined,
  diffLine: import('./diff-utils').DiffLine,
  body: string
): Promise<LineComment> {
  const match = commitInfo.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) throw new Error('Invalid GitHub repo URL')
  const [, owner, repo] = match

  let position: number | undefined
  if (rawPatch) {
    const { lineToPos } = buildPatchPositionMap(rawPatch)
    if (diffLine.type === 'removed' && diffLine.lineNumberLeft) {
      position = lineToPos.get(`left:${diffLine.lineNumberLeft}`)
    } else if (diffLine.lineNumberRight) {
      position = lineToPos.get(`right:${diffLine.lineNumberRight}`)
    } else if (diffLine.lineNumberLeft) {
      position = lineToPos.get(`left:${diffLine.lineNumberLeft}`)
    }
  }

  const token = getGitHubToken()
  if (!token) throw new AuthRequiredError('Add a GitHub token to post comments.')

  const reqBody: Record<string, unknown> = { body, path: filename }
  if (position !== undefined) reqBody.position = position

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${commitInfo.sha}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(reqBody),
    }
  )

  if (!res.ok) {
    if (res.status === 401) throw new AuthRequiredError('Authentication failed. Check your GitHub token.')
    const err = await res.json().catch(() => ({}))
    throw new Error(`Failed to post comment: ${(err as { message?: string }).message ?? res.status}`)
  }

  const data = await res.json()
  return {
    id: data.id,
    filename,
    lineNumber: diffLine.lineNumberRight ?? diffLine.lineNumberLeft ?? 0,
    side: diffLine.type === 'removed' ? 'left' : 'right',
    body: data.body,
    author: data.user.login,
    createdAt: data.created_at,
    url: data.html_url,
  }
}

async function postGitLabCommitComment(
  commitInfo: CommitInfo,
  filename: string,
  diffLine: import('./diff-utils').DiffLine,
  body: string
): Promise<LineComment> {
  const parsed = parseGitLabCommitUrl(`${commitInfo.repoUrl}/-/commit/${commitInfo.sha}`)
  if (!parsed) throw new Error('Invalid GitLab URL')
  const { baseUrl, projectPath } = parsed
  const encodedPath = encodeURIComponent(projectPath)

  const token = getGitLabToken(baseUrl)
  if (!token) throw new AuthRequiredError('Add a GitLab token to post comments.')

  const lineNumber = diffLine.type === 'removed'
    ? (diffLine.lineNumberLeft ?? 1)
    : (diffLine.lineNumberRight ?? diffLine.lineNumberLeft ?? 1)
  const lineType = diffLine.type === 'removed' ? 'old' : 'new'

  const res = await fetch(
    `${baseUrl}/api/v4/projects/${encodedPath}/repository/commits/${commitInfo.sha}/comments`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'PRIVATE-TOKEN': token,
      },
      body: JSON.stringify({ note: body, path: filename, line: lineNumber, line_type: lineType }),
    }
  )

  if (!res.ok) {
    if (res.status === 401) throw new AuthRequiredError('Authentication failed. Check your GitLab token.')
    throw new Error(`Failed to post comment (${res.status})`)
  }

  const data = await res.json()
  return {
    id: data.id ?? `gl-${Date.now()}`,
    filename,
    lineNumber,
    side: diffLine.type === 'removed' ? 'left' : 'right',
    body: data.note,
    author: data.author?.name ?? data.author?.username ?? 'Unknown',
    createdAt: data.created_at,
    url: `${commitInfo.repoUrl}/-/commit/${commitInfo.sha}`,
  }
}

export async function fetchCommitComments(commitInfo: CommitInfo): Promise<LineComment[]> {
  if (commitInfo.platform === 'github') return fetchGitHubCommitComments(commitInfo)
  return fetchGitLabCommitComments(commitInfo)
}

async function fetchGitHubCommitComments(commitInfo: CommitInfo): Promise<LineComment[]> {
  const match = commitInfo.repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
  if (!match) return []
  const [, owner, repo] = match

  const token = getGitHubToken()
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/commits/${commitInfo.sha}/comments`,
    {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    }
  )

  if (!res.ok) return []

  const patchMaps = new Map<string, ReturnType<typeof buildPatchPositionMap>>()
  for (const file of commitInfo.files) {
    if (file.rawPatch) patchMaps.set(file.filename, buildPatchPositionMap(file.rawPatch))
  }

  const data: {
    id: number
    path: string | null
    position: number | null
    line: number | null
    body: string
    user: { login: string }
    created_at: string
    html_url: string
  }[] = await res.json()

  return data
    .filter(c => c.path !== null)
    .map(c => {
      let lineNumber = c.line ?? 0
      let side: 'left' | 'right' = 'right'
      if (!lineNumber && c.position && c.path) {
        const map = patchMaps.get(c.path)
        if (map) {
          const info = map.posToLine.get(c.position)
          if (info) {
            lineNumber = info.lineRight ?? info.lineLeft ?? 0
            side = info.lineRight ? 'right' : 'left'
          }
        }
      }
      return {
        id: c.id,
        filename: c.path!,
        lineNumber,
        side,
        body: c.body,
        author: c.user.login,
        createdAt: c.created_at,
        url: c.html_url,
      }
    })
    .filter(c => c.lineNumber > 0)
}

async function fetchGitLabCommitComments(commitInfo: CommitInfo): Promise<LineComment[]> {
  const parsed = parseGitLabCommitUrl(`${commitInfo.repoUrl}/-/commit/${commitInfo.sha}`)
  if (!parsed) return []
  const { baseUrl, projectPath } = parsed
  const encodedPath = encodeURIComponent(projectPath)

  const token = getGitLabToken(baseUrl)
  const res = await fetch(
    `${baseUrl}/api/v4/projects/${encodedPath}/repository/commits/${commitInfo.sha}/comments`,
    { headers: token ? { 'PRIVATE-TOKEN': token } : {} }
  )

  if (!res.ok) return []

  const data: {
    note: string
    path: string
    line: number
    line_type: 'new' | 'old'
    author: { name: string; username: string }
    created_at: string
  }[] = await res.json()

  return data
    .filter(c => c.path)
    .map((c, i) => ({
      id: `gl-${i}-${Date.now()}`,
      filename: c.path,
      lineNumber: c.line,
      side: c.line_type === 'old' ? 'left' : ('right' as 'left' | 'right'),
      body: c.note,
      author: c.author?.name ?? c.author?.username ?? 'Unknown',
      createdAt: c.created_at,
      url: `${commitInfo.repoUrl}/-/commit/${commitInfo.sha}`,
    }))
}
