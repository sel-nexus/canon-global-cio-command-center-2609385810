"""Validate prompt input and serialize only public response history fields."""
from datetime import datetime
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class PromptRequest(BaseModel):
    """Accept text including empty unsupported prompts; reject client ownership."""

    model_config = ConfigDict(extra="forbid", strict=True, hide_input_in_errors=True)
    prompt: str


class Message(BaseModel):
    """Expose the persisted response without ownership or submitted prompt."""

    model_config = ConfigDict(from_attributes=True)
    id: UUID
    role: Literal["assistant"]
    text: str
    created_at: datetime


class History(BaseModel):
    """Return a bounded chronological page and the owner's total response count."""

    items: list[Message]
    total: int
