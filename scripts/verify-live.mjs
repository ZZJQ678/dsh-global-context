/**
 * 一键验证「装完之后到底有没有真的生效」。
 *
 * 用法（重启 DSH Desktop 之后跑）：
 *   node scripts/verify-live.mjs              # 只读检查 + 一次写入往返（自动还原）
 *   node scripts/verify-live.mjs --no-write   # 跳过写入测试，纯只读
 *   node scripts/verify-live.mjs --url http://127.0.0.1:43129 --log <harness.log 路径>
 *
 * 检查四件事：
 *   1. 宿主半边加载了没有      —— $DSH_HOME/global-context.status.json
 *   2. GUI 读写路由在不在      —— GET /api/dsh-global-context
 *   3. 保存能不能真的落盘      —— POST 后再 GET 往返比对（默认开启，结束前还原原内容）
 *   4. 浏览器半边会不会被送进浏览器 —— 首页 window.__DSH_BOOT__ 里有没有本包，
 *                                      以及 /plugins/<包名>/client.js 能不能取到
 *
 * 第 4 项是关键：首页里出现本包名，就说明标签页会随页面加载被注册。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] !== undefined ? argv[index + 1] : fallback;
};

const home = process.env.DSH_HOME || path.join(process.env.APPDATA ?? '', 'dsh-desktop', 'harness');
const logPath = value('--log', path.join(home, '..', 'logs', 'harness.log'));
const origin = value('--url', '').replace(/\/$/, '');
const writeTest = !flag('--no-write');

let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  -> ${detail}` : ''}`);
  if (!ok) failures++;
};

// ── 找地址与令牌 ────────────────────────────────────────────────
function findEndpoint() {
  let text;
  try {
    text = readFileSync(logPath, 'utf8');
  } catch (error) {
    return { error: `读不到日志 ${logPath}：${error.message}` };
  }
  const matches = [...text.matchAll(/dsh web:\s*(http:\/\/[^\s?]+)\/\?token=([\w.-]+)/g)];
  if (matches.length === 0) return { error: `日志里没有找到 dsh web 的地址与令牌：${logPath}` };
  const last = matches[matches.length - 1];
  return { origin: last[1].replace(/\/$/, ''), token: last[2] };
}

const endpoint = origin === '' ? findEndpoint() : { origin, token: null };
if (endpoint.error !== undefined) {
  console.log(`无法定位服务：${endpoint.error}`);
  process.exitCode = 2;
} else {
  const base = endpoint.origin;
  console.log(`服务地址：${base}`);
  console.log(`日志：${logPath}\n`);

  // 用令牌换 cookie：访问 /?token=... 会 303 并下发 dsh-auth-* cookie。
  let cookie = null;
  if (endpoint.token !== null) {
    const auth = await fetch(`${base}/?token=${endpoint.token}`, { redirect: 'manual' });
    const setCookie = auth.headers.get('set-cookie');
    if (setCookie !== null) cookie = setCookie.split(';')[0];
    check('用日志里的令牌换到了会话 cookie', cookie !== null, `HTTP ${auth.status}`);
  } else {
    check('提供了 --url（跳过令牌换取）', true, '需要已有的 cookie 才能过认证');
  }

  const headers = cookie === null ? {} : { cookie };

  // ── 1. 宿主状态文件 ──────────────────────────────────────────
  // 注意：测试跑过之后也会留下同名状态文件，所以不能只看存在性。
  // 真实加载用的是默认正文路径 $DSH_HOME/global-context.md；测试用的是临时目录。
  const statusPath = path.join(home, 'global-context.status.json');
  const expectedText = path.join(home, 'global-context.md');
  if (existsSync(statusPath)) {
    const status = JSON.parse(readFileSync(statusPath, 'utf8'));
    const isReal = path.resolve(String(status.textPath ?? '')) === path.resolve(expectedText);
    if (!isReal) {
      check('宿主半边已加载（状态文件存在）', false, `状态文件是别的来源留下的（textPath=${String(status.textPath)}），不是真实加载`);
    } else {
      check('宿主半边已加载（状态文件存在）', status.ok === true, `at=${status.at}`);
      check('提示词段注册成功', status.sectionError == null, String(status.sectionError ?? ''));
      check('GUI 路由注册成功', status.routeRegistered === true, `routeError=${String(status.routeError ?? '')}`);
      check('正文文件路径正确', true, String(status.textPath));
      console.log(`      段=${status.sectionName} order=${status.order} enabled=${status.enabled} 字节=${status.bytes}`);
    }
  } else {
    check('宿主半边已加载（状态文件存在）', false, `${statusPath} 不存在 —— 还没重启，或插件没加载`);
  }

  // ── 2. GUI 读写路由 ──────────────────────────────────────────
  let readBody = null;
  try {
    const response = await fetch(`${base}/api/dsh-global-context`, { headers });
    const body = await response.json().catch(() => null);
    readBody = body;
    check('GET /api/dsh-global-context 返回 200', response.status === 200, `HTTP ${response.status}`);
    check('返回体 ok=true', body?.ok === true, JSON.stringify(body?.error ?? ''));
  } catch (error) {
    check('GET /api/dsh-global-context 返回 200', false, error.message);
  }

  if (readBody?.ok === true) {
    const filePath = String(readBody.path);
    const original = typeof readBody.text === 'string' ? readBody.text : '';
    const onDisk = existsSync(filePath) ? readFileSync(filePath, 'utf8') : null;
    check('接口返回的文本与磁盘文件一致', onDisk === original, onDisk === null ? '文件不存在' : '');
    check('段注册状态为真', readBody.sectionRegistered === true, String(readBody.sectionError ?? ''));
    check('正文非空（当前有全局上下文）', original.trim().length > 0, `${original.length} 字符`);
    console.log(`      文件=${filePath}  顺序=${readBody.order}  上限=${readBody.maxBytes} 字节`);

    // ── 3. 写入往返（改完还原）─────────────────────────────────
    if (writeTest) {
      const sentinel = `${original}\n\n<!-- verify-live 往返测试 -->\n`;
      const backupPath = `${filePath}.verify-live.bak`;
      writeFileSync(backupPath, original, 'utf8');
      try {
        const post = await fetch(`${base}/api/dsh-global-context`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json' },
          body: JSON.stringify({ text: sentinel }),
        });
        const postBody = await post.json().catch(() => null);
        check('POST 保存返回 200', post.status === 200 && postBody?.ok === true, JSON.stringify(postBody?.error ?? `HTTP ${post.status}`));
        check('保存后磁盘内容已改变', readFileSync(filePath, 'utf8') === sentinel);

        const reread = await (await fetch(`${base}/api/dsh-global-context`, { headers })).json();
        check('再次 GET 能读回刚保存的内容', reread.text === sentinel);

        // 跨站写入必须被拒
        const crossSite = await fetch(`${base}/api/dsh-global-context`, {
          method: 'POST',
          headers: { ...headers, 'content-type': 'application/json', origin: 'https://evil.example' },
          body: JSON.stringify({ text: '不该写入' }),
        });
        check('跨站写入被拒绝（403）', crossSite.status === 403, `HTTP ${crossSite.status}`);
      } finally {
        // 无论成败都还原，避免把测试内容留在用户文件里。
        writeFileSync(filePath, original, 'utf8');
        const restored = await (await fetch(`${base}/api/dsh-global-context`, { headers })).json().catch(() => null);
        check('已还原原始内容', restored?.text === original || readFileSync(filePath, 'utf8') === original);
      }
    } else {
      console.log('（跳过了写入往返测试：--no-write）');
    }
  }

  // ── 4. 浏览器半边 ────────────────────────────────────────────
  try {
    const html = await (await fetch(`${base}/`, { headers })).text();
    check('首页可取到', html.length > 1000, `${html.length} 字符`);
    check(
      '首页的客户端模块图里包含本包（标签页会被加载）',
      html.includes('dsh-global-context'),
      '未见本包名 —— 浏览器半边没有被组装进 __DSH_BOOT__',
    );
    const served = await fetch(`${base}/plugins/dsh-global-context/client.js`, { headers });
    const source = served.ok ? await served.text() : '';
    check('客户端产物可从 /plugins 取到', served.ok && source.includes('全局上下文配置'), `HTTP ${served.status}`);
    check('产物里注册的是 conversation.view 插槽', source.includes('conversation.view'));
  } catch (error) {
    check('首页可取到', false, error.message);
  }

  console.log(failures === 0 ? '\n线上验证：全部通过 —— 插件已完全生效' : `\n线上验证：${failures} 项失败`);
  process.exitCode = failures === 0 ? 0 : 1;
}
