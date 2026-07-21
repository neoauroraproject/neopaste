import { api, el, copyText, animateIn } from './util.js'
import { encryptPaste, randomPassphrase } from './crypto.js'
import { getLang, setLang, t } from './i18n.js'
import { langSwitch } from './langswitch.js'

const EXPIRY = [
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

function optionRow({ title, hint, checked, onChange, body }) {
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

  const bodyWrap = el('div', { className: 'opt-body' + (checked ? ' open' : '') }, body ? [body] : [])
  if (!checked || !body) bodyWrap.hidden = true

  const row = el('div', { className: 'opt-row' + (checked ? ' on' : '') }, [head, bodyWrap])

  check.addEventListener('change', () => {
    const on = check.checked
    row.classList.toggle('on', on)
    if (body) {
      bodyWrap.hidden = !on
      bodyWrap.classList.toggle('open', on)
    }
    onChange(on)
  })

  return { row, check, bodyWrap }
}

export function renderHome(root, { siteName }) {
  let lang = getLang()
  setLang(lang)

  const mount = () => {
    const i = t(lang)
    let usePassword = true
    let useExpiry = true
    let selected = EXPIRY[2].sec
    let burn = false
    let busy = false

    const topbar = el('div', { className: 'topbar' }, [
      el('div', { className: 'topbar-spacer' }),
      langSwitch(lang, (next) => {
        lang = next
        setLang(lang)
        mount()
      }),
    ])

    const brand = el('header', { className: 'brand' }, [
      el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
      el('p', { className: 'brand-tag', text: i.tagline }),
    ])

    const content = el('textarea', {
      className: 'paste-input',
      placeholder: i.placeholder,
      rows: '8',
      spellcheck: 'false',
    })

    const password = el('input', {
      className: 'field',
      type: 'password',
      placeholder: i.passwordPh,
      autocomplete: 'new-password',
    })

    const chips = el('div', { className: 'chips', role: 'listbox' })
    EXPIRY.forEach((opt) => {
      const chip = el('button', {
        type: 'button',
        className: 'chip' + (opt.sec === selected ? ' active' : ''),
        text: i.expiry[opt.key],
        onClick: () => {
          selected = opt.sec
          chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
          chip.classList.add('active')
        },
      })
      chips.append(chip)
    })

    const passOpt = optionRow({
      title: i.optPassword,
      hint: i.optPasswordHint,
      checked: true,
      onChange: (on) => {
        usePassword = on
      },
      body: password,
    })

    const expiryOpt = optionRow({
      title: i.optExpiry,
      hint: i.optExpiryHint,
      checked: true,
      onChange: (on) => {
        useExpiry = on
      },
      body: chips,
    })

    const burnOpt = optionRow({
      title: i.optBurn,
      hint: i.optBurnHint,
      checked: false,
      onChange: (on) => {
        burn = on
      },
    })

    const status = el('p', { className: 'status', hidden: true })
    const result = el('div', { className: 'result', hidden: true })

    const submit = el('button', {
      type: 'button',
      className: 'btn primary',
      text: i.create,
      onClick: async () => {
        if (busy) return
        status.hidden = true
        result.hidden = true
        const text = content.value.trim()
        if (!text) {
          showStatus(status, i.needContent, true)
          return
        }

        let pass = password.value
        let keyInUrl = false
        if (usePassword) {
          if (!pass || pass.length < 4) {
            showStatus(status, i.needPassword, true)
            return
          }
        } else {
          pass = randomPassphrase()
          keyInUrl = true
        }

        const expiresIn = useExpiry ? selected : 30 * 24 * 60 * 60
        busy = true
        submit.disabled = true
        submit.textContent = i.encrypting
        try {
          const enc = await encryptPaste(text, pass)
          const data = await api('/api/pastes', {
            method: 'POST',
            body: JSON.stringify({
              ...enc,
              expires_in_sec: expiresIn,
              burn_after_read: burn,
            }),
          })
          let url = `${location.origin}${data.url}`
          if (keyInUrl) url += `#${encodeURIComponent(pass)}`

          result.hidden = false
          result.replaceChildren(
            el('p', { className: 'result-label', text: i.ready }),
            el('div', { className: 'result-row' }, [
              el('input', { className: 'field mono', readonly: true, value: url }),
              el('button', {
                type: 'button',
                className: 'btn ghost',
                text: i.copy,
                onClick: async (e) => {
                  const ok = await copyText(url)
                  e.target.textContent = ok ? i.copied : i.copyFail
                  setTimeout(() => {
                    e.target.textContent = i.copy
                  }, 1600)
                },
              }),
            ]),
            el('p', { className: 'hint', text: keyInUrl ? i.hintHash : i.hintPass }),
          )
          animateIn(result)
          content.value = ''
          password.value = ''
        } catch (err) {
          showStatus(status, err.message || i.createError, true)
        } finally {
          busy = false
          submit.disabled = false
          submit.textContent = i.create
        }
      },
    })

    const form = el('section', { className: 'panel create-panel' }, [
      content,
      el('div', { className: 'options' }, [passOpt.row, expiryOpt.row, burnOpt.row]),
      submit,
      status,
      result,
    ])

    const footer = el('footer', { className: 'footer' }, [
      el('a', { href: '/admin', className: 'footer-link', text: i.adminLink }),
    ])

    root.replaceChildren(el('div', { className: 'shell' }, [topbar, brand, form, footer]))
    animateIn(form)
  }

  mount()
}

function showStatus(node, msg, isError) {
  node.hidden = false
  node.textContent = msg
  node.classList.toggle('error', !!isError)
}
