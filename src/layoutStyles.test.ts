import { describe, expect, it } from 'vitest'

describe('fixed navigation layout', () => {
  it('matches detail screens nested inside the swipe-back wrapper', () => {
    document.body.innerHTML = '<div class="browsing-shell"><div class="edge-swipe-back"><div class="edge-swipe-surface"><div class="route-stage"><main id="current-detail" class="screen sub-screen"></main></div></div></div></div>'
    const detail = document.querySelector('.browsing-shell .route-stage > .sub-screen')
    expect(detail).toHaveAttribute('id', 'current-detail')
  })
})
