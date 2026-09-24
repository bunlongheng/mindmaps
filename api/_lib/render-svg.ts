// The SVG renderer moved to src/lib/render-svg.ts so the browser can import it too -
// the home grid's card previews now draw with the same renderer the /svg endpoint uses,
// instead of a separate hand-rolled minimap. This file stays as the API-side entry point
// so nothing under api/ has to change.
export { renderMindmapSvg, type MindmapRow } from '../../src/lib/render-svg.js'
