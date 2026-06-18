# Figma UI v2 — Build Scripts (ShoghlOnline)

Figma file: https://www.figma.com/design/18LO5MRi3siNwhUaf4ARV2

## Current state of the file
- Page `00 · Cover + Foundations`: cover, palette (10 paint styles), Tajawal type scale, 15 components (buttons, input, chips, **ModeToggle Worker/Employer**, Header ×2, Footer).
- Page `01 · Screens`: 13 screens built and correctly sized (jobs ×2, employer ×2, contract, chat, wallet, bids, notifications, tickets, profile, services ×2).
- Page `02 · Review Notes`: empty (script below).

## Missing (Figma MCP Starter-plan call limit was reached)
1. **3 Auth screens** — Google SSO sign-in, mode selection, worker wizard → `01_auth_screens.js`
2. **Review-notes annotations** → `02_review_notes.js`

## How to run when the limit resets
Ask Claude: *"run the scripts in figma_v2_scripts against the Figma file"* — each `.js` file is the exact code for one `use_figma` call (fileKey `18LO5MRi3siNwhUaf4ARV2`).
After running, also run `03_fix_sizing.js` (repairs auto-layout hug heights).
