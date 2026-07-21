import { api, el, animateIn } from './util.js'

export function renderAdmin(root, { siteName }) {
  const brand = el('header', { className: 'brand compact' }, [
    el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
  ])
  const panel = el('section', { className: 'panel admin-panel' }, [
    el('p', { className: 'status', text: 'در حال بارگذاری…' }),
  ])
  root.replaceChildren(el('div', { className: 'shell narrow' }, [brand, panel]))

  api('/api/admin/me')
    .then(() => showSettings(panel))
    .catch(() => showLogin(panel))
}

function showLogin(panel) {
  const user = el('input', { className: 'field', type: 'text', placeholder: 'نام کاربری', autocomplete: 'username' })
  const pass = el('input', { className: 'field', type: 'password', placeholder: 'رمز عبور', autocomplete: 'current-password' })
  const status = el('p', { className: 'status', hidden: true })
  let busy = false

  const btn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: 'ورود',
    onClick: async () => {
      if (busy) return
      busy = true
      btn.disabled = true
      status.hidden = true
      try {
        await api('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ username: user.value.trim(), password: pass.value }),
        })
        showSettings(panel)
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || 'ورود ناموفق'
        busy = false
        btn.disabled = false
      }
    },
  })

  pass.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click()
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: 'ورود ادمین' }),
    user,
    pass,
    btn,
    status,
  )
  animateIn(panel)
  user.focus()
}

async function showSettings(panel) {
  panel.replaceChildren(el('p', { className: 'status', text: 'بارگذاری تنظیمات…' }))
  let st
  try {
    st = await api('/api/admin/settings')
  } catch (err) {
    panel.replaceChildren(el('p', { className: 'status error', text: err.message }))
    return
  }

  const siteName = el('input', { className: 'field', type: 'text', value: st.site_name || '' })
  const domain = el('input', { className: 'field', type: 'text', value: st.domain || '', placeholder: 'example.com' })
  const cert = el('input', { className: 'field mono', type: 'text', value: st.cert_path || '', placeholder: '/path/to/fullchain.pem' })
  const key = el('input', { className: 'field mono', type: 'text', value: st.key_path || '', placeholder: '/path/to/privkey.pem' })
  const tls = el('input', { type: 'checkbox' })
  tls.checked = !!st.tls_enabled
  const status = el('p', { className: 'status', hidden: true })

  const save = el('button', {
    type: 'button',
    className: 'btn primary',
    text: 'ذخیره',
    onClick: async () => {
      save.disabled = true
      status.hidden = true
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            site_name: siteName.value.trim(),
            domain: domain.value.trim(),
            tls_enabled: tls.checked,
            cert_path: cert.value.trim(),
            key_path: key.value.trim(),
          }),
        })
        status.hidden = false
        status.classList.remove('error')
        status.textContent = 'ذخیره شد. برای تغییر حالت HTTP/HTTPS ممکن است نیاز به ری‌استارت سرویس باشد.'
        document.title = siteName.value.trim() || 'NeoPaste'
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || 'ذخیره ناموفق'
      } finally {
        save.disabled = false
      }
    },
  })

  const logout = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: 'خروج',
    onClick: async () => {
      await api('/api/admin/logout', { method: 'POST', body: '{}' })
      showLogin(panel)
    },
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: 'تنظیمات' }),
    el('label', { className: 'field-label', text: 'نام سایت' }),
    siteName,
    el('label', { className: 'field-label', text: 'دامنه (اختیاری)' }),
    domain,
    el('label', { className: 'toggle' }, [tls, el('span', { text: 'فعال‌سازی SSL / TLS' })]),
    el('label', { className: 'field-label', text: 'مسیر گواهی (cert)' }),
    cert,
    el('label', { className: 'field-label', text: 'مسیر کلید (key)' }),
    key,
    el('div', { className: 'btn-row' }, [save, logout]),
    status,
  )
  animateIn(panel)
}
