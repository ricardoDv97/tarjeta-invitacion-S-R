import heroImage from '../assets/boda/imagen-10.jpg'
import portrait from '../assets/boda/imagen-8.jpg'
import detail from '../assets/boda/imagen-3.jpg'
import embrace from '../assets/boda/imagen-14.jpg'
import landscape from '../assets/boda/imagen-11.jpg'
import monochrome from '../assets/boda/imagen-13.jpg'
import fountain from '../assets/boda/imagen-4.jpg'

export const wedding = {
  slug: 'ricardo-sabrina-2026',
  couple: { partner1: 'Sabrina', partner2: 'Ricardo', displayName: 'Sabri & Ri', informalName: 'Sabri y Ri' },
  event: {
    date: '2026-12-19',
    startsAt: '2026-12-19T18:00:00-03:00',
    shortDate: '19 · 12 · 2026',
    longDate: 'Sábado 19 de diciembre de 2026',
    time: '18:00 a 00:00 hs',
    eyebrow: 'Nos casamos',
  },
  location: {
    title: '¿Dónde nos encontramos?',
    name: 'Finca de Oficiales del Servicio Penitenciario de Misiones',
    description: 'Te esperamos para compartir juntos esta noche tan especial.',
    mapUrl: 'https://maps.app.goo.gl/bp1X7bPJ3mufhSqv7',
  },
  payment: { enabled: true, pricePerGuest: 35000, childPrice: 10000, youngChildPrice: 0 },
  // Metadatos locales para generar variantes responsive con astro:assets.
  media: {
    heroImage,
    gallery: [
      { src: portrait, alt: 'Sabri y Ri durante su sesión de fotos' },
      { src: detail, alt: 'Detalle de las manos de Sabri y Ri' },
      { src: embrace, alt: 'Sabri y Ri juntos en el parque' },
      { src: landscape, alt: 'Sabri y Ri en una fotografía en blanco y negro' },
      { src: monochrome, alt: 'Retrato de Sabri y Ri en blanco y negro' },
      { src: fountain, alt: 'Sabri y Ri junto a la fuente' },
    ],
  },
  rsvp: {
    title: '¿Nos acompañás?',
    description: 'Confirmá tu asistencia y registrá a las personas que te acompañarán.',
    href: '/confirmar',
  },
  social: [],
  audio: { enabled: false, src: '', volume: 0.35 },
}
