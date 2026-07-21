import { api, el, copyText, animateIn } from './util.js'
import { encryptPaste } from './crypto.js'

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

export function renderHome(root, { siteName }) {
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
    placeholder: 'رمز عبور',
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

  const burnToggle = el('label', { className: 'toggle' }, [
    el('input', {
      type: 'checkbox',
      onChange: (e) => {
        burn = e.target.checked
      },
    }),
    el('span', { text: 'حذف بعد از اولین مشاهده' }),
  ])

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
      const pass = password.value
      if (!text) {
        showStatus(status, 'متن یا لینک را وارد کنید', true)
        return
      }
      if (!pass || pass.length < 4) {
        showStatus(status, 'رمز حداقل ۴ کاراکتر باشد', true)
        return
      }
      busy = true
      submit.disabled = true
      submit.textContent = 'در حال رمزنگاری…'
      try {
        const enc = await encryptPaste(text, pass)
        const data = await api('/api/pastes', {
          method: 'POST',
          body: JSON.stringify({
            ...enc,
            expires_in_sec: selected,
            burn_after_read: burn,
          }),
        })
        const url = `${location.origin}${data.url}`
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
            text: 'رمز را جداگانه برای گیرنده بفرستید — سرور متن خام را نمی‌بیند.',
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

  const form = el('section', { className: 'panel create-panel' }, [
    content,
    el('div', { className: 'row' }, [password]),
    el('div', { className: 'section-label', text: 'انقضا' }),
    chips,
    burnToggle,
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
