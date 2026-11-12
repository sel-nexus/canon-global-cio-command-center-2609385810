"""Validate credentials and expose only public account fields."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Credentials(BaseModel):
    """Normalize only usernames; preserve every submitted password character."""

    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=4096, repr=False)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        """Canonicalize case and surrounding whitespace without accepting blanks."""
        normalized = value.strip().casefold()
        if not normalized or len(normalized) > 100:
            raise ValueError("Enter a username of 1 to 100 characters")
        return normalized


class Account(BaseModel):
    """Serialize persisted identity without exposing credentials."""

    model_config = ConfigDict(from_attributes=True)
    id: UUID
    username: str
    created_at: datetime


class LoginResponse(BaseModel):
    """Return one signed server-issued session and its public account."""

    access_token: str
    token_type: Literal["bearer"] = "bearer"
    account: Account
