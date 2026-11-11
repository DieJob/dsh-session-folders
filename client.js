window.__ModuleLoader__.load({
  id: 'dsh-session-folders',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'session-folders'
    const STATE_URL = '/session-folders/state'
    const WORKSPACE_URL = '/session-folders/workspace'

    const DICTS = {
      zh: {
        'settings.nav': '会话文件夹',
        'settings.title': '会话文件夹',
        'settings.description': '为每个工作区单独设置：开启后，会话的首次对话会在工作区中创建独立子文件夹，会话产生的文件默认保存在其中。',
        'settings.note': '已有工作区默认关闭。新建工作区时会弹窗询问；也可以随时在这里修改。',
        'settings.empty': '还没有工作区。',
        'settings.loading': '正在读取工作区…',
        'settings.loadFailed': '读取失败',
        'settings.retry': '重试',
        'settings.toggleTitle': '切换会话文件夹',
        'settings.folderCount': '已创建 {count} 个会话文件夹',
        'settings.saveFailed': '保存失败，请重试。',
        'settings.enabled': '已开启',
        'settings.disabled': '未开启',
        'config.summary': '按工作区配置会话文件夹',
        'config.description': '每个工作区的会话文件夹开关如下。',
        'prompt.title': '启用会话文件夹？',
        'prompt.body': '检测到新工作区。是否为此工作区开启会话文件夹？开启后，每个会话的首次对话都会创建一个独立子文件夹，该会话产生的文件默认保存到其中。',
        'prompt.workspace': '工作区',
        'prompt.hint': '之后可以在 设置 → 会话文件夹 中修改。',
        'prompt.enable': '启用',
        'prompt.skip': '暂不启用',
        'prompt.saving': '保存中…',
        'prompt.error': '保存失败，请重试。',
        'prompt.close': '关闭',
      },
      en: {
        'settings.nav': 'Session Folders',
        'settings.title': 'Session Folders',
        'settings.description': 'Configure each workspace separately. When enabled, the first conversation of a session creates a dedicated subfolder inside the workspace, and files produced by that session are kept there by default.',
        'settings.note': 'Existing workspaces are off by default. New workspaces prompt when created; you can change this here at any time.',
        'settings.empty': 'No workspaces yet.',
        'settings.loading': 'Loading workspaces…',
        'settings.loadFailed': 'Could not load workspaces',
        'settings.retry': 'Retry',
        'settings.toggleTitle': 'Toggle session folders',
        'settings.folderCount': '{count} session folder(s) created',
        'settings.saveFailed': 'Could not save. Please retry.',
        'settings.enabled': 'Enabled',
        'settings.disabled': 'Disabled',
        'config.summary': 'Configure session folders per workspace',
        'config.description': 'Session-folder switches for each workspace.',
        'prompt.title': 'Enable session folders?',
        'prompt.body': 'A new workspace was detected. Enable session folders for it? When enabled, the first conversation of every session creates a dedicated subfolder and files produced by that session are kept there by default.',
        'prompt.workspace': 'Workspace',
        'prompt.hint': 'You can change this later in Settings → Session Folders.',
        'prompt.enable': 'Enable',
        'prompt.skip': 'Not now',
        'prompt.saving': 'Saving…',
        'prompt.error': 'Could not save. Please retry.',
        'prompt.close': 'Close',
      },
    }

    function detectLanguage() {
      try {
        const active = window.__DSH_LOCALE__ || document.documentElement?.lang || navigator.language || ''
        const text = String(active).toLowerCase()
        if (text.startsWith('zh')) return 'zh'
        if (text.startsWith('en')) return 'en'
      } catch {
        // ignore
      }
      return 'zh'
    }

    function fallbackText(key, vars) {
      const dict = DICTS[detectLanguage()] || DICTS.zh
      let text = dict[key] !== undefined ? dict[key] : DICTS.zh[key] !== undefined ? DICTS.zh[key] : key
      if (vars && typeof vars === 'object') {
        text = String(text).replace(/\{(\w+)\}/g, (match, name) => {
          const value = vars[name]
          return value === undefined || value === null ? match : String(value)
        })
      }
      return text
    }

    function fetchJson(url, options) {
      return fetch(url, { credentials: 'same-origin', ...(options || {}) }).then((response) => {
        return response.json().catch(() => null).then((data) => {
          if (!response.ok) {
            throw new Error(data && data.error ? String(data.error) : `HTTP ${response.status}`)
          }
          return data
        })
      })
    }

    const STYLE = [
      '.dsf-section{box-sizing:border-box;display:flex;flex-direction:column;gap:16px;width:100%;max-width:760px}',
      '.dsf-section-head{display:flex;flex-direction:column;gap:8px}',
      '.dsf-title{margin:0;font-size:16px;line-height:24px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dsf-description{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}',
      '.dsf-note{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dsf-list{display:flex;flex-direction:column;border-top:.5px solid var(--dsw-alias-border-l2)}',
      '.dsf-row{display:flex;align-items:center;gap:16px;padding:14px 0;border-bottom:.5px solid var(--dsw-alias-border-l2)}',
      '.dsf-row-main{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 auto}',
      '.dsf-row-title{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
      '.dsf-row-path{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
      '.dsf-row-meta{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dsf-switch{box-sizing:border-box;position:relative;flex:none;width:36px;height:20px;padding:0;border:1px solid var(--dsw-alias-border-l3);border-radius:999px;background:var(--dsw-alias-bg-layer-3);cursor:pointer;transition:background var(--ds-transition-duration,150ms) ease,border-color var(--ds-transition-duration,150ms) ease}',
      '.dsf-switch:hover:not(:disabled){border-color:var(--dsw-alias-border-l4)}',
      '.dsf-switch:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dsf-switch:disabled{opacity:.5;cursor:default}',
      '.dsf-switch-on{background:var(--dsw-alias-button-primary-fill);border-color:var(--dsw-alias-button-primary-fill)}',
      '.dsf-switch-thumb{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-switch-thumb,#fff);transition:transform var(--ds-transition-duration,150ms) ease}',
      '.dsf-switch-on .dsf-switch-thumb{transform:translateX(16px)}',
      '.dsf-error{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}',
      '.dsf-summary{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}',
      '.dsf-empty{padding:24px 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
      '.dsf-loading{padding:24px 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-tertiary)}',
      '.dsf-retry{appearance:none;border:none;background:none;color:var(--dsw-alias-brand-primary);cursor:pointer;font:inherit;padding:0;text-decoration:underline}',
      '.dsf-modal-root{pointer-events:auto;position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px}',
      '.dsf-modal-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}',
      '.dsf-modal-dialog{box-sizing:border-box;position:relative;z-index:1;display:flex;flex-direction:column;gap:14px;width:min(440px,100%);padding:22px 24px 24px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}',
      '.dsf-modal-dialog:focus{outline:none}',
      '.dsf-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}',
      '.dsf-modal-title{margin:0;font-size:16px;line-height:24px;font-weight:500}',
      '.dsf-modal-close{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;margin:-4px -6px 0 0;padding:0;border:none;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:20px;line-height:1}',
      '.dsf-modal-close:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsf-modal-close:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dsf-modal-body{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}',
      '.dsf-prompt-workspace{display:flex;align-items:baseline;gap:8px;padding:10px 12px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3)}',
      '.dsf-prompt-label{flex:none;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}',
      '.dsf-prompt-value{min-width:0;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);text-overflow:ellipsis;white-space:nowrap;overflow:hidden}',
      '.dsf-modal-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:4px}',
      '.dsf-btn{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 14px;border-radius:var(--dsw-radius-md);font:inherit;font-size:13px;line-height:20px;font-weight:500;cursor:pointer;border:1px solid transparent}',
      '.dsf-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dsf-btn:disabled{opacity:.55;cursor:default}',
      '.dsf-btn-primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}',
      '.dsf-btn-primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}',
      '.dsf-btn-secondary{border-color:var(--dsw-alias-border-l3);background:transparent;color:var(--dsw-alias-label-primary)}',
      '.dsf-btn-secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}',
    ].join('\n')

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const selector = 'style[data-plugin-css="dsh-session-folders/client.css"]'
      if (document.querySelector(selector) !== null) return () => {}
      const style = document.createElement('style')
      style.setAttribute('data-plugin-css', 'dsh-session-folders/client.css')
      style.textContent = STYLE
      document.head.appendChild(style)
      return () => style.remove()
    }

    function useLocaleTick(ctx) {
      const [, force] = React.useState(0)
      React.useEffect(() => {
        if (!ctx.locale || typeof ctx.locale.subscribe !== 'function') return undefined
        return ctx.locale.subscribe(() => force((value) => value + 1))
      }, [ctx])
    }

    function formatText(template, vars) {
      if (!vars || typeof vars !== 'object') return template
      return String(template).replace(/\{(\w+)\}/g, (match, name) => {
        const value = vars[name]
        return value === undefined || value === null ? match : String(value)
      })
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const bound = ctx.locale && typeof ctx.locale.bind === 'function' ? ctx.locale.bind(NS) : null
        const t = (key, vars) => {
          if (bound) {
            try {
              const text = bound(key, vars)
              if (typeof text === 'string' && text !== key) return text
            } catch {
              // fall through
            }
          }
          return fallbackText(key, vars)
        }

        ctx.effect(() => installStyles())
        ctx.effect(function* () {
          if (ctx.locale && typeof ctx.locale.register === 'function') {
            yield ctx.locale.register(NS, DICTS)
          }
        })

        function WorkspaceListImpl() {
          useLocaleTick(ctx)
          const [snapshot, setSnapshot] = React.useState({ loading: true, workspaces: [], error: null })
          const [busyId, setBusyId] = React.useState(null)
          const [actionError, setActionError] = React.useState(null)
          const [reloadTick, setReloadTick] = React.useState(0)

          React.useEffect(() => {
            let alive = true
            setSnapshot((current) => ({ ...current, loading: true, error: null }))
            fetchJson(STATE_URL)
              .then((data) => {
                if (!alive) return
                setSnapshot({
                  loading: false,
                  workspaces: Array.isArray(data?.workspaces) ? data.workspaces : [],
                  error: null,
                })
              })
              .catch((error) => {
                if (!alive) return
                setSnapshot({ loading: false, workspaces: [], error: String(error?.message || error) })
              })
            return () => { alive = false }
          }, [reloadTick])

          function toggle(workspace) {
            if (busyId !== null) return
            const nextEnabled = workspace.enabled !== true
            setBusyId(workspace.workspaceId)
            setActionError(null)
            fetchJson(WORKSPACE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: workspace.workspaceId, enabled: nextEnabled }),
            })
              .then((data) => {
                if (!data || data.ok !== true) throw new Error(data?.error || t('settings.saveFailed'))
                setSnapshot((current) => ({
                  ...current,
                  workspaces: current.workspaces.map((item) => item.workspaceId === workspace.workspaceId ? { ...item, enabled: nextEnabled } : item),
                }))
              })
              .catch((error) => setActionError(String(error?.message || error)))
              .finally(() => setBusyId(null))
          }

          if (snapshot.loading) {
            return h('div', { className: 'dsf-loading' }, t('settings.loading'))
          }
          if (snapshot.error !== null) {
            return h('div', { className: 'dsf-empty' },
              h('div', null, t('settings.loadFailed')),
              h('div', { className: 'dsf-error' }, snapshot.error),
              h('button', { type: 'button', className: 'dsf-retry', onClick: () => setReloadTick((value) => value + 1) }, t('settings.retry')),
            )
          }
          if (snapshot.workspaces.length === 0) {
            return h('div', { className: 'dsf-empty' }, t('settings.empty'))
          }
          return h('div', { className: 'dsf-list' },
            snapshot.workspaces.map((workspace) => {
              const enabled = workspace.enabled === true
              return h('div', { className: 'dsf-row', key: workspace.workspaceId },
                h('div', { className: 'dsf-row-main' },
                  h('div', { className: 'dsf-row-title', title: workspace.path }, workspace.title || workspace.path),
                  h('div', { className: 'dsf-row-path', title: workspace.path }, workspace.path),
                  h('div', { className: 'dsf-row-meta' }, formatText(t('settings.folderCount'), { count: workspace.folderCount ?? 0 })),
                ),
                h('button', {
                  type: 'button',
                  role: 'switch',
                  'aria-checked': enabled ? 'true' : 'false',
                  'aria-label': t('settings.toggleTitle'),
                  title: enabled ? t('settings.enabled') : t('settings.disabled'),
                  className: 'dsf-switch' + (enabled ? ' dsf-switch-on' : ''),
                  disabled: busyId !== null,
                  onClick: () => toggle(workspace),
                }, h('span', { className: 'dsf-switch-thumb', 'aria-hidden': 'true' })),
              )
            }),
            actionError !== null ? h('div', { className: 'dsf-error' }, actionError) : null,
          )
        }

        function SettingsSection() {
          useLocaleTick(ctx)
          return h('div', { className: 'dsf-section' },
            h('div', { className: 'dsf-section-head' },
              h('h2', { className: 'dsf-title' }, t('settings.title')),
              h('p', { className: 'dsf-description' }, t('settings.description')),
              h('p', { className: 'dsf-note' }, t('settings.note')),
            ),
            h(WorkspaceListImpl),
          )
        }

        function BundleConfigCard(props) {
          useLocaleTick(ctx)
          if (props && props.view === 'summary') {
            return h('div', { className: 'dsf-summary' }, t('config.summary'))
          }
          return h('div', { className: 'dsf-section' },
            h('p', { className: 'dsf-note' }, t('config.description')),
            h(WorkspaceListImpl),
          )
        }

        function PromptLayer(props) {
          useLocaleTick(ctx)
          const supported = typeof props?.useWorkspaces === 'function'
          const phase = supported ? props.useWorkspaces((state) => state.phase) : 'unsupported'
          const items = supported ? props.useWorkspaces((state) => state.items) : []
          const [queue, setQueue] = React.useState([])
          const [busy, setBusy] = React.useState(false)
          const [error, setError] = React.useState(null)
          const baselineRef = React.useRef(null)
          const primaryRef = React.useRef(null)

          const itemList = Array.isArray(items) ? items : []

          React.useEffect(() => {
            if (!supported || phase !== 'ready') return
            const ids = itemList.map((item) => item.workspaceId)
            if (baselineRef.current === null) {
              baselineRef.current = new Set(ids)
              return
            }
            const known = baselineRef.current
            const added = ids.filter((id) => !known.has(id))
            if (added.length === 0) return
            for (const id of added) known.add(id)
            setQueue((current) => {
              const next = current.slice()
              for (const id of added) if (!next.includes(id)) next.push(id)
              return next
            })
          }, [supported, phase, itemList])

          const currentId = queue.length > 0 ? queue[0] : null
          const current = currentId === null ? null : itemList.find((item) => item.workspaceId === currentId)

          React.useEffect(() => {
            if (currentId === null) return
            if (current !== undefined) return
            setQueue((value) => value.slice(1))
          }, [currentId, current])

          React.useEffect(() => {
            if (current === null || current === undefined) return undefined
            primaryRef.current?.focus?.()
            return undefined
          }, [current?.workspaceId])

          function answer(enabled) {
            if (currentId === null || busy) return
            setBusy(true)
            setError(null)
            fetchJson(WORKSPACE_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ workspaceId: currentId, enabled }),
            })
              .then((data) => {
                if (!data || data.ok !== true) throw new Error(data?.error || t('prompt.error'))
                setQueue((value) => value.slice(1))
              })
              .catch((cause) => setError(String(cause?.message || cause)))
              .finally(() => setBusy(false))
          }

          React.useEffect(() => {
            if (current === null || current === undefined) return undefined
            const onKeyDown = (event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                answer(false)
              }
            }
            document.addEventListener('keydown', onKeyDown)
            return () => document.removeEventListener('keydown', onKeyDown)
          }, [current?.workspaceId, busy])

          if (current === null || current === undefined) return null
          const displayTitle = current.title || String(current.path || '')
          return h('div', { className: 'dsf-modal-root' },
            h('div', { className: 'dsf-modal-mask', onClick: () => answer(false) }),
            h('div', {
              className: 'dsf-modal-dialog',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'dsf-prompt-title',
            },
              h('div', { className: 'dsf-modal-head' },
                h('h2', { className: 'dsf-modal-title', id: 'dsf-prompt-title' }, t('prompt.title')),
                h('button', {
                  type: 'button',
                  className: 'dsf-modal-close',
                  'aria-label': t('prompt.close'),
                  title: t('prompt.close'),
                  disabled: busy,
                  onClick: () => answer(false),
                }, '×'),
              ),
              h('p', { className: 'dsf-modal-body' }, t('prompt.body')),
              h('div', { className: 'dsf-prompt-workspace' },
                h('span', { className: 'dsf-prompt-label' }, t('prompt.workspace')),
                h('span', { className: 'dsf-prompt-value', title: current.path }, displayTitle),
              ),
              h('p', { className: 'dsf-note' }, t('prompt.hint')),
              error !== null ? h('p', { className: 'dsf-error' }, error) : null,
              h('div', { className: 'dsf-modal-actions' },
                h('button', {
                  type: 'button',
                  className: 'dsf-btn dsf-btn-secondary',
                  disabled: busy,
                  onClick: () => answer(false),
                }, t('prompt.skip')),
                h('button', {
                  type: 'button',
                  className: 'dsf-btn dsf-btn-primary',
                  ref: primaryRef,
                  disabled: busy,
                  onClick: () => answer(true),
                }, busy ? t('prompt.saving') : t('prompt.enable')),
              ),
            ),
          )
        }

        ctx.slots.inject('settings.section', () =>
          ctx.slots.register({
            name: 'settings.section',
            id: 'dsh-session-folders',
            order: 950,
            label: () => t('settings.nav'),
          }, SettingsSection),
        )

        ctx.slots.inject('plugins.bundle.config', () =>
          ctx.slots.register({
            name: 'plugins.bundle.config',
            key: 'dsh-session-folders',
            locale: NS,
          }, BundleConfigCard),
        )

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({
            name: 'shell.overlay',
            id: 'dsh-session-folders.prompt',
            order: 40,
            label: () => t('prompt.title'),
          }, PromptLayer),
        )
      },
    }
  },
})
