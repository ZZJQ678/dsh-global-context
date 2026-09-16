/**
 * 清单测试：把宿主的收录/加载规则固化成断言。
 *
 * 这些规则抄自 @deepseek-ai/dsh-client-modules 的宿主实现（parseDshClient /
 * clientExportOf / 行构造），以及 dsh 的 bundle 约定。任何一条不满足，
 * 轻则标签页不出现，重则 Web 层启动报错，所以值得钉死。
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

/** 宿主 parseDshClient 的校验规则。 */
function parseDshClient(pkgName, value) {
  if (value === undefined) return undefined;
  assert.equal(typeof value, 'object', `${pkgName} 的 dsh.client 必须是对象`);
  assert.notEqual(value, null, `${pkgName} 的 dsh.client 不能是 null`);
  assert.equal(typeof value.platform, 'string', `${pkgName} dsh.client.platform 必须是字符串`);
  const optionalStringArray = (field, input) => {
    if (input === undefined) return undefined;
    assert.ok(Array.isArray(input), `${pkgName} 的 dsh.client.${field} 必须是数组`);
    assert.ok(
      input.every((item) => typeof item === 'string'),
      `${pkgName} 的 dsh.client.${field} 每项都必须是字符串`,
    );
    return input;
  };
  const inject = optionalStringArray('inject', value.inject);
  optionalStringArray('external', value.external);
  if (value.immediately !== undefined) {
    assert.equal(typeof value.immediately, 'boolean', `${pkgName} dsh.client.immediately 必须是布尔值`);
  }
  return { platform: value.platform, inject };
}

/** 宿主 clientExportOf 的解析规则：接受字符串，或带字符串 default 的一层条件对象。 */
function clientExportOf(pkgName, exportsField) {
  if (typeof exportsField !== 'object' || exportsField === null) return undefined;
  const client = exportsField['./client'];
  if (client === undefined) return undefined;
  if (typeof client === 'string') return client;
  if (typeof client === 'object' && client !== null && typeof client.default === 'string') return client.default;
  throw new Error(`${pkgName} 的 exports["./client"] 必须是字符串，或带字符串 default 的对象`);
}

test('dsh.client 声明能通过宿主校验', () => {
  const declaration = parseDshClient(manifest.name, manifest.dsh?.client);
  assert.notEqual(declaration, undefined, '必须声明 dsh.client，浏览器半边才会被加载');
  assert.equal(declaration.platform, 'web');
  assert.ok(Array.isArray(declaration.inject));
});

test('加载顺序声明里包含提供 slots 服务的包', () => {
  const inject = manifest.dsh.client.inject;
  // slots 服务由 dsh-client-ui-renderer 提供；没有它，标签页注册时 ctx.slots 不存在。
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-renderer'), `实际：${inject.join(', ')}`);
  assert.ok(inject.includes('@deepseek-ai/dsh-client-ui-conversation'), `实际：${inject.join(', ')}`);
});

test('exports["./client"] 可解析且文件存在', () => {
  const relative = clientExportOf(manifest.name, manifest.exports);
  assert.equal(relative, './lib/client.js');
  assert.ok(existsSync(path.join(root, relative)), `${relative} 不存在`);
});

test('包根导出指向宿主半边且文件存在', () => {
  const rootExport = manifest.exports['.'];
  const relative = typeof rootExport === 'string' ? rootExport : rootExport?.default;
  assert.equal(relative, './lib/index.js');
  assert.ok(existsSync(path.join(root, relative)), `${relative} 不存在`);
});

test('声明了 dsh.bundle.patch（精选列表的硬性门槛）', () => {
  const patch = manifest.dsh?.bundle?.patch;
  assert.equal(typeof patch, 'string', '没有 dsh.bundle.patch 就不会被 dsh plugin add 认成插件');
  const patchPath = path.join(root, patch);
  assert.ok(existsSync(patchPath), `${patch} 不存在`);
  const source = readFileSync(patchPath, 'utf8');
  assert.ok(source.includes('insert:'), '补丁层必须是一个 insert 列表');
  assert.ok(source.includes(`name: '${manifest.name}'`), '补丁层里的 name 必须等于包名');
});

test('声明了市场兼容性', () => {
  const releases = manifest.dsh?.compatibility?.dshReleases;
  assert.equal(typeof releases, 'object');
  assert.ok(Object.keys(releases).length > 0, '至少要声明一个兼容的 DSH 版本');
});

test('零运行时依赖（宿主只用 Node 内置模块）', () => {
  assert.equal(manifest.dependencies, undefined, `不该有运行时依赖，实际：${JSON.stringify(manifest.dependencies)}`);
  const hostSource = readFileSync(path.join(root, 'lib/index.js'), 'utf8');
  const imports = [...hostSource.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
  for (const specifier of imports) {
    assert.ok(specifier.startsWith('node:'), `宿主半边只能 import node: 内置模块，实际有 ${specifier}`);
  }
});

test('客户端产物的模块 id 必须等于包名', () => {
  // 宿主按包名派发产物 URL，浏览器按 id 注册模块；两者不一致就永远 require 不到。
  const source = readFileSync(path.join(root, 'lib/client.js'), 'utf8');
  assert.ok(
    source.includes(`id: '${manifest.name}'`),
    `lib/client.js 里的 id 必须写成 '${manifest.name}'`,
  );
});

test('客户端产物只依赖框架提供的模块', () => {
  const source = readFileSync(path.join(root, 'lib/client.js'), 'utf8');
  const required = [...source.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1]);
  assert.ok(required.length > 0, '应当 require react');
  for (const specifier of required) {
    assert.ok(['react', 'react/jsx-runtime', 'react-dom'].includes(specifier), `浏览器里只能 require 框架提供的模块，实际有 ${specifier}`);
  }
});

test('files 白名单覆盖所有运行必需文件', () => {
  const files = manifest.files ?? [];
  for (const required of ['lib/index.js', 'lib/client.js', 'cordis.patch.yml']) {
    assert.ok(files.includes(required), `files 里缺少 ${required}`);
  }
});
