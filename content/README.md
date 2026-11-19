# Content authoring guide

Everything the learner sees (categories, expressions, contrast groups) lives here as YAML. To add content, add a file. No code changes are needed.

```
content/
  categories.yaml                 # tree: 26 top-level areas, each with subcategories
  expressions/<top-category>/<slug>.yaml
  contrasts/<slug>.yaml
```

Check and load your changes:

```
npm run content:validate   # reports every problem as "file: message"
npm run content:seed       # validates, then loads into data/wordcraft.sqlite (re-runnable)
```

Seeding is idempotent. It updates by `slug`, removes entries whose file you deleted, and never touches the learner's own data (notebook, history, progress).

## An expression file

```yaml
slug: crestfallen            # lowercase-with-hyphens, unique, used in the URL
text: crestfallen            # exactly what the learner sees
kind: word                   # word | phrase | idiom | collocation | pattern
pos: adjective               # optional
simpleMeaning: ...           # one plain sentence
contextualMeaning: ...       # what it means in a real situation
usageNotes: ...              # when and why to use it, and what to avoid
intensity: 3                 # optional, 1 (mild) to 5 (extreme), for feelings
register: literary           # formal | neutral | informal | conversational | literary
level: advanced              # beginner | intermediate | advanced | literary
status: published            # draft entries are stored but never shown
categories: [disappointment] # first one is the primary category; any category slug
tags: ["emotion:disappointment"]   # kind:slug, kind = emotion | situation | technique
searchPhrases: [let down]    # how a learner might describe it without knowing the word
examples:                    # at least 3 when published
  - text: ...
    setting: narration       # dialogue | narration | everyday | professional | academic
    contextNote: ...         # optional
relations:
  - to: deflated             # another expression's slug
    type: synonym            # synonym | antonym | related | stronger | weaker
    note: ...
mistakes:
  - wrong: ...
    right: ...
    explanation: ...
```

## A contrast group file

A contrast group explains how near-synonyms differ. It is one of the most useful things on the site.

```yaml
slug: whisper-murmur-mutter-mumble
title: Whispered, murmured, muttered, mumbled
explanation: ... one paragraph naming the dimension each word differs on
members:                      # at least 2, all must be existing expression slugs
  - expression: whispered
    note: what makes this one different
    example: a sentence showing exactly that
```

## The quality bar

1. **Specific situations.** Say who is doing what and why. "Used for sadness" is not a usage note.
2. **Real differences.** For near-synonyms, name the dimension (volume, intent, formality, intensity, what it implies) and demonstrate it.
3. **Natural, original examples.** Write them yourself. Never copy a sentence from a book, article or website. Vary the setting (dialogue, narration, everyday, professional).
4. **Mistakes learners actually make.** Wrong word choice, wrong register, wrong grammar pattern, or a mismatch between the word and its context. Explain why, not only what.
5. **Simple English.** Explanations should be easier to read than the word being explained.
6. **Honest levels.** `beginner` is words a reader of simple novels knows; `literary` is rare, formal or poetic.

## Writing prompts

Prompts for the Writing Studio live in `content/prompts/<mode>/<slug>.yaml`. The mode is one of `situation`, `paragraph`, `creative` or `professional`.

```yaml
slug: waiting-for-the-bus
mode: situation
kind: scene            # a free label: scene, email, story, character, report, article ...
title: Waiting for the bus
situation: A specific situation with a who, a where and a what (at least 60 characters).
constraints: [Use at least one detail you can feel or hear.]   # 0 to 5
try: [overcast, shivered, glanced]                             # 2 to 4 expression slugs that must exist
level: beginner
```
