# Known Issues

This file is the running issue log for problems reported in this chat.

## Open Issues

## Resolved Issues

### R7KM — 2026-08-11 — Public feed flashes unset placeholder content before loading

- **Status:** Resolved on 2026-08-13
- **Resolution:** Exact-final-source Chromium validation deliberately held the initial `/api/feed` response pending and observed an intentional neutral loading state with no visible generic/unset Publication heading, configured branding, or fake headline content. The configured Publication presentation appeared only after the owned response resolved, and later pending navigation preserved already-known public branding.
- **Regression coverage:** `npm run test:browser` covers delayed initial loading, reduced motion, populated/null/broken/inert branding, owned unavailable-state clearing, and stale success/error/404 protection.

## Maintenance Notes

- Add newly reported problems under **Open Issues** only. Refuse product ideas, feature ideas, or general enhancements for this file.
- Move solved problems to **Resolved Issues** with the fix summary and resolution date.
- Every issue title must begin with a unique 4-character ID, followed by the date and title: `### ID — YYYY-MM-DD — Issue title`.
- Issue IDs use this restricted Base32 alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. Issue IDs are permanent and are never changed or reused, including after an issue is resolved.
