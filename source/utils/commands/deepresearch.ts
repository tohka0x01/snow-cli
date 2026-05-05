import {
	registerCommand,
	type CommandResult,
} from '../execution/commandExecutor.js';
import {getCurrentLanguage} from '../config/languageConfig.js';
import {translations} from '../../i18n/index.js';

// Maximum length of the original user prompt to show under the command
// message tree node (` └─ <prompt>`). Longer text gets truncated with an
// ellipsis. Keep this conservative so the chat row stays single-line on
// most terminals.
const PROMPT_PREVIEW_MAX = 120;

function truncatePrompt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= PROMPT_PREVIEW_MAX) return flat;
	return flat.slice(0, PROMPT_PREVIEW_MAX - 1).trimEnd() + '\u2026';
}

// Deep Research command handler - runs an autonomous multi-step web research workflow
// and writes a final markdown report into .snow/deepresearch/<task-name>.md
registerCommand('deepresearch', {
	execute: (args?: string): CommandResult => {
		const topic = args?.trim();
		if (!topic) {
			const lang = getCurrentLanguage();
			const usage =
				translations[lang]?.commandPanel?.commandOutput?.deepResearch?.usage ||
				'Usage: /deepresearch <prompt>\nExample: /deepresearch Compare the architectures of OpenAI Deep Research and Gemini Deep Research';
			return {
				success: false,
				message: usage,
			};
		}

		const prompt = `You are operating in **Deep Research Mode**. Conduct a thorough, multi-step web research investigation on the user's request and produce a structured, well-cited markdown report.

## User's Research Request
${topic}

## Workflow: Clarify -> Plan -> Search Loop -> Synthesize -> Report

### Step 1: Intent Clarification (only if ambiguous)
If the request is **clearly scoped** (specific topic, audience, depth), skip clarification and proceed directly to Step 2.

If any of the following are unclear, you **MUST** call \`askuser-ask_question\` exactly once to disambiguate:
- The research goal is too broad or has multiple plausible interpretations
- The target audience / depth (overview vs. deep technical) is unspecified and matters
- A critical constraint (time range, language, region, source type) is missing

Ask **at most one** focused question with concrete options. Do not over-clarify - if reasonable defaults exist, use them and document the assumption in the final report.

### Step 2: Research Plan
Before searching, internally plan:
- **Decompose** the request into 3-6 concrete sub-questions
- For each sub-question, draft 1-2 candidate search queries (in the most appropriate language for the topic)
- Identify which sub-questions are independent (can be researched in parallel) vs. sequential

Use \`todo-manage\` (action: add) to track each sub-question as a TODO item. Update each TODO immediately as you finish that sub-question.

### Step 3: Iterative Search Loop
For each sub-question, run this loop:

1. **Search** with \`websearch-search\` using the planned query (start with 8-12 results)
2. **Evaluate** the result list: pick 1-2 most credible, relevant URLs (prefer official docs, primary sources, reputable publications). Skip low-quality / SEO-spam results.
3. **Fetch** the chosen page(s) with \`websearch-fetch\` (set \`isUserProvided: false\` and pass the user's original question as \`userQuery\` for AI compression)
4. **Extract & Record** the key facts, quotes, and the source URL into your working memory
5. **Cross-validate** important claims with at least one additional independent source when the topic is contested or fact-sensitive
6. **Adapt** - if the results are weak/irrelevant, rewrite the query (different angle, different keywords, different language) and search again. Aim for **2-4 search iterations per sub-question** before moving on.

**Search budget**: Total 8-20 search calls and 6-15 page fetches across the whole research. Stop when each sub-question has at least one strong, cited answer.

### Step 4: Synthesis & Report
After research is complete:

1. Aggregate findings by sub-question, then merge overlapping facts.
2. Build a narrative outline (chronological, thematic, or comparison-based - pick what fits the topic).
3. Write the report in the **same language as the user's original request** (${topic}).
4. Every non-trivial claim **MUST** carry an inline citation in the form \`[1]\`, \`[2]\`, ... linked to the References section.

### Step 5: Save the Report
- **Output path**: \`.snow/deepresearch/[task-slug].md\` in the project root (use \`process.cwd()\`).
- Generate \`task-slug\` from the topic: lowercase, alphanumeric + hyphens, max 60 chars. Append a short timestamp suffix \`-YYYYMMDD-HHmm\` to avoid collisions.
- Use \`filesystem-create\` to write the file. If the directory \`.snow/deepresearch/\` does not exist, the create tool will auto-create parents.

## Report Markdown Template

\`\`\`markdown
# [Report Title]

> Research request: [original user prompt, verbatim]
> Generated: [ISO timestamp]
> Sub-questions investigated: [N]

## TL;DR
[3-6 bullet points capturing the most important conclusions, each with inline citations]

## Background & Scope
[1-2 paragraphs: why this matters, what is and isn't covered, key assumptions / clarifications adopted]

## Findings

### [Sub-question 1 / Theme 1]
[Synthesized answer with inline citations [1][2]. Include concrete facts, numbers, quotes where useful. Avoid filler.]

### [Sub-question 2 / Theme 2]
...

### [Sub-question N / Theme N]
...

## Comparison / Analysis (optional, when comparing options)
| Dimension | Option A | Option B | Source |
|-----------|----------|----------|--------|
| ...       | ...      | ...      | [3]    |

## Open Questions & Limitations
- [What remains uncertain]
- [Sources that conflicted and how the conflict was handled]
- [Topics that would need deeper / paywalled research]

## References
[1] [Page Title] - https://example.com/article-1
[2] [Page Title] - https://example.com/article-2
...
\`\`\`

## Final Step: Confirm Completion
After saving the file, reply with a concise confirmation that includes:
- The exact saved file path (\`.snow/deepresearch/...\`)
- A 2-3 sentence executive summary of the conclusions
- The number of sources cited

## Hard Rules
1. **Always cite** - every factual claim has a numbered citation pointing to a real fetched URL. Never invent sources.
2. **No hallucination** - if you cannot verify a fact through search, mark it explicitly as "unconfirmed" or omit it.
3. **Report language must match the user's request language** - detect from the user prompt above.
4. **One clarification at most** via \`askuser-ask_question\`, only when truly necessary.
5. **Track progress with TODO** and update items immediately as each sub-question is finished.
6. **Save to \`.snow/deepresearch/\`** - this is the only valid output location.

Begin now. Plan the sub-questions, then execute the search loop.`;

		return {
			success: true,
			action: 'deepResearch',
			// Pass the truncated user prompt back as `message` so the UI layer can
			// render it under the command tree node without exposing the long
			// internal AI prompt.
			message: truncatePrompt(topic),
			prompt,
		};
	},
});

export default {};
