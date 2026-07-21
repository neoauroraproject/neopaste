import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { el, copyText } from './util.js'
import { t } from './i18n.js'
import { createSecureShare, showResultPage, securityOptions, EXPIRY, topBar } from './share.js'

function toHex(str) {
  return bytesToHex(new TextEncoder().encode(str))
}
function fromHex(hex) {
  const clean = hex.replace(/\s+/g, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2) throw new Error('Invalid hex')
  return new TextDecoder().decode(hexToBytes(clean))
}

function toolCard(title, body) {
  return el('div', { className: 'tool-card' }, [
    el('h3', { className: 'tool-title', text: title }),
    body,
  ])
}

function ioBox(lang, { placeholder, onRun, runLabel }) {
  const i = t(lang)
  const input = el('textarea', { className: 'paste-input tool-io', rows: '5', placeholder })
  const output = el('textarea', { className: 'paste-input tool-io', rows: '5', readonly: true, placeholder: i.output })
  const status = el('p', { className: 'status', hidden: true })
  const run = el('button', {
    type: 'button',
    className: 'btn primary',
    text: runLabel,
    onClick: () => {
      status.hidden = true
      try {
        output.value = onRun(input.value)
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || i.createError
      }
    },
  })
  const copy = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.copy,
    onClick: async (e) => {
      const ok = await copyText(output.value)
      e.target.textContent = ok ? i.copied : i.copyFail
      setTimeout(() => {
        e.target.textContent = i.copy
      }, 1200)
    },
  })
  return { node: el('div', { className: 'tool-stack' }, [input, el('div', { className: 'btn-row' }, [run, copy]), output, status]), input, output }
}

function b64encode(str) {
  return btoa(unescape(encodeURIComponent(str)))
}
function b64decode(str) {
  return decodeURIComponent(escape(atob(str)))
}

function decodeJwt(token) {
  const parts = token.trim().split('.')
  if (parts.length < 2) throw new Error('Invalid JWT')
  const dec = (p) => {
    const pad = p.length % 4 === 0 ? '' : '='.repeat(4 - (p.length % 4))
    return JSON.parse(decodeURIComponent(escape(atob(p.replace(/-/g, '+').replace(/_/g, '/') + pad))))
  }
  return JSON.stringify({ header: dec(parts[0]), payload: dec(parts[1]) }, null, 2)
}

function simpleDiff(a, b) {
  const al = a.split('\n')
  const bl = b.split('\n')
  const max = Math.max(al.length, bl.length)
  const out = []
  for (let i = 0; i < max; i++) {
    const L = al[i]
    const R = bl[i]
    if (L === R) out.push(`  ${L ?? ''}`)
    else {
      if (L != null) out.push(`- ${L}`)
      if (R != null) out.push(`+ ${R}`)
    }
  }
  return out.join('\n')
}

export function renderTools(root, { siteName, lang, onLang, toolsEnabled }) {
  const i = t(lang)
  if (!toolsEnabled) {
    root.replaceChildren(
      el('div', { className: 'shell narrow' }, [
        topBar(lang, onLang, el('a', { href: '/', className: 'back-link', text: '← NeoPaste' })),
        el('section', { className: 'panel' }, [el('p', { className: 'status', text: i.toolsDisabled })]),
      ]),
    )
    return
  }

  const shareState = { usePassword: true, useExpiry: true, expiresIn: EXPIRY[2].sec, burn: false }
  const sec = securityOptions(lang, shareState)
  const shareStatus = el('p', { className: 'status', hidden: true })

  const boxes = {
    b64e: ioBox(lang, { placeholder: i.toolInput, runLabel: 'Base64 ↑', onRun: b64encode }),
    b64d: ioBox(lang, { placeholder: 'Base64…', runLabel: 'Base64 ↓', onRun: b64decode }),
    urle: ioBox(lang, { placeholder: i.toolInput, runLabel: 'URL ↑', onRun: (s) => encodeURIComponent(s) }),
    urld: ioBox(lang, { placeholder: 'URL encoded…', runLabel: 'URL ↓', onRun: (s) => decodeURIComponent(s) }),
    sha: ioBox(lang, {
      placeholder: i.toolInput,
      runLabel: 'SHA-256',
      onRun: (s) => bytesToHex(sha256(new TextEncoder().encode(s))),
    }),
    sha512: ioBox(lang, {
      placeholder: i.toolInput,
      runLabel: 'SHA-512',
      onRun: (s) => bytesToHex(sha512(new TextEncoder().encode(s))),
    }),
    jwt: ioBox(lang, { placeholder: 'eyJhbGciOi…', runLabel: 'JWT decode', onRun: decodeJwt }),
    json: ioBox(lang, {
      placeholder: '{…}',
      runLabel: i.formatJson,
      onRun: (s) => JSON.stringify(JSON.parse(s), null, 2),
    }),
    minify: ioBox(lang, {
      placeholder: '{…}',
      runLabel: i.minifyJson,
      onRun: (s) => JSON.stringify(JSON.parse(s)),
    }),
    hexe: ioBox(lang, { placeholder: i.toolInput, runLabel: 'Hex ↑', onRun: toHex }),
    hexd: ioBox(lang, { placeholder: '68656c6c6f…', runLabel: 'Hex ↓', onRun: fromHex }),
  }

  const uuidOut = el('input', { className: 'field mono', readonly: true, value: '' })
  const genUuid = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.genUuid,
    onClick: () => {
      uuidOut.value = crypto.randomUUID()
    },
  })
  const passOut = el('input', { className: 'field mono', readonly: true, value: '' })
  const genPass = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.genPassword,
    onClick: () => {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
      const buf = crypto.getRandomValues(new Uint8Array(20))
      passOut.value = Array.from(buf, (b) => chars[b % chars.length]).join('')
    },
  })

  const diffA = el('textarea', { className: 'paste-input tool-io', rows: '4', placeholder: 'A' })
  const diffB = el('textarea', { className: 'paste-input tool-io', rows: '4', placeholder: 'B' })
  const diffOut = el('textarea', { className: 'paste-input tool-io mono', rows: '6', readonly: true })

  const shareFrom = el('select', { className: 'field' }, [
    el('option', { value: 'b64e', text: 'Base64 out' }),
    el('option', { value: 'json', text: 'JSON out' }),
    el('option', { value: 'minify', text: 'JSON minify' }),
    el('option', { value: 'hexe', text: 'Hex out' }),
    el('option', { value: 'sha', text: 'SHA-256' }),
    el('option', { value: 'jwt', text: 'JWT decode' }),
    el('option', { value: 'uuid', text: 'UUID' }),
    el('option', { value: 'pass', text: 'Password' }),
    el('option', { value: 'diff', text: 'Diff' }),
  ])

  const shareBtn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.shareAsPaste,
    onClick: async () => {
      shareStatus.hidden = true
      let text = ''
      const v = shareFrom.value
      if (v === 'uuid') text = uuidOut.value
      else if (v === 'pass') text = passOut.value
      else if (v === 'diff') text = diffOut.value
      else text = boxes[v]?.output.value || ''
      if (!text.trim()) {
        shareStatus.hidden = false
        shareStatus.classList.add('error')
        shareStatus.textContent = i.needContent
        return
      }
      shareBtn.disabled = true
      try {
        const res = await createSecureShare({
          plaintext: text,
          lang,
          usePassword: shareState.usePassword,
          passwordValue: sec.password.value,
          useExpiry: shareState.useExpiry,
          expiresIn: shareState.expiresIn,
          burn: shareState.burn,
          kind: 'text',
          label: text.slice(0, 40),
        })
        await showResultPage(root, {
          siteName,
          url: res.url,
          keyInUrl: res.keyInUrl,
          burn: shareState.burn,
          lang,
          onLang,
          onAgain: () => renderTools(root, { siteName, lang, onLang, toolsEnabled }),
        })
      } catch (err) {
        shareStatus.hidden = false
        shareStatus.classList.add('error')
        shareStatus.textContent = err.message || i.createError
        shareBtn.disabled = false
      }
    },
  })

  const grid = el('div', { className: 'tools-grid' }, [
    toolCard('Base64 encode', boxes.b64e.node),
    toolCard('Base64 decode', boxes.b64d.node),
    toolCard('URL encode', boxes.urle.node),
    toolCard('URL decode', boxes.urld.node),
    toolCard('SHA-256', boxes.sha.node),
    toolCard('SHA-512', boxes.sha512.node),
    toolCard('JWT decode', boxes.jwt.node),
    toolCard(i.formatJson, boxes.json.node),
    toolCard(i.minifyJson, boxes.minify.node),
    toolCard('Hex encode', boxes.hexe.node),
    toolCard('Hex decode', boxes.hexd.node),
    toolCard(i.genUuid, el('div', { className: 'tool-stack' }, [uuidOut, genUuid])),
    toolCard(i.genPassword, el('div', { className: 'tool-stack' }, [passOut, genPass])),
    toolCard(i.diff, el('div', { className: 'tool-stack' }, [
      diffA,
      diffB,
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.diff,
        onClick: () => {
          diffOut.value = simpleDiff(diffA.value, diffB.value)
        },
      }),
      diffOut,
    ])),
  ])

  const sharePanel = el('section', { className: 'panel' }, [
    el('h2', { className: 'panel-title', text: i.shareAsPaste }),
    el('p', { className: 'panel-sub', text: i.shareToolHint }),
    el('label', { className: 'field-label', text: i.shareSource }),
    shareFrom,
    sec.node,
    shareBtn,
    shareStatus,
  ])

  root.replaceChildren(
    el('div', { className: 'shell page-slide' }, [
      topBar(lang, onLang, el('a', { href: '/', className: 'back-link', text: '← NeoPaste' })),
      el('header', { className: 'brand compact' }, [
        el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
        el('p', { className: 'brand-tag', text: i.toolsTitle }),
      ]),
      grid,
      sharePanel,
    ]),
  )
}
