# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Searchable dropdowns (`SearchSelect`) for locomotive and train number on operation entry rows; the list shows only matching results as you type.
- Free-text search (train or locomotive number) and a train-number filter on the turnarounds list; the Excel export honours them.
- Locomotive downtime statistics on the dashboard: time each locomotive spent off routes (neither on a turnaround nor in ТОИР) within the selected range.
- `CHANGELOG.md` — every update appends here.

### Changed
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
