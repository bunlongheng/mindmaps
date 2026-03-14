/**
 * Keyword → icon mapping. Each entry is [icon-name, [...keywords]].
 * Keywords are matched case-insensitively against the node title.
 */
const RULES: [string, string[]][] = [
  // People & identity
  ['user',        ['person','people','user','alice','bob','carol','dave','grace','hank','child','kid','baby','family','member','norden','student','team']],
  ['home',        ['home','house','arrive','room','bed','bedroom','living','kitchen','bathroom']],
  ['smile',       ['smile','happy','joy','delight','fun','enjoy','play','laugh','excited']],

  // Morning / daily routine
  ['sun',         ['morning','wake','sunrise','early','dawn','day start','open curtain']],
  ['moon',        ['night','sleep','bedtime','evening','quiet time','rest','lights off']],
  ['bed',         ['bed','sleep','rest','pajama','nap','go to bed','get up','get out of bed']],
  ['shower',      ['shower','bath','wash body','wash hair','dry','bathe','rinse']],
  ['droplets',    ['water','drink water','milk','juice','hydrate','beverage']],
  ['tooth',       ['brush teeth','teeth','dental','floss','toothbrush']],
  ['wind',        ['hair','comb hair','blow dry','brush hair','style']],
  ['shirt',       ['clothes','clothe','put on','dress','outfit','pajama','jacket','uniform','dirty clothes']],

  // Food & meals
  ['utensils',    ['eat','meal','dinner','lunch','breakfast','snack','food','sit at table','try all foods','bite']],
  ['apple',       ['healthy snack','fruit','apple','nutrition','veggie','vegetable']],
  ['cup',         ['drink','cup','glass','mug','beverage']],

  // School & learning
  ['book-open',   ['read','book','story','listen to story','library','chapter']],
  ['backpack',    ['backpack','school','pack','bag','school bag']],
  ['pencil',      ['draw','color','write','pencil','sketch','art','craft']],
  ['blocks',      ['build','block','lego','construct','toy','play with toys']],
  ['graduation',  ['school','class','learn','study','homework','lesson','before school','after school']],

  // Hygiene & health
  ['hand',        ['wash hands','hands','sanitize','clean hands','flush toilet']],
  ['toilet',      ['toilet','bathroom','use toilet','flush','restroom','lavatory']],
  ['trash',       ['trash','throw','waste','garbage','clean up','bring plate','wipe','mess']],
  ['sparkles',    ['clean','tidy','organize','put away','wipe','mop','sweep']],

  // Family & social
  ['heart',       ['family','love','hug','together','bond','talk with family','family time']],
  ['message',     ['talk','chat','discuss','conversation','speak','communicate']],
  ['phone',       ['phone','call','mobile','contact','say bye','bye']],

  // Evening & bedtime
  ['book',        ['quiet time','story time','no screens','bedtime story']],
  ['screen',      ['screen','tv','tablet','device','video game']],
  ['lamp',        ['light','lamp','turn off lights','dark','night light']],

  // General tasks & actions
  ['check-circle',['done','complete','finish','check','verify','confirmed','tick']],
  ['clock',       ['time','schedule','routine','when','timer','reminder']],
  ['star',        ['star','favorite','best','top','featured','highlight']],
  ['flag',        ['goal','target','milestone','objective','aim']],
  ['zap',         ['quick','fast','action','trigger','boost','power','energy']],
  ['settings',    ['setting','config','preference','option','adjust','control']],
  ['lock',        ['lock','safe','secure','private','password','key']],
  ['key',         ['key','unlock','access','password','credential','open']],
  ['map-pin',     ['location','place','where','address','spot','arrive','go']],
  ['compass',     ['direction','strategy','plan','vision','roadmap']],
  ['rocket',      ['launch','start','begin','kick off','ship','deploy']],
  ['folder',      ['folder','file','documents','archive','storage']],
  ['camera',      ['photo','picture','image','capture','snapshot']],
]

/** Return the best-matching icon name for a given title, or undefined */
export function guessIcon(title: string): string | undefined {
  const lower = title.toLowerCase()
  for (const [icon, keywords] of RULES) {
    if (keywords.some(kw => lower.includes(kw))) return icon
  }
  return undefined
}
