/**
 * dsh-global-context —— 客户端半边（浏览器侧）。
 *
 * 这是手写的 Cordis 客户端插件产物，格式与市场里其它第三方插件一致：
 * 通过 window.__ModuleLoader__ 注册模块工厂，工厂返回 { apply, inject }，
 * 由宿主在浏览器里当作普通 Cordis 插件加载。不依赖任何构建步骤。
 *
 * 它往对话视图的 `conversation.view` 插槽注册一个标签页「全局上下文配置」。
 * 原装 DSH 的对话视图只有「对话」一个标签页，「轨迹」「上下文」是插件加的
 * （核心轨迹 order 10、dsh-context 的上下文 order 20）；本插件用 order 900，
 * 因此永远排在所有已有标签页之后。
 * 标签页通过宿主暴露的 /api/dsh-global-context 读写全局上下文文本。
 */

window.__ModuleLoader__.load({
  id: 'dsh-global-context',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const ROUTE = '/api/dsh-global-context'
    const TAB_ID = 'global-context'
    const TAB_LABEL = '全局上下文配置'

    const styles = {
      root: {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px 16px 16px',
        boxSizing: 'border-box',
        overflow: 'auto',
        color: 'var(--dsh-text, inherit)',
      },
      header: {
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
      },
      title: { margin: 0, fontSize: '15px', fontWeight: 600 },
      subtitle: {
        margin: '4px 0 0',
        fontSize: '12px',
        lineHeight: 1.6,
        opacity: 0.72,
        maxWidth: '62ch',
      },
      actions: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
      button: {
        font: 'inherit',
        fontSize: '12px',
        padding: '5px 12px',
        borderRadius: '6px',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.35))',
        background: 'var(--dsh-surface, transparent)',
        color: 'inherit',
        cursor: 'pointer',
      },
      primary: {
        borderColor: 'var(--dsh-accent, #3b82f6)',
        background: 'var(--dsh-accent, #3b82f6)',
        color: '#fff',
      },
      editor: {
        flex: '1 1 auto',
        minHeight: '220px',
        width: '100%',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: '8px',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.35))',
        background: 'var(--dsh-surface, transparent)',
        color: 'inherit',
        font: 'inherit',
        fontSize: '13px',
        lineHeight: 1.7,
        resize: 'vertical',
        outline: 'none',
      },
      note: { fontSize: '12px', lineHeight: 1.6 },
      meta: {
        fontSize: '11px',
        lineHeight: 1.7,
        opacity: 0.62,
        wordBreak: 'break-all',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      },
      badge: {
        display: 'inline-block',
        marginLeft: '6px',
        padding: '0 6px',
        borderRadius: '999px',
        fontSize: '11px',
        border: '1px solid var(--dsh-border, rgba(127,127,127,0.35))',
        opacity: 0.9,
      },
    }

    /** 统一的 JSON 读取：非 2xx 或 ok:false 都抛出可读错误。 */
    async function callApi(init) {
      const response = await fetch(ROUTE, {
        credentials: 'same-origin',
        headers: { accept: 'application/json' },
        ...init,
      })
      let data = null
      try {
        data = await response.json()
      } catch {
        throw new Error(`响应不是 JSON（HTTP ${response.status}）`)
      }
      if (!data || data.ok !== true) throw new Error(data && data.error ? data.error : `HTTP ${response.status}`)
      return data
    }

    function GlobalContextView() {
      const [phase, setPhase] = React.useState('loading')
      const [failure, setFailure] = React.useState(null)
      const [text, setText] = React.useState('')
      const [savedText, setSavedText] = React.useState('')
      const [meta, setMeta] = React.useState(null)
      const [note, setNote] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      const load = React.useCallback(async () => {
        setPhase('loading')
        setFailure(null)
        try {
          const data = await callApi({ method: 'GET' })
          const value = typeof data.text === 'string' ? data.text : ''
          setText(value)
          setSavedText(value)
          setMeta(data)
          setPhase('ready')
        } catch (error) {
          setFailure(error && error.message ? error.message : String(error))
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        void load()
      }, [load])

      const save = React.useCallback(
        async (value) => {
          setBusy(true)
          setNote(null)
          try {
            const data = await callApi({
              method: 'POST',
              headers: { 'content-type': 'application/json', accept: 'application/json' },
              body: JSON.stringify({ text: value }),
            })
            setSavedText(value)
            setNote({
              kind: 'ok',
              text: value === '' ? '已清空：全局上下文不再注入（下一条消息起生效）' : `已保存 ${data.bytes} 字节，下一条消息即生效`,
            })
            await load()
          } catch (error) {
            setNote({ kind: 'error', text: `保存失败：${error && error.message ? error.message : String(error)}` })
          } finally {
            setBusy(false)
          }
        },
        [load],
      )

      const dirty = text !== savedText
      const chars = text.length
      const bytes = meta && typeof meta.bytes === 'number' ? meta.bytes : 0

      const content = []

      content.push(
        h(
          'div',
          { key: 'header', style: styles.header },
          h(
            'div',
            null,
            h('h2', { style: styles.title }, TAB_LABEL),
            h(
              'p',
              { style: styles.subtitle },
              '这里写的内容会注入到每个会话系统提示词的最顶部（排在内置身份之前），对所有会话、所有模型生效。保存后下一条消息立即生效，不需要重启。留空即停用。',
            ),
          ),
          h(
            'div',
            { style: styles.actions },
            h('button', { type: 'button', style: styles.button, disabled: busy, onClick: () => void load() }, '重新载入'),
            h(
              'button',
              {
                type: 'button',
                style: styles.button,
                disabled: busy || (text === '' && savedText === ''),
                onClick: () => void save(''),
              },
              '清空并停用',
            ),
            h(
              'button',
              {
                type: 'button',
                style: { ...styles.button, ...styles.primary },
                disabled: busy || !dirty,
                onClick: () => void save(text),
              },
              busy ? '保存中…' : dirty ? '保存修改' : '已保存',
            ),
          ),
        ),
      )

      if (phase === 'loading') {
        content.push(h('div', { key: 'loading', style: styles.note }, '读取中…'))
      }
      if (phase === 'error') {
        content.push(
          h(
            'div',
            { key: 'error', style: { ...styles.note, color: 'var(--dsh-danger, #b42318)' } },
            `读取失败：${failure}。请确认插件已在宿主侧加载（重启一次 DSH Desktop 后生效）。`,
          ),
        )
      }

      content.push(
        h('textarea', {
          key: 'editor',
          style: styles.editor,
          value: text,
          spellCheck: false,
          placeholder: '例如：\n始终用简体中文回答。\n涉及文件改动时，最后列出改动的文件。\n回答先给结论，再给理由。',
          onChange: (event) => setText(event.target.value),
          onKeyDown: (event) => {
            if ((event.ctrlKey || event.metaKey) && String(event.key).toLowerCase() === 's') {
              event.preventDefault()
              if (!busy && dirty) void save(text)
            }
          },
        }),
      )

      if (note !== null) {
        content.push(
          h(
            'div',
            {
              key: 'note',
              style: {
                ...styles.note,
                color: note.kind === 'error' ? 'var(--dsh-danger, #b42318)' : 'var(--dsh-success, #067647)',
              },
            },
            note.text,
          ),
        )
      }

      const metaBits = []
      if (dirty) metaBits.push('有未保存修改')
      metaBits.push(`${chars} 字符 / ${bytes} 字节`)
      if (meta !== null && meta.path) metaBits.push(`文件：${meta.path}`)
      if (meta !== null) metaBits.push(`段名 ${meta.sectionName} · order ${meta.order}${meta.enabled === false ? ' · 已在配置里停用' : ''}`)
      if (meta !== null && meta.sectionRegistered === false) metaBits.push(`宿主侧注册失败：${meta.sectionError || '未知原因'}`)

      content.push(
        h(
          'div',
          { key: 'meta', style: styles.meta },
          metaBits.map((bit, index) => h('div', { key: index }, bit)),
          h('div', { key: 'hint' }, '快捷键 Ctrl/Cmd + S 保存'),
        ),
      )

      return h('div', { style: styles.root }, content)
    }

    /** 注册标签页；宿主渲染器会把组件挂到对话视图的标签栏里。 */
    function apply(ctx) {
      const register = () =>
        ctx.slots.register(
          {
            name: 'conversation.view',
            id: TAB_ID,
            // 900 = 排在所有已有标签页之后。原装 DSH 只有「对话」一个标签页，
            // 「上下文」等是插件加的（dsh-context 用 20），取一个大值可保证本标签始终在最后。
            order: 900,
            label: () => TAB_LABEL,
          },
          GlobalContextView,
        )
      if (ctx.slots !== undefined && typeof ctx.slots.inject === 'function') {
        ctx.slots.inject('conversation.view', register, 'dsh-global-context: conversation view')
      } else {
        register()
      }
    }

    // __internal 是给测试用的接缝：加载器只认 apply / inject / name，多余字段会被忽略。
    return { apply, inject: ['slots'], __internal: { GlobalContextView, callApi, ROUTE, TAB_ID, TAB_LABEL } }
  },
})
