import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { homedir } from 'node:os'

/**
 * dsh-session-folders — host half.
 *
 * On the first real user turn of a session that belongs to an enabled
 * workspace, create `<workspace>/session-<timestamp>-<id>/` and commit a
 * `working-directory/change` event so every file-producing tool (fs, bash,
 * document tools using workingDirectory) writes into that folder.
 *
 * Per-workspace on/off state is kept in a small JSON file in the profile
 * directory. The client half reads and writes it through same-origin routes.
 */

const STATE_VERSION = 1
const STATE_FILE = 'dsh-session-folders.state.json'

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
  return { version: STATE_VERSION, workspaces: {}, folders: {}, updatedAt: null }
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
    for (const [sessionId, record] of Object.entries(raw.folders)) {
      if (typeof sessionId !== 'string' || !record || typeof record !== 'object') continue
      if (typeof record.path !== 'string' || record.path === '') continue
      state.folders[sessionId] = {
        path: record.path,
        workspaceId: typeof record.workspaceId === 'string' ? record.workspaceId : '',
        name: typeof record.name === 'string' ? record.name : basename(record.path),
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

function pad(value, length = 2) {
  return String(value).padStart(length, '0')
}

function timestampOf(value) {
  const date = new Date(value ?? Date.now())
  if (Number.isNaN(date.getTime())) return '00000000-000000'
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function shortSessionId(sessionId) {
  const random = String(sessionId ?? '').replace(/^session-/u, '').replace(/[^a-zA-Z0-9]/gu, '')
  return random.slice(0, 8) || 'session'
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

async function createSessionFolder(workspacePath, session) {
  const base = `session-${timestampOf(session.header?.createdAt)}-${shortSessionId(session.id)}`
  let candidate = join(workspacePath, base)
  for (let index = 2; existsSync(candidate); index += 1) {
    candidate = join(workspacePath, `${base}-${index}`)
  }
  await mkdir(candidate, { recursive: true })
  return candidate
}

function workspaceRow(ctx, state, workspace) {
  const folderCount = Object.values(state.folders).filter((record) => record.workspaceId === workspace.id).length
  return {
    workspaceId: workspace.id,
    path: workspace.path,
    title: workspace.title || basename(workspace.path),
    enabled: state.workspaces[workspace.id] === true,
    folderCount,
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

  function persist() {
    if (!writeState(file, state)) logger.warn?.('[dsh-session-folders] failed to persist state file %s', file)
  }

  async function ensureSessionFolder(agent) {
    const session = agent?.session
    if (!session || typeof session.id !== 'string' || session.id === '') return
    if (state.folders[session.id] !== undefined) return
    if (session.header?.isSeeded === true) return
    if (session.header?.parentSession !== undefined) return
    if (Number(session.header?.delegationDepth ?? 0) > 0) return
    if (hasRealUserMessage(session)) return

    const workspace = findWorkspace(ctx, session)
    if (workspace === undefined) return
    if (state.workspaces[workspace.id] !== true) return

    const folderPath = await createSessionFolder(workspace.path, session)
    const record = {
      path: folderPath,
      workspaceId: workspace.id,
      name: basename(folderPath),
      createdAt: new Date().toISOString(),
    }
    state.folders[session.id] = record
    persist()
    try {
      session.append('working-directory/change', { cwd: folderPath })
    } catch (error) {
      delete state.folders[session.id]
      persist()
      throw error
    }
    logger.info?.('[dsh-session-folders] session %s -> %s', session.id, folderPath)
  }

  // The assembly waterfall runs before each model step and before tools are
  // used. The working-directory service computes its model-visible context
  // text after the rest of this chain returns, so committing the change here
  // keeps both the prompt and the tool cwd consistent on the very first turn.
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
  // pre-step still gets one chance to prepare the folder before tools run.
  ctx.on(
    'agent/pre-step',
    async (payload, next) => {
      if (payload?.agent !== undefined && Array.isArray(payload.messages)) {
        const hasUser = payload.messages.some((message) => {
          const kind = message?.source?.kind
          return kind === undefined || kind === 'user'
        })
        if (hasUser) {
          try {
            await ensureSessionFolder(payload.agent)
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
  })
}
