/** Seeded demo roster. Platform names are used descriptively; no logos. */
export const SIM_ROSTER: { id: string; name: string; platform: string }[] = [
  ['chief', 'Chief of Staff', 'grokbot'], ['planner', 'Planner', 'openai'], ['coder', 'Coder', 'claude'],
  ['claw-scout', 'Scout', 'openclaw'], ['muse-writer', 'Story Muse', 'muse'], ['router', 'Router', 'grokbot'],
  ['researcher', 'Researcher', 'langchain'], ['crew-lead', 'Crew Lead', 'crewai'], ['inbox-flow', 'Inbox Flow', 'n8n'],
  ['support', 'Support GPT', 'openai'], ['reviewer', 'Reviewer', 'claude'], ['claw-ops', 'Ops Claw', 'openclaw'],
  ['analyst', 'Analyst', 'crewai'], ['sales', 'Sales Agent', 'openai'], ['growth', 'Growth', 'grokbot'],
  ['designer', 'Muse Design', 'muse'], ['rag', 'RAG Index', 'langchain'], ['crm-sync', 'CRM Sync', 'n8n'],
  ['vision', 'Vision', 'gemini'], ['qa', 'QA Bot', 'claude'], ['claw-dev', 'Dev Claw', 'openclaw'],
  ['finance', 'Finance', 'openai'], ['seo', 'SEO Crew', 'crewai'], ['home', 'Home Bot', 'custom'],
  ['social', 'Social', 'grokbot'], ['docs', 'Docs MCP', 'claude'], ['billing-flow', 'Billing Flow', 'n8n'],
].map(([id, name, platform]) => ({ id, name, platform }));

const TASKS: Record<string, string[]> = {
  openai: ['Drafting the weekly report', 'Answering 14 support tickets', 'Planning the Q4 launch', 'Pricing the new tier'],
  grokbot: ['Routing a request to Coder', 'Morning brief ready', 'Watching X for mentions', 'Booking the team dinner'],
  claude: ['Refactoring the auth module', 'Reviewing PR #482', 'Writing integration tests', 'Reading the spec via MCP'],
  openclaw: ['Scraping competitor pricing', 'Running the nightly job', 'Fixing a flaky deploy', 'Shipping v0.9 to staging'],
  muse: ['Writing a launch thread', 'Generating hero images', 'Naming the new feature', 'Storyboarding the demo'],
  langchain: ['Indexing 3,200 documents', 'Answering from the knowledge base', 'Summarizing 40 calls'],
  crewai: ['Crew: market research', 'Crew: content calendar', 'Crew: lead scoring'],
  n8n: ['Syncing 120 leads to CRM', 'Processing invoices', 'Triaging the inbox'],
  gemini: ['Reading receipts from photos', 'Transcribing the standup'],
  custom: ['Turning off the lights', 'Monitoring the server'],
};
export const simTask = (p: string) => { const l = TASKS[p] ?? TASKS.custom; return l[Math.floor(Math.random() * l.length)]; };
