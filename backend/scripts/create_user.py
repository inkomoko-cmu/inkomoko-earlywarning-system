from sqlalchemy import text
from app.db import engine
from app.auth.security import hash_password

EMAIL = "admin@inkomoko.org"
FULL_NAME = "Admin User"
PASSWORD = "Admin123!"  # change later

def main():
    pw_hash = hash_password(PASSWORD)

    with engine.begin() as conn:
        # create user
        conn.execute(
            text("""
                INSERT INTO auth_user (email, full_name, password_hash)
                VALUES (:email, :name, :pw)
                ON CONFLICT (email) DO UPDATE
                SET full_name = EXCLUDED.full_name,
                    password_hash = EXCLUDED.password_hash,
                    is_active = TRUE
            """),
            {"email": EMAIL.lower(), "name": FULL_NAME, "pw": pw_hash},
        )

        # assign admin role
        conn.execute(
            text("""
                INSERT INTO auth_user_role (user_id, role_id)
                SELECT u.user_id, r.role_id
                FROM auth_user u
                JOIN auth_role r ON r.role_key = 'admin'
                WHERE u.email = :email
                ON CONFLICT DO NOTHING
            """),
            {"email": EMAIL.lower()},
        )

    print("Created/updated user:", EMAIL)
    print("Password:", PASSWORD)

if __name__ == "__main__":
    main()
