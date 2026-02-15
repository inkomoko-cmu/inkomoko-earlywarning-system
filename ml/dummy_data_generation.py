"""
Generate synthetic Impact + Core Banking datasets (>=10,000 rows each)
based on the provided data dictionary.

Outputs:
  - impact_data.csv (enterprise/client-level impact records)
  - core_banking_loans.csv (loan-level core banking records)
  - (optional) .parquet files if pyarrow installed

Install:
  pip install pandas numpy faker

Optional parquet:
  pip install pyarrow
"""

from __future__ import annotations

import os
import math
import random
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List, Dict, Tuple

import numpy as np
import pandas as pd
from faker import Faker


# -----------------------------
# Config
# -----------------------------
SEED = 42
N_IMPACT = 10_000
N_LOANS = 10_000

OUT_DIR = "synthetic_outputs"
IMPACT_CSV = os.path.join(OUT_DIR, "impact_data.csv")
BANK_CSV = os.path.join(OUT_DIR, "core_banking_loans.csv")

# Countries referenced in your dictionary (Rwanda, Ethiopia; Kenya/SSD mentioned as later)
COUNTRIES = [
    ("RW", "Rwanda"),
    ("ET", "Ethiopia"),
    ("KE", "Kenya"),
    ("SS", "South Sudan"),
]

COUNTRY_PROVINCES_DISTRICTS = {
    "RW": {
        "provinces": ["Kigali City", "Eastern", "Northern", "Southern", "Western"],
        "districts": ["Gasabo", "Kicukiro", "Nyarugenge", "Rwamagana", "Musanze", "Huye", "Rubavu"],
        "locations": ["Gasabo", "Kicukiro", "Nyarugenge", "Mahama Camp", "Kigeme Camp", "Nyabiheke Camp"],
        "nationalities": ["Rwandan", "Congolese", "Burundian"],
        "currency": "RWF",
    },
    "ET": {
        "provinces": ["Addis Ababa", "Oromia", "Amhara", "Tigray", "SNNPR"],
        "districts": ["Bole", "Kirkos", "Yeka", "Bahir Dar", "Mekelle", "Hawassa"],
        "locations": ["Addis Ababa", "Bahir Dar", "Mekelle", "Shire Camp", "Jijiga"],
        "nationalities": ["Ethiopian", "Eritrean", "Somali"],
        "currency": "ETB",
    },
    "KE": {
        "provinces": ["Nairobi", "Rift Valley", "Central", "Western", "Coast"],
        "districts": ["Nairobi", "Kajiado", "Nakuru", "Kisumu", "Mombasa"],
        "locations": ["Nairobi", "Kakuma Camp", "Dadaab Camp", "Nakuru", "Kisumu"],
        "nationalities": ["Kenyan", "Somali", "South Sudanese"],
        "currency": "KES",
    },
    "SS": {
        "provinces": ["Central Equatoria", "Eastern Equatoria", "Western Equatoria"],
        "districts": ["Juba", "Torit", "Yambio"],
        "locations": ["Juba", "Gorom Camp", "Yambio", "Torit"],
        "nationalities": ["South Sudanese", "Sudanese", "Congolese"],
        "currency": "SSP",
    },
}

EDUCATION_LEVELS = ["None", "Primary", "Secondary", "TVET", "Diploma", "Bachelor", "Postgraduate"]
BUSINESS_SECTORS = [
    "Retail & Trade",
    "Hospitality and Tourism",
    "Professional Services",
    "Agriculture",
    "Manufacturing",
    "Transport",
    "Construction",
    "Personal Services",
    "ICT",
]
SUBSECTORS = {
    "Retail & Trade": ["Grocery", "Clothing", "Phone Accessories", "Pharmacy"],
    "Hospitality and Tourism": ["Restaurant", "Catering", "Lodging", "Coffee Shop"],
    "Professional Services": ["Hair Salon", "Tailoring", "Repairs", "Consulting"],
    "Agriculture": ["Vegetables", "Poultry", "Dairy", "Grains"],
    "Manufacturing": ["Baked Goods", "Soap", "Crafts", "Furniture"],
    "Transport": ["Moto", "Taxi", "Delivery", "Logistics"],
    "Construction": ["Masonry", "Carpentry", "Paint", "Hardware"],
    "Personal Services": ["Laundry", "Childcare", "Beauty", "Cleaning"],
    "ICT": ["Cybercafe", "Mobile Money", "Device Repair", "Software Services"],
}

LOAN_TYPES = ["Working Capital", "Asset Finance", "Inventory Loan", "Emergency Loan", "Seasonal Loan"]
PURPOSES = ["Stock purchase", "Equipment", "Expansion", "Working capital", "Rent/Utilities", "Emergency"]
LOAN_STATUS = ["active", "closed", "defaulted", "restructured"]
STRATA = ["host", "refugee"]


# -----------------------------
# Helpers
# -----------------------------
def set_seeds(seed: int = 42) -> None:
    random.seed(seed)
    np.random.seed(seed)

def rand_choice(xs: List[str]) -> str:
    return xs[random.randint(0, len(xs) - 1)]

def clip(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))

def date_between(start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=random.randint(0, max(0, delta)))

def sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))

def risk_tier_from_score(s: float) -> str:
    # score 0..1
    if s < 0.35:
        return "LOW"
    if s < 0.70:
        return "MEDIUM"
    return "HIGH"


# -----------------------------
# Synthetic Impact Dataset
# Based on fields listed in the Impact data dictionary :contentReference[oaicite:2]{index=2}
# -----------------------------
def generate_impact_data(n: int, fake: Faker) -> pd.DataFrame:
    rows: List[Dict] = []

    # survey_id is part of composite uniqueness in your dictionary :contentReference[oaicite:3]{index=3}
    # We'll simulate survey waves across years/countries
    survey_years = list(range(2018, 2026 + 1))
    survey_names = ["Baseline Survey", "Endline Survey", "Follow-up Survey"]

    for i in range(n):
        cc, cname = random.choices(COUNTRIES, weights=[0.45, 0.25, 0.20, 0.10], k=1)[0]
        country_meta = COUNTRY_PROVINCES_DISTRICTS[cc]

        year = random.choice(survey_years)
        survey_id = f"{cc}-{year}-S{random.randint(1, 3)}"
        unique_id = f"U{random.randint(1, 5000):05d}"  # not globally unique by design; composite with survey_id :contentReference[oaicite:4]{index=4}
        survey_date = date_between(date(year, 1, 1), date(year, 12, 31))

        gender = random.choices(["Male", "Female"], weights=[0.48, 0.52], k=1)[0]
        age = int(clip(np.random.normal(33, 9), 18, 65))

        strata = random.choices(STRATA, weights=[0.55, 0.45], k=1)[0]
        education_level = random.choices(
            EDUCATION_LEVELS, weights=[0.05, 0.20, 0.35, 0.10, 0.12, 0.15, 0.03], k=1
        )[0]

        client_location = rand_choice(country_meta["locations"])
        nationality = rand_choice(country_meta["nationalities"])

        business_sector = random.choices(
            BUSINESS_SECTORS, weights=[0.22, 0.10, 0.15, 0.14, 0.08, 0.08, 0.06, 0.12, 0.05], k=1
        )[0]

        # existing vs idea stage (your dictionary notes different fields) :contentReference[oaicite:5]{index=5}
        is_existing = random.random() < 0.65
        has_started_business = bool(is_existing)

        only_income_earner = random.choices(["Yes", "No"], weights=[0.30, 0.70], k=1)[0]
        number_of_people_responsible = int(clip(np.random.poisson(3) + 1, 1, 12))

        # Revenue distribution: skewed, varies by sector and strata
        sector_multiplier = {
            "Retail & Trade": 1.0,
            "Hospitality and Tourism": 1.1,
            "Professional Services": 0.95,
            "Agriculture": 0.8,
            "Manufacturing": 1.2,
            "Transport": 1.05,
            "Construction": 1.0,
            "Personal Services": 0.9,
            "ICT": 1.15,
        }[business_sector]
        strata_multiplier = 0.92 if strata == "refugee" else 1.0

        # baseline revenue (monthly), lognormal-like
        base_rev = np.random.lognormal(mean=8.2, sigma=0.55)  # large-ish; we'll scale down
        revenue = float(base_rev * 0.12 * sector_multiplier * strata_multiplier)  # yields realistic 50..5000 range
        revenue = clip(revenue, 25, 10_000)

        # household expense (existing only)
        hh_expense = None
        if is_existing:
            hh_expense_val = revenue * random.uniform(0.25, 0.70)
            hh_expense = float(clip(hh_expense_val, 10, 7000))

        # customers per month (existing only)
        monthly_customer = None
        if is_existing:
            monthly_customer = int(clip(np.random.lognormal(mean=3.2, sigma=0.55), 5, 1500))

        # registrations + finance access (existing only)
        business_location = None
        is_business_registered = None
        has_access_to_finance_in_past_6months = None
        have_bank_account = None
        kept_sales_record = None
        bz_have_new_practices = None
        practice_type = None
        bz_have_new_product = None
        new_product_type = None

        if is_existing:
            business_location = rand_choice(country_meta["districts"])
            is_business_registered = random.choices(["Yes", "No"], weights=[0.55, 0.45], k=1)[0]
            have_bank_account = random.choices(["Yes", "No"], weights=[0.62, 0.38], k=1)[0]
            has_access_to_finance_in_past_6months = random.choices(["Yes", "No"], weights=[0.45, 0.55], k=1)[0]
            kept_sales_record = random.choices(["Yes", "No"], weights=[0.50, 0.50], k=1)[0]

            bz_have_new_practices = random.choices(["Yes", "No"], weights=[0.40, 0.60], k=1)[0]
            if bz_have_new_practices == "Yes":
                practice_type = rand_choice(["Record keeping", "Pricing", "Inventory", "Marketing", "Supplier diversification"])

            bz_have_new_product = random.choices(["Yes", "No"], weights=[0.35, 0.65], k=1)[0]
            if bz_have_new_product == "Yes":
                new_product_type = rand_choice(SUBSECTORS[business_sector])

        # jobs created (both types exist per dictionary) :contentReference[oaicite:6]{index=6}
        # correlate jobs created with revenue and sector
        jobs_base = max(0, int(np.random.poisson(lam=0.5 + (revenue / 2500.0))))
        job_created = int(clip(jobs_base, 0, 25))

        # NPS / Satisfaction indicators
        # make nps and satisfaction correlated with training completion (for idea stage) and business practices (existing)
        satisfied_yes = 1 if random.random() < 0.78 else 0
        satisfied_no = 1 - satisfied_yes

        nps_promoter = 1 if random.random() < 0.55 else 0
        nps_passive = 1 if (nps_promoter == 0 and random.random() < 0.55) else 0
        nps_detractor = 1 if (nps_promoter == 0 and nps_passive == 0) else 0

        survey_name = rand_choice(survey_names)

        # Idea-stage fields (only when not started) :contentReference[oaicite:7]{index=7}
        why_not_started_business = None
        bz_source_capital = None
        did_you_buy_assets_in_the_past_6months = None
        business_challenges = None
        did_you_attended_all_training = None
        does_training_increased_bz_skills = None
        plan_after_program = None

        if not is_existing:
            has_started_business = random.random() < 0.35  # some idea-stage later start; still treat as idea-stage record
            if not has_started_business:
                why_not_started_business = rand_choice(["Lack of capital", "Market uncertainty", "Family responsibilities", "Health issues", "Permit/registration barriers"])
            bz_source_capital = rand_choice(["Savings", "Family support", "Loan", "Grant", "Community group"])
            did_you_buy_assets_in_the_past_6months = bool(random.random() < 0.32)
            business_challenges = rand_choice(["Low demand", "Competition", "High input costs", "Security constraints", "Limited mobility"])
            did_you_attended_all_training = bool(random.random() < 0.72)
            does_training_increased_bz_skills = bool(did_you_attended_all_training and (random.random() < 0.80))
            plan_after_program = rand_choice(["Start business", "Expand idea", "Seek employment", "Continue training", "Join cooperative"])

        # 3-month lead-time targets (for training your predictive suite)
        # We'll create a probabilistic "distress score" based on:
        # - low revenue, high dependents, refugee status, missing records, low finance access
        # - plus randomness to avoid leakage
        finance_penalty = 0.0
        if is_existing:
            finance_penalty += 0.35 if has_access_to_finance_in_past_6months == "No" else -0.05
            finance_penalty += 0.25 if kept_sales_record == "No" else -0.05

        z = (
            -1.2
            + (0.55 if strata == "refugee" else 0.0)
            + (0.25 if only_income_earner == "Yes" else 0.0)
            + (0.10 * (number_of_people_responsible - 3))
            + finance_penalty
            + (0.65 * (1.0 - min(revenue / 3500.0, 1.0)))  # lower revenue => higher risk
            + np.random.normal(0, 0.35)
        )
        distress_prob = sigmoid(z)  # 0..1

        risk_tier = risk_tier_from_score(distress_prob)

        # Forecasts: jobs created/lost and revenue (3m) correlated with risk
        # Revenue_3m: growth if low risk, flat if medium, decline if high
        growth_factor = {
            "LOW": random.uniform(1.05, 1.35),
            "MEDIUM": random.uniform(0.90, 1.12),
            "HIGH": random.uniform(0.55, 0.95),
        }[risk_tier]
        revenue_3m = float(clip(revenue * growth_factor, 10, 15_000))

        jobs_created_3m = int(clip(job_created + np.random.poisson(0.4 if risk_tier == "LOW" else 0.2), 0, 35))
        jobs_lost_3m = int(clip(np.random.poisson(0.2 if risk_tier == "LOW" else 0.8 if risk_tier == "HIGH" else 0.4), 0, 25))

        rows.append(
            dict(
                # identity / linkage
                unique_id=unique_id,
                survey_id=survey_id,
                survey_date=str(survey_date),

                # demographics
                age=age,
                gender=gender,
                strata=strata,
                client_location=client_location,
                nationality=nationality,
                education_level=education_level,

                # business
                business_sector=business_sector,
                business_sub_sector=rand_choice(SUBSECTORS[business_sector]),
                only_income_earner=only_income_earner,
                number_of_people_reponsible=number_of_people_responsible,

                business_location=business_location,
                is_business_registered=is_business_registered,
                has_access_to_finance_in_past_6months=has_access_to_finance_in_past_6months,
                have_bank_account=have_bank_account,
                monthly_customer=monthly_customer,
                kept_sales_record=kept_sales_record,
                bz_have_new_practices=bz_have_new_practices,
                practice_type=practice_type,
                bz_have_new_product=bz_have_new_product,
                new_product_type=new_product_type,

                # outcomes
                job_created=job_created,
                revenue=round(revenue, 2),
                hh_expense=(round(hh_expense, 2) if hh_expense is not None else None),

                # satisfaction/NPS
                nps_detractor=nps_detractor,
                nps_passive=nps_passive,
                nps_promoter=nps_promoter,
                satisfied_yes=satisfied_yes,
                satisfied_no=satisfied_no,
                survey_name=survey_name,

                # idea stage
                has_started_business=has_started_business,
                why_not_started_business=why_not_started_business,
                bz_source_capital=bz_source_capital,
                did_you_buy_assets_in_the_past_6months=did_you_buy_assets_in_the_past_6months,
                business_challenges=business_challenges,
                did_you_attended_all_training=did_you_attended_all_training,
                does_training_increased_bz_skills=does_training_increased_bz_skills,
                plan_after_program=plan_after_program,

                # for ML training (3-month horizon targets)
                risk_tier_3m=risk_tier,
                risk_score_3m=round(float(distress_prob), 6),
                jobs_created_3m=jobs_created_3m,
                jobs_lost_3m=jobs_lost_3m,
                revenue_3m=round(revenue_3m, 2),

                # extra
                countrySpecific=cname,  # mirrors the banking dictionary style :contentReference[oaicite:8]{index=8}
                country_code=cc,
            )
        )

    return pd.DataFrame(rows)


# -----------------------------
# Synthetic Core Banking Dataset
# Based on fields listed in Core Banking data dictionary :contentReference[oaicite:9]{index=9}
# -----------------------------
def generate_core_banking_data(n: int, impact_df: pd.DataFrame, fake: Faker) -> pd.DataFrame:
    rows: List[Dict] = []

    # Create a bank clientId derived from the impact composite key
    # Banking has clientId and strata, dateOfBirth, etc. :contentReference[oaicite:10]{index=10}
    # We'll sample from impact clients to keep coherence.
    impact_df = impact_df.copy()
    impact_df["clientId"] = (
        impact_df["country_code"].astype(str)
        + "-"
        + impact_df["survey_id"].astype(str)
        + "-"
        + impact_df["unique_id"].astype(str)
    )

    # Precompute DOB from age + survey_date
    def compute_dob(survey_date_str: str, age: int) -> date:
        d = datetime.strptime(survey_date_str, "%Y-%m-%d").date()
        # approximate: subtract age years with a random month/day jitter
        jitter_days = random.randint(-120, 120)
        return d - timedelta(days=int(age * 365.25) + jitter_days)

    impact_df["dateOfBirth"] = impact_df.apply(lambda r: compute_dob(r["survey_date"], int(r["age"])), axis=1)

    sample_idx = np.random.choice(impact_df.index.values, size=n, replace=True)

    for j, idx in enumerate(sample_idx):
        r = impact_df.loc[idx]
        cc = r["country_code"]
        meta = COUNTRY_PROVINCES_DISTRICTS[cc]

        clientId = r["clientId"]
        strata = r["strata"]
        dob = r["dateOfBirth"]

        province = rand_choice(meta["provinces"])
        district = rand_choice(meta["districts"])

        # dates: submission -> approval -> disbursement
        base_year = random.randint(2019, 2026)
        submissionDate = date_between(date(base_year, 1, 1), date(base_year, 12, 15))
        approvalDate = submissionDate + timedelta(days=random.randint(1, 30))
        disbursementDate = approvalDate + timedelta(days=random.randint(0, 14))

        cycle = int(clip(np.random.poisson(1.2) + 1, 1, 8))
        loanType = rand_choice(LOAN_TYPES)
        purpose = rand_choice(PURPOSES)

        # Amounts correlated with revenue: higher revenue -> higher amounts
        rev = float(r["revenue"])
        appliedAmount = float(clip(np.random.normal(loc=rev * 0.9, scale=max(50.0, rev * 0.35)), 100, 25_000))
        approvedAmount = float(clip(appliedAmount * random.uniform(0.75, 1.05), 100, 25_000))
        disbursedAmount = float(clip(approvedAmount * random.uniform(0.90, 1.00), 80, 25_000))

        termsDuration = int(random.choice([3, 6, 9, 12, 18, 24]))

        # Payment behavior correlated with impact risk_tier_3m
        risk = r["risk_tier_3m"]
        base_default_prob = {"LOW": 0.05, "MEDIUM": 0.12, "HIGH": 0.28}[risk]
        status = random.choices(
            LOAN_STATUS,
            weights=[
                0.62 if risk != "HIGH" else 0.45,    # active
                0.25 if risk == "LOW" else 0.18,     # closed
                0.08 if risk == "MEDIUM" else 0.22,  # defaulted
                0.05,                                 # restructured
            ],
            k=1
        )[0]

        # If defaulted, higher arrears
        daysInArrears = 0
        installmentInArrears = 0
        if status in ("defaulted", "restructured"):
            daysInArrears = int(clip(np.random.normal(60 if status == "defaulted" else 30, 20), 1, 360))
            installmentInArrears = int(clip(np.random.poisson(2) + 1, 1, 12))
        else:
            # maybe small arrears sometimes
            if random.random() < (0.08 if risk == "LOW" else 0.15 if risk == "MEDIUM" else 0.22):
                daysInArrears = int(clip(np.random.normal(10, 6), 1, 45))
                installmentInArrears = int(clip(np.random.poisson(1) + 1, 1, 4))

        # Balances and paid amounts
        # simulate outstanding balance as a fraction based on status and time
        principal = disbursedAmount
        interest_total = principal * random.uniform(0.08, 0.30)  # total interest across term
        fees_total = principal * random.uniform(0.01, 0.05)
        insurance_total = principal * random.uniform(0.00, 0.02)

        # Paid fraction
        if status == "closed":
            paid_frac = random.uniform(0.98, 1.02)
        elif status == "active":
            paid_frac = random.uniform(0.25, 0.75)
        elif status == "restructured":
            paid_frac = random.uniform(0.15, 0.55)
        else:  # defaulted
            paid_frac = random.uniform(0.05, 0.35)

        total_paid = float(clip((principal + interest_total + fees_total + insurance_total) * paid_frac, 0, 40_000))
        principalPaid = float(clip(principal * paid_frac * random.uniform(0.85, 1.05), 0, principal))
        interestPaid = float(clip(interest_total * paid_frac * random.uniform(0.75, 1.10), 0, interest_total))
        insuranceFeePaid = float(clip(insurance_total * paid_frac, 0, insurance_total))
        totalLateFeesPaid = float(clip((fees_total * random.uniform(0.1, 0.8)) if daysInArrears > 0 else 0.0, 0, 5000))
        excessAmountPaid = float(clip(total_paid - (principalPaid + interestPaid + insuranceFeePaid + totalLateFeesPaid), 0, 5000))
        interestWaived = float(clip((interest_total * random.uniform(0.0, 0.15)) if status == "restructured" else 0.0, 0, 5000))

        currentBalance = float(clip((principal + interest_total + fees_total + insurance_total) - total_paid, 0, 50_000))
        principalBalance = float(clip(principal - principalPaid, 0, principal))
        interestBalance = float(clip(interest_total - interestPaid - interestWaived, 0, interest_total))
        feesBalance = float(clip(fees_total - totalLateFeesPaid, 0, fees_total))

        amountPastDue = float(clip(currentBalance * (0.15 if daysInArrears > 0 else 0.0), 0, 25_000))
        principalPastDue = float(clip(principalBalance * (0.10 if daysInArrears > 0 else 0.0), 0, 25_000))
        interestPastDue = float(clip(interestBalance * (0.10 if daysInArrears > 0 else 0.0), 0, 25_000))
        feesPastDue = float(clip(feesBalance * (0.10 if daysInArrears > 0 else 0.0), 0, 25_000))

        # Scheduled installment amounts
        scheduledPrincipalAmount = float(clip(principal / max(1, termsDuration), 10, 10_000))
        scheduledInterestAmount = float(clip(interest_total / max(1, termsDuration), 1, 5000))
        scheduledFeesAmount = float(clip(fees_total / max(1, termsDuration), 0, 2000))
        scheduledPaymentAmount = float(scheduledPrincipalAmount + scheduledInterestAmount + scheduledFeesAmount)

        # Last payment
        lastPaymentDate = disbursementDate + timedelta(days=random.randint(15, 30) * random.randint(1, min(termsDuration, 8)))
        lastPaymentAmount = float(clip(np.random.normal(loc=scheduledPaymentAmount, scale=scheduledPaymentAmount * 0.25), 0, 20_000))
        lastPrincipalAmount = float(clip(lastPaymentAmount * random.uniform(0.55, 0.85), 0, scheduledPrincipalAmount * 3))
        lastInterestAmount = float(clip(lastPaymentAmount * random.uniform(0.10, 0.35), 0, scheduledInterestAmount * 3))
        lastFeesAmount = float(clip(lastPaymentAmount * random.uniform(0.00, 0.10), 0, scheduledFeesAmount * 3))
        lastLateFeesAmount = float(clip(lastPaymentAmount * random.uniform(0.00, 0.05) if daysInArrears > 0 else 0.0, 0, 500))
        lastExcessAmount = float(clip(lastPaymentAmount - (lastPrincipalAmount + lastInterestAmount + lastFeesAmount + lastLateFeesAmount), 0, 5000))

        loanNumber = f"LN-{cc}-{base_year}-{random.randint(100000, 999999)}"

        rows.append(
            dict(
                loanNumber=loanNumber,
                purpose=purpose,
                strata=strata,
                clientId=clientId,
                dateOfBirth=str(dob),
                cycle=cycle,
                province=province,
                district=district,
                submissionDate=str(submissionDate),
                approvalDate=str(approvalDate),
                disbursementDate=str(disbursementDate),

                appliedAmount=round(appliedAmount, 2),
                approvedAmount=round(approvedAmount, 2),
                disbursedAmount=round(disbursedAmount, 2),
                loanType=loanType,
                termsDuration=termsDuration,

                actualPaymentAmount=round(total_paid, 2),
                principalPaid=round(principalPaid, 2),
                interestPaid=round(interestPaid, 2),
                insuranceFeePaid=round(insuranceFeePaid, 2),
                totalLateFeesPaid=round(totalLateFeesPaid, 2),
                excessAmountPaid=round(excessAmountPaid, 2),
                interestWaived=round(interestWaived, 2),

                currentBalance=round(currentBalance, 2),
                principalBalance=round(principalBalance, 2),
                interestBalance=round(interestBalance, 2),
                feesBalance=round(feesBalance, 2),

                amountPastDue=round(amountPastDue, 2),
                principalPastDue=round(principalPastDue, 2),
                interestPastDue=round(interestPastDue, 2),
                feesPastDue=round(feesPastDue, 2),

                scheduledPrincipalAmount=round(scheduledPrincipalAmount, 2),
                scheduledInterestAmount=round(scheduledInterestAmount, 2),
                scheduledFeesAmount=round(scheduledFeesAmount, 2),
                scheduledPaymentAmount=round(scheduledPaymentAmount, 2),

                lastPaymentAmount=round(lastPaymentAmount, 2),
                lastPrincipalAmount=round(lastPrincipalAmount, 2),
                lastInterestAmount=round(lastInterestAmount, 2),
                lastFeesAmount=round(lastFeesAmount, 2),
                lastLateFeesAmount=round(lastLateFeesAmount, 2),
                lastExcessAmount=round(lastExcessAmount, 2),

                daysInArrears=daysInArrears,
                installmentInArrears=installmentInArrears,
                lastPaymentDate=str(lastPaymentDate),
                loanStatus=status,

                industrySectorOfActivity=r["business_sector"],
                businessSubSector=r["business_sub_sector"],
                countrySpecific=r["countrySpecific"],
                country_code=cc,
            )
        )

    return pd.DataFrame(rows)


# -----------------------------
# Main
# -----------------------------
def main():
    set_seeds(SEED)
    fake = Faker()
    Faker.seed(SEED)

    os.makedirs(OUT_DIR, exist_ok=True)

    impact_df = generate_impact_data(N_IMPACT, fake)
    bank_df = generate_core_banking_data(N_LOANS, impact_df, fake)

    # Save CSV
    impact_df.to_csv(IMPACT_CSV, index=False)
    bank_df.to_csv(BANK_CSV, index=False)

    # Optional Parquet
    try:
        impact_parquet = IMPACT_CSV.replace(".csv", ".parquet")
        bank_parquet = BANK_CSV.replace(".csv", ".parquet")
        impact_df.to_parquet(impact_parquet, index=False)
        bank_df.to_parquet(bank_parquet, index=False)
        parquet_msg = f"Also wrote Parquet: {impact_parquet}, {bank_parquet}"
    except Exception:
        parquet_msg = "Parquet not written (install pyarrow to enable)."

    print("Done.")
    print(f"Impact rows: {len(impact_df):,} -> {IMPACT_CSV}")
    print(f"Bank rows:   {len(bank_df):,} -> {BANK_CSV}")
    print(parquet_msg)

    # Quick sanity checks
    print("\nSanity checks:")
    print("Impact risk_tier_3m distribution:")
    print(impact_df["risk_tier_3m"].value_counts(normalize=True).round(3))
    print("\nBank loanStatus distribution:")
    print(bank_df["loanStatus"].value_counts(normalize=True).round(3))


if __name__ == "__main__":
    main()
