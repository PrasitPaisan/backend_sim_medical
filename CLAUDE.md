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

Postgres, accessed via a `pg.Pool` directly (no ORM/migrations tool, no seed script for prescriptions/medicines/departments — `backend-sim/seed-baskets.sql` only seeds the basket pool). **Current backend-sim/.env points at a remote Supabase Postgres** (`DB_HOST=aws-0-ap-southeast-1.pooler.supabase.com`, `DB_SSL=true`), not a local Docker container — the `.env` also has an older commented-out local-Docker block (`DB_HOST=localhost`, port 5433) from an earlier setup; that's dead config, not a fallback to try first. Since there's no `psql` client available in some environments, ad-hoc queries/migrations can be run with a one-off `node -e` script using the already-installed `pg` package and `dotenv`, connecting with the same `ssl: { rejectUnauthorized: false }` option `createPool` (`backend-sim/src/common/db.util.ts`) uses.

**Because this is a live shared Supabase instance, not a disposable local DB**: treat schema changes (`ALTER TABLE`) and bulk `UPDATE`/`DELETE` as real, and confirm with the user before running them — there's no "just reset the container" escape hatch here.

`databaseStructure.txt` is a reference schema but can drift from what's actually deployed (e.g. `prescription_header.pre_type` exists live but isn't in that file) — check with `\d <table>` (or query `information_schema.columns`) before assuming a column's shape. It has been kept in sync with recent additions (`medicine_dictionary.med_unit_capacity`/`sync_status`, `department_dictionary.sync_status`), but still verify before relying on it for anything not mentioned here.

Both apps read connection/target config from their own `.env` (see `.env.example` in each folder). Key backend vars: `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME/DB_SSL`, and `MACHINE_PATH_RB1500`/`MACHINE_PATH_NZP360` — the two physical dispensing machines' SOAP endpoints (see `getMachineTarget` in `backend-sim/src/common/soap.util.ts`); missing either does not crash the server, but any send-to-that-machine call will report failure. Frontend reads `VITE_API_BASE_URL` (must match the backend's actual `PORT`) and `VITE_API_TIMEOUT`.

## Architecture

### Two-level state: prescription vs. basket

Prescription-level and station-level progress are tracked in **different tables** — don't conflate them.

`prescription_header.pre_state` (smallint) has only 3 values:

| pre_state | Meaning |
|---|---|
| -1 | Received (default on insert), not yet sent |
| 0 | In progress (sent to machine, basket bound) |
| 1 | Complete |

Station-level progress lives on `basket.station_status` (int) instead — baskets are a **fixed, reusable physical pool** (seeded via `backend-sim/seed-baskets.sql`, currently `BASKET-01`..`BASKET-20`), bound to a prescription only while it's in progress. The canonical station mapping (defined once in `frontend_sim/src/lib/stations.ts` as `PIPELINE_STATIONS`, the single source of truth for both pages that visualize it) is:

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
- `GET /prescriptions?page=&pageSize=` — `pre_state = -1` (received, ready to send), paginated — Prescription Managements. Stat-priority line items (`priority = 2`) always sort first within the page.
- `GET /prescriptions/ids?limit=` / `POST /prescriptions/by-ids` — bulk-select support: `ids` returns just ids in the same order as the list above (for "select first N" across pages without pulling full medicine details), `by-ids` backfills full data for a specific id set before a send.
- `GET /prescriptions/tracking` — `pre_state = 0` prescriptions **joined** to their bound basket's `station_status`/`basket_id` — Process Tracking.
- `POST /prescriptions/preview-send` — builds the exact SOAP body(ies) `send-batch` would transmit for each prescription, **without** binding a basket, calling the machine, or writing to the DB. See "SOAP preview-before-send pattern" below.
- `POST /prescriptions/send-batch` — for each prescription: binds a basket first, dispatches to the machine, and only on the machine's actual acceptance (see below) flips `pre_state` to 0; otherwise releases the basket so it isn't wasted. Partial batch failures are normal — check `results`/`updatedIds` in the response, not just the top-level `ok`.
- `POST /prescriptions/advance-station` — the basket-based replacement for the old `advance-state`; looked up by `prescriptionhisid`, delegates to `BasketsService.advanceStationByPrescriptionHisId`.

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

### Styling

antd components + hand-written BEM-ish CSS classes in `frontend_sim/src/App.css` (e.g. `.prescription-card__header`, `.station-stepper__node--active`). **No Tailwind is installed anywhere in this repo** — don't introduce it for one page/component; it would mean running two styling systems side by side.
