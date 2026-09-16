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
  assert.equal(options.label(), '全局上下文配置');
  assert.equal(typeof component, 'function');
});

test('没有 slots.inject 时退化为直接注册', () => {
  const registered = [];
  pluginModule.apply({ slots: { register: (options, component) => registered.push({ options, component }) } });
  assert.equal(registered.length, 1);
});

test('组件能渲染出标签页内容（真实 React 服务端渲染）', () => {
  const { GlobalContextView } = pluginModule.__internal;
  const html = renderToStaticMarkup(React.createElement(GlobalContextView));
  assert.match(html, /全局上下文配置/);
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
