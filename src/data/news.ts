export type Topic =
  | 'Models'
  | 'Research'
  | 'Open Source'
  | 'Policy'
  | 'Industry'
  | 'Tools'

export interface Story {
  id: string
  title: string
  summary: string
  body: string
  topic: Topic
  source: string
  sourceUrl: string
  author: string
  publishedAt: string
  featured?: boolean
  readTime: number
  tags?: readonly string[]
  updatedAt?: string
}

export const TOPICS = Object.freeze([
  'Models',
  'Research',
  'Open Source',
  'Policy',
  'Industry',
  'Tools'
] as const)

const hoursAgo = (h: number) =>
  new Date(Date.now() - h * 60 * 60 * 1000).toISOString()

export const stories: Story[] = [
  {
    id: 'openai-o3-reasoning',
    title: 'OpenAI ships o3 with stepwise reasoning that outscores human experts on ARC-AGI',
    summary:
      'The long-awaited o3 system scores 87.5% on ARC-AGI under competition conditions, with a high-compute mode nearing 96%. OpenAI frames it as a step toward deliberate, tool-using agents rather than a raw scale win.',
    body: `OpenAI unveiled o3, a reasoning-first model family that spends variable compute at inference time to plan, check, and revise answers before responding.\n\nOn the ARC-AGI public evaluation, o3 hit 87.5% in the low-compute setting and approached 96% when allowed substantially more inference budget. That puts it past typical human baselines on a benchmark long treated as a stubborn measure of fluid intelligence.\n\nUnlike pure next-token models, o3 is trained to produce internal chains of thought and to use tools when they improve accuracy. OpenAI says the system is designed for scientific research, software engineering, and multi-step agent workflows rather than casual chat.\n\nAccess will roll out first to API safety partners and ChatGPT Pro, with broader tiers expected as capacity and cost come down. Safety evaluations focused on biological risk, cyber offense, and deceptive behavior under long-horizon planning.`,
    topic: 'Models',
    source: 'OpenAI',
    sourceUrl: 'https://openai.com',
    author: 'Research Desk',
    publishedAt: hoursAgo(3),
    featured: true,
    readTime: 6,
  },
  {
    id: 'anthropic-claude-4-sonnet',
    title: 'Anthropic launches Claude 4 Sonnet with computer use and stronger coding benchmarks',
    summary:
      'Claude 4 Sonnet leads several software engineering leaderboards while expanding desktop computer-use capabilities. Anthropic emphasizes hybrid reasoning modes that trade latency for depth.',
    body: `Anthropic released Claude 4 Sonnet, positioning it as a workhorse model for coding, analysis, and agentic desktop control.\n\nThe model posts competitive scores on SWE-bench Verified and internal multi-file refactor suites. Computer use—screen observation plus mouse and keyboard actions—moves from research preview to a supported product surface.\n\nA hybrid reasoning mode lets developers request short or extended internal deliberation depending on task difficulty. Anthropic says this cuts average latency on easy prompts while preserving depth for hard ones.\n\nEnterprise customers get improved artifacts, projects, and admin controls. Pricing remains aligned with prior Sonnet tiers, with higher rate limits for Team and Enterprise plans.`,
    topic: 'Models',
    source: 'Anthropic',
    sourceUrl: 'https://anthropic.com',
    author: 'Product Desk',
    publishedAt: hoursAgo(5),
    readTime: 5,
  },
  {
    id: 'deepseek-r1-open',
    title: 'DeepSeek R1 goes fully open-weight, matching frontier reasoning at a fraction of cost',
    summary:
      'Chinese lab DeepSeek open-sourced R1 under a permissive license. Independent evals show strong math and code performance with distillation recipes that fit mid-size GPUs.',
    body: `DeepSeek released R1 as open weights, alongside distilled variants that preserve much of the parent model’s reasoning quality at 7B–32B scales.\n\nCommunity evals on AIME, MATH, and LiveCodeBench put R1 near closed frontier systems while training and inference costs remain dramatically lower. The release includes training notes on reinforcement learning from verifiable rewards.\n\nResearchers are already fine-tuning R1 distillations for domain agents. Cloud providers raced to host endpoints within hours of the drop.\n\nThe move intensifies pressure on closed labs to justify proprietary barriers when open recipes approach parity on core reasoning tasks.`,
    topic: 'Open Source',
    source: 'DeepSeek',
    sourceUrl: 'https://github.com/deepseek-ai',
    author: 'Open Source Desk',
    publishedAt: hoursAgo(8),
    readTime: 4,
  },
  {
    id: 'meta-llama-4',
    title: 'Meta previews Llama 4 Scout and Maverick with native multimodality',
    summary:
      'Llama 4 introduces mixture-of-experts architectures and first-class image understanding. Meta pledges continued open release under an updated community license.',
    body: `Meta’s Llama 4 family arrives in two flavors: Scout for efficient multimodal work and Maverick for larger-context reasoning.\n\nBoth models use mixture-of-experts routing to keep active parameters low relative to total capacity. Native vision training replaces bolted-on adapters used in earlier Llama generations.\n\nContext windows stretch to multi-million tokens in flagship configs, aimed at codebase ingestion and long document agents. Meta says safety fine-tunes and system-level filters ship with the weights.\n\nEarly partners include cloud hyperscalers and device OEMs exploring on-device variants.`,
    topic: 'Models',
    source: 'Meta AI',
    sourceUrl: 'https://ai.meta.com',
    author: 'Models Desk',
    publishedAt: hoursAgo(11),
    readTime: 5,
  },
  {
    id: 'google-gemini-2-5',
    title: 'Google DeepMind ships Gemini 2.5 Pro with adaptive thinking budgets',
    summary:
      'Gemini 2.5 Pro exposes controllable thinking tokens and tops several multimodal leaderboards. Google integrates it across AI Studio, Vertex, and Android Gemini.',
    body: `Google DeepMind released Gemini 2.5 Pro with an explicit thinking budget developers can dial up or down per request.\n\nThe model leads on GPQA Diamond and several video understanding suites. Deep integration with Search grounding and Maps tools targets research and planning agents.\n\nVertex AI customers get batch APIs and context caching discounts. Consumer Gemini apps gain deeper Canvas-style collaboration features.\n\nGoogle frames adaptive thinking as a way to compete on quality without always paying peak inference cost.`,
    topic: 'Models',
    source: 'Google DeepMind',
    sourceUrl: 'https://deepmind.google',
    author: 'Industry Desk',
    publishedAt: hoursAgo(14),
    readTime: 4,
  },
  {
    id: 'mistral-small-3',
    title: 'Mistral Small 3.1 delivers Apache-2.0 weights competitive with GPT-4o mini',
    summary:
      'Paris-based Mistral continues its open-weight cadence with a 24B-class model tuned for low latency. Licensing stays fully permissive for commercial use.',
    body: `Mistral AI released Small 3.1 under Apache 2.0, emphasizing speed, multilingual quality, and function calling.\n\nIndependent latency tests show single-digit token times on a single H100 for short prompts. Coding and instruction following approach larger closed mini models.\n\nThe company also updated its Le Chat product with projects and web search. Enterprise on-prem deployments remain a core sales motion in Europe.\n\nOpen weights plus permissive licensing continue to differentiate Mistral against more restrictive community licenses.`,
    topic: 'Open Source',
    source: 'Mistral AI',
    sourceUrl: 'https://mistral.ai',
    author: 'Open Source Desk',
    publishedAt: hoursAgo(18),
    readTime: 3,
  },
  {
    id: 'eu-ai-act-gpa',
    title: 'EU AI Act codes of practice for general-purpose models enter enforcement window',
    summary:
      'Providers of systemic GPAI models face transparency, copyright, and risk reporting duties. Brussels published final codes after months of industry negotiation.',
    body: `The European Commission confirmed that codes of practice for general-purpose AI models now guide enforcement under the AI Act.\n\nObligations cover training data summaries, copyright compliance policies, energy disclosures, and systemic risk assessments for the largest models.\n\nUS and Chinese labs with EU users must appoint representatives and document evaluation procedures. Fines can reach a percentage of global turnover for serious non-compliance.\n\nIndustry groups welcomed clearer templates but warned that watermarking and data provenance requirements remain technically immature.`,
    topic: 'Policy',
    source: 'European Commission',
    sourceUrl: 'https://digital-strategy.ec.europa.eu',
    author: 'Policy Desk',
    publishedAt: hoursAgo(20),
    readTime: 5,
  },
  {
    id: 'nvidia-blackwell-ultra',
    title: 'NVIDIA unveils Blackwell Ultra racks aimed at multi-trillion parameter training',
    summary:
      'New GB300-class systems promise major jumps in FP4 throughput and NVLink domain size. Cloud providers line up 2026 capacity reservations.',
    body: `NVIDIA detailed Blackwell Ultra configurations that scale NVLink domains and raise dense FP4 performance for mixture-of-experts training.\n\nLiquid-cooled racks target hyperscalers building clusters beyond 100,000 GPUs. Software updates to CUDA, NCCL, and Megatron-LM accompany the silicon.\n\nMicrosoft, Google, Amazon, and Oracle announced multi-year purchase frameworks. Power delivery and data center siting remain the binding constraints, not chip supply alone.\n\nNVIDIA also expanded NIM microservices for enterprise inference of popular open models.`,
    topic: 'Industry',
    source: 'NVIDIA',
    sourceUrl: 'https://nvidia.com',
    author: 'Industry Desk',
    publishedAt: hoursAgo(22),
    readTime: 4,
  },
  {
    id: 'xai-grok-3',
    title: 'xAI’s Grok 3 emphasizes real-time search and large-scale pretraining on Colossus',
    summary:
      'Trained on the Memphis supercluster, Grok 3 targets frontier chat and agent use cases inside X and the xAI API.',
    body: `xAI released Grok 3 after training runs on its Colossus cluster, claiming competitive results on math, coding, and general knowledge.\n\nDeepSearch-style modes pull live web and X data into answers. Voice and image understanding expand the consumer Grok app.\n\nAPI pricing undercuts several peers for high-volume chat workloads. xAI says subsequent Grok versions will focus on tool use and long-horizon agents.\n\nThe release keeps pressure on a crowded frontier market where differentiation increasingly comes from product surfaces, not raw benchmark deltas alone.`,
    topic: 'Models',
    source: 'xAI',
    sourceUrl: 'https://x.ai',
    author: 'Models Desk',
    publishedAt: hoursAgo(26),
    readTime: 4,
  },
  {
    id: 'stanford-helm-update',
    title: 'Stanford HELM expands multilingual and agentic evaluation suites',
    summary:
      'The Center for Research on Foundation Models overhauled HELM with scenario packs for tool use, long context, and low-resource languages.',
    body: `Stanford CRFM updated HELM to better reflect how models are used in production agent stacks.\n\nNew scenarios cover multi-step tool calling, document-grounded QA over 100k+ tokens, and evaluation in 20+ languages beyond English-centric suites.\n\nLeaderboards now surface cost-normalized scores so smaller efficient models can be compared fairly against larger ones.\n\nAcademic and industry labs can submit runs via a standardized harness, improving reproducibility of public claims.`,
    topic: 'Research',
    source: 'Stanford CRFM',
    sourceUrl: 'https://crfm.stanford.edu',
    author: 'Research Desk',
    publishedAt: hoursAgo(30),
    readTime: 4,
  },
  {
    id: 'hf-smolagents',
    title: 'Hugging Face open-sources smolagents for minimal multi-step tool loops',
    summary:
      'A lightweight Python library shows strong agent results with surprisingly small models when the scaffold is right.',
    body: `Hugging Face released smolagents, a minimal framework for code-writing agents that call tools in a tight loop.\n\nBenchmarks suggest that scaffolding quality often matters more than raw model size for many enterprise workflows. The library ships with secure local code execution options.\n\nExamples include research assistants, data cleaning bots, and browser controllers. Integration with the Hub model catalog is first-class.\n\nThe project continues HF’s push to commoditize agent plumbing rather than only model hosting.`,
    topic: 'Tools',
    source: 'Hugging Face',
    sourceUrl: 'https://huggingface.co',
    author: 'Tools Desk',
    publishedAt: hoursAgo(34),
    readTime: 3,
  },
  {
    id: 'openai-operator',
    title: 'OpenAI Operator agents start booking and shopping in limited preview',
    summary:
      'Computer-use agents move from demos to constrained consumer tasks. Safety layers require confirmation on payments and account changes.',
    body: `OpenAI’s Operator product enters limited preview, letting agents navigate websites to complete errands like reservations and product research.\n\nUsers supervise via a remote browser view and must approve sensitive actions. OpenAI reports lower error rates after training on synthetic trajectories and human feedback.\n\nPartners include travel and retail sites that expose clearer DOM semantics. Critics worry about credential handling and dark-pattern exploitation.\n\nThe preview is US-only for Pro subscribers initially.`,
    topic: 'Tools',
    source: 'OpenAI',
    sourceUrl: 'https://openai.com',
    author: 'Tools Desk',
    publishedAt: hoursAgo(38),
    readTime: 4,
  },
  {
    id: 'microsoft-phi-4',
    title: 'Microsoft Phi-4-reasoning proves small models can punch up with targeted RL',
    summary:
      'New Phi variants focus on math and scientific reasoning while staying deployable on a single consumer GPU.',
    body: `Microsoft Research released Phi-4 reasoning-oriented checkpoints that rival much larger models on contest math after reinforcement learning on verified solutions.\n\nThe models target edge and copilot scenarios where latency and cost dominate. Azure AI Foundry hosts managed endpoints; weights are available for local use under Microsoft’s license.\n\nPhi continues to influence the industry narrative that data quality and post-training can substitute for pure parameter count.\n\nDevelopers report strong results when Phi is used as a specialist inside multi-model router systems.`,
    topic: 'Research',
    source: 'Microsoft Research',
    sourceUrl: 'https://www.microsoft.com/research',
    author: 'Research Desk',
    publishedAt: hoursAgo(42),
    readTime: 4,
  },
  {
    id: 'us-export-controls',
    title: 'US expands chip export controls with new diffusion rules for closed-weight models',
    summary:
      'Updated rules tighten GPU shipments and introduce reporting for large closed model weights. Allies coordinate licensing regimes.',
    body: `The US Commerce Department issued revised export controls covering advanced AI accelerators and certain closed-weight model releases.\n\nCompanies must report training runs above defined compute thresholds and restrict weight transfers to listed entities. Allied countries are aligning license exceptions.\n\nIndustry counsel say compliance costs will rise for multinational labs with mixed open/closed portfolios. Open-weight releases below thresholds remain largely unrestricted.\n\nThe policy aims to slow military-relevant AI diffusion without freezing commercial innovation—a balance critics on both sides dispute.`,
    topic: 'Policy',
    source: 'US Commerce',
    sourceUrl: 'https://www.bis.gov',
    author: 'Policy Desk',
    publishedAt: hoursAgo(48),
    readTime: 5,
  },
  {
    id: 'cursor-agent',
    title: 'Cursor ships multi-file agent mode that plans, edits, and runs tests in-loop',
    summary:
      'The AI code editor’s agent can open terminals, fix failing tests, and propose multi-file diffs with human checkpoints.',
    body: `Anysphere’s Cursor editor launched an agent mode that plans tasks, edits across a repository, and executes tests until green or blocked.\n\nDevelopers set budgets for steps and tool calls. Diffs remain reviewable before apply. Support for custom model endpoints continues.\n\nEarly users report big gains on mechanical refactors and flaky test hunts, with weaker results on ambiguous product design work.\n\nThe release intensifies competition among AI-native IDEs and plugin ecosystems.`,
    topic: 'Tools',
    source: 'Cursor',
    sourceUrl: 'https://cursor.com',
    author: 'Tools Desk',
    publishedAt: hoursAgo(52),
    readTime: 3,
  },
  {
    id: 'stability-sv4d',
    title: 'Stability AI open-sources SV4D 2.0 for multi-view video generation',
    summary:
      'The new model generates consistent multi-camera video from a single clip, aimed at VFX and 3D pipelines.',
    body: `Stability AI released SV4D 2.0 weights and inference code for multi-view video synthesis.\n\nGiven one video, the model hallucinates additional camera angles with improved temporal consistency over prior versions. Downstream tools convert outputs into rough NeRF or Gaussian splat assets.\n\nLicensing targets research and commercial creative studios. GPU memory requirements remain high but fit dual-24GB setups with tiling.\n\nOpen video models continue to close the gap on closed cinematic systems for specific production tasks.`,
    topic: 'Open Source',
    source: 'Stability AI',
    sourceUrl: 'https://stability.ai',
    author: 'Open Source Desk',
    publishedAt: hoursAgo(56),
    readTime: 3,
  },
  {
    id: 'apple-apple-intelligence',
    title: 'Apple Intelligence expands EU rollout after DMA negotiations',
    summary:
      'On-device and Private Cloud Compute features reach more iOS markets. Apple details third-party model hooks for Siri.',
    body: `Apple began a wider EU launch of Apple Intelligence features after addressing Digital Markets Act concerns.\n\nWriting tools, notification summaries, and visual intelligence land first; deeper Siri agent features follow. Private Cloud Compute transparency reports expand.\n\nDevelopers get App Intents hooks so Siri can invoke third-party actions with user permission. Apple still limits full system-wide alternatives to its stack.\n\nThe staggered launch shows how platform AI is increasingly shaped by regional regulation.`,
    topic: 'Industry',
    source: 'Apple',
    sourceUrl: 'https://apple.com',
    author: 'Industry Desk',
    publishedAt: hoursAgo(60),
    readTime: 4,
  },
  {
    id: 'berkeley-r1-distill',
    title: 'Berkeley researchers map how reasoning distills from huge RL models into tiny students',
    summary:
      'A new paper quantifies which chain-of-thought patterns transfer when distilling R1-class teachers into 1–8B students.',
    body: `UC Berkeley researchers published a study on reasoning distillation, measuring which supervision signals preserve multi-step accuracy.\n\nKey findings: process rewards and verified final answers both help, but diversity of intermediate strategies matters more than length alone. Over-pruned traces hurt out-of-domain transfer.\n\nThe work includes open datasets of filtered traces and student checkpoints. Labs using distillation for edge deployment are already adopting the recipes.\n\nThe paper reframes small-model gains as curriculum design problems rather than pure compression.`,
    topic: 'Research',
    source: 'UC Berkeley',
    sourceUrl: 'https://arxiv.org',
    author: 'Research Desk',
    publishedAt: hoursAgo(64),
    readTime: 5,
  },
  {
    id: 'cohere-command-a',
    title: 'Cohere Command A targets enterprise RAG with 111B efficient MoE',
    summary:
      'Optimized for retrieval-augmented generation and multilingual business workflows, Command A emphasizes citation fidelity.',
    body: `Cohere launched Command A, a mixture-of-experts model tuned for grounded enterprise generation.\n\nBenchmarks focus on citation correctness, refusal quality, and tool use rather than pure chat eloquence. North and multilingual retrieval packs ship with the API.\n\nPrivate deployment options on customer VPC remain a differentiator for regulated industries. Pricing is competitive for high-volume support and knowledge assistants.\n\nCohere continues to court enterprises wary of sending data to consumer-oriented frontier labs.`,
    topic: 'Industry',
    source: 'Cohere',
    sourceUrl: 'https://cohere.com',
    author: 'Industry Desk',
    publishedAt: hoursAgo(70),
    readTime: 3,
  },
  {
    id: 'uk-aisi-testing',
    title: 'UK AI Safety Institute publishes cross-lab pre-deployment testing protocol',
    summary:
      'Shared eval templates cover cyber, bio, and autonomy risks. Multiple frontier labs agree to pilot participation.',
    body: `The UK AI Safety Institute released a protocol for pre-deployment testing of highly capable models.\n\nScenarios include autonomous cyber intrusion attempts, biological knowledge uplift, and deception under pressure. Labs can run private tests with optional third-party observers.\n\nResults remain confidential by default, with aggregate public reporting. Civil society groups want stronger disclosure mandates.\n\nThe protocol is designed to interoperate with US and EU reporting regimes where possible.`,
    topic: 'Policy',
    source: 'UK AISI',
    sourceUrl: 'https://www.aisi.gov.uk',
    author: 'Policy Desk',
    publishedAt: hoursAgo(74),
    readTime: 4,
  },
  {
    id: 'langchain-langgraph',
    title: 'LangGraph 1.0 stabilizes durable agent workflows with time-travel debugging',
    summary:
      'Production agent graphs get checkpointing, human-in-the-loop interrupts, and replay tooling as first-class features.',
    body: `LangChain’s LangGraph hit 1.0 with APIs for durable execution of multi-actor agent graphs.\n\nCheckpoints allow recovery after failures and “time travel” to prior states when debugging bad tool calls. Human approval nodes pause execution until review.\n\nCloud SaaS and self-hosted options support streaming UIs. The ecosystem of prebuilt graph templates continues to grow.\n\nStability promises matter for enterprises that stalled on pre-1.0 breaking changes.`,
    topic: 'Tools',
    source: 'LangChain',
    sourceUrl: 'https://langchain.com',
    author: 'Tools Desk',
    publishedAt: hoursAgo(80),
    readTime: 3,
  },
  {
    id: 'amazon-nova',
    title: 'Amazon Nova models deepen Bedrock integration with multimodal fine-tuning',
    summary:
      'Nova Pro and Lite add cheaper document and image understanding paths for AWS customers.',
    body: `AWS expanded Amazon Nova model capabilities inside Bedrock, including multimodal fine-tuning and tighter IAM controls.\n\nNova aims at cost-sensitive production workloads that previously defaulted to external APIs. Cross-region inference profiles improve availability.\n\nMarketplace partners publish agents that call Nova plus enterprise data connectors. AWS continues bundling credits to win migrations.\n\nThe battle for default enterprise model share remains fierce among cloud providers.`,
    topic: 'Industry',
    source: 'Amazon Web Services',
    sourceUrl: 'https://aws.amazon.com',
    author: 'Industry Desk',
    publishedAt: hoursAgo(86),
    readTime: 3,
  },
  {
    id: 'eleuther-pythia-repro',
    title: 'EleutherAI releases full training logs for a reproducible 7B run',
    summary:
      'Transparent checkpoints, loss curves, and data mixes give academics a rare end-to-end artifact for LLM science.',
    body: `EleutherAI published a fully documented 7B training run including intermediate checkpoints and exact data ordering.\n\nThe goal is scientific reproducibility rather than chasing leaderboard SOTA. Researchers can study loss spikes, batch effects, and tokenizer artifacts with shared artifacts.\n\nCompute sponsors underwrote the run on public cloud. Companion blogs walk through anomalies observed mid-training.\n\nOpen science efforts like this remain scarce as commercial secrecy increases.`,
    topic: 'Research',
    source: 'EleutherAI',
    sourceUrl: 'https://eleuther.ai',
    author: 'Research Desk',
    publishedAt: hoursAgo(92),
    readTime: 4,
  },
  {
    id: 'github-copilot-workspace',
    title: 'GitHub Copilot Workspace generalizes issue-to-PR agents for all public repos',
    summary:
      'From issue statement to draft pull request, Copilot Workspace automates planning and coding with human merge control.',
    body: `GitHub opened Copilot Workspace beyond preview, letting developers assign issues to an agent that proposes plans and PRs.\n\nThe agent reads repository structure, runs tests in Codespaces, and iterates on CI failures. Enterprise policies can require human approval gates.\n\nPricing folds into Copilot Enterprise seats. Early data shows higher acceptance on docs and tests than on core business logic.\n\nGitHub bets that staying inside the existing git workflow beats standalone agent products.`,
    topic: 'Tools',
    source: 'GitHub',
    sourceUrl: 'https://github.com',
    author: 'Tools Desk',
    publishedAt: hoursAgo(98),
    readTime: 3,
  },
  {
    id: 'china-model-registry',
    title: 'China’s interim generative AI registry passes 300 approved models',
    summary:
      'Domestic filings accelerate as regulators standardize safety assessments for public-facing chatbots.',
    body: `Chinese regulators reported more than 300 generative AI models cleared for public release under interim rules.\n\nFilings require security assessments, content filters, and identifiable watermarks for synthetic media in many categories. Local governments compete to host AI industrial parks.\n\nExport-oriented labs navigate both domestic filings and foreign compute restrictions. Open-weight culture remains strong among Chinese researchers.\n\nThe registry is becoming a de facto map of China’s commercial model landscape.`,
    topic: 'Policy',
    source: 'CAC',
    sourceUrl: 'https://www.cac.gov.cn',
    author: 'Policy Desk',
    publishedAt: hoursAgo(104),
    readTime: 4,
  },
  {
    id: 'vllm-v1',
    title: 'vLLM V1 engine rewrites scheduler for higher throughput on MoE models',
    summary:
      'The popular open inference stack gains a new execution engine with better prefix caching and expert parallelism.',
    body: `The vLLM project launched its V1 engine, redesigning the scheduler and memory manager for modern MoE and long-context workloads.\n\nThroughput gains of 1.5–2× appear on several 100B-class MoE models in community benchmarks. Prefix caching APIs stabilize for multi-turn apps.\n\nHardware backends expand across NVIDIA, AMD, and emerging accelerators. The project remains Apache-2.0 and community governed.\n\nProduction users should re-tune continuous batching parameters when upgrading.`,
    topic: 'Open Source',
    source: 'vLLM',
    sourceUrl: 'https://github.com/vllm-project/vllm',
    author: 'Open Source Desk',
    publishedAt: hoursAgo(110),
    readTime: 3,
  },
  {
    id: 'scale-seal',
    title: 'Scale AI launches SEAL leaderboards with private held-out evals',
    summary:
      'Contamination-resistant benchmarks aim to restore trust as public test sets leak into training corpora.',
    body: `Scale AI introduced SEAL, a suite of private evaluations for frontier models with rotating held-out sets.\n\nLabs submit APIs for blinded scoring on reasoning, coding, and domain expertise. Public leaderboards show ranks without releasing raw items.\n\nCritics note potential conflicts when Scale also sells data to the same labs. Scale says firewalls separate eval and data businesses.\n\nPrivate evals are becoming table stakes as open benchmarks saturate.`,
    topic: 'Research',
    source: 'Scale AI',
    sourceUrl: 'https://scale.com',
    author: 'Research Desk',
    publishedAt: hoursAgo(118),
    readTime: 3,
  },
  {
    id: 'perplexity-shopping',
    title: 'Perplexity expands agentic shopping with merchant checkout partnerships',
    summary:
      'Answer engine users can research and buy without leaving the chat. Publishers debate traffic and attribution impacts.',
    body: `Perplexity rolled out deeper shopping agents that compare products, apply coupons, and complete checkout via partner merchants.\n\nThe company argues users want outcomes, not blue links. Retailers gain high-intent traffic with affiliate-style economics.\n\nPublishers and Google watch carefully as more queries never hit traditional SERPs. Regulators may scrutinize ranking transparency.\n\nAgentic commerce is quickly becoming a major battleground for consumer AI apps.`,
    topic: 'Industry',
    source: 'Perplexity',
    sourceUrl: 'https://perplexity.ai',
    author: 'Industry Desk',
    publishedAt: hoursAgo(126),
    readTime: 3,
  },
  {
    id: 'openai-deep-research',
    title: 'ChatGPT Deep Research mode produces multi-page briefs with citations',
    summary:
      'A specialized agent browses, reads, and synthesizes sources for complex knowledge work in tens of minutes.',
    body: `OpenAI added Deep Research to ChatGPT, spinning up a long-running agent that gathers sources and writes structured reports.\n\nUsers specify goals and constraints; the agent returns a brief with inline citations and a trail of visited pages. Pro subscribers get higher monthly caps.\n\nKnowledge workers report strong first drafts for market scans and literature reviews, with lingering hallucination risk on niche claims.\n\nThe feature blurs lines between search, analyst tools, and document copilots.`,
    topic: 'Tools',
    source: 'OpenAI',
    sourceUrl: 'https://openai.com',
    author: 'Tools Desk',
    publishedAt: hoursAgo(134),
    readTime: 4,
  },
  {
    id: 'databricks-dbrx',
    title: 'Databricks updates DBRX MoE stack for private enterprise fine-tunes',
    summary:
      'Mosaic AI tooling adds evaluation harnesses and governance for regulated fine-tunes on customer data.',
    body: `Databricks refreshed its DBRX and Mosaic AI offerings with stronger evaluation and lineage tracking for enterprise fine-tunes.\n\nCustomers can run preference optimization on proprietary data without exporting it. Unity Catalog governs datasets and resulting adapters.\n\nThe pitch: keep frontier-quality assistants inside the lakehouse security boundary. Partnerships cover NVIDIA inference microservices.\n\nDatabricks competes with hyperscaler AI platforms on governance rather than raw model novelty.`,
    topic: 'Industry',
    source: 'Databricks',
    sourceUrl: 'https://databricks.com',
    author: 'Industry Desk',
    publishedAt: hoursAgo(142),
    readTime: 3,
  },
]

export function getStoryById(id: string): Story | undefined {
  return stories.find((s) => s.id === id)
}

export function getFeaturedStory(): Story {
  return stories.find((s) => s.featured) ?? stories[0]
}

export function filterStories(opts: {
  topic?: Topic | 'All'
  query?: string
  bookmarkedOnly?: boolean
  bookmarkIds?: string[]
  /** Story collection to filter. Defaults to the seeded archive. */
  stories?: readonly Story[]
}): readonly Story[] {
  const q = opts.query?.trim().toLowerCase() ?? ''
  const source = opts.stories ?? stories
  return source.filter((s) => {
    if (opts.topic && opts.topic !== 'All' && s.topic !== opts.topic) return false
    if (opts.bookmarkedOnly && opts.bookmarkIds && !opts.bookmarkIds.includes(s.id))
      return false
    if (!q) return true
    const hay = `${s.title} ${s.summary} ${s.source} ${s.topic} ${s.author}`.toLowerCase()
    return hay.includes(q)
  }) as readonly Story[]
}
