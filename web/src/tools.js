import { sha256, sha512 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { el, copyText, animateIn } from './util.js'
import { t } from './i18n.js'
import { createSecureShare, showResultPage, securityOptions, EXPIRY, appNav } from './share.js'
import { icon } from './icons.js'

function toHex(str) {
  return bytesToHex(new TextEncoder().encode(str))
}
function fromHex(hex) {
  const clean = hex.replace(/\s+/g, '').toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2) throw new Error('Invalid hex')
  return new TextDecoder().decode(hexToBytes(clean))
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

function segment(items, activeId, onPick) {
  return el(
    'div',
    { className: 'seg' },
    items.map((it) =>
      el('button', {
        type: 'button',
        className: 'seg-btn' + (it.id === activeId ? ' active' : ''),
        text: it.label,
        onClick: () => onPick(it.id),
      }),
    ),
  )
}

function workspace(lang, { runLabel, onRun, placeholder, lastOutRef }) {
  const i = t(lang)
  const input = el('textarea', {
    className: 'paste-input tool-io',
    rows: '6',
    placeholder: placeholder || i.toolInput,
  })
  const output = el('textarea', {
    className: 'paste-input tool-io',
    rows: '6',
    readonly: true,
    placeholder: i.output,
  })
  const status = el('p', { className: 'status', hidden: true })

  const run = () => {
    status.hidden = true
    try {
      output.value = onRun(input.value)
      if (lastOutRef) lastOutRef.value = output.value
    } catch (err) {
      status.hidden = false
      status.classList.add('error')
      status.textContent = err.message || i.createError
    }
  }

  const runBtn = el('button', { type: 'button', className: 'btn primary', text: runLabel, onClick: run })
  const copyBtn = el('button', {
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

  return {
    node: el('div', { className: 'tool-workspace' }, [
      input,
      el('div', { className: 'btn-row' }, [runBtn, copyBtn]),
      output,
      status,
    ]),
    getOutput: () => output.value,
    setOutput: (v) => {
      output.value = v
      if (lastOutRef) lastOutRef.value = v
    },
  }
}

export function renderTools(root, { siteName, lang, onLang, toolsEnabled }) {
  const i = t(lang)
  if (!toolsEnabled) {
    root.replaceChildren(
      el('div', { className: 'home-page page-slide' }, [
        appNav({
          siteName,
          lang,
          onLang,
          endExtra: el('a', { href: '/', className: 'nav-chip' }, [
            icon('link'),
            el('span', { text: 'Home' }),
          ]),
        }),
        el('section', { className: 'panel home-panel' }, [
          el('p', { className: 'status', text: i.toolsDisabled }),
        ]),
      ]),
    )
    return
  }

  let tab = 'encode'
  const lastOut = { value: '' }
  const shareState = { usePassword: true, useExpiry: true, expiresIn: EXPIRY[2].sec, burn: false }

  const panel = el('section', { className: 'panel home-panel tools-panel' })
  const mount = () => {
    const tabs = segment(
      [
        { id: 'encode', label: i.toolsTabEncode },
        { id: 'hash', label: i.toolsTabHash },
        { id: 'data', label: i.toolsTabData },
        { id: 'generate', label: i.toolsTabGen },
        { id: 'diff', label: i.toolsTabDiff },
        { id: 'share', label: i.toolsTabShare },
      ],
      tab,
      (id) => {
        tab = id
        mount()
      },
    )

    let body
    if (tab === 'encode') body = encodePane(lang, i, lastOut)
    else if (tab === 'hash') body = hashPane(lang, i, lastOut)
    else if (tab === 'data') body = dataPane(lang, i, lastOut)
    else if (tab === 'generate') body = generatePane(lang, i, lastOut)
    else if (tab === 'diff') body = diffPane(lang, i, lastOut)
    else body = sharePane(root, { siteName, lang, onLang, toolsEnabled, i, shareState, lastOut })

    panel.replaceChildren(tabs, body)
  }

  mount()

  root.replaceChildren(
    el('div', { className: 'home-page page-slide tools-page' }, [
      appNav({
        siteName,
        lang,
        onLang,
        endExtra: el('a', { href: '/', className: 'nav-chip' }, [
          icon('paste'),
          el('span', { text: i.tabPaste }),
        ]),
      }),
      el('section', { className: 'home-hero' }, [
        el('h1', { className: 'hero-title', text: i.toolsTitleShort }),
        el('p', { className: 'hero-sub', text: i.toolsTitle }),
      ]),
      el('div', { className: 'tools-stage' }, [panel]),
    ]),
  )
  animateIn(panel)
}

function encodePane(lang, i, lastOut) {
  let kind = 'b64'
  let dir = 'enc'
  const wrap = el('div', { className: 'tool-pane' })

  const paint = () => {
    const ops = {
      b64: { enc: b64encode, dec: b64decode, runEnc: 'Base64 ↑', runDec: 'Base64 ↓' },
      url: {
        enc: (s) => encodeURIComponent(s),
        dec: (s) => decodeURIComponent(s),
        runEnc: 'URL ↑',
        runDec: 'URL ↓',
      },
      hex: { enc: toHex, dec: fromHex, runEnc: 'Hex ↑', runDec: 'Hex ↓' },
    }
    const op = ops[kind]
    const fn = dir === 'enc' ? op.enc : op.dec
    const label = dir === 'enc' ? op.runEnc : op.runDec
    const ws = workspace(lang, { runLabel: label, onRun: fn, lastOutRef: lastOut })
    wrap.replaceChildren(
      segment(
        [
          { id: 'b64', label: 'Base64' },
          { id: 'url', label: 'URL' },
          { id: 'hex', label: 'Hex' },
        ],
        kind,
        (id) => {
          kind = id
          paint()
        },
      ),
      segment(
        [
          { id: 'enc', label: i.encode },
          { id: 'dec', label: i.decode },
        ],
        dir,
        (id) => {
          dir = id
          paint()
        },
      ),
      ws.node,
    )
  }
  paint()
  return wrap
}

function hashPane(lang, i, lastOut) {
  let algo = '256'
  const wrap = el('div', { className: 'tool-pane' })
  const paint = () => {
    const onRun =
      algo === '256'
        ? (s) => bytesToHex(sha256(new TextEncoder().encode(s)))
        : (s) => bytesToHex(sha512(new TextEncoder().encode(s)))
    const ws = workspace(lang, {
      runLabel: algo === '256' ? 'SHA-256' : 'SHA-512',
      onRun,
      lastOutRef: lastOut,
    })
    wrap.replaceChildren(
      segment(
        [
          { id: '256', label: 'SHA-256' },
          { id: '512', label: 'SHA-512' },
        ],
        algo,
        (id) => {
          algo = id
          paint()
        },
      ),
      ws.node,
    )
  }
  paint()
  return wrap
}

function dataPane(lang, i, lastOut) {
  let kind = 'json'
  const wrap = el('div', { className: 'tool-pane' })
  const paint = () => {
    let runLabel = i.formatJson
    let onRun = (s) => JSON.stringify(JSON.parse(s), null, 2)
    if (kind === 'minify') {
      runLabel = i.minifyJson
      onRun = (s) => JSON.stringify(JSON.parse(s))
    } else if (kind === 'jwt') {
      runLabel = 'JWT'
      onRun = decodeJwt
    }
    const ws = workspace(lang, {
      runLabel,
      onRun,
      placeholder: kind === 'jwt' ? 'eyJhbGciOi…' : '{…}',
      lastOutRef: lastOut,
    })
    wrap.replaceChildren(
      segment(
        [
          { id: 'json', label: i.formatJson },
          { id: 'minify', label: i.minifyJson },
          { id: 'jwt', label: 'JWT' },
        ],
        kind,
        (id) => {
          kind = id
          paint()
        },
      ),
      ws.node,
    )
  }
  paint()
  return wrap
}

function generatePane(lang, i, lastOut) {
  const out = el('input', { className: 'field mono', readonly: true, value: '' })
  const set = (v) => {
    out.value = v
    lastOut.value = v
  }
  const copyBtn = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.copy,
    onClick: async (e) => {
      const ok = await copyText(out.value)
      e.target.textContent = ok ? i.copied : i.copyFail
      setTimeout(() => {
        e.target.textContent = i.copy
      }, 1200)
    },
  })
  return el('div', { className: 'tool-pane tool-workspace' }, [
    out,
    el('div', { className: 'btn-row' }, [
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.genUuid,
        onClick: () => set(crypto.randomUUID()),
      }),
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.genPassword,
        onClick: () => {
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%'
          const buf = crypto.getRandomValues(new Uint8Array(20))
          set(Array.from(buf, (b) => chars[b % chars.length]).join(''))
        },
      }),
      copyBtn,
    ]),
  ])
}

function diffPane(lang, i, lastOut) {
  const a = el('textarea', { className: 'paste-input tool-io', rows: '5', placeholder: 'A' })
  const b = el('textarea', { className: 'paste-input tool-io', rows: '5', placeholder: 'B' })
  const out = el('textarea', { className: 'paste-input tool-io mono', rows: '7', readonly: true })
  return el('div', { className: 'tool-pane tool-workspace' }, [
    a,
    b,
    el('div', { className: 'btn-row' }, [
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.diff,
        onClick: () => {
          out.value = simpleDiff(a.value, b.value)
          lastOut.value = out.value
        },
      }),
      el('button', {
        type: 'button',
        className: 'btn ghost',
        text: i.copy,
        onClick: async (e) => {
          const ok = await copyText(out.value)
          e.target.textContent = ok ? i.copied : i.copyFail
          setTimeout(() => {
            e.target.textContent = i.copy
          }, 1200)
        },
      }),
    ]),
    out,
  ])
}

function sharePane(root, { siteName, lang, onLang, toolsEnabled, i, shareState, lastOut }) {
  const sec = securityOptions(lang, shareState)
  const status = el('p', { className: 'status', hidden: true })
  const preview = el('textarea', {
    className: 'paste-input tool-io',
    rows: '5',
    value: lastOut.value || '',
    placeholder: i.shareToolHint,
  })

  const shareBtn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.shareAsPaste,
    onClick: async () => {
      status.hidden = true
      const text = preview.value
      if (!text.trim()) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = i.needContent
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
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || i.createError
        shareBtn.disabled = false
      }
    },
  })

  return el('div', { className: 'tool-pane tool-workspace' }, [
    el('p', { className: 'hint', text: i.shareToolHint }),
    preview,
    sec.node,
    shareBtn,
    status,
  ])
}
