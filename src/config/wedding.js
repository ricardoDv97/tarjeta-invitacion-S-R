export const wedding = {
  couple: { partner1: 'S', partner2: 'R', displayName: 'S & R' },
  event: {
    date: '',
    eyebrow: 'Nos casamos',
    title: 'Nuestra Boda',
    message: 'Muy pronto vamos a compartir todos los detalles de este día tan especial.',
  },
  story: {
    eyebrow: 'Nuestro camino',
    title: 'Nuestra historia',
    text: 'Muy pronto vamos a compartir aquí algunos de nuestros momentos favoritos.',
    image: '',
  },
  ceremony: {
    name: '',
    address: '',
    time: '',
    description: 'Próximamente encontrarás aquí todos los detalles de la ceremonia.',
  },
  celebration: {
    name: '',
    address: '',
    time: '',
    description: 'Próximamente encontrarás aquí todos los detalles de la celebración.',
  },
  location: {
    title: 'Cómo llegar',
    address: '',
    description: 'La ubicación y las indicaciones estarán disponibles muy pronto.',
    mapUrl: '',
  },
  dressCode: {
    title: 'Dress Code',
    type: '',
    description: 'Queremos que te sientas cómodo/a y disfrutes con nosotros.',
    notes: '',
  },
  payment: { enabled: true, pricePerGuest: 0 },
  // Cada valor admite indistintamente una URL https o una ruta desde /public.
  // TODO: reemplazar por fotografías y videos reales de S&R.
  media: { introBackground: '', heroImage: '', gallery: [], videos: [] },
  rsvp: {
    title: 'Confirmá tu asistencia',
    description: 'Nos encantaría compartir este día con vos.',
    href: '/confirmar',
  },
  social: [],
}
