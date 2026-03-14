/**
 * Keyword → icon mapping using only icons that exist in ICON_MAP.
 */
const RULES: [string, string[]][] = [
  // People
  ['user',         ['person','people','user','alice','bob','carol','dave','grace','hank','child','kid','norden','student','member']],
  ['heart',        ['family','love','hug','together','bond','talk with family','family time','care']],
  ['smile',        ['smile','happy','joy','delight','fun','enjoy','laugh','excited','play']],

  // Home & routine
  ['home',         ['home','house','room','bedroom','living','kitchen','arrive','arrive home']],
  ['sparkles',     ['shower','bath','wash','clean','tidy','organize','wipe','brush teeth','teeth','dental','rinse','dry','blow dry','hygiene']],
  ['activity',     ['morning','wake','wake up','get up','get out','rise','dawn','start','routine','daily']],
  ['star',         ['night','sleep','rest','quiet','bedtime','calm','peaceful','lights off','good night']],
  ['lightbulb',    ['idea','learn','study','homework','lesson','school','class','knowledge','education']],

  // Food & drink
  ['gift',         ['snack','healthy snack','food','eat','meal','dinner','lunch','breakfast','try all foods']],
  ['flask',        ['drink','water','milk','juice','beverage','hydrate']],

  // Actions & tasks
  ['check-circle', ['done','complete','finish','check','verified','tick','confirmed','put away','put shoes','pack']],
  ['sparkles',     ['trash','throw','garbage','clean up','bring plate','wipe mouth','mess','tidy']],
  ['refresh',      ['retry','redo','reset','sync','update','reload']],
  ['zap',          ['quick','fast','action','trigger','boost','power','energy']],

  // School & learning
  ['graduate',     ['school','before school','after school','backpack','class','homework','study','learn']],
  ['paint',        ['draw','color','art','sketch','craft','create','build something','draw or']],
  ['bookmark',     ['read','book','story','listen to story','quiet time','reading','library']],
  ['wrench',       ['build','construct','fix','repair','tool','lego','blocks']],

  // Family & social
  ['message',      ['talk','chat','discuss','conversation','speak','communicate','say bye','bye']],
  ['phone',        ['phone','call','mobile','contact']],
  ['monitor',      ['screen','tv','tablet','device','no screens','video game']],

  // Settings & system
  ['settings',     ['setting','config','preference','option','adjust','control']],
  ['lock',         ['lock','secure','private','password','safe']],
  ['key',          ['key','unlock','access','credential','open']],
  ['shield',       ['security','protect','guard','safety','defence']],

  // Navigation
  ['map-pin',      ['location','place','address','spot','arrive','go to','where']],
  ['compass',      ['direction','strategy','plan','vision','roadmap','navigate']],
  ['rocket',       ['launch','start','begin','kick off','ship','deploy','go live']],

  // Files & data
  ['folder',       ['folder','file','documents','archive','storage','pack backpack','backpack']],
  ['camera',       ['photo','picture','image','capture','snapshot','camera']],
  ['chart',        ['analytics','metrics','dashboard','report','kpi','data','stats']],

  // Time
  ['clock',        ['time','schedule','when','timer','reminder','deadline','morning routine','evening']],
  ['calendar',     ['calendar','date','plan','sprint','release','milestone','week']],

  // Other
  ['flag',         ['goal','target','milestone','objective','aim','north star']],
  ['trophy',       ['win','achievement','award','record','best','champion']],
  ['brain',        ['ai','ml','think','idea','smart','decision','brain']],
  ['globe',        ['web','internet','online','public','global','world']],
  ['server',       ['server','api','backend','service','node','worker']],
  ['database',     ['database','db','data','store','cache','storage']],
]

/**
 * Aliases: maps Lucide icon names (and common AI-generated variants) → our ICON_MAP keys.
 * Covers kebab-case variants, plural forms, and names AIs commonly hallucinate.
 */
const ALIASES: Record<string, string> = {
  // Calendar / time
  'calendar-days': 'calendar', 'calendar-check': 'calendar', 'calendar-clock': 'calendar',
  'alarm-clock': 'clock', 'alarm-clock-off': 'clock', 'timer': 'clock', 'hourglass': 'clock',
  // Sun / moon / weather
  'sunrise': 'activity', 'sunset': 'star', 'sun': 'activity', 'sun-medium': 'activity',
  'moon': 'star', 'moon-star': 'star', 'cloud-sun': 'activity', 'cloud-moon': 'star',
  // Bed / sleep
  'bed': 'star', 'bed-double': 'star', 'bed-single': 'star', 'sofa': 'star',
  // Bath / hygiene
  'bath': 'sparkles', 'toilet': 'sparkles', 'shower-head': 'sparkles', 'shower': 'sparkles',
  'toothbrush': 'sparkles', 'droplets': 'flask', 'droplet': 'flask', 'hand-washing': 'sparkles',
  // Clothing
  'shirt': 'gift', 'tshirt': 'gift', 't-shirt': 'gift', 'scissors': 'wrench',
  'footprints': 'map-pin', 'shoe': 'map-pin', 'boot': 'map-pin',
  // Food & drink
  'utensils': 'gift', 'utensils-crossed': 'gift', 'fork': 'gift', 'spoon': 'gift',
  'knife': 'gift', 'coffee': 'flask', 'tea': 'flask', 'milk': 'flask', 'cup-soda': 'flask',
  'glass-water': 'flask', 'wine': 'flask', 'beer': 'flask', 'bottle': 'flask',
  'apple': 'gift', 'banana': 'gift', 'carrot': 'gift', 'pizza': 'gift', 'sandwich': 'gift',
  'chef-hat': 'gift', 'cooking-pot': 'gift', 'pot': 'gift', 'bowl': 'gift', 'sink': 'sparkles',
  // School / learning
  'school': 'graduate', 'graduation-cap': 'graduate', 'backpack': 'folder',
  'pencil': 'paint', 'pen': 'paint', 'pen-tool': 'paint', 'pencil-line': 'paint',
  'book': 'bookmark', 'book-open': 'bookmark', 'book-marked': 'bookmark', 'notebook': 'bookmark',
  // Play / fun
  'gamepad': 'smile', 'gamepad-2': 'smile', 'toy-brick': 'wrench', 'blocks': 'wrench',
  'puzzle': 'wrench', 'dices': 'smile', 'dice': 'smile',
  // Home
  'door-open': 'home', 'door-closed': 'home', 'door': 'home',
  // Cleaning
  'broom': 'sparkles', 'trash': 'sparkles', 'trash-2': 'sparkles', 'recycle': 'refresh',
  // Check
  'check-square': 'check-circle', 'check': 'check-circle', 'circle-check': 'check-circle',
  'square-check': 'check-circle', 'list-check': 'check-circle',
  // Navigation / map
  'navigation': 'compass', 'navigation-2': 'compass', 'route': 'compass',
  // People
  'users': 'user', 'user-circle': 'user', 'user-round': 'user', 'person': 'user',
  'person-standing': 'user', 'baby': 'user', 'child': 'user',
  // Misc
  'package-2': 'package', 'box': 'package', 'boxes': 'package',
  'wand': 'sparkles', 'wand-2': 'sparkles', 'wand-sparkles': 'sparkles',
  'music-2': 'music', 'music-4': 'music',
  'chart-bar': 'chart', 'chart-line': 'chart', 'bar-chart': 'chart', 'line-chart': 'chart',
  'pie-chart': 'pie',
  'cpu-chip': 'cpu', 'chip': 'cpu',
  'laptop': 'monitor', 'laptop-2': 'monitor', 'pc': 'monitor', 'computer': 'monitor',
  'hand': 'sparkles', 'hand-metal': 'sparkles',
}

/**
 * Resolve an icon name: check ICON_MAP directly, then fall back to ALIASES.
 * Returns undefined if no match found.
 */
export function resolveIcon(name: string | undefined): string | undefined {
  if (!name) return undefined
  // Direct match (caller checks ICON_MAP externally, but we return the key)
  if (name in ALIASES) return ALIASES[name]
  // Try stripping numeric suffix variants like "home-2" → "home"
  const base = name.replace(/-\d+$/, '')
  if (base !== name && base in ALIASES) return ALIASES[base]
  return name // pass through — ICON_MAP check is done by caller
}

export function guessIcon(title: string): string | undefined {
  const lower = title.toLowerCase()
  for (const [icon, keywords] of RULES) {
    if (keywords.some(kw => lower.includes(kw))) return icon
  }
  return undefined
}
