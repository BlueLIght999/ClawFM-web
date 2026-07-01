# Qclaudio 88.7 — Design System

## Vibe

Retro-futuristic 24/7 AI radio station. Pixel-art crab DJ broadcasting from a terminal-inspired dashboard. Think: 1980s CRT display meets modern web audio. Dark, cozy, slightly glitchy.

## Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--bg-primary` | `#0a0a0f` | Main background |
| `--bg-secondary` | `#12121a` | Panel backgrounds |
| `--accent` | `#ff6b9d` | Primary accent (crab pink) |
| `--accent-glow` | `#ff9ec4` | Glow variant for highlights |
| `--text-primary` | `#e8e8f0` | Primary text |
| `--text-secondary` | `#8888a0` | Secondary text |
| `--text-dim` | `#555568` | Muted/dim text |
| `--border-dim` | `#1e1e2e` | Subtle borders |
| `--accent-alt` | `#ffd700` | Gold accent (rare use) |

## Typography

| Token | Font | Size | Usage |
|-------|------|------|-------|
| `--font-pixel` | `"Press Start 2P", monospace` | 6-8px | UI labels, buttons, headers |
| `--font-mono` | `"IBM Plex Mono", monospace` | 16-18px | Body text, data, chat |

- All pixel text: `image-rendering: pixelated; letter-spacing: 1px`
- No anti-aliasing on pixel fonts. Ever.

## Icons & Graphics

- **Weather icons**: 8×8 pixel grid rendered via CSS `box-shadow` on a 2×2px dot. No images, no SVG.
- **Crab mascot**: Inline SVG, 200×200 viewBox. States: `idle`, `bouncing`, `talking`. Never modify the crab's appearance — only position/animation.
- **Buttons**: `.pixel-btn` class — bordered pixel look, uppercase, `--font-pixel`, 8px font-size.

## Spacing & Layout

- Chat panel slides in from right with `cubic-bezier(0.34, 1.56, 0.64, 1)` (elastic bounce)
- Crab transitions left when chat opens: `transform: translateX(-160px)`
- Weather bar: 16px height, centered, `gap: 10px`
- Player bar: bottom-anchored, pixel-art progress bar

## Component Hierarchy

```
App
├── TopBar          (radio name, freq, connection status, nav)
├── WeatherBar      (pixel weather icon + city/temp/desc/humidity)
├── [Player View]
│   ├── Layout
│   │   ├── CrabMascot    (interactive, opens chat)
│   │   ├── Spectrum      (audio visualizer)
│   │   ├── DJBooth       (DJ message display)
│   │   └── ChatBox       (AI DJ chat, expands from right)
│   ├── LyricsDisplay     (synced lyrics)
│   ├── PlaylistList      (upcoming songs)
│   └── PlayerBar         (controls, progress, mode)
├── [Profile View]
└── [Settings View]
```

## Motion

- Crab bounce: gentle Y-axis oscillation, 3s then return to idle
- Chat expand: slide-in from right, 500ms elastic
- View transitions: instant (no crossfade — pixel aesthetic doesn't blend)
- Spectrum: real-time audio frequency bars, 32 bands, 2px wide

## Rules

1. No rounded corners over 2px. Pixel art is angular.
2. No gradients with more than 3 stops. Flat colors preferred.
3. No shadows with blur > 4px. Hard shadows or none.
4. All interactive elements get `cursor: pointer` on hover + accent color shift.
5. Monospace for anything that's data. Pixel font for anything that's UI.
6. Weather icons are CSS box-shadow, not images. Keep the technique consistent.
7. Crab SVG is sacred — animate position/size only, never redraw.
