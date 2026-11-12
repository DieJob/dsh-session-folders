import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * dsh-session-folders — host half.
 *
 * On the first real user turn of a session that belongs to an enabled
 * workspace, create a folder whose name is a short title derived from that
 * first user message and commit a `working-directory/change` event so every
 * file-producing tool writes into it.
 *
 * Folders are first-class records: `folders[folderId]` owns a physical path,
 * and `sessionFolders[sessionId]` maps a session to it. A new session can
 * inherit an existing folder through `pendingInheritance`; it then shares the
 * same physical directory without copying files.
 */

const STATE_VERSION = 2
const STATE_FILE = 'dsh-session-folders.state.json'
const FALLBACK_TITLE = '新会话'
const MAX_CJK_TITLE = 10
const MAX_LATIN_TITLE = 20
const MAX_TITLE_ATTEMPTS = 10000

export const name = 'dsh-session-folders'
export const inject = ['workspaceRegistry']

function profileDirectory(ctx) {
  try {
    const profileContext = ctx.get?.('profileContext')
    if (profileContext && typeof profileContext.dir === 'string' && profileContext.dir) {
      return profileContext.dir
    }
  } catch {
    // fall through to environment defaults
  }
  const env = process.env
  if (env.DSH_PROFILE_DIR) return env.DSH_PROFILE_DIR
  if (env.DSH_HOME) return join(env.DSH_HOME, 'profiles', env.DSH_PROFILE || 'desktop')
  return join(homedir(), '.dsh')
}

function statePath(ctx) {
  return join(profileDirectory(ctx), STATE_FILE)
}

function emptyState() {
  return {
    version: STATE_VERSION,
    workspaces: {},
    folders: {},
    sessionFolders: {},
    pendingInheritance: {},
    updatedAt: null,
  }
}

function stringArray(value) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item !== '')
}

function normalizeState(raw) {
  const state = emptyState()
  if (!raw || typeof raw !== 'object') return state

  if (raw.workspaces && typeof raw.workspaces === 'object' && !Array.isArray(raw.workspaces)) {
    for (const [workspaceId, enabled] of Object.entries(raw.workspaces)) {
      if (typeof workspaceId === 'string' && typeof enabled === 'boolean') {
        state.workspaces[workspaceId] = enabled
      }
    }
  }

  if (raw.folders && typeof raw.folders === 'object' && !Array.isArray(raw.folders)) {
    for (const [key, record] of Object.entries(raw.folders)) {
      if (!record || typeof record !== 'object') continue
      if (typeof record.path !== 'string' || record.path === '') continue

      const folderId = typeof record.id === 'string' && record.id !== ''
        ? record.id
        : typeof record.folderId === 'string' && record.folderId !== ''
          ? record.folderId
          : key
      const ownerSessionId = typeof record.ownerSessionId === 'string' && record.ownerSessionId !== ''
        ? record.ownerSessionId
        : key
      const sessionIds = stringArray(record.sessionIds)
      if (sessionIds.length === 0) sessionIds.push(ownerSessionId)

      state.folders[folderId] = {
        id: folderId,
        path: record.path,
        workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : '',
        ownerSessionId,
        sessionIds: [...new Set(sessionIds)],
        name: typeof record.name === 'string' && record.name !== '' ? record.name : basename(record.path),
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      }
    }
  }

  if (raw.sessionFolders && typeof raw.sessionFolders === 'object' && !Array.isArray(raw.sessionFolders)) {
    for (const [sessionId, folderId] of Object.entries(raw.sessionFolders)) {
      if (typeof sessionId === 'string' && typeof folderId === 'string' && state.folders[folderId] !== undefined) {
        state.sessionFolders[sessionId] = folderId
      }
    }
  }

  // Version 1 has no sessionFolders map: derive it from each folder's owner.
  for (const folder of Object.values(state.folders)) {
    for (const sessionId of folder.sessionIds) {
      if (state.sessionFolders[sessionId] === undefined) state.sessionFolders[sessionId] = folder.id
    }
    if (folder.ownerSessionId !== '' && state.sessionFolders[folder.ownerSessionId] === undefined) {
      state.sessionFolders[folder.ownerSessionId] = folder.id
    }
  }

  if (raw.pendingInheritance && typeof raw.pendingInheritance === 'object' && !Array.isArray(raw.pendingInheritance)) {
    for (const [sessionId, record] of Object.entries(raw.pendingInheritance)) {
      if (!record || typeof record !== 'object') continue
      if (typeof record.folderId !== 'string' || state.folders[record.folderId] === undefined) continue
      state.pendingInheritance[sessionId] = {
        folderId: record.folderId,
        fromSessionId: typeof record.fromSessionId === 'string' ? record.fromSessionId : '',
        createdAt: typeof record.createdAt === 'string' ? record.createdAt : null,
      }
    }
  }

  if (typeof raw.updatedAt === 'string') state.updatedAt = raw.updatedAt
  return state
}

function readState(file) {
  try {
    return normalizeState(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    return emptyState()
  }
}

function writeState(file, state) {
  try {
    mkdirSync(dirname(file), { recursive: true })
    state.updatedAt = new Date().toISOString()
    const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    renameSync(temporary, file)
    return true
  } catch {
    return false
  }
}

function hasRealUserMessage(session) {
  let events = []
  try {
    events = typeof session.ownEvents === 'function' ? session.ownEvents() : session.snapshotEvents()
  } catch {
    return false
  }
  if (!Array.isArray(events)) return false
  for (const event of events) {
    if (!event || event.type !== 'user/message') continue
    const kind = event.data?.source?.kind
    if (kind === undefined || kind === 'user') return true
  }
  return false
}

function messageText(message) {
  const content = message?.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  const parts = []
  for (const part of content) {
    if (typeof part === 'string') parts.push(part)
    else if (part && typeof part === 'object' && typeof part.text === 'string') parts.push(part.text)
  }
  return parts.join(' ').trim()
}

function userTextFromMessage(message) {
  if (!message || typeof message !== 'object') return ''
  if (message.role !== undefined && message.role !== 'user') return ''
  const kind = message.source?.kind
  if (kind !== undefined && kind !== 'user') return ''
  return messageText(message)
}

function userTextFromInboxEvent(event) {
  const inserted = Array.isArray(event?.data?.inserted) ? event.data.inserted : []
  for (const message of inserted) {
    const text = userTextFromMessage(message)
    if (text !== '') return text
  }
  return ''
}

function firstUserTextFromSession(session) {
  let events = []
  try {
    events = typeof session.snapshotEvents === 'function' ? session.snapshotEvents() : []
  } catch {
    return ''
  }
  for (const event of events) {
    if (!event || event.type !== 'user/message') continue
    const text = userTextFromMessage(event.data)
    if (text !== '') return text
  }
  return ''
}

function cleanTitleSource(text) {
  return String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/```[\s\S]*?```/gu, ' ')
    .replace(/`[^`\n]*`/gu, ' ')
    .replace(/<[^>\n]+>/gu, ' ')
    .replace(/https?:\/\/\S+/giu, ' ')
    .replace(/[\u0000-\u001f]/gu, ' ')
    .replace(/[ \t]+/gu, ' ')
    .trim()
}

function stripPoliteness(text) {
  let value = text
  for (let index = 0; index < 4; index += 1) {
    const next = value
      .replace(/^(你好|您好|请问|请|麻烦|帮我|帮忙|我想|我需要|能否|可以)[，,：:\s]*/u, '')
      .replace(/^(please|can you|could you|help me|i want to|i need to)[\s,]+/iu, '')
      .replace(/^(需求|目标|任务)[：:\s]*/u, '')
    if (next === value) break
    value = next
  }
  return value.trim()
}

function meaningfulClause(text) {
  const normalized = cleanTitleSource(text)
  const withoutCommand = normalized
    .replace(/^\/[^\s]+\s*/u, '')
    .replace(/^@[^\s]+\s*/u, '')
    .trim()
  const parts = withoutCommand
    .split(/[。！？!?；;，,]+/u)
    .map((part) => part.trim())
    .filter((part) => part !== '')
  let candidate = parts.find((part) => Array.from(part.replace(/[、：:\s]/gu, '')).length >= 2) || withoutCommand
  candidate = stripPoliteness(candidate)
    .replace(/一下/gu, '')
    .replace(/[的](?=[和与及]|$)/gu, '')
    .trim()
  const conjunction = candidate.split(/[和与及]|以及|并且|同时|然后/gu)[0].trim()
  if (Array.from(conjunction).length >= 2) candidate = conjunction
  return candidate
}

function titleLimit(text) {
  const chars = Array.from(text)
  if (chars.length === 0) return MAX_CJK_TITLE
  let cjk = 0
  for (const character of chars) {
    if (/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(character)) cjk += 1
  }
  return cjk / chars.length >= 0.3 ? MAX_CJK_TITLE : MAX_LATIN_TITLE
}

function fitTitle(text) {
  const source = String(text ?? '').trim()
  const chars = Array.from(source)
  const limit = titleLimit(source)
  let output = chars.slice(0, limit).join('')
  if (limit === MAX_LATIN_TITLE && chars.length > limit) {
    const cut = output.lastIndexOf(' ')
    if (cut >= Math.floor(limit / 2)) output = output.slice(0, cut)
  }
  return output.trim()
}

function deriveFolderTitle(text) {
  const candidate = fitTitle(meaningfulClause(text))
  return candidate !== '' ? candidate : FALLBACK_TITLE
}

function sanitizeFolderName(title) {
  let name = String(title ?? '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]/gu, ' ')
    .replace(/[\u0000-\u001f]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/gu, '')
  if (name === '') name = FALLBACK_TITLE
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/iu.test(name)) name = `${name}_会话`
  return name
}

async function createUniqueFolder(parent, title) {
  const base = sanitizeFolderName(title)
  for (let index = 0; index < MAX_TITLE_ATTEMPTS; index += 1) {
    const name = index === 0 ? base : `${base}_${index}`
    const path = join(parent, name)
    try {
      await mkdir(path)
      return { name, path }
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw new Error(`could not allocate a unique folder name for "${base}"`)
}

function findWorkspace(ctx, session) {
  const workspaces = ctx.workspaceRegistry.list()
  const bySession = workspaces.find((workspace) => Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(session.id))
  if (bySession !== undefined) return bySession
  const cwd = session.header?.cwd
  if (typeof cwd === 'string' && cwd !== '') {
    return workspaces.find((workspace) => workspace.path === cwd)
  }
  return undefined
}

function workspaceRow(ctx, state, workspace) {
  const folders = Object.values(state.folders).filter((record) => record.workspaceId === workspace.id)
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title || basename(workspace.path),
    enabled: state.workspaces[workspace.id] === true,
    folderCount: folders.length,
    sessionCount: folders.reduce((count, folder) => count + folder.sessionIds.length, 0),
  }
}

function sessionFolderView(state, sessionId) {
  const folderId = state.sessionFolders[sessionId]
  if (folderId === undefined) return null
  const folder = state.folders[folderId]
  if (folder === undefined) return null
  return {
    folderId: folder.id,
    path: folder.path,
    name: folder.name,
    workspaceId: folder.workspaceId,
    ownerSessionId: folder.ownerSessionId,
    sessionIds: [...folder.sessionIds],
  }
}

function json(res, code, body) {
  const text = JSON.stringify(body)
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Length', String(Buffer.byteLength(text)))
  res.end(text)
}

function isSameOrigin(req) {
  const headers = req?.headers
  if (headers === undefined || headers === null) return true
  const origin = headers.origin
  if (origin === undefined || origin === null || origin === '') return true
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false
  try {
    return new URL(String(origin)).host === host
  } catch {
    return false
  }
}

function isLoopbackHost(req) {
  const headers = req?.headers
  if (headers === undefined || headers === null) return false
  const host = headers.host
  if (typeof host !== 'string' || host === '') return false
  const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]
  return name === '127.0.0.1' || name === 'localhost' || name === '[::1]' || name === '::1'
}

function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let tooLarge = false
    req.on('data', (chunk) => {
      if (tooLarge) return
      raw += chunk
      if (raw.length > limit) tooLarge = true
    })
    req.on('end', () => {
      if (tooLarge) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }))
        return
      }
      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(Object.assign(new Error('body must be json'), { statusCode: 400 }))
      }
    })
    req.on('error', reject)
  })
}

export function apply(ctx, config) {
  const logger = ctx.logger ?? console
  const file = statePath(ctx)
  const state = readState(file)
  const preparations = new Map()

  function persist() {
    if (!writeState(file, state)) logger.warn?.('[dsh-session-folders] failed to persist state file %s', file)
  }

  async function prepareSessionFolder(session, firstText) {
    if (!session || typeof session.id !== 'string' || session.id === '') return
    if (state.sessionFolders[session.id] !== undefined) return

    // A pending inheritance takes precedence over creating a new folder.
    const pending = state.pendingInheritance[session.id]
    if (pending !== undefined) {
      const folder = state.folders[pending.folderId]
      if (folder === undefined) throw new Error(`inherited folder ${pending.folderId} does not exist`)
      if (!existsSync(folder.path)) throw new Error(`inherited folder path is missing: ${folder.path}`)
      session.append('working-directory/change', { cwd: folder.path })
      if (!folder.sessionIds.includes(session.id)) folder.sessionIds.push(session.id)
      state.sessionFolders[session.id] = folder.id
      delete state.pendingInheritance[session.id]
      persist()
      logger.info?.('[dsh-session-folders] session %s inherited %s', session.id, folder.path)
      return
    }

    if (session.header?.isSeeded === true) return
    if (session.header?.parentSession !== undefined) return
    if (Number(session.header?.delegationDepth ?? 0) > 0) return
    if (hasRealUserMessage(session)) return

    const workspace = findWorkspace(ctx, session)
    if (workspace === undefined) return
    if (state.workspaces[workspace.id] !== true) return

    const title = deriveFolderTitle(firstText || firstUserTextFromSession(session))
    const created = await createUniqueFolder(workspace.path, title)
    const record = {
      id: session.id,
      path: created.path,
      name: created.name,
      workspaceId: workspace.id,
      ownerSessionId: session.id,
      sessionIds: [session.id],
      createdAt: new Date().toISOString(),
    }

    session.append('working-directory/change', { cwd: created.path })
    state.folders[record.id] = record
    state.sessionFolders[session.id] = record.id
    persist()
    logger.info?.('[dsh-session-folders] session %s -> %s', session.id, created.path)
  }

  function ensureSessionFolder(agentOrSession, firstText) {
    const session = agentOrSession?.session ?? agentOrSession
    if (!session || typeof session.id !== 'string' || session.id === '') return Promise.resolve()
    const existing = preparations.get(session.id)
    if (existing !== undefined) return existing
    const work = prepareSessionFolder(session, firstText).finally(() => {
      if (preparations.get(session.id) === work) preparations.delete(session.id)
    })
    preparations.set(session.id, work)
    return work
  }

  // The inbox event is emitted when the first user message is queued, before
  // the system-prompt assembly for that turn. That gives us the message text
  // needed for the folder title without an extra model call.
  ctx.on('session/event', async (session, event) => {
    if (event?.type !== 'agent/inbox/spliced') return
    const text = userTextFromInboxEvent(event)
    if (text === '') return
    try {
      await ensureSessionFolder(session, text)
    } catch (error) {
      logger.warn?.('[dsh-session-folders] could not prepare folder from inbox: %s', String(error))
    }
  }, { prepend: true })

  // The assembly fallback covers sessions whose inbox event is not observable
  // (for example a replayed session) and keeps the first prompt's working
  // directory text consistent when no earlier event ran.
  ctx.on(
    'system-prompt/assemble',
    async (_assembly, context, next) => {
      if (context?.agent !== undefined && context.signal?.aborted !== true) {
        try {
          await ensureSessionFolder(context.agent)
        } catch (error) {
          logger.warn?.('[dsh-session-folders] could not prepare session folder: %s', String(error))
        }
      }
      return next()
    },
    { prepend: true },
  )

  // Defence in depth: if some prompt path skips the assembly waterfall, the
  // pre-step still gets one chance and can read the claimed user messages.
  ctx.on(
    'agent/pre-step',
    async (payload, next) => {
      if (payload?.agent !== undefined && Array.isArray(payload.messages)) {
        const first = payload.messages.find((message) => userTextFromMessage(message) !== '')
        if (first !== undefined) {
          try {
            await ensureSessionFolder(payload.agent, userTextFromMessage(first))
          } catch (error) {
            logger.warn?.('[dsh-session-folders] could not prepare session folder in pre-step: %s', String(error))
          }
        }
      }
      return next()
    },
    { prepend: true },
  )

  ctx.inject(['webServer'], (scoped) => {
    const webServer = scoped.get('webServer')
    if (webServer === undefined || webServer === null) return

    scoped.effect(() =>
      webServer.register({
        kind: 'exact',
        path: '/session-folders/state',
        handler: (req, res) => {
          if (!isLoopbackHost(req)) {
            json(res, 403, { error: 'host not allowed' })
            return
          }
          if (req.method !== 'GET') {
            json(res, 405, { error: 'method not allowed' })
            return
          }
          json(res, 200, {
            defaultEnabled: false,
            updatedAt: state.updatedAt,
            workspaces: ctx.workspaceRegistry.list().map((workspace) => workspaceRow(ctx, state, workspace)),
          })
        },
      }),
    )

    scoped.effect(() =>
      webServer.register({
        kind: 'exact',
        path: '/session-folders/session',
        handler: (req, res) => {
          if (!isLoopbackHost(req)) {
            json(res, 403, { error: 'host not allowed' })
            return
          }
          if (req.method !== 'GET') {
            json(res, 405, { error: 'method not allowed' })
            return
          }
          const url = new URL(req.url ?? '/', 'http://localhost')
          const sessionId = url.searchParams.get('sessionId') ?? ''
          json(res, 200, { sessionId, folder: sessionFolderView(state, sessionId) })
        },
      }),
    )

    scoped.effect(() =>
      webServer.register({
        kind: 'exact',
        path: '/session-folders/workspace',
        handler: (req, res) => {
          if (!isLoopbackHost(req)) {
            json(res, 403, { error: 'host not allowed' })
            return
          }
          if (req.method !== 'POST') {
            json(res, 405, { error: 'method not allowed' })
            return
          }
          if (!isSameOrigin(req)) {
            json(res, 403, { error: 'cross-origin write refused' })
            return
          }
          const contentType = String(req.headers?.['content-type'] || '').toLowerCase()
          if (!contentType.startsWith('application/json')) {
            json(res, 415, { error: 'content-type must be application/json' })
            return
          }
          readJsonBody(req).then((body) => {
            const workspaceId = body?.workspaceId
            const enabled = body?.enabled
            if (typeof workspaceId !== 'string' || workspaceId === '' || typeof enabled !== 'boolean') {
              json(res, 400, { error: 'workspaceId and boolean enabled are required' })
              return
            }
            const workspace = ctx.workspaceRegistry.get(workspaceId)
            if (workspace === undefined) {
              json(res, 404, { error: 'workspace not found' })
              return
            }
            state.workspaces[workspaceId] = enabled
            persist()
            json(res, 200, { ok: true, workspace: workspaceRow(ctx, state, workspace) })
          }).catch((error) => {
            json(res, error?.statusCode ?? 400, { error: String(error?.message ?? error) })
          })
        },
      }),
    )

    scoped.effect(() =>
      webServer.register({
        kind: 'exact',
        path: '/session-folders/inherit',
        handler: (req, res) => {
          if (!isLoopbackHost(req)) {
            json(res, 403, { error: 'host not allowed' })
            return
          }
          if (req.method !== 'POST') {
            json(res, 405, { error: 'method not allowed' })
            return
          }
          if (!isSameOrigin(req)) {
            json(res, 403, { error: 'cross-origin write refused' })
            return
          }
          const contentType = String(req.headers?.['content-type'] || '').toLowerCase()
          if (!contentType.startsWith('application/json')) {
            json(res, 415, { error: 'content-type must be application/json' })
            return
          }
          readJsonBody(req).then((body) => {
            const fromSessionId = body?.fromSessionId
            const newSessionId = body?.newSessionId
            if (typeof fromSessionId !== 'string' || fromSessionId === '' || typeof newSessionId !== 'string' || newSessionId === '') {
              json(res, 400, { error: 'fromSessionId and newSessionId are required' })
              return
            }
            if (state.sessionFolders[newSessionId] !== undefined) {
              json(res, 409, { error: 'new session already has a folder' })
              return
            }
            const folder = sessionFolderView(state, fromSessionId)
            if (folder === null) {
              json(res, 404, { error: 'source session has no folder' })
              return
            }
            const newWorkspace = ctx.workspaceRegistry.list().find((workspace) => workspace.sessionIds.includes(newSessionId))
            if (newWorkspace !== undefined && newWorkspace.id !== folder.workspaceId) {
              json(res, 409, { error: 'new session belongs to a different workspace' })
              return
            }
            if (!existsSync(folder.path)) {
              json(res, 409, { error: 'source folder is missing on disk' })
              return
            }
            state.pendingInheritance[newSessionId] = {
              folderId: folder.folderId,
              fromSessionId,
              createdAt: new Date().toISOString(),
            }
            persist()
            json(res, 200, { ok: true, folder })
          }).catch((error) => {
            json(res, error?.statusCode ?? 400, { error: String(error?.message ?? error) })
          })
        },
      }),
    )
  })
}
