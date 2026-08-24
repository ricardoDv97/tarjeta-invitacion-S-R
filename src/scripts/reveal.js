const revealElements = [...document.querySelectorAll('[data-reveal]')]
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (revealElements.length > 0) {
  document.documentElement.classList.add('reveal-ready')

  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealElements.forEach((element) => element.classList.add('is-visible'))
  } else {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return
        entry.target.classList.add('is-visible')
        observer.unobserve(entry.target)
      })
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 })

    revealElements.forEach((element) => observer.observe(element))
  }
}
