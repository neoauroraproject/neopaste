import QRCode from 'qrcode'
import { api, el, copyText, animateIn } from './util.js'
import { encryptPaste, randomPassphrase } from './crypto.js'
import { t } from './i18n.js'
import { langSwitch } from './langswitch.js'
import { addHistory } from './history.js'

export const EXPIRY = [
  { key: '30m', sec: 30 * 60 },
  { key: '1h', sec: 60 * 60 },
  { key: '3h', sec: 3 * 60 * 60 },
  { key: '12h', sec: 12 * 60 * 60 },
  { key: '1d', sec: 24 * 60 * 60 },
  { key: '3d', sec: 3 * 24 * 60 * 60 },
  { key: '7d', sec: 7 * 24 * 60 * 60 },
  { key: '10d', sec: 10 * 24 * 60 * 60 },
  { key: '30d', sec: 30 * 24 * 60 * 60 },
]

export function optionRow({ title, hint, checked, onChange, body }) {
  const check = el('input', { type: 'checkbox', className: 'opt-check' })
  check.checked = !!checked
  const head = el('label', { className: 'opt-head' }, [
    check,
    el('span', { className: 'opt-switch', 'aria-hidden': 'true' }),
    el('span', { className: 'opt-text' }, [
      el('strong', { className: 'opt-title', text: title }),
      hint ? el('span', { className: 'opt-hint', text: hint }) : null,
    ]),
  ])
  const bodyWrap = el('div', { className: 'opt-body' }, body ? [body] : [])
  if (!checked || !body) bodyWrap.hidden = true
  const row = el('div', { className: 'opt-row' + (checked ? ' on' : '') }, [head, bodyWrap])
  check.addEventListener('change', () => {
    const on = check.checked
    row.classList.toggle('on', on)
    if (body) {
      bodyWrap.hidden = !on
    }
    onChange(on)
  })
  return { row, check, bodyWrap }
}

export function topBar(lang, onLang, extraStart) {
  return el('div', { className: 'topbar' }, [
    extraStart || el('div', { className: 'topbar-spacer' }),
    langSwitch(lang, onLang),
  ])
}

export function securityOptions(lang, state) {
  const i = t(lang)
  const password = el('input', {
    className: 'field',
    type: 'password',
    placeholder: i.passwordPh,
    autocomplete: 'new-password',
  })
  const chips = el('div', { className: 'chips' })
  EXPIRY.forEach((opt) => {
    const chip = el('button', {
      type: 'button',
      className: 'chip' + (opt.sec === state.expiresIn ? ' active' : ''),
      text: i.expiry[opt.key],
      onClick: () => {
        state.expiresIn = opt.sec
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
        chip.classList.add('active')
      },
    })
    chips.append(chip)
  })

  const passOpt = optionRow({
    title: i.optPassword,
    hint: i.optPasswordHint,
    checked: state.usePassword,
    onChange: (on) => {
      state.usePassword = on
    },
    body: password,
  })
  const expiryOpt = optionRow({
    title: i.optExpiry,
    hint: i.optExpiryHint,
    checked: state.useExpiry,
    onChange: (on) => {
      state.useExpiry = on
    },
    body: chips,
  })
  const burnOpt = optionRow({
    title: i.optBurn,
    hint: i.optBurnHint,
    checked: state.burn,
    onChange: (on) => {
      state.burn = on
    },
  })

  const body = el('div', { className: 'options' }, [passOpt.row, expiryOpt.row, burnOpt.row])
  const fold = el('details', { className: 'options-fold' }, [
    el('summary', { className: 'options-summary', text: i.securityOpts }),
    body,
  ])
  return {
    node: fold,
    password,
    state,
  }
}

export async function createSecureShare({
  plaintext,
  lang,
  usePassword,
  passwordValue,
  useExpiry,
  expiresIn,
  burn,
  kind = 'text',
  codeLang = '',
  mime = '',
  label = '',
}) {
  const i = t(lang)
  let pass = passwordValue
  let keyInUrl = false
  if (usePassword) {
    if (!pass || pass.length < 4) throw new Error(i.needPassword)
  } else {
    pass = randomPassphrase()
    keyInUrl = true
  }
  const enc = await encryptPaste(plaintext, pass)
  const data = await api('/api/pastes', {
    method: 'POST',
    body: JSON.stringify({
      ...enc,
      expires_in_sec: useExpiry ? expiresIn : 30 * 24 * 60 * 60,
      burn_after_read: burn,
      kind,
      lang: codeLang,
      mime,
    }),
  })
  let url = `${location.origin}${data.url}`
  if (keyInUrl) url += `#${encodeURIComponent(pass)}`
  addHistory({
    id: data.id,
    url,
    createdAt: Date.now(),
    kind,
    label: label || plaintext.slice(0, 48),
    expiresAt: data.expires_at ? data.expires_at * 1000 : null,
    burn,
    hasPasswordInHash: keyInUrl,
  })
  return { url, keyInUrl, id: data.id, expiresAt: data.expires_at }
}

export async function showResultPage(root, { siteName, url, keyInUrl, burn, lang, onLang, onAgain }) {
  const i = t(lang)
  const canvas = el('canvas', { className: 'qr-canvas', width: '220', height: '220' })
  try {
    await QRCode.toCanvas(canvas, url, {
      width: 220,
      margin: 2,
      color: { dark: '#0f1419', light: '#ffffff' },
    })
  } catch {
    /* ignore */
  }

  const downloadQr = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.downloadQr,
    onClick: () => {
      const a = document.createElement('a')
      a.download = 'neopaste-qr.png'
      a.href = canvas.toDataURL('image/png')
      a.click()
    },
  })

  const copyBtn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.copyLink,
    onClick: async (e) => {
      const ok = await copyText(url)
      e.target.textContent = ok ? i.copied : i.copyFail
      setTimeout(() => {
        e.target.textContent = i.copyLink
      }, 1600)
    },
  })

  const metaBits = []
  if (burn) metaBits.push(i.badgeBurn)
  if (keyInUrl) metaBits.push(i.badgeKeyInLink)
  else metaBits.push(i.badgePassword)

  const panel = el('section', { className: 'panel result-panel' }, [
    el('div', { className: 'success-mark', text: '✓' }),
    el('h1', { className: 'panel-title', text: i.ready }),
    el('div', { className: 'meta-badges' }, metaBits.map((t0) => el('span', { className: 'badge', text: t0 }))),
    el('input', { className: 'field mono result-url', readonly: true, value: url }),
    el('div', { className: 'qr-wrap' }, [canvas]),
    copyBtn,
    downloadQr,
    el('button', { type: 'button', className: 'btn ghost', text: i.another, onClick: onAgain }),
    el('p', { className: 'hint', text: keyInUrl ? i.hintHash : i.hintPass }),
  ])

  root.replaceChildren(
    el('div', { className: 'shell narrow page-slide' }, [
      topBar(lang, onLang, el('a', { href: '/', className: 'back-link', text: '← NeoPaste' })),
      el('header', { className: 'brand compact' }, [
        el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
      ]),
      panel,
    ]),
  )
  animateIn(panel)
}
