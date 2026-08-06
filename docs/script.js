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
