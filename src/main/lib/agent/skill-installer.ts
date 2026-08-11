import { app } from 'electron'
import extract from 'extract-zip'
import { createHash, randomUUID } from 'node:crypto'
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parseDocument } from 'yaml'
import type {
  SkillCatalogEntry,
  SkillCatalogId,
  SkillDefinition,
  SkillFile,
  SkillFileKind,
  SkillImportResult,
  OfficialSkillSourceType,
  SkillSourceType
} from '@/ipc/chat/constants'

const MAX_SKILL_FILES = 1_000
const MAX_SKILL_BYTES = 25 * 1024 * 1024
const MAX_SINGLE_FILE_BYTES = 10 * 1024 * 1024
const MAX_SKILL_MD_BYTES = 1024 * 1024
const MAX_DISCOVERY_DEPTH = 8
const GITHUB_USER_AGENT = 'Lepus-Agent-Skills'
const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', '__MACOSX'])
const folderSkillRefreshes = new Map<string, Promise<SkillDefinition | null>>()

type ParsedSkillMarkdown = Pick<
  SkillDefinition,
  | 'id'
  | 'name'
  | 'description'
  | 'instructions'
  | 'triggers'
  | 'license'
  | 'compatibility'
  | 'allowedTools'
>

type GithubLocation = {
  owner: string
  repo: string
  ref?: string
  skillPath?: string
  repositoryUrl: string
}

type GithubTreeEntry = {
  path: string
  type: 'blob' | 'tree'
  size?: number
}

function skillStorageRoot(): string {
  return join(app.getPath('userData'), 'skills')
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function parseTriggerMetadata(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      ...new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      )
    ]
  }
  if (typeof value !== 'string') return []
  return [
    ...new Set(
      value
        .split(/[\n,，]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ]
}

export function parseSkillMarkdown(contents: string): ParsedSkillMarkdown {
  const frontmatter = contents.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/)
  if (!frontmatter) throw new Error('SKILL.md 缺少 YAML frontmatter')
  const document = parseDocument(frontmatter[1])
  if (document.errors.length) throw new Error(`SKILL.md YAML 无效：${document.errors[0].message}`)
  const metadata = document.toJS({ maxAliasCount: 20 }) as Record<string, unknown> | null
  if (!metadata || typeof metadata !== 'object') throw new Error('SKILL.md frontmatter 必须是对象')

  const id = asString(metadata.name).toLocaleLowerCase()
  if (!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id) || id.includes('--')) {
    throw new Error(`Skill name 不符合 Agent Skills 规范：${id || '(空)'}`)
  }
  const description = asString(metadata.description)
  if (!description || description.length > 1_024) {
    throw new Error('Skill description 长度必须为 1 到 1024 个字符')
  }
  const instructions = contents.slice(frontmatter[0].length).trim()
  if (!instructions) throw new Error('SKILL.md 指令正文不能为空')
  const firstHeading = instructions.match(/^#\s+(.+)$/m)?.[1]?.trim()
  const nestedMetadata =
    metadata.metadata && typeof metadata.metadata === 'object'
      ? (metadata.metadata as Record<string, unknown>)
      : {}
  const triggers = parseTriggerMetadata(
    metadata.triggers ?? nestedMetadata['lepus-triggers'] ?? nestedMetadata.triggers
  )
  const allowedTools = asString(metadata['allowed-tools']).split(/\s+/).filter(Boolean)

  return {
    id,
    name: firstHeading || id,
    description,
    instructions,
    triggers,
    license: asString(metadata.license),
    compatibility: asString(metadata.compatibility),
    allowedTools
  }
}

function fileKind(filePath: string): SkillFileKind {
  if (filePath === 'SKILL.md') return 'instruction'
  if (filePath.startsWith('scripts/')) return 'script'
  if (filePath.startsWith('references/')) return 'reference'
  if (filePath.startsWith('assets/')) return 'asset'
  return 'other'
}

async function collectSkillFiles(rootPath: string): Promise<SkillFile[]> {
  const files: SkillFile[] = []
  let totalBytes = 0

  async function visit(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      const absolutePath = join(directory, entry.name)
      const entryInfo = await lstat(absolutePath)
      if (entryInfo.isSymbolicLink()) throw new Error(`Skill 不允许包含软链接：${entry.name}`)
      if (entryInfo.isDirectory()) {
        await visit(absolutePath)
        continue
      }
      if (!entryInfo.isFile()) throw new Error(`Skill 包含不支持的文件类型：${entry.name}`)
      const relativePath = relative(rootPath, absolutePath).split(sep).join('/')
      if (!relativePath || relativePath.startsWith('../') || relativePath.includes('/../')) {
        throw new Error('Skill 文件路径越过了 Skill 根目录')
      }
      if (entryInfo.size > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`Skill 文件超过 10 MiB：${relativePath}`)
      }
      totalBytes += entryInfo.size
      if (totalBytes > MAX_SKILL_BYTES) throw new Error('Skill 总大小超过 25 MiB')
      files.push({ path: relativePath, size: entryInfo.size, kind: fileKind(relativePath) })
      if (files.length > MAX_SKILL_FILES) throw new Error('Skill 文件数量超过 1000 个')
    }
  }

  await visit(rootPath)
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

async function contentHash(rootPath: string, files: SkillFile[]): Promise<string> {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.path)
    hash.update('\0')
    hash.update(await readFile(join(rootPath, ...file.path.split('/'))))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function copySkillFiles(
  sourceRoot: string,
  destinationRoot: string,
  files: SkillFile[]
): Promise<void> {
  for (const file of files) {
    const source = join(sourceRoot, ...file.path.split('/'))
    const destination = join(destinationRoot, ...file.path.split('/'))
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}

async function findFolderSkillRoot(sourcePath: string, skillId: string): Promise<string> {
  const sourceInfo = await stat(sourcePath)
  if (!sourceInfo.isDirectory()) throw new Error('本地 Skill 来源不再是文件夹')
  const roots = await discoverSkillRoots(sourcePath)
  for (const root of roots) {
    try {
      const parsed = parseSkillMarkdown(await readFile(join(root, 'SKILL.md'), 'utf8'))
      if (parsed.id === skillId) return root
    } catch {
      // Continue looking for the originally imported Skill in a multi-Skill folder.
    }
  }
  throw new Error(`本地来源中找不到 Skill：${skillId}`)
}

async function replaceInstalledSkillFiles(
  skillId: string,
  sourceRoot: string,
  files: SkillFile[]
): Promise<string> {
  const storageRoot = skillStorageRoot()
  await mkdir(storageRoot, { recursive: true })
  const destinationRoot = join(storageRoot, skillId)
  if (resolve(sourceRoot) === resolve(destinationRoot)) return destinationRoot

  const temporaryRoot = join(storageRoot, `.sync-${skillId}-${randomUUID()}`)
  const backupRoot = join(storageRoot, `.backup-${skillId}-${randomUUID()}`)
  await mkdir(temporaryRoot, { recursive: false })
  let hasBackup = false
  try {
    await copySkillFiles(sourceRoot, temporaryRoot, files)
    try {
      await lstat(destinationRoot)
      await rename(destinationRoot, backupRoot)
      hasBackup = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    try {
      await rename(temporaryRoot, destinationRoot)
    } catch (error) {
      if (hasBackup) await rename(backupRoot, destinationRoot)
      throw error
    }
    if (hasBackup) await rm(backupRoot, { recursive: true, force: true })
    return destinationRoot
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

async function refreshImportedFolderSkillInternal(
  skill: SkillDefinition
): Promise<SkillDefinition | null> {
  if (skill.sourceType !== 'folder' || !skill.sourceUrl) return null
  const sourceRoot = await findFolderSkillRoot(skill.sourceUrl, skill.id)
  const skillMarkdownPath = join(sourceRoot, 'SKILL.md')
  const skillMarkdownInfo = await stat(skillMarkdownPath)
  if (!skillMarkdownInfo.isFile() || skillMarkdownInfo.size > MAX_SKILL_MD_BYTES) {
    throw new Error('SKILL.md 必须是小于 1 MiB 的普通文件')
  }
  const parsed = parseSkillMarkdown(await readFile(skillMarkdownPath, 'utf8'))
  const files = await collectSkillFiles(sourceRoot)
  const hash = await contentHash(sourceRoot, files)
  if (hash === skill.contentHash) return null

  const rootPath = await replaceInstalledSkillFiles(skill.id, sourceRoot, files)
  return {
    ...skill,
    ...parsed,
    enabled: skill.enabled,
    sourceType: 'folder',
    sourceUrl: sourceRoot,
    contentHash: hash,
    rootPath,
    files,
    createdAt: skill.createdAt,
    updatedAt: new Date().toISOString()
  }
}

export async function refreshImportedFolderSkill(
  skill: SkillDefinition
): Promise<SkillDefinition | null> {
  const running = folderSkillRefreshes.get(skill.id)
  if (running) return running
  const refresh: Promise<SkillDefinition | null> = refreshImportedFolderSkillInternal(
    skill
  ).finally(() => {
    if (folderSkillRefreshes.get(skill.id) === refresh) folderSkillRefreshes.delete(skill.id)
  })
  folderSkillRefreshes.set(skill.id, refresh)
  return refresh
}

export async function refreshImportedFolderSkills(
  skills: SkillDefinition[]
): Promise<SkillImportResult> {
  const refreshed: SkillDefinition[] = []
  const errors: string[] = []
  for (const skill of skills) {
    if (skill.sourceType !== 'folder') continue
    try {
      const update = await refreshImportedFolderSkill(skill)
      if (update) refreshed.push(update)
    } catch (error) {
      errors.push(`${skill.name}：${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { skills: refreshed, errors }
}

async function installSkillDirectory(
  sourceRoot: string,
  sourceType: SkillSourceType,
  sourceUrl: string
): Promise<SkillDefinition> {
  const skillMarkdownPath = join(sourceRoot, 'SKILL.md')
  const skillMarkdownInfo = await stat(skillMarkdownPath)
  if (!skillMarkdownInfo.isFile() || skillMarkdownInfo.size > MAX_SKILL_MD_BYTES) {
    throw new Error('SKILL.md 必须是小于 1 MiB 的普通文件')
  }
  const parsed = parseSkillMarkdown(await readFile(skillMarkdownPath, 'utf8'))
  const files = await collectSkillFiles(sourceRoot)
  const hash = await contentHash(sourceRoot, files)
  const storageRoot = skillStorageRoot()
  await mkdir(storageRoot, { recursive: true })
  const destinationRoot = join(storageRoot, parsed.id)
  try {
    await stat(destinationRoot)
    throw new Error(`Skill 已存在：${parsed.id}`)
  } catch (error) {
    if (error instanceof Error && error.message === `Skill 已存在：${parsed.id}`) throw error
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  const temporaryRoot = join(storageRoot, `.install-${randomUUID()}`)
  await mkdir(temporaryRoot, { recursive: false })
  try {
    await copySkillFiles(sourceRoot, temporaryRoot, files)
    await rename(temporaryRoot, destinationRoot)
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true })
    throw error
  }

  const now = new Date().toISOString()
  return {
    ...parsed,
    enabled: true,
    sourceType,
    sourceUrl,
    contentHash: hash,
    rootPath: destinationRoot,
    files,
    createdAt: now,
    updatedAt: now
  }
}

async function discoverSkillRoots(rootPath: string): Promise<string[]> {
  const roots: string[] = []

  async function visit(directory: string, depth: number): Promise<void> {
    if (depth > MAX_DISCOVERY_DEPTH) return
    const entries = await readdir(directory, { withFileTypes: true })
    if (entries.some((entry) => entry.isFile() && entry.name === 'SKILL.md')) {
      roots.push(directory)
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue
      await visit(join(directory, entry.name), depth + 1)
    }
  }

  await visit(rootPath, 0)
  return roots.sort()
}

async function extractSkillZip(zipPath: string, destination: string): Promise<void> {
  let entries = 0
  let uncompressedBytes = 0
  await extract(zipPath, {
    dir: destination,
    onEntry(entry) {
      entries += 1
      uncompressedBytes += entry.uncompressedSize
      const normalizedName = entry.fileName.replace(/\\/g, '/')
      if (
        normalizedName.startsWith('/') ||
        /^[a-z]:\//i.test(normalizedName) ||
        normalizedName.split('/').includes('..')
      ) {
        throw new Error(`ZIP 包含不安全路径：${entry.fileName}`)
      }
      if (entries > MAX_SKILL_FILES) throw new Error('ZIP 文件数量超过 1000 个')
      if (uncompressedBytes > MAX_SKILL_BYTES) throw new Error('ZIP 解压后大小超过 25 MiB')
      if (entry.uncompressedSize > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`ZIP 中的文件超过 10 MiB：${entry.fileName}`)
      }
    }
  })
}

async function installDiscoveredSkills(
  rootPath: string,
  sourceType: SkillSourceType,
  sourceUrl: string,
  requestedPath?: string
): Promise<SkillImportResult> {
  const requestedRoot = requestedPath
    ? join(rootPath, ...requestedPath.split('/').filter(Boolean))
    : rootPath
  const roots = await discoverSkillRoots(requestedRoot)
  if (!roots.length) throw new Error('没有找到包含 SKILL.md 的 Skill 目录')
  const skills: SkillDefinition[] = []
  const errors: string[] = []
  for (const skillRoot of roots) {
    try {
      const relativeRoot = relative(rootPath, skillRoot).split(sep).join('/')
      const effectiveSourceUrl = sourceUrl.startsWith('https://github.com/')
        ? `${sourceUrl.replace(/\/$/, '')}${relativeRoot ? `/${relativeRoot}` : ''}`
        : sourceType === 'folder'
          ? skillRoot
          : sourceUrl
      skills.push(await installSkillDirectory(skillRoot, sourceType, effectiveSourceUrl))
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { skills, errors }
}

export async function importSkillFolder(folderPath: string): Promise<SkillImportResult> {
  const folderInfo = await stat(folderPath)
  if (!folderInfo.isDirectory()) throw new Error('所选路径不是文件夹')
  return installDiscoveredSkills(folderPath, 'folder', folderPath)
}

export async function importSkillZip(zipPath: string): Promise<SkillImportResult> {
  const zipInfo = await stat(zipPath)
  if (!zipInfo.isFile() || zipInfo.size > MAX_SKILL_BYTES) {
    throw new Error('ZIP 必须是小于 25 MiB 的普通文件')
  }
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'lepus-skill-zip-'))
  try {
    await extractSkillZip(zipPath, temporaryRoot)
    return await installDiscoveredSkills(temporaryRoot, 'zip', zipPath)
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

function parseGithubUrl(value: string): GithubLocation {
  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    throw new Error('GitHub URL 无效')
  }
  if (url.protocol !== 'https:' || url.hostname.toLocaleLowerCase() !== 'github.com') {
    throw new Error('只支持 https://github.com 的仓库或 Skill 目录 URL')
  }
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length < 2) throw new Error('GitHub URL 必须包含 owner/repository')
  const owner = parts[0]
  const repo = parts[1].replace(/\.git$/i, '')
  const treeIndex = parts.indexOf('tree', 2)
  const ref = treeIndex >= 0 ? parts[treeIndex + 1] : undefined
  const skillPath = treeIndex >= 0 ? parts.slice(treeIndex + 2).join('/') : undefined
  return {
    owner,
    repo,
    ...(ref ? { ref } : {}),
    ...(skillPath ? { skillPath } : {}),
    repositoryUrl: `https://github.com/${owner}/${repo}`
  }
}

async function githubFetch(url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': GITHUB_USER_AGENT,
      'X-GitHub-Api-Version': '2022-11-28'
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000)
  })
  if (!response.ok) {
    const rateLimited =
      response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0'
    throw new Error(
      rateLimited
        ? 'GitHub API 请求次数已达上限，请稍后重试'
        : `GitHub 请求失败：${response.status}`
    )
  }
  return response
}

async function githubDefaultBranch(location: GithubLocation): Promise<string> {
  if (location.ref) return location.ref
  const response = await githubFetch(
    `https://api.github.com/repos/${location.owner}/${location.repo}`
  )
  const payload = (await response.json()) as { default_branch?: string }
  if (!payload.default_branch) throw new Error('无法确定 GitHub 仓库默认分支')
  return payload.default_branch
}

async function githubTree(location: GithubLocation, ref: string): Promise<GithubTreeEntry[]> {
  const treeResponse = await githubFetch(
    `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`
  )
  const tree = (await treeResponse.json()) as { tree?: GithubTreeEntry[]; truncated?: boolean }
  if (tree.truncated) throw new Error('GitHub 仓库文件树过大，返回结果不完整')
  return tree.tree ?? []
}

async function importGithubDirectory(
  location: GithubLocation,
  ref: string,
  sourceType: 'github' | OfficialSkillSourceType,
  existingTree?: GithubTreeEntry[]
): Promise<SkillImportResult> {
  const requestedPath = location.skillPath?.replace(/^\/+|\/+$/g, '') ?? ''
  const prefix = requestedPath ? `${requestedPath}/` : ''
  const files = (existingTree ?? (await githubTree(location, ref))).filter(
    (entry) => entry.type === 'blob' && (!prefix || entry.path.startsWith(prefix))
  )
  if (!files.some((entry) => entry.path === `${prefix}SKILL.md`)) {
    throw new Error('所选 GitHub 目录中没有 SKILL.md')
  }
  if (files.length > MAX_SKILL_FILES) throw new Error('GitHub Skill 文件数量超过 1000 个')
  const declaredBytes = files.reduce((total, file) => total + (file.size ?? 0), 0)
  if (declaredBytes > MAX_SKILL_BYTES) throw new Error('GitHub Skill 总大小超过 25 MiB')

  const temporaryRoot = await mkdtemp(join(tmpdir(), 'lepus-skill-github-directory-'))
  try {
    let downloadedBytes = 0
    await mapConcurrent(files, 6, async (file) => {
      const relativePath = file.path.slice(prefix.length)
      if (!relativePath || relativePath.startsWith('../') || relativePath.includes('/../')) {
        throw new Error('GitHub Skill 文件路径无效')
      }
      const rawUrl = `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${encodeURIComponent(ref)}/${file.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`
      const response = await fetch(rawUrl, { signal: AbortSignal.timeout(30_000) })
      if (!response.ok) throw new Error(`无法下载 GitHub Skill 文件：${file.path}`)
      const bytes = Buffer.from(await response.arrayBuffer())
      if (bytes.byteLength > MAX_SINGLE_FILE_BYTES) {
        throw new Error(`GitHub Skill 文件超过 10 MiB：${relativePath}`)
      }
      downloadedBytes += bytes.byteLength
      if (downloadedBytes > MAX_SKILL_BYTES) throw new Error('GitHub Skill 总大小超过 25 MiB')
      const destination = join(temporaryRoot, ...relativePath.split('/'))
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, bytes)
    })
    return await installDiscoveredSkills(
      temporaryRoot,
      sourceType,
      `${location.repositoryUrl}/tree/${encodeURIComponent(ref)}${requestedPath ? `/${requestedPath}` : ''}`
    )
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true })
  }
}

export async function importSkillGithub(
  value: string,
  sourceType: 'github' | OfficialSkillSourceType = 'github'
): Promise<SkillImportResult> {
  const location = parseGithubUrl(value)
  const ref = await githubDefaultBranch(location)
  if (location.skillPath) return importGithubDirectory(location, ref, sourceType)
  const tree = await githubTree(location, ref)
  const skillMarkdownPaths = tree
    .filter(
      (entry) =>
        entry.type === 'blob' && (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md'))
    )
    .map((entry) => (entry.path === 'SKILL.md' ? '' : dirname(entry.path).split(sep).join('/')))
  const skillPaths = skillMarkdownPaths.includes('') ? [''] : [...new Set(skillMarkdownPaths)]
  if (!skillPaths.length) throw new Error('GitHub 仓库中没有找到 SKILL.md')
  if (skillPaths.length > 100)
    throw new Error('GitHub 仓库包含超过 100 个 Skill，请使用具体目录 URL')
  const skills: SkillDefinition[] = []
  const errors: string[] = []
  for (const skillPath of skillPaths) {
    try {
      const result = await importGithubDirectory({ ...location, skillPath }, ref, sourceType, tree)
      skills.push(...result.skills)
      errors.push(...result.errors)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { skills, errors }
}

const OFFICIAL_CATALOGS: Record<
  SkillCatalogId,
  { owner: string; repo: string; sourceType: OfficialSkillSourceType }
> = {
  openai: { owner: 'openai', repo: 'skills', sourceType: 'official-openai' },
  anthropic: { owner: 'anthropics', repo: 'skills', sourceType: 'official-anthropic' },
  minimax: { owner: 'MiniMax-AI', repo: 'skills', sourceType: 'official-minimax' },
  modelscope: {
    owner: 'modelscope',
    repo: 'modelscope-skills',
    sourceType: 'official-modelscope'
  }
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor++
        results[index] = await mapper(values[index])
      }
    })
  )
  return results
}

export async function queryOfficialSkillCatalog(
  catalogId: SkillCatalogId
): Promise<SkillCatalogEntry[]> {
  const catalog = OFFICIAL_CATALOGS[catalogId]
  if (!catalog) throw new Error('未知的官方 Skill 目录')
  const location: GithubLocation = {
    owner: catalog.owner,
    repo: catalog.repo,
    repositoryUrl: `https://github.com/${catalog.owner}/${catalog.repo}`
  }
  const ref = await githubDefaultBranch(location)
  const skillFiles = (await githubTree(location, ref))
    .filter(
      (entry) =>
        entry.type === 'blob' && (entry.path === 'SKILL.md' || entry.path.endsWith('/SKILL.md'))
    )
    .slice(0, 200)

  const entries = await mapConcurrent(skillFiles, 6, async (entry) => {
    try {
      const rawUrl = `https://raw.githubusercontent.com/${catalog.owner}/${catalog.repo}/${encodeURIComponent(ref)}/${entry.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`
      const response = await fetch(rawUrl, { signal: AbortSignal.timeout(20_000) })
      if (!response.ok) return null
      const parsed = parseSkillMarkdown(await response.text())
      const skillPath = entry.path === 'SKILL.md' ? '' : dirname(entry.path).split(sep).join('/')
      return {
        id: `${catalog.owner}/${catalog.repo}/${skillPath}`,
        skillId: parsed.id,
        name: parsed.name,
        description: parsed.description,
        path: skillPath,
        sourceUrl: `${location.repositoryUrl}/tree/${encodeURIComponent(ref)}${skillPath ? `/${skillPath}` : ''}`,
        sourceType: catalog.sourceType
      } satisfies SkillCatalogEntry
    } catch {
      return null
    }
  })
  const validEntries = entries.filter((entry): entry is SkillCatalogEntry => entry !== null)
  if (!validEntries.length && skillFiles.length) throw new Error('官方目录中没有可解析的 Skill')
  return validEntries.sort((a, b) => a.name.localeCompare(b.name))
}

export async function removeInstalledSkill(skill: SkillDefinition): Promise<void> {
  if (!skill.rootPath) return
  const storageRoot = resolve(skillStorageRoot())
  const target = resolve(skill.rootPath)
  if (!target.startsWith(`${storageRoot}${sep}`) || basename(target) !== skill.id) {
    throw new Error('拒绝删除不属于 Lepus 管理目录的 Skill 文件')
  }
  await rm(target, { recursive: true, force: true })
}

export async function readInstalledSkillFile(
  skills: SkillDefinition[],
  skillId: string,
  filePath: string,
  maxCharacters = 100_000
): Promise<{ skillId: string; path: string; content: string; truncated: boolean }> {
  const skill = skills.find((item) => item.id === skillId && item.enabled && item.rootPath)
  if (!skill) throw new Error(`当前请求没有启用 Skill：${skillId}`)
  const normalizedPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '')
  const file = skill.files.find((item) => item.path === normalizedPath)
  if (!file) throw new Error(`Skill 文件不存在：${normalizedPath}`)
  if (file.kind === 'asset' && !/\.(?:csv|json|md|svg|txt|ya?ml)$/i.test(file.path)) {
    throw new Error('read_skill_file 只能读取文本资源')
  }
  const target = resolve(skill.rootPath, ...normalizedPath.split('/'))
  const root = resolve(skill.rootPath)
  if (!target.startsWith(`${root}${sep}`)) throw new Error('Skill 文件路径越过了 Skill 根目录')
  const targetInfo = await lstat(target)
  if (!targetInfo.isFile() || targetInfo.isSymbolicLink())
    throw new Error('目标不是普通 Skill 文件')
  const contents = await readFile(target, 'utf8')
  const limit = Math.min(Math.max(maxCharacters, 1), 500_000)
  return {
    skillId,
    path: normalizedPath,
    content: contents.slice(0, limit),
    truncated: contents.length > limit
  }
}
