import '@fontsource/vazirmatn/300.css'
import '@fontsource/vazirmatn/400.css'
import '@fontsource/vazirmatn/500.css'
import '@fontsource/vazirmatn/600.css'
import '@fontsource/vazirmatn/700.css'
import './styles.css'
import { api } from './util.js'
import { renderHome } from './home.js'
import { renderView } from './view.js'
import { renderAdmin } from './admin.js'

const app = document.getElementById('app')

async function boot() {
  let siteName = 'NeoPaste'
  try {
    const cfg = await api('/api/public-config')
    if (cfg.site_name) siteName = cfg.site_name
  } catch {
    /* offline / first paint */
  }
  document.title = siteName

  const path = location.pathname.replace(/\/+$/, '') || '/'
  if (path === '/admin') {
    renderAdmin(app, { siteName })
    return
  }
  const m = path.match(/^\/p\/([A-Za-z0-9]+)$/)
  if (m) {
    renderView(app, { siteName, id: m[1] })
    return
  }
  renderHome(app, { siteName })
}

boot()
