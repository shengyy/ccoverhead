import type { ClientModule } from 'claude-code'
import { ACTIVITY_FRAMES, ACTIVITY_FRAME_MS } from './activity'

// Only this terminal glyph redraws. The host owns the instance and its timer lifecycle;
// zero count or a narrower band removes the Client from the tree.
const Activity: ClientModule<{ color: string }, number> = (props, surface) => {
  if (surface.state === undefined) {
    surface.setState(0)
    surface.every(ACTIVITY_FRAME_MS, () => {
      surface.setState(((surface.state ?? 0) + 1) % ACTIVITY_FRAMES.length)
    })
  }
  return surface.elements.Text({ color: props.color, children: ACTIVITY_FRAMES[surface.state ?? 0] })
}

export default Activity
