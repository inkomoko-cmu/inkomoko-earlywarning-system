\set ON_ERROR_STOP on

-- Curated typed views sourced only from anonymized raw uploads.
-- Inputs:
--   anon_baseline_raw
--   anon_endline_raw
--   anon_investment_raw

CREATE OR REPLACE VIEW vw_anon_investment_curated AS
SELECT
  loannumber AS loan_number,
  COALESCE(NULLIF(baselineendlineclientid, ''), NULLIF(clientid, '')) AS client_id,
  CASE
    WHEN upper(trim(country)) IN ('RWANDA', 'RW') THEN 'RW'
    WHEN upper(trim(country)) IN ('KENYA', 'KE') THEN 'KE'
    WHEN upper(trim(country)) IN ('UGANDA', 'UG') THEN 'UG'
    WHEN upper(trim(country)) IN ('ETHIOPIA', 'ET') THEN 'ET'
    WHEN upper(trim(country)) IN ('DRC', 'CONGO', 'CD') THEN 'CD'
    ELSE upper(left(trim(country), 2))
  END AS country_code,
  country,
  purpose,
  strata,
  NULLIF(submissiondate, '')::date AS submission_date,
  NULLIF(approvaldate, '')::date AS approval_date,
  NULLIF(disbursementdate, '')::date AS disbursement_date,
  NULLIF(lastpaymentdate, '')::date AS last_payment_date,
  NULLIF(regexp_replace(appliedamount, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS applied_amount,
  NULLIF(regexp_replace(approvedamount, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS approved_amount,
  NULLIF(regexp_replace(disbursedamount, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS disbursed_amount,
  NULLIF(regexp_replace(currentbalance, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS current_balance,
  NULLIF(regexp_replace(principalbalance, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS principal_balance,
  NULLIF(regexp_replace(interestbalance, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS interest_balance,
  NULLIF(regexp_replace(feesbalance, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS fees_balance,
  NULLIF(regexp_replace(actualpaymentamount, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS actual_payment_amount,
  NULLIF(regexp_replace(principalpaid, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS principal_paid,
  NULLIF(regexp_replace(interestpaid, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS interest_paid,
  NULLIF(regexp_replace(insurancefeepaid, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS insurance_fee_paid,
  NULLIF(regexp_replace(totallatefeespaid, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS total_late_fees_paid,
  NULLIF(regexp_replace(lastpaymentamount, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS last_payment_amount,
  COALESCE(NULLIF(regexp_replace(daysinarrears, '[^0-9\\.-]', '', 'g'), '')::int, 0) AS days_in_arrears,
  NULLIF(regexp_replace(amountpastdue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS amount_past_due,
  NULLIF(regexp_replace(principalpastdue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS principal_past_due,
  NULLIF(regexp_replace(interestpastdue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS interest_past_due,
  NULLIF(regexp_replace(feespastdue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS fees_past_due,
  COALESCE(NULLIF(regexp_replace(installmentinarrears, '[^0-9\\.-]', '', 'g'), '')::int, 0) AS installment_in_arrears,
  loantype AS loan_type,
  NULLIF(regexp_replace(termsduration, '[^0-9\\.-]', '', 'g'), '')::int AS terms_duration,
  lower(trim(loanstatus)) AS loan_status,
  NULLIF(regexp_replace(interestwaived, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS interest_waived,
  industrysectorofactivity AS industry_sector,
  businesssubsector AS business_sub_sector
FROM anon_investment_raw;

CREATE OR REPLACE VIEW vw_anon_impact_curated AS
WITH baseline_clean AS (
  SELECT
    NULLIF(client_id, '') AS client_id,
    CASE
      WHEN upper(trim(country)) IN ('RWANDA', 'RW') THEN 'RW'
      WHEN upper(trim(country)) IN ('KENYA', 'KE') THEN 'KE'
      WHEN upper(trim(country)) IN ('UGANDA', 'UG') THEN 'UG'
      WHEN upper(trim(country)) IN ('ETHIOPIA', 'ET') THEN 'ET'
      WHEN upper(trim(country)) IN ('DRC', 'CONGO', 'CD') THEN 'CD'
      ELSE upper(left(trim(country), 2))
    END AS country_code,
    CASE
      WHEN NULLIF(survey_date, '') IS NULL THEN NULL
      WHEN NULLIF(survey_date, '') ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(NULLIF(survey_date, ''), 'DD/MM/YYYY')
      WHEN NULLIF(survey_date, '') ~ '^\d{4}-\d{2}-\d{2}$' THEN NULLIF(survey_date, '')::date
      ELSE NULL
    END AS baseline_survey_date,
    NULLIF(regexp_replace(job_created, '[^0-9\\.-]', '', 'g'), '')::int AS baseline_job_created,
    NULLIF(regexp_replace(revenue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS baseline_revenue,
    business_sector,
    client_location,
    nationality,
    education_level,
    strata
  FROM anon_baseline_raw
),
endline_clean AS (
  SELECT
    NULLIF(client_id, '') AS client_id,
    CASE
      WHEN upper(trim(country)) IN ('RWANDA', 'RW') THEN 'RW'
      WHEN upper(trim(country)) IN ('KENYA', 'KE') THEN 'KE'
      WHEN upper(trim(country)) IN ('UGANDA', 'UG') THEN 'UG'
      WHEN upper(trim(country)) IN ('ETHIOPIA', 'ET') THEN 'ET'
      WHEN upper(trim(country)) IN ('DRC', 'CONGO', 'CD') THEN 'CD'
      ELSE upper(left(trim(country), 2))
    END AS country_code,
    CASE
      WHEN NULLIF(survey_date, '') IS NULL THEN NULL
      WHEN NULLIF(survey_date, '') ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(NULLIF(survey_date, ''), 'DD/MM/YYYY')
      WHEN NULLIF(survey_date, '') ~ '^\d{4}-\d{2}-\d{2}$' THEN NULLIF(survey_date, '')::date
      ELSE NULL
    END AS endline_survey_date,
    NULLIF(regexp_replace(job_created, '[^0-9\\.-]', '', 'g'), '')::int AS endline_job_created,
    NULLIF(regexp_replace(revenue, '[^0-9\\.-]', '', 'g'), '')::numeric(18,2) AS endline_revenue,
    COALESCE(NULLIF(nps_promoter, '')::boolean, FALSE) AS nps_promoter,
    COALESCE(NULLIF(nps_detractor, '')::boolean, FALSE) AS nps_detractor,
    business_sector,
    client_location,
    nationality,
    education_level,
    strata,
    COALESCE(NULLIF(satisfied_yes, '')::boolean, FALSE) AS satisfied_yes,
    COALESCE(NULLIF(satisfied_no, '')::boolean, FALSE) AS satisfied_no
  FROM anon_endline_raw
),
investment_rollup AS (
  SELECT
    COALESCE(NULLIF(baselineendlineclientid, ''), NULLIF(clientid, '')) AS client_id,
    MAX(COALESCE(NULLIF(regexp_replace(daysinarrears, '[^0-9\\.-]', '', 'g'), '')::numeric, 0)) AS max_days_in_arrears,
    AVG(COALESCE(NULLIF(regexp_replace(amountpastdue, '[^0-9\\.-]', '', 'g'), '')::numeric, 0)) AS avg_amount_past_due,
    MAX(COALESCE(NULLIF(regexp_replace(installmentinarrears, '[^0-9\\.-]', '', 'g'), '')::numeric, 0)) AS max_installment_in_arrears
  FROM anon_investment_raw
  GROUP BY 1
),
merged AS (
  SELECT
    COALESCE(e.client_id, b.client_id) AS unique_id,
    COALESCE(e.client_id, b.client_id) AS client_id,
    COALESCE(e.country_code, b.country_code) AS country_code,
    COALESCE(e.endline_survey_date, b.baseline_survey_date) AS survey_date,
    COALESCE(e.business_sector, b.business_sector) AS business_sector,
    NULL::text AS business_sub_sector,
    COALESCE(e.client_location, b.client_location) AS client_location,
    COALESCE(e.nationality, b.nationality) AS nationality,
    COALESCE(e.education_level, b.education_level) AS education_level,
    COALESCE(e.strata, b.strata) AS strata,
    e.nps_promoter,
    e.nps_detractor,
    e.satisfied_yes,
    e.satisfied_no,
    b.baseline_job_created,
    e.endline_job_created,
    b.baseline_revenue,
    e.endline_revenue
  FROM endline_clean e
  FULL OUTER JOIN baseline_clean b
    ON e.client_id = b.client_id
   AND e.country_code = b.country_code
)
SELECT
  m.unique_id,
  m.client_id,
  m.country_code,
  m.survey_date,
  m.business_sector,
  m.business_sub_sector,
  m.client_location,
  m.nationality,
  m.education_level,
  m.strata,
  m.nps_promoter,
  m.nps_detractor,
  m.satisfied_yes,
  m.satisfied_no,
  COALESCE(m.endline_revenue, m.baseline_revenue, 0)::numeric(18,2) AS revenue_3m,
  COALESCE(m.endline_job_created, m.baseline_job_created, 0)::int AS jobs_created_3m,
  GREATEST(COALESCE(m.baseline_job_created, 0) - COALESCE(m.endline_job_created, 0), 0)::int AS jobs_lost_3m,
  (
    LEAST(
      1.0,
      (0.55 * LEAST(COALESCE(i.max_days_in_arrears, 0) / 90.0, 1.0)) +
      (0.30 * LEAST(
        CASE
          WHEN COALESCE(m.endline_revenue, m.baseline_revenue, 0) > 0
            THEN COALESCE(i.avg_amount_past_due, 0) / COALESCE(m.endline_revenue, m.baseline_revenue, 1)
          ELSE 1.0
        END,
      1.0)) +
      (0.15 * LEAST(COALESCE(i.max_installment_in_arrears, 0) / 6.0, 1.0))
    )
  )::numeric(6,5) AS risk_score_3m,
  CASE
    WHEN (
      LEAST(
        1.0,
        (0.55 * LEAST(COALESCE(i.max_days_in_arrears, 0) / 90.0, 1.0)) +
        (0.30 * LEAST(
          CASE
            WHEN COALESCE(m.endline_revenue, m.baseline_revenue, 0) > 0
              THEN COALESCE(i.avg_amount_past_due, 0) / COALESCE(m.endline_revenue, m.baseline_revenue, 1)
            ELSE 1.0
          END,
        1.0)) +
        (0.15 * LEAST(COALESCE(i.max_installment_in_arrears, 0) / 6.0, 1.0))
      )
    ) >= 0.7 THEN 'HIGH'
    WHEN (
      LEAST(
        1.0,
        (0.55 * LEAST(COALESCE(i.max_days_in_arrears, 0) / 90.0, 1.0)) +
        (0.30 * LEAST(
          CASE
            WHEN COALESCE(m.endline_revenue, m.baseline_revenue, 0) > 0
              THEN COALESCE(i.avg_amount_past_due, 0) / COALESCE(m.endline_revenue, m.baseline_revenue, 1)
            ELSE 1.0
          END,
        1.0)) +
        (0.15 * LEAST(COALESCE(i.max_installment_in_arrears, 0) / 6.0, 1.0))
      )
    ) >= 0.4 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS risk_tier_3m,
  COALESCE(m.endline_revenue, m.baseline_revenue, 0)::numeric(18,2) AS revenue
FROM merged m
LEFT JOIN investment_rollup i ON i.client_id = m.client_id
WHERE m.unique_id IS NOT NULL;
