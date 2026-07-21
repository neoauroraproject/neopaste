export async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  let data = null
  const text = await res.text()
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text || 'پاسخ نامعتبر' }
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || 'خطا')
    err.status = res.status
    err.data = data
    throw err
  }
  return data
}

export function $(sel, root = document) {
  return root.querySelector(sel)
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag)
  for (const [k, v] of Object.entries(props)) {
    if (k === 'className') node.className = v
    else if (k === 'text') node.textContent = v
    else if (k === 'html') node.innerHTML = v
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v)
    else if (v === false || v == null) continue
    else if (v === true) node.setAttribute(k, '')
    else node.setAttribute(k, v)
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue
    node.append(c instanceof Node ? c : document.createTextNode(String(c)))
  }
  return node
}

/** Like replaceChildren, but skips null/false (DOM would otherwise render "null"). */
export function setChildren(node, ...children) {
  node.replaceChildren(...children.filter((c) => c != null && c !== false))
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

export function animateIn(node) {
  node.classList.add('enter')
  requestAnimationFrame(() => node.classList.add('enter-active'))
}
