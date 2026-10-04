// Small, local enhancements. The page's content, version and images are present without JavaScript.
const status = document.getElementById('copy-status')

document.querySelectorAll('[data-copy-target], [data-copy-all]').forEach(button => {
  button.addEventListener('click', async () => {
    const text = button.hasAttribute('data-copy-all')
      ? [...document.querySelectorAll('[data-install-command]')].map(code => code.textContent.trim()).join('\n')
      : document.getElementById(button.dataset.copyTarget)?.textContent.trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      status.textContent = button.hasAttribute('data-copy-all') ? 'All three commands copied.' : 'Command copied.'
      const label = button.textContent
      button.textContent = 'Copied'
      button.disabled = true
      setTimeout(() => {
        button.textContent = label
        button.disabled = false
      }, 1800)
    } catch {
      status.textContent = 'Copy is unavailable. Select the command above to copy it.'
    }
  })
})

const tabs = [...document.querySelectorAll('[role="tab"]')]
const bandImage = document.getElementById('band-image')
const bandPanel = document.getElementById('band-preview')
const caption = document.getElementById('band-caption')
function selectSurface(tab) {
  tabs.forEach(item => {
    const selected = item === tab
    item.setAttribute('aria-selected', String(selected))
    item.tabIndex = selected ? 0 : -1
  })
  bandImage.src = tab.dataset.image
  bandImage.alt = tab.dataset.alt
  bandImage.removeAttribute('width')
  bandImage.removeAttribute('height')
  caption.textContent = tab.dataset.caption
  bandPanel.setAttribute('aria-labelledby', tab.id)
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectSurface(tab))
  tab.addEventListener('keydown', event => {
    let next
    if (event.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length]
    if (event.key === 'ArrowLeft') next = tabs[(index + tabs.length - 1) % tabs.length]
    if (event.key === 'Home') next = tabs[0]
    if (event.key === 'End') next = tabs.at(-1)
    if (!next) return
    event.preventDefault()
    selectSurface(next)
    next.focus()
  })
})

document.querySelectorAll('[data-language]').forEach(button => {
  button.addEventListener('click', () => {
    const language = button.dataset.language
    document.querySelectorAll('[data-language]').forEach(item => {
      item.setAttribute('aria-pressed', String(item === button))
    })
    for (const kind of ['layout', 'states']) {
      const image = document.getElementById(`${kind}-sheet`)
      const address = new URL(image.src)
      address.pathname = address.pathname.replace(/-(en|zh-cn)\.png$/, `-${language}.png`)
      image.src = address.href
      image.alt = `${language === 'en' ? 'English' : 'Simplified Chinese'} design reference: ${kind === 'layout' ? 'layout, narrowing and color scale' : 'states, data flow and verification boundaries'}`
      document.getElementById(`${kind}-sheet-link`).href = address.href
    }
  })
})
