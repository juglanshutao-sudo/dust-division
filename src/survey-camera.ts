// Both survey views look across the open southeast apron. Keeping one bearing
// preserves the street orientation when the player opens the production grid.
const bearing = (145 * Math.PI) / 180
const east = Math.sin(bearing)
const north = Math.cos(bearing)

export function surveyCamera(industry: boolean, aspect: number) {
  const portrait = Math.min(1, Math.max(0, (1.55 - aspect) / 1.09))
  const widthFit = Math.max(1, 0.46 / aspect)
  const distance = industry ? 60 + 40 * portrait : 51 + 46 * portrait
  const across = industry ? -7.5 + 6.5 * portrait : -7 + 7.8 * portrait
  const along = industry ? -1 - 4.2 * portrait : -3.5 - 2 * portrait
  const elevation = ((46 + portrait * (industry ? 1 : 4.5)) * Math.PI) / 180
  return {
    bearing,
    elevation,
    distance: distance * widthFit,
    fov: industry ? 42 : 43,
    x: north * across + east * along,
    z: -22 - east * across + north * along,
  }
}
