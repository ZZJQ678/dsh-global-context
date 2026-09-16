/**
 * dsh-global-context —— 宿主半边（Node 侧）。
 *
 * 职责有两件：
 *   1. 把「全局上下文」文本注入到**每个会话系统提示词的最顶部**（排在内置身份之前）。
 *   2. 在 DSH Web 服务上开一个精确路由，让浏览器里的「全局上下文配置」标签页
 *      可以读取和保存这段文本。
 *
 * 文本的唯一真源是一个普通文本文件（默认 `$DSH_HOME/global-context.md`）：
 * 它在每次组装系统提示词时按 mtime 缓存重新读取，所以保存后**下一次请求立刻生效**，
 * 不需要重启；用户也可以直接用记事本改这个文件。
 *
 * 两条必须守住的安全边界：
 *   1. apply() 绝不抛错。加载器对所有条目 Promise.allSettled，任一失败会让整个
 *      profile 回滚，等于 DSH 起不来。注册失败只记日志、只降级。
 *   2. 文本提供者永远返回字符串且绝不抛错 —— 它在每次请求组装提示词时执行。
 *      注册失败时返回空串（空段会被渲染器丢弃），绝不让请求失败。
 *
 * 另外：系统提示词渲染器对 `{{变量}}` 做严格插值，未知引用会直接抛错并弄坏每一个
 * 请求。这里在注入前把 `{{` 拆成 `{` + 零宽空格 + `{`，让渲染器永远看不到引用组，
 * 视觉上仍是 `{{`。
 */

import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

export const name = 'dsh-global-context';
/** 只要 systemPrompt 就够启动；webServer 到位后再补上 GUI 通道，缺了也不影响注入。 */
export const inject = ['systemPrompt'];
/** GUI 读写这段全局上下文用的精确路由。 */
export const ROUTE = '/api/dsh-global-context';

const ZWSP = '\u200B';
const DEFAULT_SECTION_NAME = 'user:global-context';
const DEFAULT_FILE_NAME = 'global-context.md';
const STATUS_FILE_NAME = 'global-context.status.json';
/** 提示词正文上限，防止一次误粘贴把每个请求都撑爆。 */
const MAX_BYTES = 256 * 1024;
/** 请求体上限（JSON 包装后略大于正文）。 */
const MAX_BODY_BYTES = MAX_BYTES + 8 * 1024;
const IDENTITY_ORDER_KEY = 'HARNESS_IDENTITY';
/** 拿不到顺序常量时的兜底：内置身份为 -1000，这里再往前 100。 */
const FALLBACK_ORDER = -1100;

function resolveHome() {
  return process.env.DSH_HOME || path.join(process.env.USERPROFILE || process.env.HOME || '.', '.dsh');
}

function defaultTextPath() {
  return path.join(resolveHome(), DEFAULT_FILE_NAME);
}

/**
 * 拆掉所有 `{{` 序列，使渲染器的严格变量插值永远匹配不到引用组。
 *
 * @param text - 用户原文。
 * @returns 可安全注入的文本。
 */
function neutralizeVariables(text) {
  return text.includes('{{') ? text.split('{{').join(`{${ZWSP}{`) : text;
}

/**
 * 按 mtime+size 缓存的文件读取器：内容变了就重读。任何失败都返回空串，绝不抛错。
 *
 * @param textPath - 正文文件路径。
 * @returns 读取当前正文的函数。
 */
function createReader(textPath) {
  let cached = null;
  return function read() {
    try {
      const stat = statSync(textPath);
      if (cached !== null && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached.text;
      const text = readFileSync(textPath, 'utf8');
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, text };
      return text;
    } catch {
      cached = null;
      return '';
    }
  };
}

/** 原子写：先写临时文件再改名，避免 GUI 保存与提示词读取撞车时读到半截内容。 */
function writeTextAtomically(textPath, text) {
  const dir = path.dirname(textPath);
  mkdirSync(dir, { recursive: true });
  const temp = `${textPath}.${process.pid}.tmp`;
  writeFileSync(temp, text, 'utf8');
  renameSync(temp, textPath);
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

/** 读完整请求体；超限直接拒绝，避免无界缓冲。 */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        const error = new Error(`请求体超过上限 ${limit} 字节`);
        error.status = 413;
        reject(error);
        try {
          req.destroy();
        } catch {
          /* 已经断开就算了。 */
        }
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * 跨站请求粗筛：这是个会写文件的端点，浏览器发来的请求必须同源。
 * 没有 Origin 头的（curl、脚本）放行，与桌面端本地使用一致。
 */
function sameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers?.host;
  } catch {
    return false;
  }
}

/** 写一份加载状态，作为「插件到底有没有被加载」的可查证据。诊断用途，失败即忽略。 */
function writeStatus(statusPath, status) {
  try {
    mkdirSync(path.dirname(statusPath), { recursive: true });
    writeFileSync(statusPath, `${JSON.stringify({ ...status, at: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  } catch {
    /* 诊断用途，失败不影响宿主。 */
  }
}

export function apply(ctx, config = {}) {
  const enabled = config.enabled !== false;
  const textPath = typeof config.textPath === 'string' && config.textPath.trim() !== '' ? config.textPath : defaultTextPath();
  const fallback = typeof config.prompt === 'string' ? config.prompt : '';
  const sectionName =
    typeof config.sectionName === 'string' && config.sectionName.trim() !== '' ? config.sectionName : DEFAULT_SECTION_NAME;
  const read = createReader(textPath);
  // 状态文件也允许改路径：测试可以指到临时目录，不去污染真实的 harness 目录。
  const statusPath =
    typeof config.statusPath === 'string' && config.statusPath.trim() !== ''
      ? config.statusPath
      : path.join(resolveHome(), STATUS_FILE_NAME);

  let order = FALLBACK_ORDER;
  let sectionRegistered = false;
  let sectionError = null;
  let routeRegistered = false;
  let routeError = null;

  // ── 1. 提示词段 ────────────────────────────────────────────────
  try {
    const identityOrder = ctx.systemPrompt?.getSectionOrder?.(IDENTITY_ORDER_KEY);
    order = Number.isFinite(config.order) ? config.order : Number.isFinite(identityOrder) ? identityOrder - 100 : FALLBACK_ORDER;
    ctx.systemPrompt.section({
      name: sectionName,
      order,
      text: () => {
        try {
          if (!enabled) return '';
          const raw = read() || fallback;
          const text = typeof raw === 'string' ? raw.trim() : '';
          return text === '' ? '' : neutralizeVariables(text);
        } catch {
          return '';
        }
      },
    });
    sectionRegistered = true;
  } catch (error) {
    // 启动安全边界：注册失败只记日志。抛出去会让整个 loader 更新失败并回滚。
    sectionError = error?.message ?? String(error);
    try {
      ctx.logger?.warn?.(`dsh-global-context: 提示词段注册失败：${sectionError}`);
    } catch {
      /* 连日志都失败就放弃。 */
    }
  }

  // ── 2. GUI 通道 ───────────────────────────────────────────────
  /**
   * 诊断：把当前状态同时写到日志与状态文件。
   * 必须可重复调用 —— 路由是异步注册的（下面走 ctx.inject），
   * 只在 apply 末尾写一次会把 routeRegistered 记成 false（实际已经注册上）。
   */
  const report = () => {
    try {
      const bytes = Buffer.byteLength(read(), 'utf8');
      const summary = `已加载 段=${sectionName} order=${order} enabled=${enabled} 文件=${textPath} 路由=${routeRegistered}`;
      ctx.logger?.info?.(`dsh-global-context: ${summary}`);
      process.stderr.write(`[dsh-global-context] ${summary}\n`);
      writeStatus(statusPath, {
        ok: sectionRegistered,
        sectionName,
        order,
        enabled,
        textPath,
        bytes,
        routeRegistered,
        sectionError,
        routeError,
      });
    } catch {
      /* 诊断输出失败不影响宿主。 */
    }
  };

  const registerRoute = (webServer) => {
    try {
      if (webServer === undefined || webServer === null) return;
      webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (req, res) => {
          try {
            if (!sameOrigin(req)) {
              sendJson(res, 403, { ok: false, error: '仅允许同源请求' });
              return;
            }
            const method = String(req.method ?? 'GET').toUpperCase();
            if (method === 'GET') {
              const text = read();
              sendJson(res, 200, {
                ok: true,
                text,
                path: textPath,
                sectionName,
                order,
                enabled,
                sectionRegistered,
                sectionError,
                bytes: Buffer.byteLength(text, 'utf8'),
                maxBytes: MAX_BYTES,
              });
              return;
            }
            if (method !== 'POST') {
              sendJson(res, 405, { ok: false, error: '只允许 GET / POST' });
              return;
            }
            const body = await readBody(req, MAX_BODY_BYTES);
            let parsed;
            try {
              parsed = JSON.parse(body === '' ? '{}' : body);
            } catch {
              sendJson(res, 400, { ok: false, error: '请求体不是合法 JSON' });
              return;
            }
            const text = parsed?.text;
            if (typeof text !== 'string') {
              sendJson(res, 400, { ok: false, error: '缺少字符串字段 text' });
              return;
            }
            const bytes = Buffer.byteLength(text, 'utf8');
            if (bytes > MAX_BYTES) {
              sendJson(res, 413, { ok: false, error: `内容超过上限 ${MAX_BYTES} 字节（当前 ${bytes}）` });
              return;
            }
            try {
              writeTextAtomically(textPath, text);
            } catch (error) {
              sendJson(res, 500, { ok: false, error: `写入失败：${error?.message ?? String(error)}` });
              return;
            }
            sendJson(res, 200, { ok: true, bytes, path: textPath });
          } catch (error) {
            try {
              const status = Number.isInteger(error?.status) ? error.status : 500;
              sendJson(res, status, { ok: false, error: error?.message ?? String(error) });
            } catch {
              /* 响应已经发出去了。 */
            }
          }
        },
      });
      routeRegistered = true;
      report();
    } catch (error) {
      routeError = error?.message ?? String(error);
      report();
      try {
        ctx.logger?.warn?.(`dsh-global-context: GUI 路由注册失败：${routeError}`);
      } catch {
        /* 忽略。 */
      }
    }
  };

  try {
    const existing = ctx.get?.('webServer');
    if (existing !== undefined) registerRoute(existing);
    else ctx.inject?.(['webServer'], (scope) => registerRoute(scope?.webServer ?? scope?.get?.('webServer')));
  } catch (error) {
    routeError = error?.message ?? String(error);
  }

  // ── 3. 诊断 ───────────────────────────────────────────────────
  // 路由可能还没注册（异步），先记一次；注册完成时会再记一次覆盖。
  report();
}

export default { name, inject, apply };
