from pydantic import BaseModel, EmailStr

class MeResponse(BaseModel):
    user_id: str
    email: EmailStr
    full_name: str | None
    roles: list[str]

class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None
    roles: list[str]
