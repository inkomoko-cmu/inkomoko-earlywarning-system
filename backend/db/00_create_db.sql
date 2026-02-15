\set ON_ERROR_STOP on

-- Create the database (run from an existing DB like "postgres")
DROP DATABASE IF EXISTS inkomoko_early_warning;

CREATE DATABASE inkomoko_early_warning
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       CONNECTION LIMIT = -1;

-- NOTE:
-- We intentionally do NOT set LC_COLLATE/LC_CTYPE here because
-- Windows locale strings vary and can cause failures.
