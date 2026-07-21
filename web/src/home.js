import { api, el, copyText, animateIn } from './util.js'
import { encryptPaste, randomPassphrase } from './crypto.js'

const EXPIRY = [
  { label: '۳۰ دقیقه', sec: 30 * 60 },
  { label: '۱ ساعت', sec: 60 * 60 },
  { label: '۳ ساعت', sec: 3 * 60 * 60 },
  { label: '۱۲ ساعت', sec: 12 * 60 * 60 },
  { label: '۱ روز', sec: 24 * 60 * 60 },
  { label: '۳ روز', sec: 3 * 24 * 60 * 60 },
  { label: '۷ روز', sec: 7 * 24 * 60 * 60 },
  { label: '۱۰ روز', sec: 10 * 24 * 60 * 60 },
  { label: '۳۰ روز', sec: 30 * 24 * 60 * 60 },
]

function optionRow({ title, hint, checked, onChange, body }) {
  const check = el('input', {
    type: 'checkbox',
    className: 'opt-check',
    checked: !!checked,
    onChange: (e) => onChange(e.target.checked),
  })
  if (checked) check.checked = true

  const head = el('label', { className: 'opt-head' }, [
    check,
    el('span', { className: 'opt-switch', 'aria-hidden': 'true' }),
    el('span', { className: 'opt-text' }, [
      el('strong', { className: 'opt-title', text: title }),
      hint ? el('span', { className: 'opt-hint', text: hint }) : null,
    ]),
  ])

  const bodyWrap = el('div', {
    className: 'opt-body' + (checked ? ' open' : ''),
    hidden: !checked,
  }, body ? [body] : [])

  const row = el('div', { className: 'opt-row' + (checked ? ' on' : '') }, [head, bodyWrap])

  return {
    row,
    setOpen(open) {
      bodyWrap.hidden = !open
      bodyWrap.classList.toggle('open', open)
      row.classList.toggle('on', open)
      check.checked = open
    },
    check,
    bodyWrap,
  }
}

export function renderHome(root, { siteName }) {
  let usePassword = true
  let useExpiry = true
  let selected = EXPIRY[2].sec
  let burn = false
  let busy = false

  const brand = el('header', { className: 'brand' }, [
    el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
    el('p', { className: 'brand-tag', text: 'اشتراک امن متن و لینک — رمزنگاری در مرورگر شما' }),
  ])

  const content = el('textarea', {
    className: 'paste-input',
    placeholder: 'متن یا لینک را اینجا بنویسید…',
    rows: '8',
    spellcheck: 'false',
  })

  const password = el('input', {
    className: 'field',
    type: 'password',
    placeholder: 'یک رمز قوی انتخاب کنید',
    autocomplete: 'new-password',
  })

  const chips = el('div', { className: 'chips', role: 'listbox', 'aria-label': 'زمان انقضا' })
  EXPIRY.forEach((opt) => {
    const chip = el('button', {
      type: 'button',
      className: 'chip' + (opt.sec === selected ? ' active' : ''),
      text: opt.label,
      onClick: () => {
        selected = opt.sec
        chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'))
        chip.classList.add('active')
      },
    })
    chips.append(chip)
  })

  const passOpt = optionRow({
    title: 'محافظت با رمز',
    hint: 'گیرنده برای باز کردن باید رمز را بداند',
    checked: true,
    onChange: (on) => {
      usePassword = on
      passOpt.setOpen(on)
    },
    body: password,
  })

  const expiryOpt = optionRow({
    title: 'انقضای خودکار',
    hint: 'بعد از این زمان از سرور حذف می‌شود',
    checked: true,
    onChange: (on) => {
      useExpiry = on
      expiryOpt.setOpen(on)
      if (!on) selected = 30 * 24 * 60 * 60 // fallback max when toggled off visually still need expiry server-side
    },
    body: chips,
  })

  const burnOpt = optionRow({
    title: 'حذف بعد از اولین مشاهده',
    hint: 'لینک فقط یک‌بار قابل باز شدن است',
    checked: false,
    onChange: (on) => {
      burn = on
      burnOpt.row.classList.toggle('on', on)
    },
  })
  burnOpt.bodyWrap.remove()

  const status = el('p', { className: 'status', hidden: true })
  const result = el('div', { className: 'result', hidden: true })

  const submit = el('button', {
    type: 'button',
    className: 'btn primary',
    text: 'ساخت لینک کوتاه',
    onClick: async () => {
      if (busy) return
      status.hidden = true
      result.hidden = true
      const text = content.value.trim()
      if (!text) {
        showStatus(status, 'متن یا لینک را وارد کنید', true)
        return
      }

      let pass = password.value
      let keyInUrl = false
      if (usePassword) {
        if (!pass || pass.length < 4) {
          showStatus(status, 'رمز حداقل ۴ کاراکتر باشد', true)
          return
        }
      } else {
        pass = randomPassphrase()
        keyInUrl = true
      }

      const expiresIn = useExpiry ? selected : 30 * 24 * 60 * 60

      busy = true
      submit.disabled = true
      submit.textContent = 'در حال رمزنگاری…'
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
          el('p', { className: 'result-label', text: 'لینک شما آماده است' }),
          el('div', { className: 'result-row' }, [
            el('input', { className: 'field mono', readonly: true, value: url }),
            el('button', {
              type: 'button',
              className: 'btn ghost',
              text: 'کپی',
              onClick: async (e) => {
                const ok = await copyText(url)
                e.target.textContent = ok ? 'کپی شد' : 'خطا'
                setTimeout(() => {
                  e.target.textContent = 'کپی'
                }, 1600)
              },
            }),
          ]),
          el('p', {
            className: 'hint',
            text: keyInUrl
              ? 'کلید داخل لینک است — لینک کامل را بفرستید. سرور متن خام را نمی‌بیند.'
              : 'رمز را جداگانه برای گیرنده بفرستید — سرور متن خام را نمی‌بیند.',
          }),
        )
        animateIn(result)
        content.value = ''
        password.value = ''
      } catch (err) {
        showStatus(status, err.message || 'خطا در ساخت', true)
      } finally {
        busy = false
        submit.disabled = false
        submit.textContent = 'ساخت لینک کوتاه'
      }
    },
  })

  const options = el('div', { className: 'options' }, [
    passOpt.row,
    expiryOpt.row,
    burnOpt.row,
  ])

  const form = el('section', { className: 'panel create-panel' }, [
    content,
    options,
    submit,
    status,
    result,
  ])

  const footer = el('footer', { className: 'footer' }, [
    el('a', { href: '/admin', className: 'footer-link', text: 'ورود ادمین' }),
  ])

  root.replaceChildren(el('div', { className: 'shell' }, [brand, form, footer]))
  animateIn(form)
}

function showStatus(node, msg, isError) {
  node.hidden = false
  node.textContent = msg
  node.classList.toggle('error', !!isError)
}
