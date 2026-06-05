---
name: Nested anchor bug pattern
description: React hydration error from <Link> wrapping cards that contain WalletBadge or other <a> elements
---

**Rule:** Never wrap a clickable card in `<Link>` (wouter) if the card's subtree contains `<WalletBadge>` or any other `<a>` element. Use `<div role="link" tabIndex={0} onClick={() => navigate(href)}>` instead.

**Why:** `<Link>` from wouter renders as `<a>`. `WalletBadge` renders `<a>` tags for explorer links. The combination creates `<a><a>` which is invalid HTML. React 18 detects this and logs: "In HTML, <a> cannot be a descendant of <a>. This will cause a hydration error."

**How to apply:** Pattern found and fixed in `Traders.tsx` (trader card grid). Same risk exists in any other card grid that uses `<Link>` as the outer wrapper while containing `WalletBadge` or external links inside. Prefer the div+navigate pattern used by WinPost/SignalPost/LossPost in Feed.tsx.

**Also fixed:** `<Link><button>` in LossPost was similarly invalid (`<a>` containing interactive content). Replaced with a plain `<button onClick={() => navigate(...)}>`.
