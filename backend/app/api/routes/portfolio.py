from fastapi import APIRouter, Depends
from app.api.deps import get_current_user
from motor.motor_asyncio import AsyncIOMotorClient
from bson import Decimal128

# MongoDB setup
mongo_client = AsyncIOMotorClient("mongodb+srv://Inkomoko:ymosyLynkAPr86EI@cluster0.2wssn.mongodb.net/?appName=Cluster0")
mongo_db = mongo_client["InkomokoDB"]

# core_banking_loans uses camelCase
# impact uses snake_case
loans_collection = mongo_db["core_banking_loans"]
impact_collection = mongo_db["impact"]

router = APIRouter(prefix="/portfolio", tags=["portfolio"])


def safe_float(value):
    """Convert Decimal128 or None to float safely."""
    if value is None:
        return 0.0
    if isinstance(value, Decimal128):
        return float(value.to_decimal())
    return float(value)


@router.get("/summary")
async def portfolio_summary(current_user=Depends(get_current_user)):
    pipeline = [
        {
            "$group": {
                "_id": None,
                "total_loans": {"$sum": 1},
                "total_disbursed": {"$sum": "$disbursedAmount"},       # camelCase
                "total_outstanding": {"$sum": "$currentBalance"},      # camelCase
                "avg_days_in_arrears": {"$avg": "$daysInArrears"},     # camelCase
                "par30_amount": {
                    "$sum": {
                        "$cond": [
                            {"$gt": ["$daysInArrears", 30]},           # camelCase
                            "$currentBalance",                          # camelCase
                            0,
                        ]
                    }
                },
            }
        }
    ]
    result = await loans_collection.aggregate(pipeline).to_list(1)
    if not result:
        return {}
    row = result[0]
    return {
        "total_loans": row.get("total_loans", 0),
        "total_disbursed": round(safe_float(row.get("total_disbursed")), 2),
        "total_outstanding": round(safe_float(row.get("total_outstanding")), 2),
        "avg_days_in_arrears": round(safe_float(row.get("avg_days_in_arrears")), 2),
        "par30_amount": round(safe_float(row.get("par30_amount")), 2),
    }


@router.get("/by-country")
async def portfolio_by_country(current_user=Depends(get_current_user)):
    pipeline = [
        {
            "$group": {
                "_id": "$countryCode",                                  # camelCase
                "loans": {"$sum": 1},
                "total_disbursed": {"$sum": "$disbursedAmount"},        # camelCase
                "total_outstanding": {"$sum": "$currentBalance"},       # camelCase
            }
        },
        {"$sort": {"loans": -1}},
    ]
    result = await loans_collection.aggregate(pipeline).to_list(None)
    return [
        {
            "country_code": r["_id"],
            "loans": r.get("loans", 0),
            "total_disbursed": round(safe_float(r.get("total_disbursed")), 2),
            "total_outstanding": round(safe_float(r.get("total_outstanding")), 2),
        }
        for r in result
    ]


@router.get("/loans")
async def portfolio_loans(current_user=Depends(get_current_user)):
    cursor = loans_collection.find(
        {},
        {
            "loanNumber": 1,                   # camelCase
            "countryCode": 1,                  # camelCase
            "industrySectorOfActivity": 1,     # camelCase
            "loanStatus": 1,                   # camelCase
            "disbursedAmount": 1,              # camelCase
            "currentBalance": 1,               # camelCase
            "daysInArrears": 1,                # camelCase
            "installmentInArrears": 1,         # camelCase
        },
    ).sort("disbursementDate", -1).limit(200)  # camelCase

    rows = await cursor.to_list(200)
    return [
        {
            "loannumber": r.get("loanNumber"),
            "country_code": r.get("countryCode"),
            "industrysectorofactivity": r.get("industrySectorOfActivity"),
            "loanstatus": r.get("loanStatus"),
            "disbursedamount": safe_float(r.get("disbursedAmount")),
            "currentbalance": safe_float(r.get("currentBalance")),
            "daysinarrears": safe_float(r.get("daysInArrears")),
            "installmentinarrears": safe_float(r.get("installmentInArrears")),
        }
        for r in rows
    ]


@router.get("/overview")
async def portfolio_overview(current_user=Depends(get_current_user)):
    # core_banking_loans - camelCase fields
    loans_pipeline = [
        {
            "$group": {
                "_id": None,
                "total_loans": {"$sum": 1},
                "total_disbursed": {"$sum": "$disbursedAmount"},        # camelCase
                "total_outstanding": {"$sum": "$currentBalance"},       # camelCase
                "avg_days_in_arrears": {"$avg": "$daysInArrears"},      # camelCase
                "par30_amount": {
                    "$sum": {
                        "$cond": [
                            {"$gt": ["$daysInArrears", 30]},            # camelCase
                            "$currentBalance",                           # camelCase
                            0,
                        ]
                    }
                },
            }
        }
    ]

    # impact - snake_case fields
    impact_pipeline = [
        {
            "$group": {
                "_id": None,
                "jobs_created_3m": {"$sum": "$jobs_created_3m"},        # snake_case
                "jobs_lost_3m": {"$sum": "$jobs_lost_3m"},              # snake_case
                "avg_revenue_3m": {"$avg": "$revenue_3m"},              # snake_case
                "nps_promoter": {"$sum": "$nps_promoter"},              # snake_case
                "nps_detractor": {"$sum": "$nps_detractor"},            # snake_case
            }
        }
    ]

    loans_result = await loans_collection.aggregate(loans_pipeline).to_list(1)
    impact_result = await impact_collection.aggregate(impact_pipeline).to_list(1)

    loans_row = loans_result[0] if loans_result else {}
    impact_row = impact_result[0] if impact_result else {}

    return {
        "total_loans": loans_row.get("total_loans", 0),
        "total_disbursed": round(safe_float(loans_row.get("total_disbursed")), 2),
        "total_outstanding": round(safe_float(loans_row.get("total_outstanding")), 2),
        "avg_days_in_arrears": round(safe_float(loans_row.get("avg_days_in_arrears")), 2),
        "par30_amount": round(safe_float(loans_row.get("par30_amount")), 2),
        "jobs_created_3m": safe_float(impact_row.get("jobs_created_3m")),
        "jobs_lost_3m": safe_float(impact_row.get("jobs_lost_3m")),
        "avg_revenue_3m": round(safe_float(impact_row.get("avg_revenue_3m")), 2),
        "nps_promoter": safe_float(impact_row.get("nps_promoter")),
        "nps_detractor": safe_float(impact_row.get("nps_detractor")),
    }


@router.get("/risk-distribution")
async def portfolio_risk_distribution(current_user=Depends(get_current_user)):
    # core_banking_loans - camelCase fields
    pipeline = [
        {
            "$project": {
                "risk_tier": {
                    "$switch": {
                        "branches": [
                            {"case": {"$eq": ["$daysInArrears", 0]}, "then": "Low"},       # camelCase
                            {"case": {"$lte": ["$daysInArrears", 30]}, "then": "Medium"},  # camelCase
                        ],
                        "default": "High",
                    }
                }
            }
        },
        {"$group": {"_id": "$risk_tier", "value": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    result = await loans_collection.aggregate(pipeline).to_list(None)
    return [{"name": r["_id"], "value": r["value"]} for r in result]


@router.get("/jobs-summary")
async def portfolio_jobs_summary(current_user=Depends(get_current_user)):
    # impact - snake_case fields
    pipeline = [
        {
            "$group": {
                "_id": None,
                "created": {"$sum": "$jobs_created_3m"},   # snake_case
                "lost": {"$sum": "$jobs_lost_3m"},         # snake_case
            }
        }
    ]
    result = await impact_collection.aggregate(pipeline).to_list(1)
    if not result:
        return {"created": 0, "lost": 0}
    row = result[0]
    return {
        "created": safe_float(row.get("created")),
        "lost": safe_float(row.get("lost")),
    }