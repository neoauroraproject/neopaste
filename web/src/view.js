import { api, el, copyText, animateIn, setChildren } from './util.js'
import { decryptPaste, passwordVerify } from './crypto.js'
import { getLang, setLang, t } from './i18n.js'
import { langSwitch } from './langswitch.js'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import go from 'highlight.js/lib/languages/go'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import 'highlight.js/styles/github-dark.css'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('go', go)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('xml', xml)

function hashPassword() {
  const h = location.hash.replace(/^#/, '')
  return h ? decodeURIComponent(h) : ''
}

export function renderView(root, { siteName, id }) {
  let lang = getLang()
  setLang(lang)

  const i = t(lang)
  const panel = el('section', { className: 'panel view-panel' }, [
    el('p', { className: 'status', text: i.checking }),
  ])
  root.replaceChildren(
    el('div', { className: 'shell narrow page-slide' }, [
      el('div', { className: 'topbar' }, [
        el('a', { href: '/', className: 'back-link', text: '← NeoPaste' }),
        langSwitch(lang, (next) => {
          lang = next
          setLang(lang)
          renderView(root, { siteName, id })
        }),
      ]),
      el('header', { className: 'brand compact' }, [
        el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
      ]),
      panel,
    ]),
  )
  animateIn(panel)

  api(`/api/pastes/${encodeURIComponent(id)}`)
    .then(async (meta) => {
      if (meta.locked) {
        panel.replaceChildren(el('p', { className: 'status error', text: t(lang).locked }))
        return
      }
      const fromHash = hashPassword()
      if (fromHash) {
        try {
          await unlockWithPassword(panel, id, meta, fromHash, lang)
          return
        } catch {
          /* form */
        }
      }
      showUnlockForm(panel, id, meta, fromHash, lang)
    })
    .catch((err) => {
      panel.replaceChildren(el('p', { className: 'status error', text: err.message || t(lang).notFound }))
    })
}

async function unlockWithPassword(panel, id, meta, pass, lang) {
  const i = t(lang)
  if (!meta.salt) throw new Error(i.incomplete)
  const verify = await passwordVerify(pass, meta.salt)
  const payload = await api(`/api/pastes/${encodeURIComponent(id)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password_verify: verify }),
  })
  const plain = await decryptPaste(payload, pass)
  showContent(panel, plain, { ...meta, ...payload }, lang)
}

function showUnlockForm(panel, id, meta, prefill, lang) {
  const i = t(lang)
  const password = el('input', {
    className: 'field',
    type: 'password',
    placeholder: i.password,
    autocomplete: 'current-password',
  })
  if (prefill) password.value = prefill
  const status = el('p', { className: 'status', hidden: true })
  let busy = false

  const btn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.view,
    onClick: async () => {
      if (busy) return
      const pass = password.value
      if (!pass) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = i.enterPass
        return
      }
      busy = true
      btn.disabled = true
      btn.textContent = i.opening
      status.hidden = true
      try {
        await unlockWithPassword(panel, id, meta, pass, lang)
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || i.badPass
        busy = false
        btn.disabled = false
        btn.textContent = i.view
      }
    },
  })
  password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click()
  })

  setChildren(
    panel,
    el('h1', { className: 'panel-title', text: i.unlockTitle }),
    el('p', { className: 'panel-sub', text: meta.burn_after_read ? i.unlockBurn : i.unlockSub }),
    password,
    btn,
    status,
  )
  animateIn(panel)
  password.focus()
}

function showContent(panel, plain, meta, lang) {
  const i = t(lang)
  const kind = meta.kind || 'text'
  const kids = [el('h1', { className: 'panel-title', text: i.content })]

  if (kind === 'image' && plain.startsWith('data:image/')) {
    kids.push(el('img', { className: 'content-image', src: plain, alt: 'shared' }))
    kids.push(
      el('a', {
        className: 'btn primary',
        href: plain,
        download: 'neopaste-image',
        text: i.downloadImage,
      }),
    )
  } else if (kind === 'code') {
    const pre = el('pre', { className: 'code-block' })
    const code = el('code', { className: meta.lang ? `language-${meta.lang}` : '' })
    code.textContent = plain
    pre.append(code)
    try {
      if (meta.lang && meta.lang !== 'plaintext') hljs.highlightElement(code)
    } catch {
      /* ignore */
    }
    kids.push(el('div', { className: 'content-card' }, [pre]))
    kids.push(
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.copyContent,
        onClick: async (e) => {
          const ok = await copyText(plain)
          e.target.textContent = ok ? i.copied : i.copyFail
          setTimeout(() => {
            e.target.textContent = i.copyContent
          }, 1600)
        },
      }),
    )
  } else {
    const trimmed = plain.trim()
    const isURL = /^https?:\/\/\S+$/i.test(trimmed)
    const body = isURL
      ? el('a', {
          className: 'content-link',
          href: trimmed,
          target: '_blank',
          rel: 'noopener noreferrer',
          text: trimmed,
        })
      : el('pre', { className: 'content-body', text: plain })
    kids.push(el('div', { className: 'content-card' }, [body]))
    kids.push(
      el('button', {
        type: 'button',
        className: 'btn primary',
        text: i.copyContent,
        onClick: async (e) => {
          const ok = await copyText(plain)
          e.target.textContent = ok ? i.copied : i.copyFail
          setTimeout(() => {
            e.target.textContent = i.copyContent
          }, 1600)
        },
      }),
    )
  }

  if (meta.burn_after_read || meta.BurnAfterRead) {
    kids.push(el('p', { className: 'hint', text: i.burned }))
  }

  setChildren(panel, ...kids)
  animateIn(panel)
}
