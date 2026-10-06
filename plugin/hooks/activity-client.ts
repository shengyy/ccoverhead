import type { ClientModule } from 'claude-code'
import { ACTIVITY_FRAMES, ACTIVITY_FRAME_MS, activityGlyphs } from './activity'

// Only this bounded spinner row redraws, with one clock for all spinners. The host owns its lifecycle;
// zero count or a narrower band removes the Client from the tree.
const Activity: ClientModule<{ color: string; count: number }, number> = (props, surface) => {
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(ACTIVITY_FRAME_MS, () => {
      surface.setState(((surface.state ?? 0) + 1) % ACTIVITY_FRAMES.length)
    })
  }
  return surface.elements.Text({ color: props.color, children: activityGlyphs(props.count, surface.state ?? 0) })
}

export default Activity
