// Full eight-dot braille: two columns, four rows. Five lit dots move clockwise.
// The vector version uses the same bits and timing, so both surfaces show one animation.
const CLOCKWISE_BITS = [0, 3, 4, 5, 7, 6, 2, 1]
const MASKS = CLOCKWISE_BITS.map((_, phase) =>
  Array.from({ length: 5 }, (_, offset) => 1 << CLOCKWISE_BITS[(phase + offset) % 8]!).reduce((a, b) => a | b, 0),
)
export const ACTIVITY_FRAMES = MASKS.map(mask => String.fromCharCode(0x2800 + mask))
export const ACTIVITY_FRAME_MS = 140
const ACTIVITY_LIMIT = 3

export const activityCount = (count: number) => Math.min(count, ACTIVITY_LIMIT)
export const activityOverflow = (count: number) => count > ACTIVITY_LIMIT ? `+${count - ACTIVITY_LIMIT}` : ''
export const activityWidth = (count: number) => activityCount(count) * 10 - 2

export function activityGlyphs(count: number, phase = 0): string {
  return ACTIVITY_FRAMES[phase % MASKS.length]!.repeat(activityCount(count))
}

// Script-free vector dots: each dot advances at the same step as the terminal glyph.
export function activityBody(count: number): string {
  const dots = [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [0, 3], [1, 3]]
  const draw = (animated: boolean) => Array.from({ length: activityCount(count) }, (_, i) => dots.map(([x, y], bit) => {
    const values = MASKS.map(mask => mask & (1 << bit) ? 1 : 0.12)
    const times = Array.from({ length: MASKS.length + 1 }, (_, i) => i / MASKS.length).join(';')
    const motion = animated ? `<animate attributeName="opacity" values="${[...values, values[0]].join(';')}" keyTimes="${times}" calcMode="discrete" dur="${ACTIVITY_FRAME_MS * MASKS.length}ms" repeatCount="indefinite"/>` : ''
    return `<circle cx="${2 + i * 10 + x! * 4}" cy="${1.5 + y! * 11 / 3}" r="1.15" opacity="${values[0]}">${motion}</circle>`
  }).join('')).join('')
  return `<style>.still{display:none}@media(prefers-reduced-motion:reduce){.moving{display:none}.still{display:inline}}</style>` +
    `<g class="k moving">${draw(true)}</g><g class="k still">${draw(false)}</g>`
}
