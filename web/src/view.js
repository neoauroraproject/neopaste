import { api, el, copyText, animateIn } from './util.js'
import { decryptPaste, passwordVerify } from './crypto.js'

function hashPassword() {
  const h = location.hash.replace(/^#/, '')
  return h ? decodeURIComponent(h) : ''
}

export function renderView(root, { siteName, id }) {
  const brand = el('header', { className: 'brand compact' }, [
    el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
  ])

  const status = el('p', { className: 'status', text: 'در حال بررسی لینک…' })
  const panel = el('section', { className: 'panel view-panel' }, [status])
  root.replaceChildren(el('div', { className: 'shell narrow' }, [brand, panel]))
  animateIn(panel)

  api(`/api/pastes/${encodeURIComponent(id)}`)
    .then(async (meta) => {
      if (meta.locked) {
        status.classList.add('error')
        status.textContent = 'این لینک موقتاً قفل شده است. کمی بعد دوباره تلاش کنید.'
        return
      }
      const fromHash = hashPassword()
      if (fromHash) {
        try {
          await unlockWithPassword(panel, id, meta, fromHash)
          return
        } catch {
          /* fall through to form */
        }
      }
      showUnlockForm(panel, id, meta, fromHash)
    })
    .catch((err) => {
      status.classList.add('error')
      status.textContent = err.message || 'لینک پیدا نشد'
    })
}

async function unlockWithPassword(panel, id, meta, pass) {
  if (!meta.salt) throw new Error('اطلاعات لینک ناقص است')
  const verify = await passwordVerify(pass, meta.salt)
  const payload = await api(`/api/pastes/${encodeURIComponent(id)}/unlock`, {
    method: 'POST',
    body: JSON.stringify({ password_verify: verify }),
  })
  const plain = await decryptPaste(payload, pass)
  showContent(panel, plain, meta)
}

function showUnlockForm(panel, id, meta, prefill = '') {
  const password = el('input', {
    className: 'field',
    type: 'password',
    placeholder: 'رمز عبور',
    autocomplete: 'current-password',
    value: prefill || undefined,
  })
  if (prefill) password.value = prefill
  const status = el('p', { className: 'status', hidden: true })
  let busy = false

  const btn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: 'مشاهده',
    onClick: async () => {
      if (busy) return
      const pass = password.value
      if (!pass) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = 'رمز را وارد کنید'
        return
      }
      busy = true
      btn.disabled = true
      btn.textContent = 'در حال باز کردن…'
      status.hidden = true
      try {
        await unlockWithPassword(panel, id, meta, pass)
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || 'رمز اشتباه است'
        busy = false
        btn.disabled = false
        btn.textContent = 'مشاهده'
      }
    },
  })

  password.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click()
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: 'ورود با رمز' }),
    el('p', {
      className: 'panel-sub',
      text: meta.burn_after_read
        ? 'این محتوا بعد از اولین مشاهده موفق حذف می‌شود.'
        : 'محتوا رمزنگاری‌شده است و فقط با رمز صحیح باز می‌شود.',
    }),
    password,
    btn,
    status,
  )
  animateIn(panel)
  password.focus()
}

function showContent(panel, plain, meta) {
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
    text: 'کپی محتوا',
    onClick: async (e) => {
      const ok = await copyText(plain)
      e.target.textContent = ok ? 'کپی شد' : 'خطا'
      setTimeout(() => {
        e.target.textContent = 'کپی محتوا'
      }, 1600)
    },
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: 'محتوا' }),
    el('div', { className: 'content-card' }, [body]),
    copyBtn,
    meta.burn_after_read
      ? el('p', { className: 'hint', text: 'این محتوا از سرور حذف شد و دوباره در دسترس نیست.' })
      : null,
  )
  animateIn(panel)
}
