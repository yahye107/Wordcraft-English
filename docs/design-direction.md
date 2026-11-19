# Wordcraft design direction

Skills applied in order: frontend-design, ui-ux-pro-max (`--design-system` search), emil-design-eng.

## Decision

The ui-ux-pro-max search suggested claymorphism with a playful kids' font pair. That fits children's apps, not an adult writer building craft, so it was **rejected**. The direction below is chosen for this brief instead: a calm editor's desk.

**Idea: the editor's marks.** The one memorable thing is how example sentences are shown. The expression being taught is lit with a **highlighter marker**; mistakes use a **red strike**, corrections a **green mark**. Every other surface stays quiet so those marks carry meaning.

## Tokens

| Role | Light | Dark |
| --- | --- | --- |
| Paper (page) | `#F4F6F8` cool paper, not cream | `#0F1622` |
| Surface | `#FFFFFF` | `#172131` |
| Ink (text) | `#16202F` | `#E9EEF5` |
| Ink 2 (muted) | `#4A5668` | `#A3AFC2` |
| Rule | `#D9DFE7` | `#27344A` |
| Cobalt (links, actions) | `#2347D9` | `#7F9BFF` |
| Marker (highlight) | `#FFE14D` | `#E8C93A` |
| Wrong | `#C42B2B` | `#FF8A80` |
| Right | `#17744F` | `#6FD3A5` |

## Type

- **Literata** (serif, made for long reading): headings and every example sentence. Line-height 1.6, measure under 70ch.
- **Hanken Grotesk** (sans): interface, labels, nav. Clearly different from the serif.

## Layout

- Desktop: fixed left rail (wordmark and nav), one reading column, left-aligned.
- Phone: slim top bar with a menu, bottom nav of five (Home, Explore, Search, Studio, Notebook).
- Borders and rules only where they mean something (section breaks, the wrong/right pair). Radius 10px on controls, 14px on large panels.

## Motion (emil-design-eng)

- Press feedback: `scale(0.97)` on `:active`, 160ms ease-out.
- No animation on keyboard-driven actions or on every card.
- One orchestrated moment: on the dashboard, the highlighter draws across the key phrase once.
- Honours `prefers-reduced-motion`; hover effects only where hover exists.

## Rejected as generic

Cream + terracotta + display serif; dark + acid accent; all-caps tracked eyebrows; identical rounded cards with soft shadows; numbered 01/02/03 markers on non-sequences.
