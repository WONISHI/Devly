/** Serialized fixed code only. Model data enters as JSON arguments, never as script source. */
export function browserDOM(action: string, selector: string, value: string, expected: string) {
  if (action === 'read_text') {
    const text = document.body?.innerText ?? ''
    return {
      url: location.href,
      title: document.title.slice(0, 300),
      text: text.slice(0, 12000),
      truncated: text.length > 12000,
    }
  }
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) return { error: 'TARGET_NOT_FOUND' }
  if (element instanceof HTMLInputElement && ['password', 'file'].includes(element.type))
    return { error: 'TARGET_PROTECTED' }
  const rect = element.getBoundingClientRect()
  if (
    !rect.width ||
    !rect.height ||
    getComputedStyle(element).visibility === 'hidden' ||
    getComputedStyle(element).display === 'none'
  )
    return { error: 'TARGET_NOT_VISIBLE' }
  if ('disabled' in element && element.disabled) return { error: 'TARGET_DISABLED' }
  const snapshot = JSON.stringify({
    url: location.href,
    tag: element.tagName,
    type: element instanceof HTMLInputElement ? element.type : '',
    href: element instanceof HTMLAnchorElement ? element.href : '',
    text: (element.textContent ?? '').slice(0, 500),
    value:
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
        ? element.value.slice(0, 8192)
        : '',
  })
  if (action === 'snapshot') return { snapshot }
  if (snapshot !== expected) return { error: 'TARGET_CHANGED' }
  if (action === 'fill') {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement))
      return { error: 'TARGET_NOT_EDITABLE' }
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      'value',
    )?.set
    if (!setter) return { error: 'TARGET_NOT_EDITABLE' }
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  } else if (action === 'click') element.click()
  else return { error: 'UNKNOWN_ACTION' }
  return { applied: true, url: location.href }
}
