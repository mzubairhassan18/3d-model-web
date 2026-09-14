# Reusable Specification: Scroll-Driven 3D Storytelling Website

## 1. Purpose and scope

Build a single-page website that uses scrolling to guide visitors through a sequence of content chapters. A persistent 3D subject acts as a visual guide, while accessible HTML presents the actual information and actions.

This structure can support personal introductions, product presentations, agency stories, educational explainers, or interactive case studies. The subject, chapter count, content, colors, and final action are configurable.

The core experience must remain understandable when animation, audio, or 3D rendering is unavailable. Motion enhances the narrative; it must not be required to retrieve information or use links.

## 2. Experience structure

Use four types of chapter. Repeat the detail chapter as needed.

| Chapter type | Content purpose | Typical composition | Typical motion |
| --- | --- | --- | --- |
| Introduction | Establish identity, subject, and value | Short eyebrow, primary heading, supporting copy, start action | Subject enters or idles beside the introduction |
| Overview | Explain the central proposition | One heading, concise summary, small set of attributes | Subject moves aside or gestures toward the content |
| Detail sequence | Present evidence, features, milestones, or steps | Repeated panels with metadata, title, points, and tags | Subject and content alternate sides between panels |
| Closing action | Give the visitor a clear next step | Short closing message, optional credentials or supporting facts, action links | Subject settles into a final pose |

Every chapter needs a stable identifier, navigation label, accessible heading, and defined entry and exit state. Keep the order meaningful even when presented as a conventional vertical document.

### Narrative pacing

- Introduce one main idea per panel.
- Allocate more scroll distance to dense content than to brief transitions.
- Separate movement intervals from reading intervals.
- Keep the subject relatively still while visitors read.
- Let visitors reverse direction without losing context.
- Make the primary closing action easy to reach through chapter navigation.

## 3. Page and component hierarchy

```text
Page
├── Skip-to-content link
├── Main narrative region
│   └── Persistent stage
│       ├── Header
│       │   ├── Identity / home link
│       │   ├── Optional descriptor
│       │   └── Optional audio control
│       ├── Decorative background
│       ├── 3D rendering surface
│       ├── Introduction panel
│       ├── Overview panel
│       ├── Detail panel collection
│       │   └── Detail panel × N
│       │       ├── Heading group
│       │       │   ├── Metadata badge
│       │       │   ├── Optional organization or category link
│       │       │   └── Panel heading
│       │       └── Reading group
│       │           ├── Summary or bullet list
│       │           └── Supporting tags or actions
│       ├── Closing panel
│       ├── Optional contextual caption
│       ├── Chapter controls
│       │   ├── Scroll cue
│       │   ├── Chapter navigation
│       │   └── Replay control
│       └── Overall progress indicator
└── Readable static fallback
```

The outer narrative region supplies scroll distance. The stage remains sticky while that distance is traversed. Panels share the stage and change visibility according to narrative progress.

Keep headings, paragraphs, lists, links, and navigation in semantic HTML above or beside the rendering surface. Do not draw essential text into the 3D canvas.

## 4. Layout and visual layers

Define a small, documented stacking order:

1. Page background and decorative typography.
2. 3D subject, lighting, and shadow.
3. Decorative connectors or transition effects.
4. Content panels and captions.
5. Header, navigation, and persistent controls.
6. Temporary loading or recovery interface.

Decorative layers must not intercept pointer input. Invisible panels must not block links or model interactions underneath them.

Use shared layout variables for header clearance, footer clearance, outer gutters, center divider, panel width, and subject bounds. Both the renderer and HTML layout should derive placement from the same usable stage area.

### Wide-screen composition

- Position introduction text and the subject in separate visual regions.
- Give detail panels a readable maximum width rather than stretching paragraphs across the screen.
- Alternate the reading region between left and right for successive detail chapters.
- Move the subject into the opposite region before the next panel becomes readable.
- Keep chapter navigation along the bottom, between the scroll cue and replay control.
- Allow the closing panel to be wider than ordinary detail panels.
- Keep closing actions in one horizontal row when their labels fit comfortably.
- Reserve an explicit gap between the closing content and bottom controls.
- Use transparent or minimally framed panels only where text retains adequate contrast against the scene.

### Compact-screen composition

Treat compact screens as a distinct composition, not a uniformly scaled desktop layout.

- Place introductory content below the measured header bounds with a deliberate gap.
- Divide detail chapters into two regions around a central gutter or progress divider.
- Put the heading group at the top of the subject's region.
- Put the reading group at the top of the opposite region.
- Keep both regions inside their assigned halves throughout reading intervals.
- Swap the two regions together when the narrative changes sides.
- Size and position the subject to fit below its heading and above persistent controls.
- Prefer short action labels or recognizable icons when full labels cannot fit.
- Give icon-only actions accessible names and useful tooltips where supported.
- Stack chapter numbers above their labels while keeping the navigation itself compact.

Avoid making an entire panel span across both the subject and reading region. Separate heading and reading containers so each can be positioned independently without duplicating semantic content.

### Short screens and overflow

Choose breakpoints from actual content fit, including viewport height. Width alone does not identify every constrained layout.

If the reading region exceeds the available height, first reduce decorative spacing and simplify optional content. If scrolling within a panel is still necessary, provide a visible affordance and keyboard access; allow visitors to continue the page narrative when they reach its boundary. Never trap the user in a nested scroll region.

When two columns become too narrow to read comfortably, switch to a linear layout with a smaller subject or static illustration. Readability takes priority over preserving the split composition.

## 5. Scroll and state model

Use one normalized narrative progress value from `0` to `1` as the source of truth for chapter selection, panel visibility, subject position, and reading reveals.

Keep the mapping between physical scroll distance and narrative progress explicit. Each segment should define:

| Field | Purpose |
| --- | --- |
| Identifier | Stable reference for navigation and state |
| Chapter identifier | Content associated with the segment |
| Segment type | Arrival, reading, transition, or closing |
| Narrative range | Start and end within the normalized story |
| Scroll weight | Relative physical distance allocated to the segment |
| Layout side | Reading region placement, where applicable |
| Subject pose | Named motion or pose configuration |
| Theme identifier | Visual theme applied during the segment |

Within a segment, calculate local progress as:

```text
local progress = clamp((story progress - segment start)
                      / (segment end - segment start), 0, 1)
```

Use cumulative scroll weights to map chapter navigation back to a page position. Navigation and manual scrolling must use the same mapping.

### Required behavior

- Scrolling backward restores the corresponding earlier state.
- Reloading or restoring a scrolled page produces the correct chapter after initialization.
- Navigation moves to a useful readable position, rather than an empty transition frame.
- Replay returns to the beginning and resets temporary interaction state.
- Resizing recalculates geometry while retaining the visitor's narrative position.
- Hidden panels leave the keyboard focus order and accessibility tree.
- Focus moves to a stable control if its current panel becomes hidden.
- Optional effects trigger once per intentional event, not on every rendered frame.

## 6. Content reveal and motion system

Use scroll-controlled timelines for content that must remain synchronized with reading progress. Reserve time-based motion for subtle idle behavior and explicit interactions.

A typical detail panel reveals its content in this order:

1. Metadata and organization or category.
2. Main heading.
3. Supporting points in reading order.
4. Tags or secondary facts.
5. Related actions.

Keep semantic markup intact during reveals. If splitting text into words, preserve emphasis, links, language attributes, and responsive copy variants. Reinitialization must not wrap the same text repeatedly.

Do not make unrevealed content so faint that reading becomes unnecessarily difficult. In reduced-motion and static modes, display essential content immediately.

### Subject choreography

Organize the 3D subject's motion into independent layers:

- Base pose or imported animation.
- Narrative movement and orientation.
- Contextual gesture, such as pointing or presenting.
- Subtle idle motion.
- Optional pointer or keyboard-triggered reaction.

Define blending priorities so competing layers do not snap between poses. Movement should end in a stable reading pose. Decorative gestures must remain within layout bounds and must not obscure content.

Optional particles, props, speech bubbles, and connectors are enhancements. Their absence must not affect navigation or comprehension.

## 7. Content and theme configuration

Keep content separate from animation logic. A reusable implementation should accept a structured configuration rather than hard-code organization names, headings, links, or chapter counts into rendering functions.

Suggested content fields:

```text
Site configuration
  identity
  introduction: eyebrow, heading, summary, primary action
  overview: heading, summary, attributes
  details[]:
    id, navigation label, metadata, heading
    optional logo and related URL
    summary, points[], tags[]
    theme identifier, optional pose identifier
  closing: heading, short message, optional supporting facts, actions[]
  optional audio captions
```

Each action should carry a label, destination, icon identifier, and accessible name. Store compact copy separately only when it conveys the same essential meaning as the longer version.

### Design tokens

Define tokens for background, primary text, muted text, borders, accent, panel surface, spacing, typography, radius, shadow, and motion duration.

Per-chapter themes may define badge fill, highlight color, tag surface, tag text, and connector color. Derive related accents from shared tokens so they stay consistent. If a badge uses a gradient, specify whether the heading uses that gradient or an associated solid accent.

Support light and dark surfaces intentionally. Validate contrast independently in both; a color that works on one background may fail on the other.

## 8. Interaction and accessibility requirements

- Use semantic landmarks and a logical heading hierarchy.
- Keep meaningful content available as HTML without requiring WebGL.
- Label chapter navigation and expose the active chapter programmatically.
- Provide visible keyboard focus and comfortable touch targets.
- Make all primary actions usable without hovering or interacting with the 3D subject.
- Hide purely decorative images, particles, and connectors from assistive technology.
- Give the 3D surface a concise description when it adds meaning.
- Avoid announcing every word reveal or progress update through live regions.
- Respect reduced-motion preferences by removing travel, shaking, flashing, and unnecessary transitions.
- Keep audio off until the visitor explicitly enables it.
- Provide visible text for any meaningful spoken information.
- Cancel obsolete speech when navigating, replaying, or disabling audio.
- Prevent model interactions from firing when the visitor uses a link or control.
- Preserve readable content and usable controls at increased text sizes and browser zoom.

## 9. Rendering, loading, and recovery

Load the semantic page first. Initialize the renderer as an enhancement after its dependencies and required assets are available.

A robust startup sequence is:

1. Present readable HTML and navigation.
2. Check rendering and animation capabilities.
3. Initialize the scene, camera, lighting, and renderer.
4. Load and validate the main model.
5. Normalize the model's size and origin.
6. Measure the usable stage and content regions.
7. Build scroll segments and animation timelines.
8. Synchronize with the current scroll position.
9. Reveal the enhanced experience and remove temporary loading UI.

Show loading progress only when it can be measured reliably. Optional assets must not block the entire page.

If a required model fails, WebGL is unavailable, or the rendering context is lost, show an understandable recovery state and retain the content and actions. A static image or ordinary document layout is an acceptable fallback.

### Performance principles

- Optimize model geometry, textures, and animation data before delivery.
- Cap rendering resolution to an appropriate device pixel ratio.
- Reuse geometry, materials, and temporary calculation objects where practical.
- Cache layout measurements and refresh them after relevant changes.
- Avoid reading layout and writing styles repeatedly for every word on every frame.
- Pause unnecessary work when the page is hidden.
- Bound particles and other temporary effects, and dispose of unused resources.
- Recalculate after font loading, viewport changes, and content changes.
- Ensure repeated initialization does not duplicate event listeners or timelines.

## 10. Suggested implementation boundaries

The architecture is framework-independent. Keep these responsibilities separate even in a small implementation:

| Module or layer | Responsibility |
| --- | --- |
| Content configuration | Text, links, chapters, themes, and metadata |
| Semantic components | Accessible HTML structure and controls |
| Design system | Shared tokens and component styling |
| Responsive layout | Region placement and usable viewport measurements |
| Scene controller | Model loading, camera, lighting, and render lifecycle |
| Narrative controller | Scroll mapping, chapter state, and navigation |
| Motion controller | Pose blending, transitions, and content reveal |
| Interaction controller | Pointer, keyboard, optional audio, and replay |
| Recovery layer | Static presentation, loading, and error states |

Avoid scattering breakpoint values and chapter thresholds across unrelated modules. Share configuration between layout and animation wherever they must agree.

Use a predictable CSS cascade. Keep responsive rules scoped and avoid accumulating contradictory overrides or relying on widespread `!important` declarations.

## 11. Implementation sequence

1. Define the audience, narrative, chapter inventory, and closing action.
2. Build the complete semantic page as a readable static document.
3. Establish wide-screen, compact-screen, and short-screen layouts.
4. Add persistent-stage behavior and working chapter navigation.
5. Introduce the 3D subject with stable placement and fallback behavior.
6. Add deterministic transitions and reading intervals.
7. Add optional gestures, captions, audio, and decorative effects.
8. Validate accessibility, responsiveness, performance, and recovery.

Complete each step before adding complexity that depends on it. A working static baseline makes later animation defects easier to isolate.

## 12. Validation and acceptance criteria

### Test matrix

Validate narrow phones, typical phones, tablets, wide desktops, and short landscape windows. Test just above and below each breakpoint, both visual themes, reduced motion, and increased text size.

Exercise every chapter in forward and reverse order. Inspect both alternating sides, transition frames, the fully revealed closing panel, and a resize performed midway through the narrative.

### Acceptance checklist

- [ ] No essential text overlaps the subject, header, divider, or persistent controls.
- [ ] Detail headings and reading content start at the intended top edges.
- [ ] Alternating panels remain in their assigned regions during reading intervals.
- [ ] The subject remains fully usable within its allocated space.
- [ ] Content is readable without horizontal page overflow.
- [ ] Long headings, extra points, and long action labels degrade gracefully.
- [ ] Closing content leaves clear space above the bottom controls.
- [ ] Compact icon actions retain meaningful accessible names.
- [ ] Navigation, replay, links, and optional audio controls work with a keyboard.
- [ ] Hidden panels cannot receive focus or intercept pointer input.
- [ ] Reverse scrolling and chapter jumps produce consistent state.
- [ ] Reduced-motion mode exposes all essential information.
- [ ] Loading and asset failures preserve a useful page.
- [ ] Browser logs contain no unresolved application errors.
- [ ] Rendering and scroll responsiveness have been checked on representative hardware.

Use screenshots to evaluate composition and DOM measurements to verify boundaries and overflow. For the narrative controller, test mapping, chapter transitions, reverse progress, and replay behavior independently of decorative animation details.

## 13. Decisions to make for each new website

Before implementation, specify the audience, primary conversion action, number of chapters, content density, 3D subject, asset budget, target devices, visual themes, and required integrations.

Decide which enhancements are optional: alternating layouts, word reveals, speech captions, audio, particles, interactive gestures, and secondary 3D props. Start with the smallest set that supports the story.

Treat all dimensions, breakpoints, timing values, color choices, and content limits as configurable design decisions. Preserve the architectural principles: semantic content, clear reading regions, one narrative state model, reversible navigation, responsive choreography, and a reliable static fallback.
