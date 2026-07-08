-- Department dictionary — mirrors medicine_dictionary's conventions.
-- Backs NZP360's SendDeptInfo call (DEPT_CODE/DEPT_NAME/DEPT_PY), which has
-- no equivalent source today: prescription_header.departmentname is free
-- text per-prescription, with no stable code or phonetic (py) code anywhere.
CREATE TABLE department_dictionary (
    id              BIGSERIAL PRIMARY KEY,
    dept_code       VARCHAR(50)  NOT NULL,
    dept_name       VARCHAR(255) NOT NULL,
    dept_py         VARCHAR(100) NOT NULL,
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dept_code)
);
