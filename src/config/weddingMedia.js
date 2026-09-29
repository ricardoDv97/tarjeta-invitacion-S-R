// Metadatos locales para que Astro genere variantes optimizadas.
const files = import.meta.glob('../assets/boda/*', { eager: true, import: 'default' })
const images = Object.entries(files)
  .map(([path, src]) => ({ name: path.split('/').pop(), src }))
  .filter(({ name }) => /\.(jpe?g|png|webp)$/i.test(name))
const numberedImages = (prefix) => images
  .map((image) => ({ ...image, match: image.name.match(new RegExp(`^${prefix}-(\\d+)\\.(jpe?g|png|webp)$`, 'i')) }))
  .filter(({ match }) => match)
  .map(({ name, src, match }) => ({ name, src, number: Number(match[1]) }))
  .sort((a, b) => a.number - b.number)
const hero = images.find(({ name }) => /^principal\.(jpe?g|png|webp)$/i.test(name))
if (!hero) throw new Error('Falta Principal.jpg, .jpeg, .png o .webp en src/assets/boda/.')
export const weddingMedia = {
  heroImage: hero.src,
  featured: numberedImages('destacada')
    .map(({ src }, index) => ({ src, alt: `Sabri y Ri — recuerdo destacado ${index + 1}` })),
  memories: numberedImages('imagen')
    .map(({ src }, index) => ({ src, alt: `Un momento de la historia de Sabri y Ri — fotografía ${index + 1}` })),
}
