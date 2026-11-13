# Changelog

All notable changes to this project are documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Operation 15 on the Böyük Kəsik → Gardabani route: "Получение перевозочных документов" (Daşıma sənədlərinin alınması / Receipt of transport documents) at Gardabani, required, recorded right after GR passport control (14). The route is now 24 steps. Operation numbers on the outbound leg are whole numbers again: GR customs inspection is 15 → 16, document processing 16 → 17, and the wagon inspection 16.1 → 18. The return leg keeps the sheet numbers 21, 22, 25–28. ТОИР return stays conditional on the ТОИР send. Demo history follows the new numbering. Run `npm run db:seed` to apply.
- Gardabani route: a turnaround opened at Gardabani runs its own 23-step sequence, Gardabani → Böyük Kəsik → Gardabani, mirrored from the Böyük Kəsik one (GR customs/border and locomotive attachment at Gardabani, AZ train number, passport control and customs at Böyük Kəsik, ТОИР back at Gardabani). Operations and turnarounds carry a `route` (`BK` | `GRD`, migration 0008; `seq` is now unique per route). Operators open on their own station's route, admins pick it on the create form. The list, detail page and turnaround export show the route; the dashboard timeline and the monthly journal (page and Excel) are viewed one route at a time; `/admin/operations` lists each route's steps under its own heading. The Gardabani sequence is a draft — `docs/Operations.xlsx` only describes the Böyük Kəsik direction — and is editable at `/admin/operations`. Existing turnarounds stay on the Böyük Kəsik route.
- Train numbers 2680–2688 and 2690–2698 (even, Böyük Kəsik → Tbilisi) in the seeded registry.
- Operation 16.1 at Gardabani: "Технический осмотр вагонов (по необходимости)" — optional, recorded between document processing and departure on the outbound leg.
- Operations carry a display number (`operation_types.display_no`) alongside the ordering key, so the app shows the numbers docs/Operations.xlsx prints — 16.1 for the new step, and 17–28 unchanged for the steps after it even though their ordering keys shifted to 18–29. Turnaround, dashboard, journal and Excel export all read it; the admin catalogue keeps showing the ordering key, since that is what its "conditional on" and "parallel with" inputs refer to.
- User manual at `/manual`, linked from the sidebar for every role: operator sections for everyone, administrator sections for admins. Written in all four languages, illustrated with screenshots of the app in the reader's language (`public/manual/*.{az,ru,en,ka}.webp`), re-shot by `node scripts/manual-shots.mjs`.
- Searchable dropdowns (`SearchSelect`) for locomotive and train number on operation entry rows; the list shows only matching results as you type.
- Free-text search (train or locomotive number) and a train-number filter on the turnarounds list; the Excel export honours them.
- Locomotive downtime statistics on the dashboard: time each locomotive spent off routes (neither on a turnaround nor in ТОИР) within the selected range.
- `CHANGELOG.md` — every update appends here.

### Removed
- Tbilisi: the station and its six operations (sheet numbers 18–23) are off the route, which is now Böyük Kəsik → Gardabani → Böyük Kəsik in 23 operations. The remaining steps keep the numbers the sheet prints (24–28 after Gardabani's departure). The seed retires what it no longer lists: steps and stations nothing refers to are deleted, the rest are deactivated so turnarounds recorded through Tbilisi stay readable, and operator accounts at a retired station are switched off. A turnaround that was waiting on Tbilisi continues at Gardabani.
- Train number parity rule: any number opens a turnaround at either station, and the `wrong_parity` error is gone.
- Train number registry: `train_numbers` table, the `/admin/train-numbers` page and the AZ/GR railway suffix are gone. The train number is now free text typed on the turnaround and on each step that carries one (`turnarounds.train_number`, `turnaround_operations.train_number`, migration 0006 copies the old values across); the list filter dropdown is replaced by the free-text search. Parity (even opens at Böyük Kəsik, odd at Tbilisi) is read from the last digit of the number typed, and a mismatch is reported as `wrong_parity`.
- Locomotive availability guard: any active locomotive can now be recorded on any operation. The dropdown no longer hides locomotives that are on another turnaround or in ТОИР, the server-side `locomotive_busy` check is gone, and so is `getAvailableLocomotives`.
- Train availability guard: a train may now be opened on a turnaround while an earlier one is still unfinished. The create dropdown no longer hides busy trains, the `trainBusy` check is gone from both write paths, and the unique index on (train, cycle date) is dropped — with the number following the route's renumbering, two turnarounds on one date can legitimately share it.

### Changed
- The Gardabani → Böyük Kəsik route is now an exact copy of the Böyük Kəsik → Gardabani route, generated from it in the seed: the same 24 steps, numbers (1–18, 21, 22, 25–28), obligations, fields and links, with only the station names, the AZ/GR authorities and the even/odd train numbers swapped in all four languages. This also adds "Получение перевозочных документов" at Böyük Kəsik (15), and moves ТОИР send (required) and return to Gardabani at the end of the route. Steps that kept their meaning keep their codes, so recorded history stays attached; the two Böyük Kəsik ТОИР steps of the old draft are retired (deactivated where recorded, deleted otherwise). Run `npm run db:seed` to apply.
- Route labels name only the start and far station: "Беюк-Кясик → Гардабани" and "Гардабани → Беюк-Кясик" instead of the full round trip. This applies everywhere they appear: list, detail page, create form, dashboard, journal, admin catalogue and Excel exports.
- Both routes are now real round trips, turning at the far station instead of looping through the retired Tbilisi steps. **Böyük Kəsik → Gardabani → Böyük Kəsik:** the duplicate "Отправление из Гардабани / Прибытие в Гардабани" pair (sheet 17 and 24) is gone; after the wagon inspection Gardabani records the return-train steps the sheet had at Tbilisi: locomotive link (21, optional) and GR train number, odd (22), then departure (25), arrival at Böyük Kəsik (26) and ТОИР (27–28). **Gardabani → Böyük Kəsik → Gardabani:** Böyük Kəsik is the turnaround point, following the sheet's turnaround pattern: ТОИР send (optional), ТОИР return (required once sent), locomotive link (optional), AZ train number for the return train, departure, arrival at Gardabani. ТОИР no longer happens at Gardabani. Both routes stay at 23 steps. The seed retires the replaced steps (deactivated where turnarounds recorded them, deleted otherwise). Demo history follows the new Böyük Kəsik sequence.
- Gardabani opens turnarounds the same way Böyük Kəsik does.
- Stations carry an active flag (`stations.is_active`, migration 0007); inactive ones are hidden from the user, locomotive and journal pickers.
- A deactivated operation no longer takes part in the chronology check or blocks clearing a later step.
- The turnaround now carries whichever train number was assigned last: the number given at Böyük Kəsik is superseded by the reassignment at Gardabani and again at Tbilisi, and the list, dashboard, journal and export follow it. Each operation keeps the number it recorded, so the step rows are the history of the renumbering; clearing the step that assigned the current number falls back to the last one still recorded.
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
