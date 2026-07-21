-- Full schema bootstrap for a fresh database (e.g. a new Supabase project).
-- Generated from the live development database — this is what the app
-- actually expects today, not a hand-maintained approximation.
--
-- Existing databases that already have prescription_header/prescription_detail/
-- medicine_dictionary/basket from before this file existed should keep using
-- create-department-dictionary.sql / add-nzp360-prescription-columns.sql /
-- seed-baskets.sql instead — this file is for standing up a brand new,
-- empty database in one shot.
--
-- Run once, in a single psql/SQL-editor session (order matters — child
-- tables reference prescription_header via foreign key).

-- ============================================================
-- Tables with no foreign-key dependencies
-- ============================================================

-- Prescriptions received from the hospital HIS (or the Prescribe Medicine
-- page, which stands in for it). pre_state: -1 received, 0 in progress,
-- 1 complete. patientbirthday/patientvisitid/patientbed/doctorid/
-- administration/repeatindicator/deptcode are NZP360-only fields RB1500
-- never needed — free text, since the source system's date/time-like
-- values (e.g. patientbirthday="19330903") aren't a standard parseable
-- format. mzno IS the patient identifier for NZP360's PATIENT_ID too —
-- there's deliberately no separate patienthisid column.
CREATE TABLE prescription_header (
    id                      BIGSERIAL PRIMARY KEY,
    mzno                    VARCHAR(50)  NOT NULL,
    patientname             VARCHAR(255) NOT NULL,
    patientage              INT          NOT NULL,
    patientsex              SMALLINT     NOT NULL,
    prescriptionhisid       VARCHAR(50)  NOT NULL UNIQUE,
    prescriptiondoctorname  VARCHAR(255) NULL,
    prescriptionhint        VARCHAR(500) NULL,
    departmentname          VARCHAR(255) NULL,
    fetchwindow             INT          NOT NULL,
    basket_id               VARCHAR(50)  NULL,
    pre_state               SMALLINT     DEFAULT -1,
    delete_flag             SMALLINT     DEFAULT 0,
    finish_time             TIMESTAMP    NULL,
    notified_state          SMALLINT     DEFAULT 0,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    pre_type                VARCHAR(255) DEFAULT '0',
    patientbirthday         VARCHAR(20)  NULL,
    patientvisitid          VARCHAR(50)  NULL,
    patientbed              VARCHAR(50)  NULL,
    doctorid                VARCHAR(50)  NULL,
    administration          VARCHAR(100) NULL,
    repeatindicator         VARCHAR(10)  NULL,
    deptcode                VARCHAR(50)  NULL
);
CREATE INDEX idx_pre_state ON prescription_header (pre_state);
CREATE INDEX idx_basket ON prescription_header (basket_id);
CREATE INDEX idx_mzno ON prescription_header (mzno);

-- Machine's own copy of a medicine, added once the machine has confirmed
-- it via SendMedicine — drives the "which medicines are already on the
-- machine" list on the Add Medicine page. dispense_type (manual/rb1500/
-- nzp360/cobot) is DB-only, not part of the SendMedicine XML contract —
-- it's what routes a prescription's line items to the right dispensing
-- station downstream.
CREATE TABLE medicine_dictionary (
    id                  BIGSERIAL PRIMARY KEY,
    medicinehisid       VARCHAR(50)  NOT NULL,
    medicinenamech      VARCHAR(255) NOT NULL,
    medicinenameen      VARCHAR(255) NULL,
    medicineunit        VARCHAR(50)  NOT NULL,
    medicinestate       SMALLINT     DEFAULT 1,
    medfactoryid        VARCHAR(50)  NULL,
    medfactoryname      VARCHAR(255) NOT NULL,
    typeunit            VARCHAR(50)  NOT NULL,
    hpmtypeunit         VARCHAR(50)  NOT NULL,
    numcode             VARCHAR(50)  NULL,
    pycode              VARCHAR(100) NOT NULL,
    boxmaxnum           INT          NOT NULL DEFAULT 1,
    medposition         VARCHAR(100) NULL,
    med_batch           VARCHAR(100) NULL,
    validate_time       DATE         NULL,
    created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    dispense_type       VARCHAR(255) DEFAULT 'manual',
    UNIQUE (medicinehisid, medicineunit, medfactoryname)
);
CREATE INDEX idx_numcode ON medicine_dictionary (numcode);
CREATE INDEX idx_pycode ON medicine_dictionary (pycode);

-- Backs NZP360's SendDeptInfo call (DEPT_CODE/DEPT_NAME/DEPT_PY) — no
-- equivalent existed before: prescription_header.departmentname is free
-- text per-prescription, with no stable code or phonetic (py) code
-- anywhere. Also used to autofill the department picker on the Prescribe
-- Medicine page.
CREATE TABLE department_dictionary (
    id              BIGSERIAL PRIMARY KEY,
    dept_code       VARCHAR(50)  NOT NULL,
    dept_name       VARCHAR(255) NOT NULL,
    dept_py         VARCHAR(100) NOT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dept_code)
);

-- Reserved for future use — not read or written by any code in this repo
-- yet (no MachineStatusService/controller exists today).
CREATE TABLE machine_status (
    id              BIGSERIAL PRIMARY KEY,
    machine_id      INT          NOT NULL,
    machine_state   SMALLINT     NOT NULL,
    machine_message VARCHAR(255) NULL,
    "timestamp"     TIMESTAMP    NOT NULL
);
CREATE INDEX idx_machine ON machine_status (machine_id, "timestamp");

-- ============================================================
-- Tables with foreign keys into the tables above
-- ============================================================

-- One row per medicine line item on a prescription. drugspec/drugpycode/
-- dosage*/dispensingtime/performtime*/nursingcode are NZP360-only fields —
-- same rationale as prescription_header's additions above.
CREATE TABLE prescription_detail (
    id                      BIGSERIAL PRIMARY KEY,
    prescription_id         BIGINT       NOT NULL,
    prescriptionhisid       VARCHAR(50)  NOT NULL,
    medhisid                VARCHAR(50)  NOT NULL,
    medunit                 VARCHAR(50)  NOT NULL,
    medicinenum             INT          NOT NULL DEFAULT 0,
    medicineheteromorphism  DECIMAL(10,2) NOT NULL DEFAULT 0,
    medicinehint            VARCHAR(500) NULL,
    medfactoryid            VARCHAR(50)  NULL,
    medfactoryname          VARCHAR(255) NOT NULL,
    medicinenamech          VARCHAR(255) NOT NULL,
    created_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    drugspec                VARCHAR(255) NULL,
    drugpycode              VARCHAR(100) NULL,
    dosage                  VARCHAR(50)  NULL,
    dosageunit              VARCHAR(50)  NULL,
    dosageperunit           VARCHAR(50)  NULL,
    dispensingtime          VARCHAR(50)  NULL,
    performtime             VARCHAR(50)  NULL,
    performfreqdetail       VARCHAR(100) NULL,
    performfreq             VARCHAR(100) NULL,
    performfreqprint        VARCHAR(100) NULL,
    nursingcode             VARCHAR(100) NULL,
    FOREIGN KEY (prescription_id) REFERENCES prescription_header(id) ON DELETE CASCADE
);
CREATE INDEX idx_prescriptionhisid ON prescription_detail (prescriptionhisid);
CREATE INDEX idx_medhisid ON prescription_detail (medhisid);

-- Fixed, reusable physical pool (see seed-baskets.sql for seeding
-- BASKET-01..20) — bound to a prescription only while it's in progress.
-- station_status: 0 free, 1 sent to machine .. 6 pharmacist recheck
-- (pre_state flips to complete here), 7 call patient for pickup,
-- 8 patient received (basket released back to the pool here).
CREATE TABLE basket (
    id              BIGSERIAL PRIMARY KEY,
    basket_id       VARCHAR(50)  NOT NULL UNIQUE,
    prescription_id BIGINT       NULL,
    machine_id      INT          NULL,
    is_lit          SMALLINT     DEFAULT 0,
    station_status  INT          NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescription_header(id) ON DELETE SET NULL
);

-- Reserved for future use — not read or written by any code in this repo yet.
CREATE TABLE cobot_task (
    id              BIGSERIAL PRIMARY KEY,
    task_no         VARCHAR(64)  NOT NULL UNIQUE,
    machine_id      INT          NOT NULL,
    cobot_id        VARCHAR(50)  NOT NULL,
    prescription_id BIGINT       NOT NULL,
    pre_id          VARCHAR(50)  NULL,
    split_id        INT          DEFAULT 1,
    basket_id       VARCHAR(50)  NULL,
    task_state      SMALLINT     DEFAULT 0,
    task_error_id   VARCHAR(20)  DEFAULT '0',
    task_message    VARCHAR(255) NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (prescription_id) REFERENCES prescription_header(id)
);

-- Reserved for future use — not read or written by any code in this repo yet.
CREATE TABLE machine_part_status (
    id                BIGSERIAL PRIMARY KEY,
    machine_status_id BIGINT       NOT NULL,
    part_name         VARCHAR(100) NULL,
    part_state        SMALLINT     NOT NULL,
    part_message      VARCHAR(255) NULL,
    FOREIGN KEY (machine_status_id) REFERENCES machine_status(id) ON DELETE CASCADE
);

-- ============================================================
-- Seed data
-- ============================================================

-- Physical basket pool the app expects to exist (BASKET-01..20). Safe to
-- re-run.
INSERT INTO basket (basket_id, station_status)
SELECT 'BASKET-' || LPAD(n::text, 2, '0'), 0
FROM generate_series(1, 20) AS n
ON CONFLICT (basket_id) DO NOTHING;
