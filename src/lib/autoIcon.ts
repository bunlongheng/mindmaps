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

export function guessIcon(title: string): string | undefined {
  const lower = title.toLowerCase()
  for (const [icon, keywords] of RULES) {
    if (keywords.some(kw => lower.includes(kw))) return icon
  }
  return undefined
}
