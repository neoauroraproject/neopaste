import { api, el, copyText, animateIn } from './util.js'
import { decryptPaste, passwordVerify } from './crypto.js'
import { getLang, setLang, t } from './i18n.js'
import { langSwitch } from './langswitch.js'

function hashPassword() {
  const h = location.hash.replace(/^#/, '')
  return h ? decodeURIComponent(h) : ''
}

export function renderView(root, { siteName, id }) {
  let lang = getLang()
  setLang(lang)

  const mountShell = (panelContent) => {
    const i = t(lang)
    const topbar = el('div', { className: 'topbar' }, [
      el('a', { href: '/', className: 'back-link', text: '← NeoPaste' }),
      langSwitch(lang, (next) => {
        lang = next
        setLang(lang)
        renderView(root, { siteName, id })
      }),
    ])
    const brand = el('header', { className: 'brand compact' }, [
      el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
    ])
    const panel = el('section', { className: 'panel view-panel' }, panelContent)
    root.replaceChildren(el('div', { className: 'shell narrow' }, [topbar, brand, panel]))
    animateIn(panel)
    return { panel, i }
  }

  const { panel, i } = mountShell([el('p', { className: 'status', text: t(lang).checking })])

  api(`/api/pastes/${encodeURIComponent(id)}`)
    .then(async (meta) => {
      if (meta.locked) {
        panel.replaceChildren(el('p', { className: 'status error', text: i.locked }))
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
      panel.replaceChildren(el('p', { className: 'status error', text: err.message || i.notFound }))
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
  showContent(panel, plain, meta, lang)
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

  panel.replaceChildren(
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

  const copyBtn = el('button', {
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
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: i.content }),
    el('div', { className: 'content-card' }, [body]),
    copyBtn,
    meta.burn_after_read ? el('p', { className: 'hint', text: i.burned }) : null,
  )
  animateIn(panel)
}
