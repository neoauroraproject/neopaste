import { el, animateIn, copyText } from './util.js'
import { getLang, setLang, t } from './i18n.js'
import { listHistory, clearHistory, removeHistory, refreshHistoryStatuses } from './history.js'
import {
  createSecureShare,
  showResultPage,
  securityOptions,
  EXPIRY,
  topBar,
} from './share.js'
import { TEMPLATES } from './templates.js'
import { compressImage } from './image.js'
import { renderTools } from './tools.js'

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
    const status = el('p', { className: 'status', hidden: true })

    const tabs = el('div', { className: 'seg mode-seg' }, [
      segBtn(i.tabPaste, 'paste'),
      segBtn(i.tabCode, 'code'),
      segBtn(i.tabImage, 'image'),
    ])

    function segBtn(label, id) {
      return el('button', {
        type: 'button',
        className: 'seg-btn' + (mode === id ? ' active' : ''),
        text: label,
        onClick: () => {
          mode = id
          mount()
        },
      })
    }

    const content = el('textarea', {
      className: 'paste-input',
      placeholder: mode === 'code' ? '// code…' : i.placeholder,
      rows: mode === 'code' ? '9' : '6',
      spellcheck: 'false',
    })

    const langSelect = el(
      'select',
      { className: 'field field-compact' },
      CODE_LANGS.map((l) => el('option', { value: l.id, text: l.label })),
    )

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

    const imgPreview = el('img', { className: 'img-preview', hidden: true, alt: '' })
    const imgMeta = el('p', { className: 'hint', hidden: true })
    let imagePayload = null

    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true })
    const drop = el('div', { className: 'dropzone' }, [
      el('span', { text: i.dropImage }),
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
        imgPreview.src = imagePayload.dataUrl
        imgPreview.hidden = false
        imgMeta.hidden = false
        imgMeta.textContent = `${imagePayload.mime} · ${Math.round(imagePayload.bytes / 1024)} KB`
        status.hidden = true
      } catch (err) {
        status.classList.add('error')
        status.textContent = err.message || i.createError
        imagePayload = null
      }
    }

    let busy = false
    const submit = el('button', {
      type: 'button',
      className: 'btn primary',
      text: i.create,
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
          if (!plaintext.trim()) {
            showStatus(status, i.needContent, true)
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
        submit.textContent = i.encrypting
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
          const shell = root.querySelector('.shell')
          if (shell) {
            shell.classList.add('page-out')
            await new Promise((r) => setTimeout(r, 260))
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
          submit.textContent = i.create
        }
      },
    })

    let composeBody
    if (mode === 'image') {
      composeBody = el('div', { className: 'compose-body' }, [drop, fileInput, imgPreview, imgMeta])
    } else if (mode === 'code') {
      composeBody = el('div', { className: 'compose-body' }, [langSelect, content])
    } else {
      composeBody = el('div', { className: 'compose-body' }, [
        el('div', { className: 'compose-meta' }, [tplToggle]),
        tplRow,
        content,
      ])
    }

    const form = el('section', { className: 'panel create-panel clean' }, [
      tabs,
      composeBody,
      sec.node,
      submit,
      status,
    ])

    const historySection = await buildHistory(lang, i)

    const navBits = []
    if (toolsEnabled) {
      navBits.push(el('a', { href: '/tools', className: 'footer-link', text: i.tabTools }))
      navBits.push(el('span', { className: 'dot', text: '·' }))
    }
    navBits.push(el('a', { href: '/admin', className: 'footer-link', text: i.adminLink }))

    root.replaceChildren(
      el('div', { className: 'shell narrow page-slide home-shell' }, [
        topBar(lang, onLang),
        el('header', { className: 'brand' }, [
          el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
          el('p', { className: 'brand-tag soft', text: i.taglineShort }),
        ]),
        form,
        historySection,
        el('footer', { className: 'footer' }, navBits),
      ]),
    )
    animateIn(form)
  }

  mount()
}

async function buildHistory(lang, i) {
  const section = el('section', { className: 'history-section quiet', hidden: true })
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
    for (const item of items.slice(0, 6)) {
      const gone = item.status === 'gone'
      const card = el('div', { className: 'history-card slim' + (gone ? ' gone' : '') }, [
        el('div', { className: 'history-main' }, [
          el('span', { className: 'history-kind', text: item.kind || 'text' }),
          el('span', { className: 'history-label', text: item.label || item.id }),
          gone ? el('span', { className: 'history-status', text: i.gone }) : null,
        ]),
        el('div', { className: 'history-actions' }, [
          el('button', {
            type: 'button',
            className: 'btn ghost mini',
            text: i.copy,
            onClick: async (e) => {
              const ok = await copyText(item.url)
              e.target.textContent = ok ? i.copied : i.copyFail
              setTimeout(() => {
                e.target.textContent = i.copy
              }, 1000)
            },
          }),
          el('a', {
            className: 'btn ghost mini',
            href: (() => {
              try {
                const u = new URL(item.url)
                return u.pathname + u.hash
              } catch {
                return item.url
              }
            })(),
            text: i.open,
          }),
          el('button', {
            type: 'button',
            className: 'btn ghost mini danger',
            text: '×',
            title: i.remove,
            onClick: () => {
              removeHistory(item.id)
              paint(listHistory())
            },
          }),
        ]),
      ])
      list.append(card)
    }
  }

  paint(listHistory())
  refreshHistoryStatuses().then((items) => paint(items))

  section.append(
    el('div', { className: 'history-head' }, [
      el('h2', { className: 'section-title quiet', text: i.recent }),
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
