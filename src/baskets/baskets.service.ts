import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient } from 'pg';
import { createPool } from '../common/db.util';

// Mirrors frontend_sim/src/lib/stations.ts PIPELINE_STATIONS — kept as local
// constants since the two apps don't share code.
// Pharmacist recheck (6) marks the prescription as dispensed/complete, but the
// basket stays bound through two more simulation-only steps: calling the
// patient to pick up (7) and confirming they received it (8) — only then is
// the basket actually released back to the pool.
const RECHECK_STATION_STATUS = 6;
const FINAL_STATION_STATUS = 8;

// A prescription the machine eliminated/cancelled — deliberately distinct
// from -1 (received)/0 (in progress)/1 (complete) so it disappears from
// every existing queue view (Prescription Managements only shows -1,
// Process Tracking only shows 0/1) instead of masquerading as "complete".
export const ELIMINATED_PRE_STATE = 2;

export type AdvanceStationResult =
  | { ok: true; basketId: string; stationStatus: number }
  | { ok: false; reason: 'not_found' }
  | { ok: false; reason: 'no_basket_bound' }
  | { ok: false; reason: 'wrong_state'; currentStatus: number };

export type EliminateResult =
  { ok: true; basketId: string | null } | { ok: false; reason: 'not_found' };

@Injectable()
export class BasketsService implements OnModuleDestroy {
  private pool: Pool;

  constructor(private config: ConfigService) {
    this.pool = createPool(this.config);
  }

  // Joined with prescription info so callers (Machine Sim's per-station
  // basket counts) can show which prescription a basket is currently
  // carrying, not just its bare basket_id.
  async findAll() {
    const res = await this.pool.query(
      `
      SELECT b.*, ph.prescriptionhisid, ph.patientname
      FROM basket b
      LEFT JOIN prescription_header ph ON ph.id = b.prescription_id
      ORDER BY b.basket_id
      `,
    );
    return res.rows;
  }

  // Picks a free basket (prescription_id IS NULL), binds it, and starts it at
  // station_status = 1 ("sent to machine"). FOR UPDATE SKIP LOCKED means two
  // concurrent sends can't grab the same basket. Runs on the caller's
  // transaction client so the caller can roll the whole send back together.
  async assignBasket(
    client: PoolClient,
    prescriptionId: number,
  ): Promise<string | null> {
    const res = await client.query(
      `
      UPDATE basket
      SET prescription_id = $1, station_status = 1, updated_at = NOW()
      WHERE basket_id = (
        SELECT basket_id FROM basket
        WHERE prescription_id IS NULL
        ORDER BY id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING basket_id
      `,
      [prescriptionId],
    );
    return res.rows[0]?.basket_id ?? null;
  }

  // Undoes assignBasket — used when the machine rejects a prescription after
  // a basket was already bound to it, so the basket isn't wasted.
  async releaseBasket(client: PoolClient, basketId: string): Promise<void> {
    await client.query(
      `UPDATE basket SET prescription_id = NULL, station_status = 0, updated_at = NOW() WHERE basket_id = $1`,
      [basketId],
    );
  }

  // Not every prescription visits every station (e.g. a manual-only
  // prescription never touches the box or loose-tablet machines), so this
  // only requires forward progress (station_status < newStatus) rather than
  // exact adjacency — skipping stations that don't apply is expected, not an
  // error. Going backward or re-reporting the same station is still rejected.
  // Reaching the final station also completes the prescription and frees the
  // basket back to the pool, atomically.
  async advanceStationByPrescriptionHisId(
    prescriptionhisid: string,
    newStatus: number,
  ): Promise<AdvanceStationResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const headerRes = await client.query(
        `SELECT id, basket_id FROM prescription_header WHERE prescriptionhisid = $1`,
        [prescriptionhisid],
      );

      if (headerRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }

      const { id: prescriptionId, basket_id: basketId } = headerRes.rows[0];

      if (!basketId) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'no_basket_bound' };
      }

      const updateRes = await client.query(
        `
        UPDATE basket
        SET station_status = $1, updated_at = NOW()
        WHERE basket_id = $2 AND prescription_id = $3 AND station_status < $1
        RETURNING station_status
        `,
        [newStatus, basketId, prescriptionId],
      );

      if (updateRes.rows.length === 0) {
        const currentRes = await client.query(
          `SELECT station_status FROM basket WHERE basket_id = $1`,
          [basketId],
        );
        await client.query('ROLLBACK');
        return {
          ok: false,
          reason: 'wrong_state',
          currentStatus: currentRes.rows[0]?.station_status ?? 0,
        };
      }

      // >= rather than === so pre_state still flips to complete even if a
      // caller jumps straight to a later station (e.g. skips 7) without
      // passing through 6 first.
      if (newStatus >= RECHECK_STATION_STATUS) {
        await client.query(
          `UPDATE prescription_header SET pre_state = 1, updated_at = NOW() WHERE id = $1 AND pre_state <> 1`,
          [prescriptionId],
        );
      }

      if (newStatus === FINAL_STATION_STATUS) {
        await client.query(
          `UPDATE basket SET prescription_id = NULL, station_status = 0, updated_at = NOW() WHERE basket_id = $1`,
          [basketId],
        );
        await client.query(
          `UPDATE prescription_header SET basket_id = NULL WHERE id = $1`,
          [prescriptionId],
        );
      }

      await client.query('COMMIT');
      return { ok: true, basketId, stationStatus: newStatus };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Called after the real machine confirms ExecEliminatePrescription
  // succeeded (see MachineController.eliminatePrescription) — releases
  // whatever basket was bound to this prescription back to the pool for
  // reuse and marks the prescription eliminated. Works whether or not a
  // basket was actually bound (a still-unsent prescription can be
  // eliminated too), so basketId in the result can be null.
  async eliminateByPrescriptionHisId(
    prescriptionhisid: string,
  ): Promise<EliminateResult> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const headerRes = await client.query(
        `SELECT id, basket_id FROM prescription_header WHERE prescriptionhisid = $1`,
        [prescriptionhisid],
      );

      if (headerRes.rows.length === 0) {
        await client.query('ROLLBACK');
        return { ok: false, reason: 'not_found' };
      }

      const { id: prescriptionId, basket_id: basketId } = headerRes.rows[0];

      if (basketId) {
        await client.query(
          `UPDATE basket SET prescription_id = NULL, station_status = 0, updated_at = NOW() WHERE basket_id = $1`,
          [basketId],
        );
      }

      await client.query(
        `UPDATE prescription_header SET pre_state = $1, basket_id = NULL, updated_at = NOW() WHERE id = $2`,
        [ELIMINATED_PRE_STATE, prescriptionId],
      );

      await client.query('COMMIT');
      return { ok: true, basketId: basketId ?? null };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Simulation-only reset button (Machine Sim): unbinds every basket and
  // puts every prescription back to "received" (-1), so testers can re-run
  // a scenario from scratch without touching the database by hand. This app
  // is a simulator, not the real dispensing pipeline, so a blunt full reset
  // is fine here — it would not be safe against a real machine.
  async resetAll(): Promise<{
    basketsReset: number;
    prescriptionsReset: number;
  }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const basketRes = await client.query(
        `UPDATE basket SET prescription_id = NULL, station_status = 0, updated_at = NOW()
         WHERE prescription_id IS NOT NULL OR station_status <> 0`,
      );
      const prescriptionRes = await client.query(
        `UPDATE prescription_header SET pre_state = -1, basket_id = NULL, updated_at = NOW()
         WHERE pre_state <> -1 OR basket_id IS NOT NULL`,
      );

      await client.query('COMMIT');
      return {
        basketsReset: basketRes.rowCount ?? 0,
        prescriptionsReset: prescriptionRes.rowCount ?? 0,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
