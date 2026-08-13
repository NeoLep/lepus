const navToggle = document.querySelector('.nav-toggle')
const siteNav = document.querySelector('.site-nav')

navToggle?.addEventListener('click', () => {
  const isOpen = siteNav?.classList.toggle('open') ?? false
  navToggle.setAttribute('aria-expanded', String(isOpen))
})

siteNav?.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    siteNav.classList.remove('open')
    navToggle?.setAttribute('aria-expanded', 'false')
  })
})

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible')
        observer.unobserve(entry.target)
      }
    })
  },
  { threshold: 0.12 }
)

document.querySelectorAll('.reveal').forEach((element) => observer.observe(element))
document.querySelector('#year').textContent = String(new Date().getFullYear())

const releasePage = 'https://github.com/NeoLep/lepus/releases/latest'
const assetPatterns = {
  'mac-arm64': /-arm64\.dmg$/i,
  'mac-x64': /-x64\.dmg$/i,
  'windows-x64': /-x64-setup\.exe$/i,
  'linux-x64': /-(?:x64|x86_64)\.AppImage$/i
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function loadLatestRelease() {
  const versionLabel = document.querySelector('#latest-version')
  const links = document.querySelectorAll('[data-asset]')

  try {
    const response = await fetch('https://api.github.com/repos/NeoLep/lepus/releases/latest', {
      headers: { Accept: 'application/vnd.github+json' }
    })
    if (!response.ok) throw new Error(`GitHub API returned ${response.status}`)

    const release = await response.json()
    if (versionLabel) versionLabel.textContent = `最新版本 ${release.tag_name}`

    links.forEach((link) => {
      const pattern = assetPatterns[link.dataset.asset]
      const asset = release.assets?.find((item) => pattern?.test(item.name))
      link.href = asset?.browser_download_url ?? release.html_url ?? releasePage
      if (asset) link.setAttribute('download', '')
    })
  } catch {
    if (versionLabel) versionLabel.textContent = '最新版本可在 GitHub Releases 下载'
    links.forEach((link) => {
      link.href = releasePage
    })
  }
}

loadLatestRelease()

const copyButton = document.querySelector('.copy-command')
copyButton?.addEventListener('click', async () => {
  const command = document.querySelector('.terminal-command code')?.textContent
  if (!command) return

  try {
    await navigator.clipboard.writeText(command)
    copyButton.textContent = '已复制'
    window.setTimeout(() => {
      copyButton.textContent = '复制'
    }, 1800)
  } catch {
    copyButton.textContent = '请手动复制'
  }
})
