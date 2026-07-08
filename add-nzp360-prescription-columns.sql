-- Adds the HIS-sourced fields NZP360's SendPrescription needs that RB1500
-- never required. All are free-text: the sample envelope's date/time-like
-- fields (e.g. PATIENT_BIRTHDAY="19330903", DISPENSING_TIME="2017032909:44:30")
-- aren't in a standard parseable format, so these are stored as-is rather
-- than as DATE/TIMESTAMP.
-- No patienthisid column: mzno IS the patient identifier, NZP360 just calls
-- its own field PATIENT_ID — mapped straight from mzno, not a stored column.
ALTER TABLE prescription_header
    ADD COLUMN patientbirthday VARCHAR(20)  NULL,
    ADD COLUMN patientvisitid  VARCHAR(50)  NULL,
    ADD COLUMN patientbed      VARCHAR(50)  NULL,
    ADD COLUMN doctorid        VARCHAR(50)  NULL,
    ADD COLUMN administration  VARCHAR(100) NULL,
    ADD COLUMN repeatindicator VARCHAR(10)  NULL,
    ADD COLUMN deptcode        VARCHAR(50)  NULL;

ALTER TABLE prescription_detail
    ADD COLUMN drugspec         VARCHAR(255) NULL,
    ADD COLUMN drugpycode       VARCHAR(100) NULL,
    ADD COLUMN dosage           VARCHAR(50)  NULL,
    ADD COLUMN dosageunit       VARCHAR(50)  NULL,
    ADD COLUMN dosageperunit    VARCHAR(50)  NULL,
    ADD COLUMN dispensingtime   VARCHAR(50)  NULL,
    ADD COLUMN performtime      VARCHAR(50)  NULL,
    ADD COLUMN performfreqdetail VARCHAR(100) NULL,
    ADD COLUMN performfreq      VARCHAR(100) NULL,
    ADD COLUMN performfreqprint VARCHAR(100) NULL,
    ADD COLUMN nursingcode      VARCHAR(100) NULL;
