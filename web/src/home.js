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

    const tabs = el('div', { className: 'mode-tabs' }, [
      tabBtn(i.tabPaste, 'paste'),
      tabBtn(i.tabCode, 'code'),
      tabBtn(i.tabImage, 'image'),
      toolsEnabled
        ? el('a', { href: '/tools', className: 'mode-tab linkish', text: i.tabTools })
        : null,
    ].filter(Boolean))

    function tabBtn(label, id) {
      return el('button', {
        type: 'button',
        className: 'mode-tab' + (mode === id ? ' active' : ''),
        text: label,
        onClick: () => {
          mode = id
          mount()
        },
      })
    }

    const content = el('textarea', {
      className: 'paste-input',
      placeholder: i.placeholder,
      rows: '7',
      spellcheck: 'false',
    })

    const langSelect = el(
      'select',
      { className: 'field' },
      CODE_LANGS.map((l) => el('option', { value: l.id, text: l.label })),
    )

    const tplRow = el(
      'div',
      { className: 'tpl-row' },
      TEMPLATES.map((tpl) =>
        el('button', {
          type: 'button',
          className: 'chip',
          text: lang === 'fa' ? tpl.labelFa : tpl.labelEn,
          onClick: () => {
            content.value = tpl.body
            content.focus()
          },
        }),
      ),
    )

    const imgPreview = el('img', { className: 'img-preview', hidden: true, alt: '' })
    const imgMeta = el('p', { className: 'hint', hidden: true })
    let imagePayload = null

    const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', hidden: true })
    const pickBtn = el('button', {
      type: 'button',
      className: 'btn ghost',
      text: i.pickImage,
      onClick: () => fileInput.click(),
    })
    const drop = el('div', { className: 'dropzone', text: i.dropImage })
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

    let busy = false

    const composeBody =
      mode === 'image'
        ? el('div', { className: 'compose-body' }, [drop, pickBtn, fileInput, imgPreview, imgMeta])
        : mode === 'code'
          ? el('div', { className: 'compose-body' }, [
              el('label', { className: 'field-label', text: i.language }),
              langSelect,
              content,
            ])
          : el('div', { className: 'compose-body' }, [
              el('label', { className: 'field-label', text: i.templates }),
              tplRow,
              content,
            ])

    // restore mode UI correctly after draft remount
    if (mode === 'code') content.placeholder = '// code…'
    if (mode === 'paste') content.placeholder = i.placeholder

    const form = el('section', { className: 'panel create-panel' }, [
      tabs,
      composeBody,
      sec.node,
      submit,
      status,
    ])

    const historySection = await buildHistory(lang, i)

    root.replaceChildren(
      el('div', { className: 'shell page-slide' }, [
        topBar(lang, onLang),
        el('header', { className: 'brand' }, [
          el('a', { href: '/', className: 'brand-name', text: siteName || 'NeoPaste' }),
          el('p', { className: 'brand-tag', text: i.tagline }),
        ]),
        form,
        historySection,
        el('footer', { className: 'footer' }, [
          el('a', { href: '/admin', className: 'footer-link', text: i.adminLink }),
        ]),
      ]),
    )
    animateIn(form)
  }

  mount()
}

async function buildHistory(lang, i) {
  const list = el('div', { className: 'history-list' })
  const clearBtnSlot = el('div', { className: 'history-clear-slot' })

  const paint = (items) => {
    list.replaceChildren()
    clearBtnSlot.replaceChildren()
    if (!items.length) {
      list.append(el('p', { className: 'hint', text: i.emptyRecent }))
      return
    }
    clearBtnSlot.append(
      el('button', {
        type: 'button',
        className: 'btn ghost mini',
        text: i.clearRecent,
        onClick: () => {
          clearHistory()
          paint([])
        },
      }),
    )
    for (const item of items.slice(0, 12)) {
      const statusLabel =
        item.status === 'gone' ? i.gone : item.status === 'alive' ? i.alive : ''
      const card = el('div', { className: 'history-card' + (item.status === 'gone' ? ' gone' : '') }, [
        el('div', { className: 'history-main' }, [
          el('span', { className: 'history-kind', text: item.kind || 'text' }),
          el('span', { className: 'history-label', text: item.label || item.id }),
          statusLabel ? el('span', { className: 'history-status', text: statusLabel }) : null,
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
            text: i.remove,
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

  return el('section', { className: 'history-section' }, [
    el('div', { className: 'history-head' }, [
      el('h2', { className: 'section-title', text: i.recent }),
      clearBtnSlot,
    ]),
    el('p', { className: 'hint', text: i.recentHint }),
    list,
  ])
}

function showStatus(node, msg, isError) {
  node.hidden = false
  node.textContent = msg
  node.classList.toggle('error', !!isError)
}

// re-export for main
export { renderTools }
