// A demo map is just a map carrying the `demo` tag. No column, no second table:
// tagging a map `demo` moves it to the Demo tab on the home library and turns on
// the social footer on its share page, and untagging it takes both away.
export const DEMO_TAG = 'demo'

/** True when this map is one of the public showcase maps. */
export function isDemo(tags: string[] | undefined): boolean {
  return (tags ?? []).includes(DEMO_TAG)
}
