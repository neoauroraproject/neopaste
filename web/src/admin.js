import { api, el, animateIn } from './util.js'
import { getLang, setLang, t } from './i18n.js'
import { langSwitch } from './langswitch.js'

export function renderAdmin(root, { siteName }) {
  let lang = getLang()
  setLang(lang)

  const frame = (panelNode) => {
    const topbar = el('div', { className: 'topbar' }, [
      el('a', { href: '/', className: 'back-link', text: '← NeoPaste' }),
      langSwitch(lang, (next) => {
        lang = next
        setLang(lang)
        renderAdmin(root, { siteName })
      }),
    ])
    const brand = el('header', { className: 'brand compact' }, [
      el('span', { className: 'brand-name', text: siteName || 'NeoPaste' }),
    ])
    root.replaceChildren(el('div', { className: 'shell narrow' }, [topbar, brand, panelNode]))
  }

  const panel = el('section', { className: 'panel admin-panel' }, [
    el('p', { className: 'status', text: t(lang).adminLoading }),
  ])
  frame(panel)

  api('/api/admin/me')
    .then(() => showSettings(panel, lang, () => renderAdmin(root, { siteName })))
    .catch(() => showLogin(panel, lang, () => renderAdmin(root, { siteName })))
}

function showLogin(panel, lang, rerender) {
  const i = t(lang)
  const user = el('input', { className: 'field', type: 'text', placeholder: i.username, autocomplete: 'username' })
  const pass = el('input', { className: 'field', type: 'password', placeholder: i.password, autocomplete: 'current-password' })
  const status = el('p', { className: 'status', hidden: true })
  let busy = false

  const btn = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.login,
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
        showSettings(panel, lang, rerender)
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || i.loginFail
        busy = false
        btn.disabled = false
      }
    },
  })

  pass.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click()
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: i.adminLogin }),
    el('p', { className: 'panel-sub', text: 'NeoPaste' }),
    user,
    pass,
    btn,
    status,
  )
  animateIn(panel)
  user.focus()
}

async function showSettings(panel, lang, rerender) {
  const i = t(lang)
  panel.replaceChildren(el('p', { className: 'status', text: i.loadingSettings }))
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

  const tlsCheck = el('input', { type: 'checkbox', className: 'opt-check' })
  tlsCheck.checked = !!st.tls_enabled
  const tlsRow = el('div', { className: 'opt-row' + (st.tls_enabled ? ' on' : '') }, [
    el('label', { className: 'opt-head' }, [
      tlsCheck,
      el('span', { className: 'opt-switch', 'aria-hidden': 'true' }),
      el('span', { className: 'opt-text' }, [
        el('strong', { className: 'opt-title', text: i.enableTls }),
        el('span', { className: 'opt-hint', text: 'TLS' }),
      ]),
    ]),
  ])
  tlsCheck.addEventListener('change', () => {
    tlsRow.classList.toggle('on', tlsCheck.checked)
  })

  const status = el('p', { className: 'status', hidden: true })

  const save = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.save,
    onClick: async () => {
      save.disabled = true
      status.hidden = true
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            site_name: siteName.value.trim(),
            domain: domain.value.trim(),
            tls_enabled: tlsCheck.checked,
            cert_path: cert.value.trim(),
            key_path: key.value.trim(),
          }),
        })
        status.hidden = false
        status.classList.remove('error')
        status.textContent = i.saved
        document.title = siteName.value.trim() || 'NeoPaste'
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message || i.saveFail
      } finally {
        save.disabled = false
      }
    },
  })

  const logout = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.logout,
    onClick: async () => {
      await api('/api/admin/logout', { method: 'POST', body: '{}' })
      showLogin(panel, lang, rerender)
    },
  })

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: i.settings }),
    el('div', { className: 'admin-grid' }, [
      el('label', { className: 'field-label', text: i.siteName }),
      siteName,
      el('label', { className: 'field-label', text: i.domain }),
      domain,
      tlsRow,
      el('label', { className: 'field-label', text: i.certPath }),
      cert,
      el('label', { className: 'field-label', text: i.keyPath }),
      key,
    ]),
    el('div', { className: 'btn-row' }, [save, logout]),
    status,
  )
  animateIn(panel)
}
