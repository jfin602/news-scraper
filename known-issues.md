# Known Issues

This file is the running issue log for problems reported in this chat.

## Open Issues

### R7KM — 2026-08-11 — Public feed flashes unset placeholder content before loading

- **Status:** Open
- **Summary:** On the public feed at `/`, the initial document briefly renders generic/unset placeholder content such as `News Feed` before the canonical `/api/feed` response finishes loading and the real Publication content replaces it.
- **Observed behavior:** A user can see the incorrect placeholder state flash during page startup before `Indie Author Publishing News` and the populated headline list appear.
- **Expected behavior:** The initial page state should show a centered loading indicator while the canonical feed request is pending. Generic placeholder titles or unset content should not be visibly painted before the Publication/feed state is known.
- **Regression coverage:** Browser coverage should prove the loading state is visible while `/api/feed` is pending, placeholder/unset content is not exposed during that interval, and populated, empty, unavailable, and error states still render correctly on desktop and mobile without changing canonical `/` or `/api/feed` behavior.
- **User impact:** The flash makes the public page look unfinished and creates visible layout/content jank even though the final loaded feed is correct.

## Resolved Issues

## Maintenance Notes

- Add newly reported problems under **Open Issues** only. Refuse product ideas, feature ideas, or general enhancements for this file.
- Move solved problems to **Resolved Issues** with the fix summary and resolution date.
- Every issue title must begin with a unique 4-character ID, followed by the date and title: `### ID — YYYY-MM-DD — Issue title`.
- Issue IDs use this restricted Base32 alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`. The characters I, O, 0, and 1 are excluded to reduce confusion.
- Assign IDs pseudo-randomly rather than sequentially. Issue IDs are permanent and are never changed or reused, including after an issue is resolved.
