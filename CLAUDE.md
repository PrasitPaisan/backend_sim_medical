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
| 6 | Pharmacist Recheck done → triggers completion |

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

Still unconfirmed against the real machine (sample envelopes only, may need correction): NZP360's `SendDeptInfo`/`SendPrescription`/`SendMedicine`, and RB1500's `QueryBasket`. If one of these starts failing with a machine-side "unrecognized operation" fault (as `QueryMachineState` did), suspect the operation name/namespace first, not just the field-level structure.

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
