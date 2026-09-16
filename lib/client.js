/**
 * dsh-global-context —— 客户端半边（浏览器侧）。
 *
 * 这是手写的 Cordis 客户端插件产物，格式与市场里其它第三方插件一致：
 * 通过 window.__ModuleLoader__ 注册模块工厂，工厂返回 { apply, inject }，
 * 由宿主在浏览器里当作普通 Cordis 插件加载。不依赖任何构建步骤。
 *
 * 它往对话视图的 `conversation.view` 插槽注册一个标签页「全局上下文配置」。
 * 原装 DSH 的对话视图只有「对话」一个标签页，「轨迹」「上下文」都是插件加的。
 * 排序值是**运行时探测**出来的：读插槽里已有条目的 order，停在第一个空位
 * （也就是紧跟在最后一个之后），并在别的插件后来插到前面时自动让位；
 * 插槽不提供探测接口时退回 900。详见下方 chooseOrder。
 * 标签页通过宿主暴露的 /api/dsh-global-context 读写全局上下文文本，
 * 并把定位结果 POST 到 /api/dsh-global-context/placement 供事后核对。
 */

window.__ModuleLoader__.load({
  id: 'dsh-global-context',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const ROUTE = '/api/dsh-global-context'
    const PLACEMENT_ROUTE = '/api/dsh-global-context/placement'
    const SLOT = 'conversation.view'
    const TAB_ID = 'global-context'
    const TAB_LABEL = '全局上下文配置'
    /** 读不到插槽内容时的兜底排序值：取大值以确保排在最后。 */
    const FALLBACK_ORDER = 900
    /** 每次只前进 1 —— 于是总是停在「第一个空位」，紧跟在最后一个已有标签页之后。 */
    const ORDER_STEP = 1
    /** 让位次数上限，异常情况下不至于反复重注册。 */
    const MAX_ADJUST = 50

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

    // ── 标签页定位 ────────────────────────────────────────────────────────
    // 目标：永远排在已注册的标签页之后（原装 DSH 只有「对话」，其余都是插件加的）。
    // 做法：运行时读插槽里其它条目的 order，停在**第一个空位** —— 也就是紧跟在最后一个之后；
    // 并订阅插槽变化：如果之后有插件占到我们前面，就自动往后让一位。
    // 插槽不提供这些接口时退回一个大值（FALLBACK_ORDER），行为等价于「排在最后」。

    /** 读出插槽里其它标签页的 id/order（排除自己）；读不到返回 null。 */
    function readOtherTabs(slots) {
      try {
        if (typeof slots.entries !== 'function') return null
        const list = slots.entries(SLOT)
        if (!Array.isArray(list)) return null
        return list
          .filter((entry) => entry?.options?.id !== TAB_ID)
          .map((entry) => ({
            id: typeof entry?.options?.id === 'string' ? entry.options.id : '(无 id)',
            order: Number.isFinite(entry?.options?.order) ? entry.options.order : 0,
          }))
      } catch {
        return null
      }
    }

    /** 决定排序值：其它条目最大 order + 1（第一个空位）；读不到就退回兜底值。 */
    function chooseOrder(slots) {
      const others = readOtherTabs(slots)
      if (others === null) return { order: FALLBACK_ORDER, others: null, smart: false }
      let highest = 0
      for (const tab of others) if (tab.order > highest) highest = tab.order
      return { order: highest + ORDER_STEP, others, smart: true }
    }

    /** 把定位结果报给宿主（写进状态文件），只是诊断，失败完全不影响标签页。 */
    function reportPlacement(payload) {
      try {
        void fetch(PLACEMENT_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        }).catch(() => {})
      } catch {
        /* 忽略：诊断不上报也要能正常显示标签页。 */
      }
    }

    /**
     * 注册标签页；宿主渲染器会把组件挂到对话视图的标签栏里。
     * 位置是运行时探测出来的，见 chooseOrder。
     */
    function apply(ctx) {
      const slots = ctx?.slots
      if (slots === undefined || slots === null || typeof slots.register !== 'function') return

      let disposeTab = null
      let placedOrder = null
      let unsubscribe = null
      let adjustments = 0
      let disposed = false
      // 插槽的 register / dispose 都会**同步**通知订阅者，也就是会重入 place()。
      // placing 挡住重入（重入只记一笔 pending），循环再消化掉，避免自己触发自己。
      let placing = false
      let pending = false

      /** 一轮探测 + 注册；已经排在正确位置就什么都不做。 */
      const round = () => {
        let decision
        try {
          decision = chooseOrder(slots)
        } catch {
          decision = { order: FALLBACK_ORDER, others: null, smart: false }
        }
        // 已经就位（并列也算就位，因为并列时先注册的排前面）。
        if (disposeTab !== null && placedOrder !== null && decision.order <= placedOrder) return
        if (adjustments >= MAX_ADJUST) return
        adjustments += 1
        if (disposeTab !== null) {
          const previous = disposeTab
          disposeTab = null // 先清空再注销：注销会触发通知重新进来
          try {
            previous()
          } catch {
            /* 旧的注销失败不影响重新注册。 */
          }
        }
        // 只把 register 放进 try：诊断上报失败绝不能连累注册结果（否则会丢掉注销函数）。
        let dispose = null
        try {
          dispose = slots.register(
            { name: SLOT, id: TAB_ID, order: decision.order, label: () => TAB_LABEL },
            GlobalContextView,
          )
        } catch (error) {
          reportPlacement({ order: decision.order, failed: error instanceof Error ? error.message : String(error) });
          return;
        }
        disposeTab = typeof dispose === 'function' ? dispose : null
        placedOrder = decision.order
        reportPlacement({
          order: decision.order,
          smart: decision.smart,
          // 我的位次：排在我不前面的标签页数量 + 1（并列时先注册的算在前面）。
          rank: decision.others === null ? null : 1 + decision.others.filter((tab) => tab.order <= decision.order).length,
          others: decision.others,
        })
      }

      /** 放置，并消化放置期间到达的变化通知。 */
      const place = () => {
        if (disposed) return
        if (placing) {
          pending = true
          return
        }
        placing = true
        try {
          let rounds = 0
          do {
            pending = false
            round()
            rounds += 1
          } while (pending && rounds < 5 && !disposed)
        } finally {
          placing = false
        }
      }

      /** 订阅插槽变化：有插件插到前面就让位。 */
      const watch = () => {
        if (unsubscribe !== null || typeof slots.subscribe !== 'function') return
        try {
          unsubscribe = slots.subscribe(SLOT, () => {
            try {
              place()
            } catch {
              /* 让位失败就保持原位。 */
            }
          })
        } catch {
          unsubscribe = null
        }
      }

      const start = () => {
        place()
        watch()
      }

      try {
        if (typeof slots.inject === 'function') slots.inject(SLOT, start, 'dsh-global-context: conversation view')
        else start()
      } catch {
        try {
          start()
        } catch {
          /* 插槽不可用时静默降级：不显示标签页，但绝不影响宿主。 */
        }
      }

      try {
        ctx.effect?.(() => () => {
          disposed = true
          if (disposeTab !== null) {
            try {
              disposeTab()
            } catch {
              /* 忽略。 */
            }
            disposeTab = null
          }
          if (unsubscribe !== null) {
            try {
              unsubscribe()
            } catch {
              /* 忽略。 */
            }
            unsubscribe = null
          }
        })
      } catch {
        /* effect 不可用也无妨。 */
      }
    }

    // __internal 是给测试用的接缝：加载器只认 apply / inject / name，多余字段会被忽略。
    return {
      apply,
      inject: ['slots'],
      __internal: {
        GlobalContextView,
        callApi,
        readOtherTabs,
        chooseOrder,
        ROUTE,
        PLACEMENT_ROUTE,
        SLOT,
        TAB_ID,
        TAB_LABEL,
        FALLBACK_ORDER,
      },
    }
  },
})
