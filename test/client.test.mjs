/**
 * 客户端半边测试：用真实的 React 在 Node 里加载手写的模块表产物，
 * 验证「产物形状」「标签页注册」「组件能渲染」「接口调用逻辑」四件事。
 *
 * 这里不需要浏览器：window.__ModuleLoader__ 用一个抓取用的桩替代，
 * require 用 profile 里的真实 react / react-dom。
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const home = process.env.DSH_HOME || path.join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness');
const profileDir = process.env.DSH_PROFILE_DIR || path.join(home, 'profiles', 'web');
const requireFromProfile = createRequire(path.join(profileDir, 'package.json'));
const React = requireFromProfile('react');
const { renderToStaticMarkup } = requireFromProfile('react-dom/server');

let captured = null;
globalThis.window = {
  __ModuleLoader__: {
    load(config) {
      captured = config;
    },
  },
};
await import('../lib/client.js');

test('产物以 window.__ModuleLoader__.load 注册，且 id 正确', () => {
  assert.ok(captured !== null, '应当调用 window.__ModuleLoader__.load');
  assert.equal(captured.id, 'dsh-global-context');
  assert.equal(typeof captured.factory, 'function');
});

const pluginModule = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error(`未预期的 require：${id}`);
});

test('工厂返回 Cordis 插件形状：apply + inject(services)', () => {
  assert.equal(typeof pluginModule.apply, 'function');
  assert.deepEqual(pluginModule.inject, ['slots']);
});

test('注册到 conversation.view 插槽，排在 对话/轨迹/上下文 之后', () => {
  const injected = [];
  const registered = [];
  const ctx = {
    slots: {
      inject(name, callback, label) {
        injected.push({ name, label });
        callback();
      },
      register(options, component) {
        registered.push({ options, component });
      },
    },
  };
  pluginModule.apply(ctx);

  assert.deepEqual(injected, [{ name: 'conversation.view', label: 'dsh-global-context: conversation view' }]);
  assert.equal(registered.length, 1);
  const { options, component } = registered[0];
  assert.equal(options.name, 'conversation.view');
  assert.equal(options.id, 'global-context');
  assert.equal(
    options.order,
    900,
    '要排在所有已有标签页之后：对话(0) / 轨迹(10) / 上下文(20)，以及以后新增的标签页',
  );
  assert.equal(typeof options.label, 'function');
  assert.equal(options.label(), '全局提示词配置');
  assert.equal(typeof component, 'function');
});

test('没有 slots.inject 时退化为直接注册', () => {
  const registered = [];
  pluginModule.apply({ slots: { register: (options, component) => registered.push({ options, component }) } });
  assert.equal(registered.length, 1);
});

/**
 * 假插槽：行为对齐真实的 SlotCore —— register 入账并通知订阅者，
 * entries(key) 返回当前全部条目，register 返回注销函数。
 */
function makeFakeSlots(initialTabs = [], { withEntries = true, withSubscribe = true } = {}) {
  const entries = [...initialTabs];
  const listeners = new Set();
  const registered = [];
  const notify = () => {
    for (const fn of [...listeners]) fn();
  };
  const slots = {
    inject(name, callback) {
      callback();
    },
    register(options, component) {
      const entry = { options, component };
      entries.push(entry);
      registered.push(entry);
      notify();
      return () => {
        const index = entries.indexOf(entry);
        if (index >= 0) entries.splice(index, 1);
        notify();
      };
    },
  };
  if (withEntries) slots.entries = (name) => (name === 'conversation.view' ? entries : []);
  if (withSubscribe) {
    slots.subscribe = (name, fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    };
  }
  return { slots, entries, registered };
}

const tab = (id, order) => ({ options: { id, order } });

test('智能定位：三个已有标签页（0/10/20）→ 停在第一个空位 21，位次第 4', () => {
  const originalFetch = globalThis.fetch;
  const posted = [];
  globalThis.fetch = async (url, init) => {
    posted.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  };
  try {
    const { slots, registered } = makeFakeSlots([tab('chat', 0), tab('trajectory', 10), tab('context', 20)]);
    pluginModule.apply({ slots });
    assert.equal(registered.length, 1, '只应注册一次（订阅回调不得引发反复重注册）');
    assert.equal(registered[0].options.order, 21, '应停在已有最大 order(20) 之后的第一个空位');
    assert.deepEqual(posted, [
      {
        url: pluginModule.__internal.PLACEMENT_ROUTE,
        body: {
          order: 21,
          smart: true,
          rank: 4,
          others: [
            { id: 'chat', order: 0 },
            { id: 'trajectory', order: 10 },
            { id: 'context', order: 20 },
          ],
        },
      },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('智能定位：后来有插件插到前面时自动让位到它之后', () => {
  const { slots, entries, registered } = makeFakeSlots([tab('chat', 0), tab('trajectory', 10), tab('context', 20)]);
  pluginModule.apply({ slots });
  assert.equal(registered[0].options.order, 21);

  // 模拟另一个插件随后注册到 500：位置被占，应当自动让到 501。
  slots.register({ name: 'conversation.view', id: 'later-plugin', order: 500, label: () => '后来的插件' }, () => null);
  const mine = registered.filter((entry) => entry.options.id === 'global-context');
  assert.equal(mine.length, 2, '应当注销旧条目并重新注册一次让位');
  assert.equal(mine[0].options.order, 21);
  assert.equal(mine[1].options.order, 501);

  const inSlot = entries.filter((entry) => entry.options.id === 'global-context');
  assert.equal(inSlot.length, 1, '旧条目必须已注销，不能残留两份');
  assert.equal(inSlot[0].options.order, 501, '让位后应当排在 500 之后');
  assert.equal(
    entries.filter((entry) => entry.options.id === 'later-plugin').length,
    1,
    '不得动别人的条目',
  );
});

test('智能定位：其它条目 order 缺失时按 0 处理', () => {
  const { slots, registered } = makeFakeSlots([{ options: { id: 'chat' } }]);
  pluginModule.apply({ slots });
  assert.equal(registered[0].options.order, 1);
});

test('插槽读不到 entries / subscribe 时退回兜底大值，且不订阅', () => {
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) });
  const { slots, registered } = makeFakeSlots([tab('chat', 0)], { withEntries: false, withSubscribe: false });
  pluginModule.apply({ slots });
  assert.equal(registered.length, 1);
  assert.equal(registered[0].options.order, pluginModule.__internal.FALLBACK_ORDER);
});

test('register 持续失败时重试有上限，不会无限循环', () => {
  const { slots } = makeFakeSlots([tab('chat', 0)], { withEntries: false });
  let calls = 0;
  slots.register = () => {
    calls += 1;
    throw new Error('槽位暂不可用');
  };
  pluginModule.apply({ slots });
  assert.equal(calls, 1, '没有订阅时只尝试一次');
});

test('chooseOrder / readOtherTabs 直接可用（测试接缝）', () => {
  const { chooseOrder, readOtherTabs, TAB_ID } = pluginModule.__internal;
  assert.equal(readOtherTabs({}), null, '没有 entries 接口应为 null');
  assert.equal(chooseOrder({ entries: () => [{ options: { id: TAB_ID, order: 999 } }] }).order, 1, '自己的条目要被排除');
});

test('组件能渲染出标签页内容（真实 React 服务端渲染）', () => {
  const { GlobalContextView } = pluginModule.__internal;
  const html = renderToStaticMarkup(React.createElement(GlobalContextView));
  assert.match(html, /全局提示词配置/);
  assert.match(html, /读取中/);
  assert.match(html, /textarea/);
});

test('callApi：成功、业务错误、网络错误三种情况', async () => {
  const { callApi, ROUTE } = pluginModule.__internal;
  const calls = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return { status: 200, json: async () => ({ ok: true, text: 'abc', bytes: 3 }) };
  };
  const ok = await callApi({ method: 'GET' });
  assert.equal(ok.text, 'abc');
  assert.equal(calls[0].url, ROUTE);
  assert.equal(calls[0].init.credentials, 'same-origin');

  globalThis.fetch = async () => ({ status: 400, json: async () => ({ ok: false, error: '缺少字符串字段 text' }) });
  await assert.rejects(() => callApi({ method: 'POST' }), /缺少字符串字段 text/);

  globalThis.fetch = async () => {
    throw new Error('网络不通');
  };
  await assert.rejects(() => callApi({ method: 'GET' }), /网络不通/);

  globalThis.fetch = async () => ({
    status: 502,
    json: async () => {
      throw new Error('not json');
    },
  });
  await assert.rejects(() => callApi({ method: 'GET' }), /响应不是 JSON/);

  globalThis.fetch = originalFetch;
});
