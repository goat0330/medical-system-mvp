CREATE TABLE IF NOT EXISTS golden_patient (
  patient_id text PRIMARY KEY,
  name text NOT NULL,
  sex text NOT NULL,
  birth_date date NOT NULL,
  synthetic boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS golden_episode (
  episode_id text PRIMARY KEY,
  patient_id text NOT NULL REFERENCES golden_patient(patient_id),
  medical_record_number text NOT NULL,
  admission_at timestamptz NOT NULL,
  discharge_at timestamptz,
  department text NOT NULL,
  principal_diagnosis_code text NOT NULL,
  principal_procedure_code text,
  synthetic boolean NOT NULL DEFAULT true,
  payload jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS golden_document (
  document_id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  template_id text NOT NULL,
  document_name text NOT NULL,
  authored_at timestamptz,
  status text NOT NULL,
  body_text text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS golden_diagnosis (
  diagnosis_id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  diagnosis_role text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS golden_procedure (
  procedure_id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  procedure_role text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  started_at timestamptz,
  ended_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS golden_fee_item (
  fee_item_id bigserial PRIMARY KEY,
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  category text NOT NULL,
  item_name text NOT NULL,
  amount numeric(12,2) NOT NULL,
  class_a numeric(12,2) NOT NULL DEFAULT 0,
  class_b numeric(12,2) NOT NULL DEFAULT 0,
  self_pay numeric(12,2) NOT NULL DEFAULT 0,
  other numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE (episode_id, category, item_name)
);

CREATE TABLE IF NOT EXISTS golden_expected_group (
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  scheme text NOT NULL,
  level text NOT NULL,
  code text,
  name text,
  payload jsonb NOT NULL,
  PRIMARY KEY (episode_id, scheme, level)
);

CREATE TABLE IF NOT EXISTS golden_qc_variant (
  variant_id text PRIMARY KEY,
  episode_id text NOT NULL REFERENCES golden_episode(episode_id),
  name text NOT NULL,
  payload jsonb NOT NULL
);
