import pymongo
from typing import Optional
from pymongo import MongoClient
import csv

# Hardcoded MongoDB connection string
MONGO_URI = "mongodb+srv://Inkomoko:ymosyLynkAPr86EI@cluster0.2wssn.mongodb.net/?appName=Cluster0"

# 1. Connect
client = MongoClient(MONGO_URI)

# 2. Create/access database
db = client["InkomokoDB"]

# 3. Create/access collection
impact = db["impact"]
core_banking_loans = db["core_banking_loans"]
users = db["users"]

def check_mongodb_connection():
    """Check MongoDB connection and return True if connected, False otherwise."""
    try:
        # Perform a simple ping to verify connection
        client.admin.command('ping')
        return True
    except Exception as e:
        print(f"MongoDB connection error: {e}")
        return False

# # 4. Clear old data
# impact.delete_many({})
# core_banking_loans.delete_many({})
# users.delete_many({})

# # 5. Insert sample data
# sample_core_banking_loans = []
# with open("C:\\Users\\STUDENT\\OneDrive - andrew.cmu.edu\\Desktop\\INKOMOKO CAPSTONE\\inkomoko-earlywarning-system\\backend\\app\\db\\core_banking_loans.csv", 'r') as file:
#     reader = csv.DictReader(file)
#     for row in reader:
#         sample_core_banking_loans.append(row)

# core_banking_loans = db["core_banking_loans"]

# core_banking_loans.insert_many(sample_core_banking_loans)

# print("\n--- Initial Data ---")
# for loan in core_banking_loans.find({}, {"_id": 0}):
#     print(loan)


# sample_impact_data = []
# with open("C:\\Users\\STUDENT\\OneDrive - andrew.cmu.edu\\Desktop\\INKOMOKO CAPSTONE\\inkomoko-earlywarning-system\\ml\\synthetic_outputs\\impact_data.csv", 'r') as file:
#     reader = csv.DictReader(file)
#     for row in reader:
#         sample_impact_data.append(row)

# impact = db["impact"]
# impact.insert_many(sample_impact_data)

# print("\n--- Initial Impact Data ---")
# for data in impact.find({}, {"_id": 0}):
#     print(data)

# sample_users = []
# with open("C:\\Users\\STUDENT\\OneDrive - andrew.cmu.edu\\Desktop\\INKOMOKO CAPSTONE\\inkomoko-earlywarning-system\\backend\\users.csv", 'r') as file:
#     reader = csv.DictReader(file)
#     for row in reader:
#         sample_users.append(row)

# users = db["users"]
# users.insert_many(sample_users)

# print("\n--- Initial Users Data ---")
# for user in users.find({}, {"_id": 0}):
#     print(user)

# # 6. CREATE
# students.insert_one({
#     "student_id": 4,
#     "name": "David",
#     "age": 24,
#     "major": "Physics"
# })

# print("\n--- After Create ---")
# for student in students.find({}, {"_id": 0}):
#     print(student)

# # 7. READ one
# print("\n--- Read One ---")
# student = students.find_one({"student_id": 2}, {"_id": 0})
# print(student)

# # 8. UPDATE
# students.update_one(
#     {"student_id": 1},
#     {"$set": {"age": 22, "major": "Software Engineering"}}
# )

# print("\n--- After Update ---")
# for student in students.find({}, {"_id": 0}):
#     print(student)

# # 9. DELETE
# students.delete_one({"student_id": 3})

# print("\n--- After Delete ---")
# for student in students.find({}, {"_id": 0}):
#     print(student)