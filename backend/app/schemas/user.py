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


class UserListItem(BaseModel):
    user_id: str
    email: EmailStr
    full_name: str | None
    is_active: bool
    roles: list[str]


class UpdateUserStatusRequest(BaseModel):
    is_active: bool
