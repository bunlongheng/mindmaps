export const DICE_ICONS = ['user','bot','server','database','zap','plug','git-branch','globe','brain','settings','folder','cloud','mail','lock','key','search','star','rocket','lightbulb','flame','check-circle','map-pin','trophy','message','phone','wrench','chart','eye','shield','flask','sparkles','smile','home','building','briefcase','clock','calendar','code','terminal','package','layers','bell','target','compass','map']

export const DICE_WORDS: Record<string, string[]> = {
  user:['Alice','Bob','Carol','Dave','Grace','Hank'],bot:['ChatBot','AutoAgent','AI Helper','Smart Bot','Copilot','NLP Engine'],
  server:['API Server','Web Server','Auth Service','Worker Node','Gateway','Edge Node'],database:['Postgres DB','Redis Cache','Data Lake','MongoDB','Firestore','Analytics DB'],
  zap:['Trigger','Event Hook','Webhook','Automation','Pipeline','Quick Action'],plug:['Plugin','Extension','Connector','Integration','Bridge','Add-on'],
  'git-branch':['Feature Branch','Release v2','Hotfix','Dev Branch','Canary','Main'],globe:['Public API','Web App','Global CDN','DNS Zone','Edge Network','Proxy'],
  brain:['ML Model','Neural Net','AI Core','Decision Engine','Classifier','LLM'],settings:['Config','Admin Panel','Control Center','Preferences','Feature Flags','Env'],
  folder:['Assets','Resources','Archive','Media','Documents','Uploads'],cloud:['AWS S3','Cloud Storage','GCP Bucket','Blob Store','Object Store','R2'],
  mail:['Email Service','SMTP','Newsletter','Notification','Inbox','Digest'],lock:['Auth Layer','Security Gate','SSO','Firewall','2FA','RBAC'],
  key:['API Key','Secret Token','OAuth','JWT Auth','Credentials','PAT'],search:['Search Index','Elastic','Full-Text','Query Engine','Discovery','Algolia'],
  star:['Featured','Top Pick','Best Seller','Highlighted','Premium','Editor Pick'],rocket:['Launch Plan','Go-Live','Deploy v1','MVP Sprint','Release Day','Ship It'],
  lightbulb:['Idea Hub','Innovation','Brainstorm','Prototype','Concept','Experiment'],flame:['Hot Feature','Trending','Viral Loop','Growth Hack','Momentum','FOMO'],
  'check-circle':['Done','Complete','Verified','Shipped','Approved','Signed Off'],'map-pin':['HQ','Office','Region','Location','Branch','Datacenter'],
  trophy:['Top Goal','KPI Win','Milestone','Achievement','Record','OKR Hit'],message:['Support Chat','Feedback','Comments','Discussion','Slack Thread','Forum'],
  phone:['Mobile App','iOS App','Android','Push Notify','SMS','WhatsApp'],wrench:['Maintenance','Fix Mode','Debug','Patch','Repair','Refactor'],
  chart:['Analytics','Metrics','Dashboard','Reports','KPIs','Funnels'],eye:['Monitoring','Observability','Alerting','Logs','Traces','Sentry'],
  shield:['Security','Protection','WAF','Rate Limit','Guard','Compliance'],flask:['Lab Env','Experiment','A/B Test','Beta','Sandbox','Staging'],
  sparkles:['Magic Feature','AI Polish','Premium UX','Delight','Wow Factor','Easter Egg'],smile:['User Delight','Happy Path','NPS +10','Customer Joy','Onboarding','Flow'],
  home:['Home Page','Landing','Dashboard','Overview','Portal','Hub'],building:['Enterprise','Org Unit','HQ','Department','Division','Tenant'],
  briefcase:['Project','Client Work','Contract','Engagement','Mandate','Proposal'],clock:['Scheduler','Cron Job','Timer','Reminder','Deadline','SLA'],
  calendar:['Sprint Plan','Release Date','Roadmap','Q2 Plan','Milestone','Kickoff'],code:['Feature Code','Module','Library','Component','Hook','Utility'],
  terminal:['CLI Tool','Shell Script','Dev Env','Console','Bash','Makefile'],package:['npm Package','SDK','Library','Dependency','Bundle','Release'],
  layers:['Stack','Layer','Tier','Platform','Infrastructure','Monolith'],bell:['Notification','Alert','Reminder','Push','Ping','Pager'],
  target:['OKR','Goal','KPI','North Star','Target Metric','Outcome'],compass:['Direction','Strategy','Vision','North Star','Roadmap','Charter'],
  map:['Journey Map','Architecture','Sitemap','Flow','Diagram','Canvas'],
}

export const ROOT_TOPICS = [
  'Velocity','Clarity','Vision','Scale','Launch',
  'Security','Growth','Data','Platform','Strategy',
  'Design','Resilience','Automation','Culture','Impact',
  'Discovery','Delivery','Metrics','Identity','Ecosystem',
]

export function pickRandom<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)] }
