# LudoBurrow

> ludo (Latin for "play") + burrow ("den, shelter") — a PC puzzle game platform

[中文](./README.md) | **English**

An install-free, local-first, purely front-end puzzle game platform: **double-click [`play/index.html`](./play/index.html) to play** (the repository ships a ready-to-run build — no Node or server required; the root `index.html` is the development template and cannot be opened directly). The same build deploys to the web unchanged. No backend, no database, no runtime dependencies.

**Games & capabilities**

- ⌨️ **Key Game** — press the key shown on screen: random letters & digits / English words / Chinese Pinyin (4 modes, 50 levels each)
- 🧩 **Jigsaw** — a real-table jigsaw experience: cutting, snapping, trial-and-error, validation; smart cutting with optional AI enhancement (4-topic gallery of 24 images, level count varies by cutting scheme)
- 🌀 **Maze** — pixel-hero themed mazes (8 themes, 50 levels)
- 🌐 **Bilingual UI (Chinese/English)** — switch in personal settings, takes effect immediately; game content does not change with language
- 📴 **PWA** — the online build works offline after one visit (the local file:// build does not rely on it)

**Status (2026-09-14 baseline)**: Phase 1 (M1-M6) fully delivered (v1.0.0 released, acceptance rework iterated to v1.1.0, later acceptance results to ship with the next release); current gates: typecheck 0 errors, 574 tests, coverage 94.25% (branches 90.48%), i18n 163 keys. Phase 2 is scheduled (web login & per-user assets + iOS mobile support + portrait/landscape adaptive layout); the web-fork framework is already in place.

## Tech Stack

Vite · TypeScript · Vue 3 · Pinia · vue-i18n · Canvas 2D · Vitest (versions locked at the M1 scaffold; see [Coding Standards §13](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md), in Chinese)

## Directory Layout

```
LudoBurrow/
├── CLAUDE.md               # Cross-tool project rules (for AI coding tools)
├── documents/
│   ├── design/             # Design & specification docs (authoritative; archive/ is local-only)
│   ├── ui/                 # UI prototype (single interactive HTML: five views + overlays)
│   └── bug/                # Bug-fix write-ups (accumulated over development)
├── play/                   # Ready-to-run build (double-click play/index.html; rebuild via npm run play)
├── public/                 # Static assets (gallery 4 topics × 6 / maze tiles 8 themes / sprites / icons / PWA files)
├── scripts/                # Build, verification & asset scripts (release / verify-dist / fetch-gallery, etc.)
├── src/                    # Source (core/games/engines/ai/i18n/services/stores/components)
└── tests/                  # Tests (separate from src/)
```

## Documentation Index

All design documents are written in Chinese.

| Document | Scope |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | Cross-tool project rules: architecture constraints / release principles / capability boundaries / doc review standards |
| [LudoBurrow 技术架构说明文档](./documents/design/LudoBurrow%20%E6%8A%80%E6%9C%AF%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E%E6%96%87%E6%A1%A3.md) | Technical architecture (authoritative): modules / GameModule plugin system / three games / AI capabilities / data assets |
| [LudoBurrow 架构说明（正式版）](./documents/design/LudoBurrow%20%E6%9E%B6%E6%9E%84%E8%AF%B4%E6%98%8E%EF%BC%88%E6%AD%A3%E5%BC%8F%E7%89%88%EF%BC%89.md) | Formal architecture summary for project review |
| [LudoBurrow 代码规范](./documents/design/LudoBurrow%20%E4%BB%A3%E7%A0%81%E8%A7%84%E8%8C%83.md) | Coding standards (TypeScript / Vue 3 / Canvas / assets) + git commit format |
| [LudoBurrow 测试规范文档](./documents/design/LudoBurrow%20%E6%B5%8B%E8%AF%95%E8%A7%84%E8%8C%83%E6%96%87%E6%A1%A3.md) | Vitest strategy / coverage gates (≥80% overall) / browser smoke matrix |
| [LudoBurrow 部署规范](./documents/design/LudoBurrow%20%E9%83%A8%E7%BD%B2%E8%A7%84%E8%8C%83.md) | Release artifacts / release pipeline / online deployment / rollback |
| 《LudoBurrow 开发计划文档》(internal, archived under `documents/design/历史存档/`, not in repo) | Milestones M1-M6 / AI-assisted development workflow / acceptance & gates |
| [LudoBurrow 问题汇总明细](./documents/design/LudoBurrow%20%E9%97%AE%E9%A2%98%E6%B1%87%E6%80%BB%E6%98%8E%E7%BB%86.md) | Pitfall log (four-part entries, accumulated) |
| [documents/ui/README.md](./documents/ui/README.md) | UI prototype directory guide |
| [documents/bug/README.md](./documents/bug/README.md) | Bug document naming conventions |

## Release History

> Every release (including hotfixes and config changes) must add a row here — see `CLAUDE.md §Release Principles` #9. Counting restarts from the 2026-09-14 documentation baseline; earlier history lives in `documents/design/历史存档/` (local-only).

| Version | Date | Type | Summary | By |
|------|------|------|------|-----|
| v1.1.0 | 2026-09-14 | Baseline | Documentation baseline: full doc review with unified figures (measured gates: typecheck 0 errors / 574 tests / coverage 94.25% (branches 90.48%) / i18n 163 keys), English README added, design-doc archive (V1) created | castle |

## License

Code is released under the [MIT License](./LICENSE). The built-in gallery (24 images, ≥1K resolution) comes from Wikimedia Commons (CC0 / CC-BY / CC BY-SA / public domain) and Openclipart (cartoon topic, site-wide CC0), fetched by `scripts/fetch-gallery.mjs` and credited per image in `public/assets/images/CREDITS.md`; maze tiles/sprites are generated by `scripts/gen-maze-assets.mjs` and PWA icons by `scripts/gen-pwa-icons.mjs` (shipped under MIT). Copyrighted images imported locally by users (including `documents/local/`, ignored via .gitignore) never enter the repository and are never distributed.
