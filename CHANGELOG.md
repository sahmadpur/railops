# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Train numbers 2680–2688 and 2690–2698 (even, Böyük Kəsik → Tbilisi) in the seeded registry.
- Operation 16.1 at Gardabani: "Технический осмотр вагонов (по необходимости)" — optional, recorded between document processing and departure on the outbound leg.
- Operations carry a display number (`operation_types.display_no`) alongside the ordering key, so the app shows the numbers docs/Operations.xlsx prints — 16.1 for the new step, and 17–28 unchanged for the steps after it even though their ordering keys shifted to 18–29. Turnaround, dashboard, journal and Excel export all read it; the admin catalogue keeps showing the ordering key, since that is what its "conditional on" and "parallel with" inputs refer to.
- User manual at `/manual`, linked from the sidebar for every role: operator sections for everyone, administrator sections for admins. Written in all four languages, illustrated with screenshots of the app in the reader's language (`public/manual/*.{az,ru,en,ka}.webp`), re-shot by `node scripts/manual-shots.mjs`.
- Searchable dropdowns (`SearchSelect`) for locomotive and train number on operation entry rows; the list shows only matching results as you type.
- Free-text search (train or locomotive number) and a train-number filter on the turnarounds list; the Excel export honours them.
- Locomotive downtime statistics on the dashboard: time each locomotive spent off routes (neither on a turnaround nor in ТОИР) within the selected range.
- `CHANGELOG.md` — every update appends here.

### Removed
- Locomotive availability guard: any active locomotive can now be recorded on any operation. The dropdown no longer hides locomotives that are on another turnaround or in ТОИР, the server-side `locomotive_busy` check is gone, and so is `getAvailableLocomotives`.

### Changed
- Changing the train number on operation 1 now also updates the turnaround's own train number, so the list, dashboard and export follow the correction. Rejected if that train is already on an unfinished turnaround or already has one on the same date.
- The seed keys operations by `code` instead of `seq`, so inserting a step mid-sequence renumbers the rest without recorded history following the wrong step.
- User manual copy rewritten in all four languages for natural, native-reader prose; quoted UI labels now match the actual button and column labels in each language file.
- Turnarounds list and detail pages refresh themselves every 30 seconds while the tab is visible, so work recorded at another station appears without a manual reload.
- Favicon letters are now MS, matching the new product name; the sidebar and sign-in badges carry the same MS mark.
- Product name shown in the UI is now Monstyk ("Монстык" in Russian); internal identifiers (package name, database, cookies, audit settings) keep the `railops` name.
- The per-operation comment moved out of the Time cell into its own Note column on the turnaround detail page.
- Locomotives on an unfinished turnaround or in open ТОИР are excluded from operation entry dropdowns (and rejected server-side).
- Post-login landing page is `/turnarounds` for all users.
- Operators only see turnaround records headed to their station (previous station's mandatory steps done); a record leaves their list once their station's part is filled. Direct links stay read-only.
- Operators see only the turnaround interface: dashboard, journal, admin pages, and Excel exports are admin-only.
- Downtime values read as days/hours/minutes ("23 дн. 14 ч 3 мин") instead of a raw hours:minutes counter, localized per language.
- Operations from earlier legs of the route are collapsed behind a "Show earlier operations" toggle on the turnaround detail page.
- Operators can only edit the leg the turnaround is currently on: a Böyük Kəsik operator receiving the return leg (seq 26+) can no longer edit the outbound BK operations, enforced in the UI and on the save/clear paths (`past_leg` error).
- The new-turnaround form uses the same searchable train dropdown (`SearchSelect`) as operation entry rows.
- Searchable dropdowns no longer open a full-height list on an empty box: options appear only while typing, capped at the 10 closest matches.
- Operators can close a turnaround themselves once no required operations are left; reopening and deleting remain admin-only.
- A fully filled but unclosed turnaround stays on the final station's list (and stays editable there) until it is closed, so leaving the page before closing cannot strand the record.
