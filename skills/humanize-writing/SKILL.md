---
name: humanize-writing
description: Edit long-form and web writing so it reads like a person wrote it — cut AI tells (filler openers, uniform rhythm, flagged vocabulary, em-dash overuse, listicle bloat) and raise real quality through specificity and varied sentence rhythm. Use when polishing blog posts, newsletters, docs, landing-page copy, or any prose that will be published on the web. English/general companion to humanize-korean.
origin: harness
workloads: [writing]
---

# Humanize Writing

Make published prose sound like a specific human, not a generic model. This is the English/general counterpart to `humanize-korean`.

## Core Principle (read this first)

**Optimize for genuine quality, not for beating AI detectors.** Detectors measure *perplexity* (how predictable word choice is) and *burstiness* (how much sentence length varies); LLM prose scores low on both. But strong academic and technical prose *also* scores low, so "detector-gaming" can degrade good writing. Fix the underlying tells and the detector score follows — never the other way around.

Corollary: no single token is a reliable tell. The em-dash is the classic example — plenty of human essayists lean on it. Cut **overuse**, do not ban the character.

## When to Activate

- Editing a draft (yours or an LLM's) destined for a blog, newsletter, README intro, docs, or marketing copy.
- The user says the text "sounds like AI," "sounds generic," or "needs a human voice."
- Final polish pass before publishing web content.

## Patterns to Cut (the reliable tells)

- **Filler openers:** "In today's fast-paced world," "In the ever-evolving landscape of," "It's important to note that," "When it comes to."
- **Flagged vocabulary (over-represented in LLM output):** delve, underscore, tapestry, testament, realm, navigate (figurative), leverage, robust, seamless, elevate, unlock, embark, foster, showcase, pivotal.
- **Uniform rhythm** — the #1 structural tell. Runs of sentences all 15–22 words long.
- **Empty transitions:** stacked "Moreover / Furthermore / Additionally"; reflexive "That said,".
- **Listicle bloat** — every idea forced into a bulleted list of three with bolded lead-ins.
- **Over-hedging:** "can help to," "may potentially," "it's worth considering."
- **Symmetry tics:** the rule of three everywhere; "It's not just X, it's Y."
- **Hollow conclusions:** "In conclusion, X remains a powerful tool that…"; ending on a rhetorical question.
- **Em-dash overuse** specifically — cap the frequency; substitute periods, commas, or colons.

## Positive Craft (what to add)

1. **Vary sentence length deliberately.** Follow a 30-word sentence with a 4-word one. This raises burstiness honestly.
2. **Add specificity only a human would know** — concrete numbers, names, dates, a real anecdote or edge case. Raises perplexity honestly.
3. **Commit to a voice** — a clear opinion, mild asymmetry, an occasional fragment or contraction.
4. **Cut throat-clearing** — delete the first sentence of most paragraphs; it is usually filler.
5. **Prefer the surprising-but-right word** over the most probable one. Kill clichés.

## Editing-Pass Checklist (run in order)

- [ ] Delete filler openers and stacked transitions.
- [ ] Merge/split sentences to break any run of uniform length.
- [ ] Swap 3–5 flagged words for plainer or more precise ones.
- [ ] Replace at least one generic claim with a concrete detail (number, name, example).
- [ ] Rewrite the conclusion to end on a specific point, not a summary.
- [ ] Read it aloud once; fix anything you would not actually say.

## Review Lens

To audit rather than rewrite, scan the draft against the "Patterns to Cut" list and report the top offenders with line references (the "unslop" pattern popularized by community `ai-writing-auditor` skills). Then apply the checklist.

## Reference

Perplexity/burstiness framing: McGill Office for Science & Society; CUNY writing resources. Treat SEO-vendor "beat the detector" pages as directional only — the goal is a human reader's respect, not a classifier's score.
