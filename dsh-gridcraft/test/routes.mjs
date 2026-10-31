/**
 * Host-route unit tests for dsh-gridcraft (no DSH host needed):
 *   node test/routes.mjs
 * Covers path containment, the save route (happy path / escapes / unknown
 * session / empty body), the static route (MIME + traversal refusal) and the
 * presented-file resolve route (coordinates → declared path).
 */
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { createGridcraftRoutes, createResolveRoute, resolveInsideWorkspace } from '../lib/routes.js'

const ROOT = mkdtempSync(join(tmpdir(), 'dsh-gridcraft-test-'))
const WORKSPACE = join(ROOT, 'ws')
const STATIC = join(ROOT, 'static')
mkdirSync(WORKSPACE)
mkdirSync(STATIC)
writeFileSync(join(STATIC, 'index.html'), '<html>gc</html>')
writeFileSync(join(STATIC, 'app_bg.wasm'), 'wasm-bytes')

// ── resolveInsideWorkspace ────────────────────────────────────────────
assert.equal(resolveInsideWorkspace(WORKSPACE, 'book.xlsx'), join(WORKSPACE, 'book.xlsx'))
assert.equal(resolveInsideWorkspace(WORKSPACE, 'sub/dir/book.xlsx'), join(WORKSPACE, join('sub', 'dir', 'book.xlsx')))
assert.equal(resolveInsideWorkspace(WORKSPACE, ''), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, '..'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, '../escape.xlsx'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, 'a/../../escape.xlsx'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, '/etc/hosts'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, 'C:\\Windows\\evil.xlsx'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, 'ok\0evil'), undefined)
assert.equal(resolveInsideWorkspace(WORKSPACE, '.hidden.xlsx'), join(WORKSPACE, '.hidden.xlsx'), 'dotfiles are legal names')
console.log('✅ resolveInsideWorkspace containment')

// ── route fixtures ────────────────────────────────────────────────────
const sessions = {
  get(id) {
    if (id === 's1') return { header: { cwd: WORKSPACE } }
    if (id === 's2') return { header: {} } // no cwd
    return undefined
  },
}
const routes = createGridcraftRoutes({ staticDir: STATIC, sessions })
const saveRoute = routes.find(route => route.path === '/api/dsh-gridcraft/save')
const staticRoute = routes.find(route => route.kind === 'prefix')
assert.ok(saveRoute && staticRoute)

function mockRes() {
  const res = new PassThrough()
  res.statusCode = 0
  res.headers = {}
  res.writeHead = (status, headers) => { res.statusCode = status; res.headers = headers }
  res.body = []
  res.on('data', chunk => res.body.push(chunk))
  res.done = new Promise(resolvePromise => res.on('end', resolvePromise))
  return res
}

async function readBodyOf(res) {
  await res.done
  return Buffer.concat(res.body).toString('utf8')
}

// ── save route ────────────────────────────────────────────────────────
function mockReq(method, url, body) {
  // Minimal IncomingMessage stand-in: async-iterable chunks.
  const chunks = body === undefined ? [] : [Buffer.from(body)]
  let index = 0
  return {
    method,
    url,
    on(event, handler) {
      if (event === 'data') { setImmediate(() => { if (index < chunks.length) handler(chunks[index++]) }) }
      if (event === 'end') { setImmediate(handler) }
      if (event === 'error') { /* unused */ }
    },
    destroy() { /* unused */ },
  }
}

{
  const res = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s1&path=reports/book.xlsx', 'XLSX-BYTES'), res)
  const json = JSON.parse(await readBodyOf(res))
  assert.equal(res.statusCode, 200)
  assert.equal(json.success, true)
  assert.equal(json.data.path, 'reports/book.xlsx')
  assert.equal(readFileSync(join(WORKSPACE, 'reports', 'book.xlsx'), 'utf8'), 'XLSX-BYTES')
  const leftovers = readdirSafe(join(WORKSPACE, 'reports'))
  assert.equal(leftovers.filter(name => name.includes('.tmp')).length, 0, 'no tmp leftovers')
  console.log('✅ save: writes inside workspace, atomic (no tmp leftovers)')
}
{
  const res = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s1&path=../escape.xlsx', 'X'), res)
  assert.equal(res.statusCode, 400)
  const res2 = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=unknown&path=a.xlsx', 'X'), res2)
  assert.equal(res2.statusCode, 404)
  const res3 = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s2&path=a.xlsx', 'X'), res3)
  assert.equal(res3.statusCode, 404, 'session without cwd rejects')
  const res4 = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s1&path=', 'X'), res4)
  assert.equal(res4.statusCode, 400, 'empty path rejects')
  const res5 = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s1&path=a.xlsx', ''), res5)
  assert.equal(res5.statusCode, 400, 'empty body rejects')
  const res6 = mockRes()
  await saveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/save?sessionId=s1&path=a.xlsx'), res6)
  assert.equal(res6.statusCode, 405)
  console.log('✅ save: escapes/unknown/no-cwd/empty/method all rejected')
}
{
  // Overwrite round-trip: second save replaces content and leaves no tmp.
  writeFileSync(join(WORKSPACE, 'book.xlsx'), 'OLD')
  const res = mockRes()
  await saveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/save?sessionId=s1&path=book.xlsx', 'NEW-CONTENT'), res)
  assert.equal(res.statusCode, 200)
  assert.equal(readFileSync(join(WORKSPACE, 'book.xlsx'), 'utf8'), 'NEW-CONTENT')
  console.log('✅ save: overwrite replaces content')
}

// ── static route ──────────────────────────────────────────────────────
{
  const res = mockRes()
  await staticRoute.handler(mockReq('GET', '/api/dsh-gridcraft/app/index.html?chrome=none&host=parent'), res)
  await res.done
  assert.equal(res.statusCode, 200)
  assert.match(res.headers['Content-Type'], /text\/html/)
  assert.equal(res.headers['Cache-Control'], 'no-cache')
  assert.equal(Buffer.concat(res.body).toString('utf8'), '<html>gc</html>')

  const res2 = mockRes()
  await staticRoute.handler(mockReq('GET', '/api/dsh-gridcraft/app/app_bg.wasm'), res2)
  await res2.done
  assert.match(res2.headers['Content-Type'], /application\/wasm/, 'wasm MIME is application/wasm')
  assert.match(res2.headers['Cache-Control'], /immutable/)

  const res3 = mockRes()
  await staticRoute.handler(mockReq('GET', '/api/dsh-gridcraft/app/%2e%2e%2fdsh-host.d.ts'), res3)
  await res3.done
  assert.equal(res3.statusCode, 400, 'encoded traversal rejected')

  const res4 = mockRes()
  await staticRoute.handler(mockReq('GET', '/api/dsh-gridcraft/app/missing.js'), res4)
  await res4.done
  assert.equal(res4.statusCode, 404)
  console.log('✅ static: html/wasm MIME + cache + traversal/404')
}

// ── resolve route (presented coordinates → declared path) ─────────────
{
  const sessionQuery = {
    async readEvent({ sessionId, seq }) {
      if (sessionId === 's1' && seq === 7) {
        return {
          target: {
            type: 'deliverables/presented',
            data: { turn: 3, callId: 'c1', files: [{ path: 'reports/demo.xlsx' }, { path: 'notes.md' }] },
          },
          session: { cwd: WORKSPACE },
        }
      }
      if (sessionId === 's1' && seq === 9) throw new Error('session store offline')
      return { target: { type: 'conversation/message', data: {} } }
    },
  }
  const resolveRoute = createResolveRoute({ sessionQuery })

  const res = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=7&index=0'), res)
  const json = JSON.parse(await readBodyOf(res))
  assert.equal(res.statusCode, 200)
  assert.equal(json.success, true)
  assert.deepEqual(json.data, { sessionId: 's1', path: 'reports/demo.xlsx', name: 'demo.xlsx' })

  const res2 = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=7&index=5'), res2)
  assert.equal(res2.statusCode, 404, 'index out of range rejects')

  const res3 = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=7&index=1'), res3)
  assert.equal(res3.statusCode, 200, 'non-spreadsheet declared files still resolve (client filters)')

  const res4 = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=8&index=0'), res4)
  assert.equal(res4.statusCode, 404, 'non-presented event rejects')

  const res5 = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=abc&index=0'), res5)
  assert.equal(res5.statusCode, 400, 'non-numeric coordinates reject')

  const res6 = mockRes()
  await resolveRoute.handler(mockReq('GET', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=9&index=0'), res6)
  assert.equal(res6.statusCode, 502, 'session store failures surface as 502')

  const res7 = mockRes()
  await resolveRoute.handler(mockReq('POST', '/api/dsh-gridcraft/resolve?sessionId=s1&seq=7&index=0'), res7)
  assert.equal(res7.statusCode, 405, 'non-GET rejects')
  console.log('✅ resolve: happy path + 404/400/405/502 rejections')
}

function readdirSafe(dir) {
  try { return readdirSync(dir) } catch { return [] }
}

rmSync(ROOT, { recursive: true, force: true })
console.log('ALL ROUTE TESTS PASSED')
