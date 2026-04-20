#!/usr/bin/env node
/**
 * Sentinel AI — lokal proxy sunucu.
 *
 * Claude Max aboneliğini tarayıcı SPA'sından kullanabilmek için küçük
 * bir HTTP köprüsü. `claude` CLI'ini (Claude Code) arka planda çağırır
 * ve yanıtı tarayıcıya döner.
 *
 * Akış:
 *   tarayıcı (AssistantPanel)
 *      └─ POST http://localhost:8787/chat  { system, messages }
 *            └─ spawn "claude -p" + stdin = flatten(system, messages)
 *                  └─ Max OAuth token otomatik kullanılır
 *            └─ stdout → JSON { text }
 *
 * Hiç npm bağımlılığı yok — yalnız Node builtin (http, child_process).
 * CORS her origin'e açık (localhost geliştirme amacıyla).
 *
 * Kullanım:
 *   npm run assistant      (varsayılan port 8787)
 *   PORT=9000 npm run assistant
 *
 * NOT: Kalıcı olarak çalışan bir daemon değil; terminali kapatınca
 * durur. İstersen `pm2` veya Windows scheduled task ile arkaplana alabilir.
 */

import { createServer } from 'node:http'
import { spawn }        from 'node:child_process'
import { readdirSync, existsSync } from 'node:fs'
import { join, isAbsolute }        from 'node:path'

const PORT = Number(process.env.PORT) || 8787

/**
 * Claude Code CLI'ını bul.
 *
 * Öncelik:
 *   1. CLAUDE_CMD env var (explicit override — her zaman kazanır)
 *   2. Windows'ta Claude Desktop paketi: %APPDATA%\Claude\claude-code\<v>\claude.exe
 *      (en yüksek semver versiyon alınır)
 *   3. PATH'de "claude" (klasik `npm i -g @anthropic-ai/claude-code` kurulumu)
 *
 * Bu sayede kullanıcının hiç ek kurulum / PATH ayarı yapmasına gerek kalmaz:
 * Claude Desktop kurulu olduğu sürece köprü aynı ikili üzerinden çalışır.
 */
function findClaudeCli() {
  if (process.env.CLAUDE_CMD) return process.env.CLAUDE_CMD

  if (process.platform === 'win32' && process.env.APPDATA) {
    const root = join(process.env.APPDATA, 'Claude', 'claude-code')
    try {
      const versions = readdirSync(root)
        .filter((n) => /^\d+\.\d+/.test(n))
        .sort(semverDesc)
      for (const v of versions) {
        const exe = join(root, v, 'claude.exe')
        if (existsSync(exe)) return exe
      }
    } catch {}
  }

  return 'claude'
}

function semverDesc(a, b) {
  const pa = a.split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  const pb = b.split(/[.+-]/).map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0
    if (x !== y) return y - x
  }
  return 0
}

const CMD           = findClaudeCli()
const USE_SHELL     = !isAbsolute(CMD)   // absolute .exe → shell gereksiz
// Default: Claude Code inherits Max subscription via the auth token in
// ~/.claude/. Operators can override the model per-request from the
// panel (we pass --model if the client sends one).
const DEFAULT_MODEL = process.env.CLAUDE_MODEL || ''
const MAX_WAIT_MS   = Number(process.env.CLAUDE_TIMEOUT_MS) || 90_000

/** CORS başlıkları — geliştirme modunda tüm origin'lere izin ver. */
const CORS = {
  'access-control-allow-origin':  '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age':       '86400',
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...CORS })
  res.end(JSON.stringify(body))
}

function text(res, status, body) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...CORS })
  res.end(body)
}

/**
 * Sohbet mesajlarını Claude'a tek-seferlik prompt olarak sunmak için
 * basitçe düzleştir. Sistem promptu `--append-system-prompt` ile
 * ayrıca iletilir; konuşma geçmişi tek stdin bloğunda alt-alta konur.
 * Claude Code tek-turlu print modunda (`-p`) bu formatı sorunsuz okur.
 */
function flattenMessages(messages) {
  return messages
    .map((m) => {
      const role = m.role === 'assistant' ? 'Sentinel AI' : 'Operatör'
      return `${role}: ${m.content}`
    })
    .join('\n\n')
    + '\n\nSentinel AI:'
}

/** `claude -p` çağır, stdin'e promptu yaz, stdout'u topla. */
function runClaude({ system, messages, model }) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text']
    const mdl  = model || DEFAULT_MODEL
    if (mdl)    args.push('--model', mdl)
    if (system) args.push('--append-system-prompt', system)

    const proc = spawn(CMD, args, {
      shell: USE_SHELL,
      stdio: ['pipe', 'pipe', 'pipe'],
      // Absolute path varsa shell gereksiz (deprecation-safe). Path'e
      // düşersek Windows'ta .cmd kabuğu için shell: true lazım.
      env: { ...process.env },
    })

    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      proc.kill('SIGKILL')
      reject(new Error(`claude CLI ${MAX_WAIT_MS}ms içinde cevap vermedi`))
    }, MAX_WAIT_MS)

    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('error', (e) => {
      clearTimeout(timer)
      // `claude` PATH'de yoksa ENOENT — anlamlı mesaj ver.
      if (e.code === 'ENOENT') {
        reject(new Error(
          `"${CMD}" komutu bulunamadı. Claude Code kurulu mu? ` +
          `Test: yeni bir terminalde "${CMD} --version" çalıştır.`
        ))
      } else {
        reject(e)
      }
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) {
        return reject(new Error(
          `claude CLI exit=${code}. stderr:\n${err.slice(0, 2000) || '(boş)'}`
        ))
      }
      resolve(out.trim())
    })

    proc.stdin.write(flattenMessages(messages))
    proc.stdin.end()
  })
}

/** Sağlık kontrolü — panelden "lokal köprü açık mı?" probu için. */
async function ping() {
  return new Promise((resolve) => {
    const proc = spawn(CMD, ['--version'], { shell: USE_SHELL })
    let out = ''
    let err = ''
    proc.stdout.on('data', (d) => { out += d.toString() })
    proc.stderr.on('data', (d) => { err += d.toString() })
    proc.on('error',  (e) => resolve({ ok: false, error: e.message || 'claude-cli-missing' }))
    proc.on('close', (code) => resolve({
      ok: code === 0,
      version: out.trim() || err.trim(),
      code,
      cmd: CMD,
    }))
    setTimeout(() => { proc.kill(); resolve({ ok: false, error: 'timeout' }) }, 5000)
  })
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS); res.end()
    return
  }

  if (req.method === 'GET' && req.url === '/health') {
    const pong = await ping()
    return json(res, pong.ok ? 200 : 503, pong)
  }

  if (req.method === 'GET' && req.url === '/') {
    return text(res, 200,
      `Sentinel AI local bridge · port ${PORT}\n` +
      `POST /chat       { system, messages, model? }\n` +
      `GET  /health     — claude CLI erişim kontrolü\n`
    )
  }

  if (req.method === 'POST' && req.url === '/chat') {
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 1_000_000) req.destroy() })
    req.on('end', async () => {
      let body
      try { body = JSON.parse(raw) } catch { return json(res, 400, { error: 'invalid json' }) }
      const messages = Array.isArray(body.messages) ? body.messages : []
      const system   = typeof body.system === 'string' ? body.system : ''
      const model    = typeof body.model  === 'string' ? body.model  : ''
      if (!messages.length) return json(res, 400, { error: 'messages boş' })

      try {
        const text = await runClaude({ system, messages, model })
        json(res, 200, { text, provider: 'local-claude-cli' })
      } catch (e) {
        json(res, 500, { error: e.message || String(e) })
      }
    })
    return
  }

  json(res, 404, { error: 'bilinmeyen route' })
})

server.listen(PORT, () => {
  console.log('')
  console.log('  Sentinel AI · local bridge')
  console.log('  ──────────────────────────')
  console.log(`  listen : http://localhost:${PORT}/`)
  console.log(`  claude : ${CMD}`)
  console.log(`  model  : ${DEFAULT_MODEL || '(auto)'}`)
  console.log('')
  console.log('  Endpoint'.padEnd(10) + ': POST /chat   { system, messages, model? }')
  console.log('  Health  '.padEnd(10) + ': GET  /health')
  console.log('  Stop    '.padEnd(10) + ': Ctrl+C')
  console.log('')
  // Başlangıçta claude CLI ping at — erken hata yakala.
  ping().then((p) => {
    if (!p.ok) {
      console.warn('  [!] claude CLI ping başarısız:', p.error || `exit ${p.code}`)
      console.warn('      denenen yol:', CMD)
      console.warn('      override: CLAUDE_CMD="C:\\tam\\yol\\claude.exe" npm run assistant')
    } else {
      console.log('  [ok] claude CLI hazır:', p.version)
    }
  })
})
