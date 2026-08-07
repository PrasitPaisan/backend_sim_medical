# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A pharmacy dispensing automation console for a hospital. It is **not** a physical/3D robot simulator — it's the web software layer that receives prescriptions from a hospital HIS, tracks them through a fixed pipeline of dispensing stations, and dispatches them to a physical dispensing "cobot" over a SOAP/XML endpoint. Code comments and sample/seed data are frequently in Thai (built for a Thai hospital).

Two independent npm projects, not a monorepo — no shared tooling or workspace config ties them together:

```
Sim_web/
├── databaseStructure.txt   # reference schema dump (live DB is Supabase Postgres) — may drift, verify with \d before relying on it
├── backend-sim/            # NestJS API (raw pg, no ORM)
└── frontend_sim/           # React + Vite + antd SPA
```

## Commands

Run each from its own subdirectory (`backend-sim/` or `frontend_sim/`) — there is no root-level script runner.

**backend-sim** (NestJS, port from `.env` `PORT`, defaults to 3000 in `.env.example` but this project's own `.env` uses 3001):
- `npm run start:dev` — dev server with watch/reload
- `npm run build` — `nest build`
- `npm run lint` — eslint --fix over `src,apps,libs,test`
- `npm run test` — Jest unit tests (`*.spec.ts` under `src`)
- `npm run test -- <pattern>` — run a single test file/suite by name pattern
- `npm run test:e2e` — e2e tests (`test/jest-e2e.json`)
- `npx tsc --noEmit -p .` — typecheck without emitting

**frontend_sim** (Vite + React):
- `npm run dev` — dev server (Vite will bump the port if 5173 is taken — check its output)
- `npm run build` — `tsc -b && vite build` (typecheck is part of the build)
- `npm run lint` — oxlint
- `npx tsc -b` — typecheck only

There is no frontend test runner configured (no test script, no test framework installed).

### Database

Postgres, accessed via a `pg.Pool` directly (no ORM/migrations tool, no seed script for prescriptions/medicines/departments — `backend-sim/seed-baskets.sql` only seeds the basket pool). **Current backend-sim/.env points at a local Docker Postgres container** (`DB_HOST=localhost`, `DB_PORT=5433`, `DB_NAME=dbmedicalmock`, `DB_SSL=false`), restored from a Supabase dump (see `backend-sim/docker/`) — the `.env` also has a commented-out Supabase block (`DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com`, `DB_SSL=true`) kept for reference; swap back to it by commenting the Docker block and uncommenting the Supabase one. Since there's no `psql` client available in some environments, ad-hoc queries/migrations can be run with a one-off `node -e` script using the already-installed `pg` package and `dotenv`, connecting via `createPool` (`backend-sim/src/common/db.util.ts`).

**The local Docker DB is disposable** — schema changes and bulk `UPDATE`/`DELETE` are safe to run without the same caution a live shared instance would need. If `.env` is ever swapped back to the commented-out Supabase block, treat that as a live shared instance again and confirm with the user before running schema changes or bulk mutations.

`databaseStructure.txt` is a reference schema but can drift from what's actually deployed (e.g. `prescription_header.pre_type` exists live but isn't in that file) — check with `\d <table>` (or query `information_schema.columns`) before assuming a column's shape. It has been kept in sync with recent additions (`medicine_dictionary.med_unit_capacity`/`sync_status`/`desc_code`, `department_dictionary.sync_status`, `prescription_header.nzp360_sent_at`/`priority`), but still verify before relying on it for anything not mentioned here.

Both apps read connection/target config from their own `.env` (see `.env.example` in each folder). Key backend vars: `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/DB_SSL`, and `MACHINE_PATH_RB1500`/`MACHINE_PATH_NZP360` — the two physical dispensing machines' SOAP endpoints (see `getMachineTarget` in `backend-sim/src/common/soap.util.ts`); missing either does not crash the server, but any send-to-that-machine call will report failure. Frontend reads `VITE_API_BASE_URL` (must match the backend's actual `PORT`) and `VITE_API_TIMEOUT`.

## Architecture

### Two-level state: prescription vs. basket

Prescription-level and station-level progress are tracked in **different tables** — don't conflate them.

`prescription_header.pre_state` (smallint) has 4 values:

| pre_state | Meaning |
|---|---|
| -1 | Received (default on insert), not yet sent |
| 0 | In progress (sent to machine, basket bound) |
| 1 | Complete |
| 2 | Eliminated — cancelled on the real machine via RB1500's `ExecEliminatePrescription` (`POST /machine/eliminate-prescription`); releases the bound basket back to the pool and hides the prescription from every queue view. See `BasketsService.eliminateByPrescriptionHisId`. |

Station-level progress lives on `basket.station_status` (int) instead — baskets are a **fixed, reusable physical pool** (seeded via `backend-sim/seed-baskets.sql`, currently `BASKET-01`..`BASKET-40`), bound to a prescription only while it's in progress. The canonical station mapping (defined once in `frontend_sim/src/lib/stations.ts` as `PIPELINE_STATIONS`, the single source of truth for both pages that visualize it) is:

| station_status | Meaning |
|---|---|
| 0 | Free / not bound to any prescription |
| 1 | Sent to machine |
| 2 | Box Dispensing Machine done |
| 3 | Manual Dispensing Point done |
| 4 | Loose Tablet Dispensing Machine done |
| 5 | COBOT done |
| 6 | Arrived at Recheck Point — basket physically reached the recheck area (mapped from real `QueryBasketPosition`'s `Position=6` "End"), NOT yet pharmacist-verified. Does not trigger completion. |
| 7 | Pharmacist Recheck done → triggers completion (`RECHECK_STATION_STATUS` in `baskets.service.ts`) |
| 8 | Call Patient for Pickup — Monitor Queue's data source (`station_status = 8`) |
| 9 | Patient Received Medicine (`FINAL_STATION_STATUS`) → releases the basket back to the pool

`BasketsService` (`backend-sim/src/baskets/baskets.service.ts`) owns all basket state transitions:
- `assignBasket` — atomically claims a free basket (`FOR UPDATE SKIP LOCKED`) and sets it to `station_status = 1`. Called by `PrescriptionsService` *before* a prescription is dispatched to the machine — binding happens first, dispatch second.
- `releaseBasket` — undoes a binding (`prescription_id = NULL`, `station_status = 0`) when the machine rejects a prescription after a basket was already claimed for it. A failed send must never leak a basket.
- `advanceStationByPrescriptionHisId` — enforces sequential progression (`station_status` must equal `newStatus - 1`, checked in the `WHERE` clause so it's atomic) and, on reaching the final station (6), transactionally flips the prescription to complete (`pre_state = 1`) *and* releases the basket back to the pool in one go.

Backend endpoints:
- `GET /prescriptions?page=&pageSize=` — `pre_state = -1` (received, ready to send), paginated — Prescription Managements. Stat prescriptions (`prescription_header.priority = 1`) always sort first within the page — see "Prescription priority" below.
- `GET /prescriptions/ids?limit=` / `POST /prescriptions/by-ids` — bulk-select support: `ids` returns just ids in the same order as the list above (for "select first N" across pages without pulling full medicine details), `by-ids` backfills full data for a specific id set before a send.
- `GET /prescriptions/tracking` — `pre_state = 0` prescriptions **joined** to their bound basket's `station_status`/`basket_id` — Process Tracking.
- `POST /prescriptions/preview-send` — builds the exact SOAP body(ies) `send-batch` would transmit for each prescription (both RB1500 and NZP360), **without** binding a basket, calling the machine, or writing to the DB. See "SOAP preview-before-send pattern" below.
- `POST /prescriptions/send-batch` — for each prescription: binds a basket first, dispatches to **both** machines, and only on RB1500's acceptance (and NZP360's acceptance-or-skip) flips `pre_state` to 0; otherwise releases the basket so it isn't wasted. Partial batch failures are normal — check `results`/`updatedIds` in the response, not just the top-level `ok`.
- `POST /prescriptions/preview-send-rb1500` / `send-rb1500` and `POST /prescriptions/preview-send-nzp360` / `send-nzp360` — split-send counterparts that hit exactly one machine. See "Split-send" below.
- `POST /prescriptions/advance-station` — the basket-based replacement for the old `advance-state`; looked up by `prescriptionhisid`, delegates to `BasketsService.advanceStationByPrescriptionHisId`.

### Split-send: RB1500 and NZP360 independently, in either order

The combined `send-batch` flow dispatches to both machines together, but a pharmacist may want to send NZP360 first (so loose-tablet prep starts before the basket physically arrives) and RB1500 later, or vice versa — `prescription_header.nzp360_sent_at` (timestamp, nullable) tracks NZP360 confirmation **independently** of `pre_state`/`basket_id`, which only ever track RB1500's conveyor entry:
- `sendRb1500Only`/`POST /prescriptions/send-rb1500` — binds a basket, dispatches to RB1500 only, flips `pre_state` to 0 on success. Identical basket/failure semantics to the combined flow, just without ever calling NZP360.
- `sendNzp360Only`/`POST /prescriptions/send-nzp360` — dispatches to NZP360 only (filtered to that prescription's `dispense_type = 'nzp360'` medicines), **never** binds a basket or touches `pre_state` — a prescription sent to NZP360 alone hasn't entered the conveyor yet, so it correctly stays out of Process Tracking until RB1500 is sent too. Idempotent: a prescription with `nzp360_sent_at` already set is reported `ok` without re-hitting the machine, so a repeat click can't double-dispense. Skips (reports a per-item error, not a batch failure) any prescription with no `nzp360`-dispensed medicines.
- The combined `sendBatchToMachines` checks `nzp360_sent_at` before building its NZP360 batch — if already set, that prescription is treated as "no NZP360 medicines to send" for that call, so using split-send and the combined button together can never double-dispense.
- Frontend: `PrescriptionPage.tsx` has **one** confirm modal for all three send shapes, with a `Segmented` target selector (`Both` / `RB1500 only` / `NZP360 only`) — opened at `Both` by the toolbar's batch "Send" button (multi-select), or preset to a single machine by each card's "Send NZP360 only"/"Send RB1500 only" buttons, but switchable either way once open. Switching the target re-fetches just that machine's preview against the same resolved prescription list.
- `BasketsService.resetAll()` (the "Reset Simulation" button) also clears `nzp360_sent_at` — a prescription that was only split-sent to NZP360 must come back genuinely fresh, not still flagged as sent.

### COBOT spacing: dispatch-order interleaving, not real-time locking

The physical COBOT station can't dispense two baskets back-to-back. The backend only learns a basket cleared a station *after the fact* (`advance-station`), and stations can be skipped (`advanceStationByPrescriptionHisId` allows non-sequential jumps), so there's no reliable way to detect "a basket is about to reach COBOT" ahead of time to gate on. The one lever fully under this backend's control is **dispatch order** — `interleaveCobotPrescriptions()` (`prescriptions.service.ts`) reorders a batch so prescriptions with a `dispense_type = 'cobot'` medicine are spread evenly across it (e.g. 2 cobot prescriptions among 20 land at positions 10 and 20 — `round(i * n / c)` for `i = 1..c`), rather than sent consecutively or clustered, so several non-cobot prescriptions are physically processed on the conveyor between any two cobot ones.

This runs at the very top of all four RB1500-facing entry points — `sendBatchToMachines`, `sendRb1500Only`, and their preview counterparts `buildPreviewForBatch`/`buildPreviewForRb1500` — so the preview XML's `<prescription>` order always matches what's actually dispatched. It does **not** apply to NZP360-only sends (`sendNzp360Only`/`buildPreviewForNzp360`), since COBOT is purely an RB1500-conveyor concern.

**Known limitation (accepted for now):** this only spaces cobot prescriptions out *within a single dispatch call* — it has no memory of a cobot basket still in flight from an earlier, separate send, so two sends done back-to-back could still place cobot baskets close together. Extending this to account for in-flight baskets from prior sends would need real-time gating against `basket.station_status`, which was deliberately deferred.

### Test data for conveyor/COBOT routing coverage: TCV001-TCV015

`prescription_header` rows with `patientname` ending `TCV001` through `TCV015` (`prescriptionhisid` values `MOCK1784910428854`..`MOCK1784910428868`) are a deliberate exhaustive-combination test matrix over the 4 dispensing machines (Manual, RB1500, NZP360, COBOT) — every single machine alone, every pair, every triple, and the full 4-way combo, one prescription each. Each row's `prescriptionhint` states its combination in plain text (e.g. `"Conveyor routing: RB1500 + COBOT"`), confirmed against `prescription_detail`/`medicine_dictionary.dispense_type` live in the local Docker DB:

| patientname suffix | prescriptionhisid | dispense_type(s) covered |
|---|---|---|
| TCV001 | MOCK1784910428854 | rb1500 |
| TCV002 | MOCK1784910428855 | manual |
| TCV003 | MOCK1784910428856 | nzp360 |
| TCV004 | MOCK1784910428857 | cobot |
| TCV005 | MOCK1784910428858 | manual, rb1500 |
| TCV006 | MOCK1784910428859 | nzp360, rb1500 |
| TCV007 | MOCK1784910428860 | cobot, rb1500 |
| TCV008 | MOCK1784910428861 | manual, nzp360 |
| TCV009 | MOCK1784910428862 | cobot, manual |
| TCV010 | MOCK1784910428863 | cobot, nzp360 |
| TCV011 | MOCK1784910428864 | manual, nzp360, rb1500 (no COBOT) |
| TCV012 | MOCK1784910428865 | cobot, manual, rb1500 (no NZP360) |
| TCV013 | MOCK1784910428866 | cobot, nzp360, rb1500 (no Manual) |
| TCV014 | MOCK1784910428867 | cobot, manual, nzp360 (no RB1500) |
| TCV015 | MOCK1784910428868 | cobot, manual, nzp360, rb1500 (full loop, all 4) |

All 15 were `pre_state = -1` (received, not yet sent) as of 2026-08-07, so ready to send/track through every pipeline station without needing new mock data. A separate, unrelated set (`TCV016`-`TCV035`, `MOCKPOS-32`..`MOCKPOS-51`) simulates realistic multi-drug/multi-day orders with COBOT lines interspersed for routing-coverage spot checks (not an exhaustive combination matrix like TCV001-015) — `TCV035` was already `pre_state = 2` (eliminated) as of the same check.

Distinct from the `TC-CB-RFID-01..15`/`TC-CB-CONC-05..09` prescriptions that exist only inside `backend-sim/docker/dump.sql` (an older snapshot) but are **not** present in the currently running local Docker DB — don't confuse the two naming schemes; TCV001-015 is the one that's actually live and testable right now.

### Frontend derives UI state from station_status, never stores it separately

`frontend_sim/src/lib/stations.ts` is the only place that maps a raw station number to a label/status (`done`/`active`/`pending`). Two pages read from it:
- **Process Tracking** (`pages/ProcessTrackingPage.tsx` + `components/tracking/`) shows the 4 dispensing stations + a synthetic "Pending" (station 1) and "Completed" (station 6) node, derived from `STATIONS` (a slice of `PIPELINE_STATIONS`), fed `station_status` from `useTrackedPrescriptions`.
- **Machine Sim** (`pages/MachineSimPage.tsx` + `components/machinesim/`) shows one action card per pipeline step and calls `advance-station` directly by HIS id — it exists purely to simulate machine callbacks for testing, without a real machine attached.

If the pipeline ever gains/loses a station, or the numbering changes, `lib/stations.ts` is the only file that needs to change for both pages to stay correct.

### Shared card components

`PrescriptionBaseCard` (header/meta layout) and `PrescriptionDetails` (medicine list) are shared building blocks used by both `PrescriptionCard` (Prescription Managements) and `TrackingCard` (Process Tracking) — extend these rather than duplicating card markup when adding a new prescription-card variant.

### Receiving prescriptions

`POST /prescriptions/receive` is the HIS ingestion endpoint. It inserts directly into `prescription_header` (+ `prescription_detail` for each medicine) at `pre_state = -1` inside a transaction per prescription, with `ON CONFLICT (prescriptionhisid) DO NOTHING` (duplicates by HIS id are silently skipped, not errored). There is intentionally no separate in-memory queue anymore — the database is the only state store, so anything inserted here is immediately visible to every other endpoint.

### SOAP structures: what's confirmed vs. still guessed

RB1500's `SendPrescription` payload does **not** include `<destination>` or `<basket_id>` — an earlier version of this code guessed a `<basket_id>` tag was needed so the machine would know which basket to dispense into, but a real captured request confirmed the machine is never told the basket at all; basket tracking is purely internal to this backend (`BasketsService`). Don't reintroduce either field without new evidence.

Confirmed field-by-field against real captured requests/responses: RB1500 `SendMedicine`, RB1500 `SendPrescription`, RB1500 `QueryMachineState` (operation name confirmed via the machine's own SOAP fault — it was previously miscoded as `GetMachineStatus` and rejected outright). All of these use a SOAP 1.2 envelope (`soap12:Envelope`, `http://www.w3.org/2003/05/soap-envelope`) with the operation's action folded into the `Content-Type` header (`buildSoapContentType` in `backend-sim/src/common/soap.util.ts`) rather than a separate `SOAPAction` header — every RB1500 operation ended up on this same convention, so default to it for any new RB1500 operation.

Still unconfirmed against the real machine (sample envelopes/param specs only, may need correction): NZP360's `SendDeptInfo`/`SendPrescription`/`SendMedicine`, and RB1500's `QueryBasket`/`UpdateCOBOTTask`. If one of these starts failing with a machine-side "unrecognized operation" fault (as `QueryMachineState` did), suspect the operation name/namespace first, not just the field-level structure. `QueryCOBOTTask`, `QueryBasketPosition`, and `QueryInventory` have since been fired against the real machine and got real responses (operation name/envelope accepted in all three cases) — `QueryInventory` specifically returned `Result=3`/"No medicine information" since this dev unit has no stock data loaded, so its `InventoryItem` field parsing is only verified against the doc's sample response, not a real populated one.

**`QueryBasket`** (RB1500, `queryBasketFromRB1500`/`GET /machine/query-basket`) — despite the name, isn't purely read-only: `str` is the prescriptionhisid ("unique number of prescription in HIS"), `type` doubles as a lighting command — `1` light the basket blue, `2` green, `3` red, anything else = plain query with no lighting side effect. Confirmed against a real error-case capture (`Result=-1`, `Error="PrescriptionID not exist!"` when `str` isn't a prescriptionhisid RB1500 recognizes) — `DataTable`'s fields mirror `prescription_header` columns almost 1:1 (`patient_name`→`patientname`, `fetch_window`→`fetchwindow`, `delete_flag`→`delete_flag`, `basket_Id`→`basket_id`, `finish_time`→`finish_time`) and are parsed out individually into the response, same as `QueryCOBOTTask`'s flat fields. Frontend: **Query Basket** page (`pages/QueryBasketPage.tsx`) — pharmacist picks from currently in-progress prescriptions (`pre_state = 0`, via the same `/prescriptions/tracking` data `useTrackedPrescriptions` already polls for Process Tracking) rather than typing a prescriptionhisid by hand, picks the color/type freely, then goes through the usual preview-before-send confirm modal. Verified live against the real machine: a mock test prescription's `str` wasn't recognized by RB1500's basket system, correctly surfacing the machine's own error text (`篮子号不存在!` — "basket number does not exist").

**`QueryBasketPosition`** (RB1500, `queryBasketPositionFromRB1500`/`GET /machine/query-basket-position`) — bulk query, unlike `QueryBasket`'s one-prescription-at-a-time: returns every basket RB1500 has moved within the last `withinTime` seconds (default/spec-recommended 300s), each with `BasketId`/`PreNo`/`SplitNo`/`Position`/`LastTime`. `Position` (0-6: Idle/Binding card/Manual replenishment/NZP360 dispensing/T type exit/COBOT dispensing/End) is RB1500's own numbering — **deliberately never mapped onto `basket.station_status`**, since they diverge at 2/3/4 (ours: box/manual/loose-tablet done; theirs: manual replenishment/NZP360 dispensing/T-type exit) and there's no reliable translation between the two schemes. `extractRepeatedBlocks()` (new helper in `soap.util.ts`, alongside `extractTagValues`) splits the nested `<BasketItem>` list into per-item blocks first, so each item's fields can be correlated correctly (`extractTagValues` alone only returns one flat list across the whole fragment, which would silently misalign fields across items). Confirmed live against the real machine (`Result=0`, empty `<BasketList />` when nothing's moved recently).

Frontend: **Process Tracking** gained a **"Fetch live position"** button (`ProcessTrackingPage.tsx`) — read-only, so no preview-confirm modal (matching `QueryReadyPrescriptionsCard`'s pattern, not the mutating-call preview pattern). One bulk fetch on click, matched against each visible tracked prescription by `PreNo == prescriptionhisid` client-side. The result renders as a **separate plain-text line** ("Live from machine: NZP360 dispensing position") below the existing simulated `StationStepper` — not merged into it, not replacing it. This is intentional: the simulated stepper (driven by `station_status`, advanced via Machine Sim) remains the primary way to test the pipeline without real hardware; the live line is supplementary real-world telemetry shown alongside it, using RB1500's own `Position` labels (`lib/basketPosition.ts`) rather than borrowing `lib/stations.ts`'s labels.

In addition, `mapPositionToStationStatus()` (`lib/basketPosition.ts`) gives a **best-effort, partial** mapping from real `Position` to `station_status`, used to auto-advance the simulated stepper right after a live fetch (via the existing `advance-station` endpoint — forward-only, same guard as everywhere else): `0`/`1` (Idle/Binding card) → `2`, `2` (Manual replenishment) → `3`, `3` (NZP360 dispensing) → `4`, `5` (COBOT) → `5`, `6` (End) → **`6`** (Arrived at Recheck Point — deliberately not `7`, since arriving physically is not the same as pharmacist verification). `Position=4` ("T type exit") has no mapping at all and stays display-only, since there's no equivalent station.

**`QueryInventory`** (RB1500, `queryInventoryFromRB1500`/`GET /machine/query-inventory`) — real-time medication stock query. Input is `Root/Body/MachineId/Operation/Timestamp` (CDATA in `<tns:str>`, same shape as `QueryMachineState`/`QueryCOBOTTask`/`QueryBasketPosition`); `Operation`: `1` query shortage inventory, `2` query inventory summary, `3` query inventory details. Response's `InventoryList/InventoryItem[]` parsed the same way as `QueryBasketPosition`'s `BasketItem[]` (via `extractRepeatedBlocks`) — `LocationCode`/`MedHisId`/`MedName`/`MedSpecs`/`MedFactory`/`MedUnit`/`CurrentQuantity`/`MaximumQuantity`/`ShortagePercentage`/`IsShortage`. Confirmed the operation name is accepted by the real machine (no "unrecognized operation" fault), though this dev unit currently has no medicine data loaded (`Result=3`, "No medicine information") — item-field parsing verified against the doc's sample response instead. Frontend: `RB1500InventoryPanel` (`components/inventory/`), filling in what was previously an empty Machine Inventory page placeholder — Machine ID + Operation controls, a 3-tile stat row (SKUs / Low Stock / OK, reusing `machine-sim-card`'s existing danger/positive colors rather than a new palette), and a sortable Table (shortage-first by default). Named for RB1500 specifically (not a generic "InventoryPanel") since NZP360 will need its own panel later with an unconfirmed, possibly different field set — no Tabs shell built preemptively for that.

### Pharmacist Recheck: closing the loop between QueryReadyPrescription and completion

Per the RSS OPD System Interface doc's §1.1 workflow, `QueryReadyPrescription` (detect dispensing done) is meant to lead into `UpdateReadyPrescriptionState` (ack) and then `ExecEliminatePrescription` (after the patient actually picks up the medicine) — three calls that previously existed only as disconnected manual buttons across Machine Sim, with **no code path connecting any of them**, and Monitor Queue driven purely by this backend's own `station_status` rather than anything RB1500 actually reports. The **Pharmacist Recheck** page (`PharmacistRecheckPage.tsx`) is a first pass at closing this: fetches ready prescriptions (`QueryReadyPrescription`), lets the pharmacist select one, then offers three actions:
- **Confirm Dispensing** (solo) — `UpdateReadyPrescriptionState` via a **new** `POST /machine/confirm-recheck` endpoint (reuses the same SOAP builder as Machine Sim's existing "Confirm Dispensing Complete" card, but is a *separate* endpoint) that also sets `pre_state = 1` on success, via `BasketsService.confirmRecheckByPrescriptionHisId` — without touching the basket. Kept separate from `/machine/update-ready-state` deliberately: that one is Machine Sim's machine-only test action and must keep doing nothing to the database.
- **Eliminate (Release Basket)** (solo) — 100% reuse of the existing `/machine/eliminate-prescription` endpoint (`pre_state = 2`, basket released).
- **Confirm + Eliminate (Full Process)** — fires both real SOAP calls in sequence in one click (previewing both XML bodies together first), standing in for the real end-to-end pharmacist workflow. Verified live against the real machine: both calls succeeded, `pre_state` ended at `2` and the basket was confirmed released back to the pool.

**Known remaining gap:** "Confirm Dispensing" only sets `pre_state = 1` — it does **not** advance `station_status` to `8`, so a confirmed prescription still won't appear on Monitor Queue automatically (still requires a manual "Pass" at Machine Sim's station 7→8). The doc's §1.1 says the ready-detection step should "put the patient information on the screen" — this isn't wired yet.

**`QueryCOBOTTask`** (RB1500, `queryCobotTaskFromRB1500`/`GET /machine/query-cobot-task`) — lets a physical COBOT unit ask RB1500 which dispensing task to work on next. Same inner-document shape as `QueryMachineState` (`Root/Body/...`, declared `utf-16`, CDATA-wrapped inside a single `<tns:str>`), plus a `MachineId`/`CobotId`/`Timestamp` body. The response's `DataTable` (`TaskNo`/`PreHisId`/`PreId`/`BasketId`/`SplitId`/patient fields/`MedicineList`) is only partially parsed — `TaskNo`/`PreHisId`/`PreId`/`BasketId`/`SplitId` are pulled out individually (same as `QueryMachineState`'s `MachineState`/`MachineMessage`), the rest (patient fields, nested `MedicineList`/`MedicineItem`) is left in the response's `innerXml` for the caller to read, since `extractTagValues` only handles flat repeated tags cleanly — same tradeoff `QueryBasket` already makes. No frontend UI wired up yet (backend-only, preview + real call both exist — `GET /machine/query-cobot-task/preview`).

**`UpdateCOBOTTask`** (RB1500, `updateCobotTaskOnRB1500`/`POST /machine/update-cobot-task`) — `QueryCOBOTTask`'s write counterpart: tells RB1500 a COBOT finished (or failed) the task it queried, which is what actually lets RB1500 carry that basket onward past the COBOT station. Same inner-document shape (`Root/Body/...`, `utf-16`, CDATA in `<tns:str>`), body is `MachineId`/`CobotId`/`TaskNo`/`TaskState`/`TaskErrorId`/`TaskMessage`/`Timestamp`. `TaskState`: `0` Unprocessed new task, `1` Received, `2` Process complete, `3` Process failed. Response carries no `DataTable`, just `Result`/`Error` — same shape as `ExecEliminatePrescription`. Not wired into any database state yet (machine-only call, same as `ExecEliminatePrescription`/`UpdateReadyPrescriptionState`); no frontend UI wired up yet either.

### NZP360 (ATDPS integration doc): Token header, QueryInventory/QueryMachineState/QueryPackagedInfo

Per the ATDPS integration doc, NZP360 (unlike RB1500) requires a `Token` header on every call, obtained from a separate login call whose spec isn't documented anywhere in that file. `getMachineToken()`/`buildNzp360Headers()` (`backend-sim/src/common/soap.util.ts`) build this header set for every NZP360 call — `MACHINE_TOKEN_NZP360` in `.env`/`.env.example` is currently an empty placeholder, to be filled in once the login endpoint is documented. The envelope itself deliberately still uses RB1500's confirmed SOAP 1.2 convention (folded-action `Content-Type`, no separate `SOAPAction` header) rather than the doc's SOAP 1.1 PostMan examples — ASMX services normally answer both SOAP versions, and RB1500 (same underlying `.asmx` server type) is already confirmed working with 1.2, so this was the lower-risk choice; only fall back to a SOAP 1.1 rewrite if live testing shows 1.2 failing for NZP360 specifically.

**`QueryInventory`** (NZP360, `queryInventoryFromNZP360`/`GET /machine/query-inventory-nzp360`) — same `Root/Body/MachineId/Operation/Timestamp` input and `InventoryList/InventoryItem` output shape as RB1500's `QueryInventory` (see above), just a different envelope namespace (`RssServer`). **Confirmed live against the real machine** — returned real populated inventory data (not just a `Result=3` placeholder like RB1500's dev unit), so its field parsing is verified against actual data, not just the doc's sample. Frontend: `MachineInventoryPage.tsx` now has an antd `Tabs` shell (`RB1500` / `NZP360`), both backed by the same generalized `InventoryPanel` component (`components/inventory/InventoryPanel.tsx`, replacing the RB1500-only `RB1500InventoryPanel.tsx`) parameterized by `machine`.

**`QueryMachineState`** (NZP360, `getMachineStatusFromNZP360`/`GET /machine/status-nzp360`) — same `Root/Body/MachineId/Timestamp` input as RB1500's `QueryMachineState`, but the doc's response additionally carries a `PartList`/`PartItem` breakdown (`PartName`/`PartId`/`PartState`/`PartMessage`) that RB1500's doesn't have, parsed with `extractRepeatedBlocks` the same way `QueryInventory`'s `InventoryItem` list is. **Rejected live by the real machine** with a SOAP fault — `无法识别操作"RssServer/QueryMachineState"` ("unrecognized operation") — even though `QueryInventory` against the same machine, moments earlier, was accepted and returned real data. Per the existing "suspect the operation name/namespace first" guidance (see `QueryBasket`/`UpdateCOBOTTask` above), this means either the doc's function name is wrong for this machine build, or this operation simply isn't implemented on this dev unit yet — needs following up with whoever provided the ATDPS doc before trusting the field-level shape further. Frontend: `MachineStatusCard.tsx` was generalized to take a `machine` prop (`'RB1500' | 'NZP360'`) and render an optional `parts` list; Machine Sim now shows one card per machine side by side.

**`QueryPackagedInfo`/`UpdatePackagedInfo`** (NZP360, `queryPackagedInfoFromNZP360`/`GET /machine/query-packaged-info-nzp360` and `updatePackagedInfoOnNZP360`/`POST /machine/update-packaged-info-nzp360`) — play the same role as RB1500's `QueryReadyPrescription`: detect which pouches NZP360 has finished packaging (`PackagedList/PackagedItem`, each with a nested `MedList/PackagedMedItem`, parsed the same nested-`extractRepeatedBlocks` way `QueryBasketPosition`'s items are), then let the pharmacist acknowledge/filter specific pouches by `PackId` via `UpdatePackagedInfo` (response carries no `DataTable`, just `Result`/`Error`, same shape as `ExecEliminatePrescription`). **Both rejected live by the real machine** with the same "unrecognized operation" SOAP fault as `QueryMachineState` above (`无法识别操作"RssServer/QueryPackagedInfo"` / `..."RssServer/UpdatePackagedInfo"`). Neither is wired into any database state (machine-only calls, matching `ExecEliminatePrescription`/`UpdateReadyPrescriptionState`'s pattern). Frontend: new **Packaged Pouches** page (`pages/PackagedPouchesPage.tsx`) — fetch, multi-select pouches via checkbox, then the usual preview-before-send confirm modal for `UpdatePackagedInfo`.

**`SendMedicine`/`SendDeptInfo`/`SendPrescription`** (NZP360) — all three **confirmed live against the real machine** after the Token-header fix above (HTTP 200, `ok: true`, no envelope/field changes needed beyond what the doc already specified): `SendDeptInfo` accepted department 701 (flipped its `sync_status` to `synced`), `SendMedicine` accepted a real NZP360-dispensed medicine row, and `SendPrescription` (via `send-nzp360`) accepted a mock test prescription's NZP360-dispensed medicine line. So the pattern across this whole NZP360 batch is: every **Send*** write call and `QueryInventory` work as documented; every **Query/UpdatePackagedInfo** and `QueryMachineState` call is rejected by this dev unit with "unrecognized operation" — worth flagging to whoever maintains the ATDPS doc/machine firmware, since the field-level shapes for the rejected ones are otherwise already built exactly to spec and have nothing left to fix on this end without new information.

Deliberately deferred per explicit instruction: NZP360's **Nursing Interface** (`Nursing`/`NursingCode`, doc §3.4) — not implemented.


**`medstoremachine`** (RB1500 `SendMedicine` field, confirmed) is a numeric code for which physical machine a medicine is dispensed by: `0` = manual, `1` = RB1500, `2` = NZP360, `3` = COBOT. It's derived, not stored — `mapDispenseTypeToStoreMachine()` in `backend-sim/src/medicines/medicines.service.ts` computes it from the existing `medicine_dictionary.dispense_type` column via `DISPENSE_TYPE_TO_STORE_MACHINE`. Because it's computed fresh at XML-build time rather than persisted, this mapping applies retroactively to every existing medicine/prescription the next time `SendMedicine` is actually called — no data migration needed when the codes change. This field is also why RB1500's conveyor can route baskets correctly: RB1500 must learn every medicine's `medstoremachine` (via `SendMedicine`) *before* it can decide, station by station, which junction to divert a basket into — that's why `PrescriptionsService`'s RB1500 `SendPrescription` call is unconditional (always fires with the full drug list) while NZP360's is conditional on NZP360-dispensed medicines existing. Don't make RB1500's call conditional — it needs the complete picture to control the belt, not just the medicines it personally dispenses.

**`desc_code`** (RB1500 `SendMedicine` field, per RB1500's API spec) is the medicine's electronic tracking code(s) — each code is 7 digits, multiple codes joined with `|`. Unlike `medstoremachine` above, this **is** stored as-is (`medicine_dictionary.desc_code`, free text, not validated/split server-side) rather than derived, since there's no other column it could be computed from. Editable via the "Tracking Code (desc_code)" field in `MedicineForm`'s RB-1500-only section.

**`priority`** (RB1500 `SendPrescription` field, header-level) takes a value `0`-`9`, only `0`-`4` defined so far: `0` Vending machine, `1` Stat order, `2` New order, `3` Discharge order, `4` Continue order. Stored on `prescription_header.priority` (default `2`), one code per prescription — sent once per `<prescription>` block, **not** per medicine. See "Prescription priority" below for why this is a separate concept from `prescription_detail.priority`.

**`ORDER_DRUG`** (NZP360 `SendPrescription`'s `DrugInfo`) is confirmed to be the drug's **1-based sequential position within the prescription's drug list** (`1, 2, 3, ...`) — not the medicine's HIS id (that's the separate `DRUG_CODE` field). It's computed fresh at XML-build time as `index + 1` over the `details` array (`buildSoapEnvelopeForSendPrescriptionNZP360` in `backend-sim/src/prescriptions/prescriptions.service.ts`), never stored in the DB, so no data migration was needed when this was fixed. Because the ordering depends entirely on array order, the 3 queries that assemble `details` via `json_agg(json_build_object(...))` (in `findAll`/`findByIds`/`findInProgress`) all carry an explicit `ORDER BY pd.id` inside the `json_agg(...)` call — Postgres does not guarantee `json_agg` row order without one, so without it the same prescription could get inconsistent `ORDER_DRUG` numbering across separate preview/send calls. Keep this `ORDER BY pd.id` if you touch any of these queries.

### SOAP preview-before-send pattern

Every "send to a real machine" flow (medicines, departments, prescriptions, and the machine-only actions in Machine Sim) follows the same shape: a `POST .../preview` (or `preview-send`) endpoint builds and returns the *exact* SOAP XML the real send would transmit, by calling the same private `buildSoapEnvelopeFor...` method the real send uses — reusing the builder, not duplicating it, is what guarantees the preview can never drift from what actually goes out over the wire. Preview endpoints never bind a basket, call the machine, or write to the DB.

On the frontend, the corresponding "Send" button doesn't call the machine directly — it first fetches the preview, then opens an antd `Modal` showing the XML (`<pre className="medicine-preview__xml">`) with **Cancel / Copy / Confirm & Send** actions; only "Confirm & Send" triggers the real dispatch. See `MedicineForm`/`AddMedicinePage`, `DepartmentForm`/`AddDepartmentPage`, `PrescriptionPage`'s send-batch flow, and `MachineActionCard` (Machine Sim) for the reference implementations. When adding a new machine-mutating action, follow this same pair (`.../preview` + confirm modal) rather than firing the real call directly from a button click.

### `sync_status`: prepared-but-undispatched vs. machine-confirmed

`medicine_dictionary` and `department_dictionary` both have a `sync_status` column (`'pending'` | `'synced'`, default `'synced'`) that the reference schema documents but is easy to miss:
- **`'synced'`** — the real machine has actually confirmed this row (via a successful `SendMedicine`/`SendDeptInfo` call). This is the only state that existed before `sync_status` was added, hence the column default.
- **`'pending'`** — saved straight to the DB with no machine call at all (`POST /medicines/save`, `POST /departments/save`) — lets a pharmacist prepare data ahead of time (e.g. today, for dispatch tomorrow) without the physical machine needing to be reachable.

The upsert in both services (`MedicinesService.upsertMedicine`, `DepartmentsService.upsertDepartment`) takes an explicit `syncStatus` param and guards against downgrading: the `ON CONFLICT` `SET sync_status = CASE WHEN <table>.sync_status = 'synced' THEN 'synced' ELSE EXCLUDED.sync_status END` means a later `'pending'` save can never regress a row that's already been machine-confirmed. The frontend surfaces this as a Status column/Tag ("Pending" vs "Sent to Machine") in `MedicineList`/`DepartmentList`, and both Add-pages let you reselect existing rows (including pending ones) back into a staging list to actually dispatch later.

### Medicine order quantities: typeunit/hpmtypeunit/boxmaxnum split

RB1500's `SendPrescription`/`SendMedicine` contracts split an order quantity into two fields instead of one flat number, and the relationship between them is easy to get backwards:
- `typeunit` — the *big* dispensing unit (e.g. `box`), `hpmtypeunit` — the *small* unit (e.g. `pill`/`tablet`/`sachet`), `boxmaxnum` — how many small units make up one big unit (all three live on `medicine_dictionary`, keyed by `medicinehisid`/`medicineunit`/`medfactoryname`).
- `medicinenum` (on `prescription_detail`) = quantity in whole `typeunit`s. `medicineheteromorphism` = the leftover quantity in `hpmtypeunit`s that doesn't fill a whole `typeunit`.
- Given a total quantity in `hpmtypeunit`s (e.g. "70 pills", `boxmaxnum = 30`): `medicinenum = floor(70 / 30) = 2`, `medicineheteromorphism = 70 % 30 = 10`.

`frontend_sim/src/lib/quantity.ts` (`splitQuantity`) is the single place this split is computed — `PrescriptionOrderForm` (Prescribe Medicine) uses it live as the pharmacist types a single "Total Quantity" field (autofilling `typeunit`/`hpmtypeunit`/`boxmaxnum` from the picked medicine and showing the computed breakdown), and its "Mockup" button uses the same function rather than hand-rolling random values. `medicinenum` legitimately can be `0` (an order for less than one full box) — don't validate quantity by checking `medicinenum` truthiness; check the total-quantity input instead, the way `PrescriptionOrderForm.handleFinish` does.

**`dosageperunit`/`DOSAGE_PER_UNIT`** (NZP360's `DrugInfo`, unrelated to the RB1500 split above) is confirmed to be a fraction of `dosageunit` per single dose: `1` = a whole tablet, `0.5` = half a tablet. This is a *different* field from `dosage`/`medicinenum` — don't conflate them. `PrescriptionOrderForm`'s "Mockup" button (`randomDosagePerUnit`) generates mostly `1.0` with an occasional `0.5`, matching how real orders are overwhelmingly whole-tablet doses — don't revert to a uniform random fraction (an earlier version did `randomInt(1,5)/10`, which made "half a tablet or less" the common case and was never actually confirmed against real prescribing patterns).

**`repeatindicator`** (`prescription_header`, sent to NZP360 as `<PRE_REPEAT_INDICATOR>`) is confirmed to be **the number of days the order is for** — a plain integer-as-string, not a boolean/flag. This closes the loop on total quantity: `total quantity (hpmtypeunit) = dosage (per administration) × doses/day (parsed from PERFORM_FREQ_DETAIL) × repeatindicator (days)`. `frontend_sim/src/lib/quantity.ts` implements this as `countDosesPerDay` (best-effort frequency-string parser — handles `HH:MM`/`HH-HH`/`HH:MM-HH:MM-...`/`qd`/`qn`, returns `undefined` rather than guessing for anything else, e.g. NULL/PRN, unmapped DB codes like `3601200`, or malformed input) and `computeSuggestedTotalQuantity`. `PrescriptionOrderForm` exposes this as a **"Suggest" button** next to Total Quantity — a convenience the pharmacist can invoke or ignore, not a forced/auto-applied value, since the parser deliberately can't cover every DB usage code. Mock prescriptions in `ATDPS_Master_Test_Cases.xlsx`'s companion DB rows were retroactively corrected to satisfy this formula wherever the frequency was parseable (see `prescription_detail.medicinenum`/`medicineheteromorphism` for TC-M-01..23/POS-01..20) — the 4 rows with unparseable frequency (NULL/PRN, `3601200`, `XYZ123`) were deliberately left alone since those are the intentional edge cases under test.

### Prescription priority: header-level, not derived from medicines

`prescription_header.priority` (smallint, default `2`) is the **sole source** for a prescription's overall priority — the "top priority" list sort (`ORDER BY (ph.priority = 1) DESC, ph.id DESC` in `findAll`/`findIds`) and the priority `Tag` on `PrescriptionBaseCard` both read it directly. This replaced an earlier design that derived a prescription's priority from its most-urgent medicine line (`prescription_detail.priority`, scanning all details for a Stat line) — that derivation function (`getPrescriptionPriority`) has been removed.

Don't confuse the two priority fields — they have different scopes, different numbering, and different purposes, and both are still live:
- `prescription_header.priority` (`frontend_sim/src/lib/orderPriority.ts`, `0` Vending / `1` Stat / `2` New / `3` Discharge / `4` Continue) — one value per prescription, drives RB1500's `SendPrescription` `<priority>` field and the list sort/Tag. Set via `POST /prescriptions/receive` (from the HIS payload or the Prescribe Medicine form's header-level "Priority (order type)" field), defaults to `2` (New order) if not given.
- `prescription_detail.priority` (`frontend_sim/src/lib/priority.ts`, `1` Vending / `2` Stat / `3` New / `4` Continue / `5` Discharge — note the numbering and Continue/Discharge order both differ from the header field) — one value per medicine line, still a real input in `PrescriptionOrderForm`'s per-drug rows and still shown in `PrescriptionDetails`' expandable table, but **no longer used for sorting or the card Tag**.

### Styling

antd components + hand-written BEM-ish CSS classes in `frontend_sim/src/App.css` (e.g. `.prescription-card__header`, `.station-stepper__node--active`). **No Tailwind is installed anywhere in this repo** — don't introduce it for one page/component; it would mean running two styling systems side by side.
