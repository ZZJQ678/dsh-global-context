/**
 * 宿主半边测试：装载真实的 SystemPrompt 服务与一个假的 webServer，
 * 验证「注入位置」与「GUI 读写通道」两件事都对。
 *
 * 运行：node --test test/
 * 依赖从当前 DSH profile 里解析（DSH_HOME 或 DSH_PROFILE_DIR 可覆盖）。
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import test from 'node:test';

const home = process.env.DSH_HOME || path.join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness');
const profileDir = process.env.DSH_PROFILE_DIR || path.join(home, 'profiles', 'web');
const requireFromProfile = createRequire(path.join(profileDir, 'package.json'));

const { Context } = await import(pathToFileURL(requireFromProfile.resolve('@deepseek-ai/cordis')).href);
const systemPromptModule = await import(pathToFileURL(requireFromProfile.resolve('@deepseek-ai/dsh-system-prompt')).href);
const SystemPrompt = systemPromptModule.default;
const { renderPrompt } = systemPromptModule;
const plugin = await import('../lib/index.js');

const tick = (ms = 25) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(predicate, label) {
  for (let index = 0; index < 40; index++) {
    if (predicate()) return;
    await tick();
  }
  throw new Error(`等待超时：${label}`);
}

/** 假 webServer：只记录注册进来的路由，供测试直接调用 handler。 */
function createFakeWebServer() {
  const routes = new Map();
  return {
    routes,
    register(options) {
      routes.set(options.path, options);
      return () => routes.delete(options.path);
    },
  };
}

function fakeRequest(method, body = null, headers = {}) {
  const stream = Readable.from(body === null ? [] : [Buffer.from(body, 'utf8')]);
  stream.method = method;
  stream.headers = { host: '127.0.0.1:43129', ...headers };
  return stream;
}

function fakeResponse() {
  return {
    statusCode: null,
    headers: null,
    body: '',
    writeHead(status, headers) {
      this.statusCode = status;
      this.headers = headers;
    },
    end(chunk) {
      this.body += chunk ?? '';
    },
  };
}

/** 起一个装了真实 SystemPrompt + 假 webServer 的上下文，并挂上本插件。 */
async function createHost(config) {
  const ctx = new Context();
  const webServer = createFakeWebServer();
  ctx.provide('webServer', webServer);
  ctx.plugin(SystemPrompt);
  await waitFor(() => ctx.systemPrompt !== undefined, 'systemPrompt 服务上线');
  ctx.plugin({ name: plugin.name, inject: plugin.inject, apply: plugin.apply }, config);
  await tick();
  return { ctx, webServer };
}

const workDir = mkdtempSync(path.join(tmpdir(), 'dsh-global-context-'));
const textFile = path.join(workDir, 'global-context.md');

test('注入到系统提示词最顶部，且排在内置身份之前', async () => {
  writeFileSync(textFile, '始终使用简体中文回答。', 'utf8');
  const { ctx } = await createHost({ enabled: true, textPath: textFile });
  const assembly = await ctx.systemPrompt.assemble({});
  const prompt = renderPrompt(assembly);
  assert.equal(assembly.sections[0].name, 'user:global-context', '应当是第一节');
  assert.ok(prompt.startsWith('始终使用简体中文回答。'), `实际开头：${JSON.stringify(prompt.slice(0, 30))}`);
  assert.ok(
    prompt.indexOf('始终使用简体中文回答。') < prompt.indexOf('You are an AI agent powered by DeepSeek Harness'),
    '自定义内容必须在内置身份之前',
  );
});

test('改文件后无需重新注册即刻生效', async () => {
  writeFileSync(textFile, '第一版内容。', 'utf8');
  const { ctx } = await createHost({ textPath: textFile });
  assert.ok(renderPrompt(await ctx.systemPrompt.assemble({})).startsWith('第一版内容。'));
  await tick(1100);
  writeFileSync(textFile, '第二版内容。', 'utf8');
  const after = renderPrompt(await ctx.systemPrompt.assemble({}));
  assert.ok(after.startsWith('第二版内容。'), `实际开头：${JSON.stringify(after.slice(0, 30))}`);
  assert.ok(!after.includes('第一版内容。'));
});

test('{{变量}} 不会弄坏组装，视觉上仍是原文', async () => {
  writeFileSync(textFile, '把 {{name}} 当字面占位符。', 'utf8');
  const { ctx } = await createHost({ textPath: textFile });
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({})); // 抛错即测试失败
  assert.ok(!prompt.includes('{{'), '渲染结果里不能残留会触发插值的 {{ 序列');
  assert.ok(prompt.includes('{\u200B{name}}'), '两个花括号之间应插入零宽空格');
});

test('文件缺失或为空时不注入任何内容', async () => {
  const { ctx } = await createHost({ textPath: path.join(workDir, '不存在.md') });
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({}));
  assert.ok(prompt.startsWith('You are an AI agent powered by DeepSeek Harness'), '身份段应回到最前');
});

test('enabled=false 时完全不注入', async () => {
  writeFileSync(textFile, '这段不该出现。', 'utf8');
  const { ctx } = await createHost({ enabled: false, textPath: textFile });
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({}));
  assert.ok(!prompt.includes('这段不该出现'));
});

test('注册了精确路由：GET 读、POST 写', async () => {
  writeFileSync(textFile, '初始内容。', 'utf8');
  const { webServer } = await createHost({ textPath: textFile });
  const route = webServer.routes.get(plugin.ROUTE);
  assert.ok(route !== undefined, `未注册 ${plugin.ROUTE}`);
  assert.equal(route.kind, 'exact');

  const readRes = fakeResponse();
  await route.handler(fakeRequest('GET'), readRes);
  assert.equal(readRes.statusCode, 200);
  const readBody = JSON.parse(readRes.body);
  assert.equal(readBody.ok, true);
  assert.equal(readBody.text, '初始内容。');
  assert.equal(readBody.path, textFile);
  assert.equal(readBody.sectionRegistered, true);

  const writeRes = fakeResponse();
  await route.handler(fakeRequest('POST', JSON.stringify({ text: '来自 GUI 的新内容。' })), writeRes);
  assert.equal(writeRes.statusCode, 200);
  assert.equal(JSON.parse(writeRes.body).ok, true);
  assert.equal(readFileSync(textFile, 'utf8'), '来自 GUI 的新内容。', '文件应被真实写入');

  const reread = fakeResponse();
  await route.handler(fakeRequest('GET'), reread);
  assert.equal(JSON.parse(reread.body).text, '来自 GUI 的新内容。');
});

test('路由拒绝：非字符串、超大、跨站、错误方法', async () => {
  const { webServer } = await createHost({ textPath: textFile });
  const route = webServer.routes.get(plugin.ROUTE);

  const badType = fakeResponse();
  await route.handler(fakeRequest('POST', JSON.stringify({ text: 42 })), badType);
  assert.equal(badType.statusCode, 400);

  const tooBig = fakeResponse();
  await route.handler(fakeRequest('POST', JSON.stringify({ text: 'x'.repeat(300 * 1024) })), tooBig);
  assert.equal(tooBig.statusCode, 413);

  const crossSite = fakeResponse();
  await route.handler(fakeRequest('GET', null, { origin: 'https://evil.example' }), crossSite);
  assert.equal(crossSite.statusCode, 403);

  const wrongMethod = fakeResponse();
  await route.handler(fakeRequest('DELETE'), wrongMethod);
  assert.equal(wrongMethod.statusCode, 405);
});

test('没有 webServer 时仍然照常注入（GUI 通道缺席不影响提示词）', async () => {
  writeFileSync(textFile, '只有提示词也要能用。', 'utf8');
  const ctx = new Context();
  ctx.plugin(SystemPrompt);
  await waitFor(() => ctx.systemPrompt !== undefined, 'systemPrompt 服务上线');
  ctx.plugin({ name: plugin.name, inject: plugin.inject, apply: plugin.apply }, { textPath: textFile });
  await tick();
  const prompt = renderPrompt(await ctx.systemPrompt.assemble({}));
  assert.ok(prompt.startsWith('只有提示词也要能用。'));
});
