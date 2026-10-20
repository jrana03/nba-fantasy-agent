export const gameDate = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

export const gameTime = (iso) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })

export const venueText = (venue) =>
  venue ? [venue.name, [venue.city, venue.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : 'Venue TBD'
