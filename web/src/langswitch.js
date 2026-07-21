import { el } from './util.js'

export function langSwitch(current, onChange) {
  return el('div', { className: 'lang-switch', role: 'group', 'aria-label': 'Language' }, [
    el('button', {
      type: 'button',
      className: 'lang-btn' + (current === 'fa' ? ' active' : ''),
      text: 'فا',
      onClick: () => onChange('fa'),
    }),
    el('button', {
      type: 'button',
      className: 'lang-btn' + (current === 'en' ? ' active' : ''),
      text: 'EN',
      onClick: () => onChange('en'),
    }),
  ])
}
