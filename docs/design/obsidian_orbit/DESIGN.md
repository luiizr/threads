---
name: Obsidian Orbit
colors:
  surface: '#0f131c'
  surface-dim: '#0f131c'
  surface-bright: '#353942'
  surface-container-lowest: '#0a0e16'
  surface-container-low: '#181c24'
  surface-container: '#1c2028'
  surface-container-high: '#262a33'
  surface-container-highest: '#31353e'
  on-surface: '#dfe2ee'
  on-surface-variant: '#cbc3d7'
  inverse-surface: '#dfe2ee'
  inverse-on-surface: '#2c3039'
  outline: '#958ea0'
  outline-variant: '#494454'
  surface-tint: '#d0bcff'
  primary: '#d0bcff'
  on-primary: '#3c0091'
  primary-container: '#a078ff'
  on-primary-container: '#340080'
  inverse-primary: '#6d3bd7'
  secondary: '#d2bbff'
  on-secondary: '#3f008e'
  secondary-container: '#6001d1'
  on-secondary-container: '#c9aeff'
  tertiary: '#adc6ff'
  on-tertiary: '#002e6a'
  tertiary-container: '#4d8eff'
  on-tertiary-container: '#00285d'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#e9ddff'
  primary-fixed-dim: '#d0bcff'
  on-primary-fixed: '#23005c'
  on-primary-fixed-variant: '#5516be'
  secondary-fixed: '#eaddff'
  secondary-fixed-dim: '#d2bbff'
  on-secondary-fixed: '#25005a'
  on-secondary-fixed-variant: '#5a00c6'
  tertiary-fixed: '#d8e2ff'
  tertiary-fixed-dim: '#adc6ff'
  on-tertiary-fixed: '#001a42'
  on-tertiary-fixed-variant: '#004395'
  background: '#0f131c'
  on-background: '#dfe2ee'
  surface-variant: '#31353e'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: -0.005em
  body-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.02em
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '400'
    lineHeight: 16px
  code-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: 14px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-dense: 0.5rem
  margin: 1rem
  margin-window: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system defines a high-density, professional desktop application client optimized for multi-account social media operations on Threads. Built for creators, agency managers, and growth strategists navigating complex cross-account scheduling, moderation, and analytics, the system embodies a **Tactile High-Tech Dark Minimalism** aesthetic.

The visual tone balances utilitarian efficiency with high-end creative energy:
- **Precision Workspace:** Deep, low-fatigue slate backgrounds mimic studio production software (e.g., modern IDEs, audio workstations, or video suites), shifting cognitive load entirely onto content previews and telemetry metrics.
- **Electric Accentuation:** Punchy electric violet and deep indigo gradients signal active creation states and primary conversions without visual noise.
- **Clear Information Density:** Information is categorized through strict micro-typography, precise 1px hairline dividers, and semantic state indicators designed for rapid scanning.

## Colors

The palette employs a deep slate foundation with layered surfaces to establish a clear desktop window hierarchy, combined with an electric violet primary spectrum and rigorous semantic status signaling.

### Canvas & Surface Hierarchy
- **Canvas Base (`#0B0F17`):** Primary desktop window backdrop, sidebar drawer tracks, and root layout frames.
- **Surface Elevation 1 (`#111827`):** Working canvas, content lists, central panel workspaces, and main data tables.
- **Surface Elevation 2 (`#1E293B`):** Individual cards, modal shells, popovers, and sticky toolbars.
- **Surface Elevation 3 (`#334155`):** Hover states, active row selections, and elevated micro-elements.

### Accents & Gradients
- **Primary Violet (`#8B5CF6` / `#7C3AED`):** Dedicated to high-priority user intentions, active navigation indicators, and key focus rings.
- **Creation Gradient:** A subtle 135-degree linear gradient from `#8B5CF6` to `#6D28D9` reserved strictly for primary execution triggers such as global compose buttons.

### Semantic Status Palette
- **Success / Connected (`#10B981`):** Active account sessions, successful thread dispatches, and healthy API nodes. Paired with a 10% alpha fill (`rgba(16, 185, 129, 0.12)`).
- **Warning / Degraded (`#F59E0B`):** Token lifespan expiration warnings, rate-limit thresholds, and draft conflicts. Paired with a 10% alpha fill (`rgba(245, 158, 11, 0.12)`).
- **Destructive / Error (`#EF4444`):** Disconnected accounts, failed thread posts, and terminal states. Paired with a 10% alpha fill (`rgba(239, 68, 68, 0.12)`).
- **Informational / Scheduled (`#3B82F6`):** Queued threads, scheduled publication slots, and platform notices. Paired with a 10% alpha fill (`rgba(59, 130, 246, 0.12)`).

## Typography

The typography relies on **Inter** for all interface headlines, thread content, and operational controls, paired with **JetBrains Mono** for telemetry, character counts, status indicators, and timestamps.

- **Scale & Density:** Scaled deliberately for 1440x900 desktop environments where standard web font sizes consume excessive real estate. Base UI body sits at `13px`, producing crisp scanning across multi-column account feeds.
- **Thread Previews:** Thread composition editors and timeline previews use `body-lg` (`15px`) to simulate mobile reading scale inside a desktop canvas.
- **Tabular & Meta Data:** Timestamps, schedule countdowns, post character limits (e.g., `482/500`), and API rate counters use `code-sm` or `code-xs` with tabular numbers enabled to eliminate layout jitter during live updates.

## Layout & Spacing

The layout is built upon an application-shell architecture designed to stay fixed within the native window boundary (optimized for 1440x900 viewport constraints) without generic vertical page scrolling. 

### Desktop Window Shell Architecture
- **Window Chrome:** Fixed `40px` window bar carrying native macOS window traffic lights or Windows control anchors, global workspace switchers, and sync state indicators.
- **Three-Pane Split Layout:**
  1. **Primary Navigation Bar (Left Rail):** Fixed `64px` icon-only or `220px` expanded sidebar housing global accounts, scheduling queues, and settings.
  2. **Entity Column / Account Matrix (Middle Pane):** Flexible `320px` to `380px` list view displaying accounts, draft pipelines, or scheduling queues.
  3. **Detail & Composition Stage (Right Canvas):** Elastic stage (remaining space, minimum `720px`) housing thread preview cards, rich-text multi-post threads, and analytical micro-charts.
- **Rhythm & Grid:** Standard layout movements conform to an 8px grid baseline, utilizing `space-xs` (4px) and `space-sm` (8px) for internal component padding, preserving compactness in tables and card rows.

## Elevation & Depth

Visual depth is achieved through **tonal separation and hairline borders** rather than diffuse drop shadows. This maintains a technical desktop application look and eliminates visual mud on dark displays.

- **Low-Contrast Structural Borders:** Containers, table rows, window panes, and panels rely on a crisp `1px solid #1E293B` or `1px solid #334155` outline.
- **Subtle Ambient Shadows:** Reserved strictly for floating overlays, autocomplete dropdowns, context menus, and modal dialogs:
  - `shadow-modal`: `0 16px 36px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px #334155`
  - `shadow-popover`: `0 8px 20px -4px rgba(0, 0, 0, 0.5), 0 0 0 1px #1E293B`
- **Focus Rings:** High-visibility electric violet ring (`0 0 0 2px #0B0F17, 0 0 0 4px #8B5CF6`) ensuring accessibility on keyboard navigation.

## Shapes

The design system applies a calibrated roundedness scale tailored for modern desktop clients:
- **Base Surfaces & Cards:** `12px` (`rounded-xl` equivalent via token configuration) for dashboard cards, preview bubbles, and modal dialog surfaces.
- **Buttons, Form Inputs & Menu Items:** `8px` (`rounded-lg`) offering ergonomic clickable surfaces that integrate smoothly within dense toolbars.
- **Badges, Avatar Cutouts & Segment Controls:** Full pills (`9999px`) to immediately distinguish contextual status tokens and tag elements from structural layout cards.

## Components

### Buttons & Trigger Controls
- **Primary Action (Compose / Dispatch):** Styled with a gradient from `#8B5CF6` to `#7C3AED`, white bold text, `8px` corner radius, `space-sm` vertical and `space-md` horizontal padding. Hover brightens border illumination; active shifts downward by 1px.
- **Secondary Action:** Surface `#1E293B` with border `1px solid #334155`, text `#F8FAFC`.
- **Ghost / Icon Button:** Transparent background, text `#94A3B8`, hover to `#1E293B` with text `#FFFFFF`.
- **Window Chrome Actions:** Compact traffic light dots (macOS style: Close `#EF4444`, Minimize `#F59E0B`, Expand `#10B981` at 12px diameter).

### Status Badges & Pills
- Badges must feature an icon (or 6px dot indicator) paired with text:
  - **Connected / Publicado:** Background `rgba(16, 185, 129, 0.12)`, text `#10B981`, border `1px solid rgba(16, 185, 129, 0.25)`.
  - **Token Expirando:** Background `rgba(245, 158, 11, 0.12)`, text `#F59E0B`, border `1px solid rgba(245, 158, 11, 0.25)`.
  - **Desconectada / Falhou:** Background `rgba(239, 68, 68, 0.12)`, text `#EF4444`, border `1px solid rgba(239, 68, 68, 0.25)`.
  - **Agendado:** Background `rgba(59, 130, 246, 0.12)`, text `#3B82F6`, border `1px solid rgba(59, 130, 246, 0.25)`.

### Input Fields & Textareas
- **Background:** `#111827`, border `1px solid #1E293B`, border-radius `8px`.
- **Thread Editor Field:** Borderless background within the preview card; character count dynamic indicator anchored at bottom right in `code-xs`.

### Cards & Thread Previews
- **Container:** Background `#1E293B`, border `1px solid #334155`, radius `12px`, internal padding `space-md`.
- **Account Switcher Card:** Avatar with platform icon badge, handle name in `label-md`, session status pill right-aligned, and quick metrics bar along the lower baseline.

### Data Tables & Micro-Charts
- **Row Styling:** Alternating subtle row states or pure border dividers (`#1E293B`); row height `40px` for dense scanning.
- **Micro-Charts:** Sparklines rendered in `#8B5CF6` (threads volume) or `#10B981` (engagement rate) with zero grid lines, 1.5px stroke width, and gradient fill to transparent base.