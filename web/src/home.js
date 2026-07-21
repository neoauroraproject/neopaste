import { el, animateIn, copyText } from './util.js'
import { getLang, setLang, t } from './i18n.js'
import { listHistory, clearHistory, removeHistory, refreshHistoryStatuses } from './history.js'
import {
  createSecureShare,
  showResultPage,
  securityOptions,
  EXPIRY,
} from './share.js'
import { TEMPLATES } from './templates.js'
import { compressImage } from './image.js'
import { renderTools } from './tools.js'
import { langSwitch } from './langswitch.js'
import { icon, iconLabel } from './icons.js'

const CODE_LANGS = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'python', label: 'Python' },
  { id: 'go', label: 'Go' },
  { id: 'bash', label: 'Bash' },
  { id: 'json', label: 'JSON' },
  { id: 'xml', label: 'HTML/XML' },
  { id: 'plaintext', label: 'Plain' },
]

export function renderHome(root, { siteName, toolsEnabled = true }) {
  let lang = getLang()
  setLang(lang)
  let mode = 'paste'
  let pasteHandler = null
  let showTemplates = false
  const draft = { text: '', codeLang: 'javascript', imagePayload: null }

  const onLang = (next) => {
    lang = next
    setLang(lang)
    mount()
  }

  const mount = async () => {
    if (pasteHandler) {
      document.removeEventListener('paste', pasteHandler)
      pasteHandler = null
    }
    const i = t(lang)
    const state = { usePassword: true, useExpiry: true, expiresIn: EXPIRY[2].sec, burn: false }
    const sec = securityOptions(lang, state)
    const status = el('p', { className: 'status', role: 'status', hidden: true })

    const tabs = el(
      'div',
      { className: 'seg mode-seg', role: 'tablist', 'aria-label': i.composeModes },
      [
        modeTab(i.tabPaste, 'paste', 'paste'),
        modeTab(i.tabCode, 'code', 'code'),
        modeTab(i.tabImage, 'image', 'image'),
      ],
    )

    function modeTab(label, id, ico) {
      return el(
        'button',
        {
          type: 'button',
          role: 'tab',
          'aria-selected': mode === id ? 'true' : 'false',
          className: 'seg-btn mode-btn' + (mode === id ? ' active' : ''),
          onClick: () => {
            if (mode === 'paste' || mode === 'code') draft.text = content.value
            mode = id
            mount()
          },
        },
        [icon(ico), el('span', { text: label })],
      )
    }

    const content = el('textarea', {
      className: 'paste-input home-input',
      placeholder: mode === 'code' ? '// code…' : i.placeholder,
      rows: mode === 'code' ? '12' : '8',
      spellcheck: 'false',
      'aria-label': mode === 'code' ? i.tabCode : i.tabPaste,
    })
    if (mode !== 'image') content.value = draft.text

    const langSelect = el(
      'select',
      { className: 'field field-compact', 'aria-label': i.language },
      CODE_LANGS.map((l) =>
        el('option', {
          value: l.id,
          text: l.label,
          selected: l.id === draft.codeLang ? true : undefined,
        }),
      ),
    )
    langSelect.value = draft.codeLang
    langSelect.addEventListener('change', () => {
      draft.codeLang = langSelect.value
    })

    const tplRow = el(
      'div',
      { className: 'tpl-row', hidden: !showTemplates },
      TEMPLATES.map((tpl) =>
        el('button', {
          type: 'button',
          className: 'chip quiet',
          text: lang === 'fa' ? tpl.labelFa : tpl.labelEn,
          onClick: () => {
            content.value = tpl.body
            draft.text = tpl.body
            content.focus()
          },
        }),
      ),
    )

    const tplToggle = el('button', {
      type: 'button',
      className: 'linkish-btn',
      text: showTemplates ? i.hideTemplates : i.templates,
      onClick: () => {
        showTemplates = !showTemplates
        tplRow.hidden = !showTemplates
        tplToggle.textContent = showTemplates ? i.hideTemplates : i.templates
      },
    })

    const imgPreview = el('img', { className: 'img-preview', hidden: true, alt: i.imagePreview })
    const imgMeta = el('p', { className: 'hint', hidden: true })
    let imagePayload = draft.imagePayload
    if (imagePayload) {
      imgPreview.src = imagePayload.dataUrl
      imgPreview.hidden = false
      imgMeta.hidden = false
      imgMeta.textContent = `${imagePayload.mime} · ${Math.round(imagePayload.bytes / 1024)} KB`
    }

    const fileInput = el('input', {
      type: 'file',
      accept: 'image/png,image/jpeg,image/webp',
      hidden: true,
      'aria-hidden': 'true',
    })
    const drop = el('div', {
      className: 'dropzone',
      role: 'button',
      tabindex: '0',
      'aria-label': i.pickImage,
    }, [
      icon('image', 'ico drop-ico'),
      el('span', { className: 'drop-title', text: i.dropImage }),
      el('span', { className: 'drop-hint', text: i.dropHint }),
      el('button', {
        type: 'button',
        className: 'btn ghost mini',
        text: i.pickImage,
        onClick: (e) => {
          e.stopPropagation()
          fileInput.click()
        },
      }),
    ])
    drop.addEventListener('click', () => fileInput.click())
    drop.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        fileInput.click()
      }
    })
    drop.addEventListener('dragover', (e) => {
      e.preventDefault()
      drop.classList.add('over')
    })
    drop.addEventListener('dragleave', () => drop.classList.remove('over'))
    drop.addEventListener('drop', async (e) => {
      e.preventDefault()
      drop.classList.remove('over')
      const f = e.dataTransfer.files?.[0]
      if (f) await loadImage(f)
    })
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0]
      if (f) await loadImage(f)
    })
    pasteHandler = async (e) => {
      if (mode !== 'image') return
      const item = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'))
      if (item) {
        const f = item.getAsFile()
        if (f) await loadImage(f)
      }
    }
    document.addEventListener('paste', pasteHandler)

    async function loadImage(file) {
      status.hidden = true
      status.classList.remove('error')
      status.hidden = false
      status.textContent = i.compressing
      try {
        imagePayload = await compressImage(file)
        draft.imagePayload = imagePayload
        imgPreview.src = imagePayload.dataUrl
        imgPreview.hidden = false
        imgMeta.hidden = false
        imgMeta.textContent = `${imagePayload.mime} · ${Math.round(imagePayload.bytes / 1024)} KB`
        status.hidden = true
      } catch (err) {
        status.classList.add('error')
        status.textContent = err.message || i.createError
        imagePayload = null
        draft.imagePayload = null
      }
    }

    let busy = false
    const submit = el('button', {
      type: 'button',
      className: 'btn primary home-cta',
      onClick: async () => {
        if (busy) return
        status.hidden = true
        let plaintext = ''
        let kind = 'text'
        let codeLang = ''
        let mime = ''
        let label = ''

        if (mode === 'image') {
          if (!imagePayload) {
            showStatus(status, i.needContent, true)
            return
          }
          plaintext = imagePayload.dataUrl
          kind = 'image'
          mime = imagePayload.mime
          label = 'image'
        } else {
          plaintext = content.value
          draft.text = plaintext
          if (!plaintext.trim()) {
            showStatus(status, i.needContent, true)
            content.focus()
            return
          }
          if (mode === 'code') {
            kind = 'code'
            codeLang = langSelect.value
            label = codeLang
          } else {
            label = plaintext.trim().slice(0, 48)
          }
        }

        busy = true
        submit.disabled = true
        submit.replaceChildren(el('span', { className: 'cta-label', text: i.encrypting }))
        try {
          const res = await createSecureShare({
            plaintext,
            lang,
            usePassword: state.usePassword,
            passwordValue: sec.password.value,
            useExpiry: state.useExpiry,
            expiresIn: state.expiresIn,
            burn: state.burn,
            kind,
            codeLang,
            mime,
            label,
          })
          const shell = root.querySelector('.home-page')
          if (shell) {
            shell.classList.add('page-out')
            await new Promise((r) => setTimeout(r, 220))
          }
          await showResultPage(root, {
            siteName,
            url: res.url,
            keyInUrl: res.keyInUrl,
            burn: state.burn,
            lang,
            onLang,
            onAgain: () => renderHome(root, { siteName, toolsEnabled }),
          })
        } catch (err) {
          showStatus(status, err.message || i.createError, true)
          busy = false
          submit.disabled = false
          submit.replaceChildren(
            icon('link', 'ico'),
            el('span', { className: 'cta-label', text: i.create }),
          )
        }
      },
    }, [icon('link', 'ico'), el('span', { className: 'cta-label', text: i.create })])

    let composeBody
    if (mode === 'image') {
      composeBody = el('div', { className: 'compose-body' }, [drop, fileInput, imgPreview, imgMeta])
    } else if (mode === 'code') {
      composeBody = el('div', { className: 'compose-body' }, [
        el('div', { className: 'compose-toolbar' }, [
          el('label', { className: 'field-label', text: i.language }),
          langSelect,
        ]),
        content,
      ])
    } else {
      composeBody = el('div', { className: 'compose-body' }, [
        el('div', { className: 'compose-meta' }, [tplToggle]),
        tplRow,
        content,
      ])
    }

    const form = el('section', { className: 'panel create-panel home-panel', 'aria-label': i.create }, [
      tabs,
      composeBody,
      sec.node,
      submit,
      status,
    ])

    const trust = el('aside', { className: 'trust-rail', 'aria-label': i.trustTitle }, [
      el('h2', { className: 'aside-title', text: i.trustTitle }),
      trustItem('shield', i.trustE2e, i.trustE2eHint),
      trustItem('clock', i.trustExpiry, i.trustExpiryHint),
      trustItem('flame', i.trustBurn, i.trustBurnHint),
    ])

    function trustItem(ico, title, hint) {
      return el('div', { className: 'trust-item' }, [
        el('div', { className: 'trust-ico' }, [icon(ico)]),
        el('div', { className: 'trust-copy' }, [
          el('strong', { text: title }),
          el('span', { text: hint }),
        ]),
      ])
    }

    const historySection = await buildHistory(lang, i)

    const navEnd = el('div', { className: 'home-nav-end' }, [
      toolsEnabled
        ? el('a', { href: '/tools', className: 'nav-chip' }, [
            icon('tools'),
            el('span', { text: i.tabTools }),
          ])
        : null,
      langSwitch(lang, onLang),
    ].filter(Boolean))

    root.replaceChildren(
      el('div', { className: 'home-page page-slide' }, [
        el('header', { className: 'home-nav' }, [
          el('a', { href: '/', className: 'nav-brand' }, [
            el('span', { className: 'nav-mark', 'aria-hidden': 'true' }),
            el('span', { className: 'nav-name', text: siteName || 'NeoPaste' }),
          ]),
          navEnd,
        ]),
        el('section', { className: 'home-hero' }, [
          el('h1', { className: 'hero-title', text: siteName || 'NeoPaste' }),
          el('p', { className: 'hero-sub', text: i.taglineShort }),
          el('div', { className: 'hero-pills' }, [
            iconLabel('shield', i.pillE2e, 'pill'),
            iconLabel('lock', i.pillPass, 'pill'),
            iconLabel('clock', i.pillTimer, 'pill'),
          ]),
        ]),
        el('div', { className: 'home-grid' }, [
          el('div', { className: 'home-primary' }, [form]),
          el('div', { className: 'home-secondary' }, [trust, historySection]),
        ]),
        el('footer', { className: 'home-footer' }, [
          el('a', { href: '/admin', className: 'footer-link', text: i.adminLink }),
        ]),
      ]),
    )
    animateIn(form)
  }

  mount()
}

async function buildHistory(lang, i) {
  const section = el('section', { className: 'history-section pro', hidden: true })
  const list = el('div', { className: 'history-list' })
  const clearBtnSlot = el('div', { className: 'history-clear-slot' })

  const paint = (items) => {
    list.replaceChildren()
    clearBtnSlot.replaceChildren()
    if (!items.length) {
      section.hidden = true
      return
    }
    section.hidden = false
    clearBtnSlot.append(
      el('button', {
        type: 'button',
        className: 'linkish-btn',
        text: i.clearRecent,
        onClick: () => {
          clearHistory()
          paint([])
        },
      }),
    )
    for (const item of items.slice(0, 8)) {
      const gone = item.status === 'gone'
      const pathHref = (() => {
        try {
          const u = new URL(item.url)
          return u.pathname + u.hash
        } catch {
          return item.url
        }
      })()
      const card = el('article', { className: 'history-card pro' + (gone ? ' gone' : '') }, [
        el('div', { className: 'history-main' }, [
          el('span', { className: 'history-kind', text: item.kind || 'text' }),
          el('span', { className: 'history-label', text: item.label || item.id }),
          gone ? el('span', { className: 'history-status', text: i.gone }) : null,
        ]),
        el('div', { className: 'history-actions' }, [
          el('button', {
            type: 'button',
            className: 'icon-btn',
            'aria-label': i.copy,
            title: i.copy,
            onClick: async (e) => {
              const ok = await copyText(item.url)
              e.currentTarget.classList.toggle('ok', ok)
              setTimeout(() => e.currentTarget.classList.remove('ok'), 900)
            },
          }, [icon('copy')]),
          el('a', {
            className: 'icon-btn',
            href: pathHref,
            'aria-label': i.open,
            title: i.open,
          }, [icon('external')]),
          el('button', {
            type: 'button',
            className: 'icon-btn danger',
            'aria-label': i.remove,
            title: i.remove,
            onClick: () => {
              removeHistory(item.id)
              paint(listHistory())
            },
          }, [icon('x')]),
        ]),
      ])
      list.append(card)
    }
  }

  paint(listHistory())
  refreshHistoryStatuses().then((items) => paint(items))

  section.append(
    el('div', { className: 'history-head' }, [
      el('h2', { className: 'aside-title', text: i.recent }),
      clearBtnSlot,
    ]),
    el('p', { className: 'hint tiny', text: i.recentHint }),
    list,
  )
  return section
}

function showStatus(node, msg, isError) {
  node.hidden = false
  node.textContent = msg
  node.classList.toggle('error', !!isError)
}

export { renderTools }
