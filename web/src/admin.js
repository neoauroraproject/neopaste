import { api, el, animateIn } from './util.js'
import { getLang, setLang, t } from './i18n.js'
import { langSwitch } from './langswitch.js'

export function renderAdmin(root, { siteName }) {
  let lang = getLang()
  setLang(lang)

  const frame = (panelNode) => {
    root.replaceChildren(
      el('div', { className: 'shell narrow page-slide' }, [
        el('div', { className: 'topbar' }, [
          el('a', { href: '/', className: 'back-link', text: '← NeoPaste' }),
          langSwitch(lang, (next) => {
            lang = next
            setLang(lang)
            renderAdmin(root, { siteName })
          }),
        ]),
        el('header', { className: 'brand compact' }, [
          el('span', { className: 'brand-name', text: siteName || 'NeoPaste' }),
        ]),
        panelNode,
      ]),
    )
  }

  const panel = el('section', { className: 'panel admin-panel' }, [
    el('p', { className: 'status', text: t(lang).adminLoading }),
  ])
  frame(panel)

  api('/api/admin/me')
    .then(() => showSettings(panel, lang))
    .catch(() => showLogin(panel, lang))
}

function showLogin(panel, lang) {
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
      try {
        await api('/api/admin/login', {
          method: 'POST',
          body: JSON.stringify({ username: user.value.trim(), password: pass.value }),
        })
        showSettings(panel, lang)
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
  panel.replaceChildren(el('h1', { className: 'panel-title', text: i.adminLogin }), user, pass, btn, status)
  animateIn(panel)
  user.focus()
}

async function showSettings(panel, lang) {
  const i = t(lang)
  panel.replaceChildren(el('p', { className: 'status', text: i.loadingSettings }))
  let st
  let stats
  try {
    ;[st, stats] = await Promise.all([api('/api/admin/settings'), api('/api/admin/stats')])
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
  const tlsRow = toggleRow(i.enableTls, 'TLS', tlsCheck)

  const toolsCheck = el('input', { type: 'checkbox', className: 'opt-check' })
  toolsCheck.checked = st.tools_enabled !== false
  const toolsRow = toggleRow(i.enableTools, 'Toolbox', toolsCheck)

  const status = el('p', { className: 'status', hidden: true })
  const save = el('button', {
    type: 'button',
    className: 'btn primary',
    text: i.save,
    onClick: async () => {
      save.disabled = true
      try {
        await api('/api/admin/settings', {
          method: 'PUT',
          body: JSON.stringify({
            site_name: siteName.value.trim(),
            domain: domain.value.trim(),
            tls_enabled: tlsCheck.checked,
            cert_path: cert.value.trim(),
            key_path: key.value.trim(),
            tools_enabled: toolsCheck.checked,
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

  const purge = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.purgeExpired,
    onClick: async () => {
      try {
        const r = await api('/api/admin/purge-expired', { method: 'POST', body: '{}' })
        status.hidden = false
        status.classList.remove('error')
        status.textContent = `${i.purged}: ${r.deleted}`
        const s2 = await api('/api/admin/stats')
        statsBox.replaceChildren(...statsChildren(i, s2))
      } catch (err) {
        status.hidden = false
        status.classList.add('error')
        status.textContent = err.message
      }
    },
  })

  const logout = el('button', {
    type: 'button',
    className: 'btn ghost',
    text: i.logout,
    onClick: async () => {
      await api('/api/admin/logout', { method: 'POST', body: '{}' })
      showLogin(panel, lang)
    },
  })

  const statsBox = el('div', { className: 'stats-grid' }, statsChildren(i, stats))

  panel.replaceChildren(
    el('h1', { className: 'panel-title', text: i.settings }),
    el('h2', { className: 'section-title', text: i.stats }),
    statsBox,
    el('div', { className: 'admin-grid' }, [
      el('label', { className: 'field-label', text: i.siteName }),
      siteName,
      el('label', { className: 'field-label', text: i.domain }),
      domain,
      tlsRow,
      toolsRow,
      el('label', { className: 'field-label', text: i.certPath }),
      cert,
      el('label', { className: 'field-label', text: i.keyPath }),
      key,
    ]),
    el('div', { className: 'btn-row' }, [save, purge, logout]),
    status,
  )
  animateIn(panel)
}

function statsChildren(i, stats) {
  const kb = Math.round((stats.db_bytes || 0) / 1024)
  return [
    el('div', { className: 'stat' }, [el('strong', { text: String(stats.active_pastes ?? 0) }), el('span', { text: i.activePastes })]),
    el('div', { className: 'stat' }, [el('strong', { text: String(stats.total_pastes ?? 0) }), el('span', { text: i.totalPastes })]),
    el('div', { className: 'stat' }, [el('strong', { text: `${kb} KB` }), el('span', { text: i.dbSize })]),
  ]
}

function toggleRow(title, hint, check) {
  const row = el('div', { className: 'opt-row' + (check.checked ? ' on' : '') }, [
    el('label', { className: 'opt-head' }, [
      check,
      el('span', { className: 'opt-switch', 'aria-hidden': 'true' }),
      el('span', { className: 'opt-text' }, [
        el('strong', { className: 'opt-title', text: title }),
        el('span', { className: 'opt-hint', text: hint }),
      ]),
    ]),
  ])
  check.addEventListener('change', () => row.classList.toggle('on', check.checked))
  return row
}
