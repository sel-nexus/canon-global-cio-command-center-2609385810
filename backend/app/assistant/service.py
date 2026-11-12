"""Resolve the exact four rule-based responses and persist response-only history."""
import re
import unicodedata
from uuid import UUID
from sqlalchemy.orm import Session
from app.assistant.repository import AssistantRepository
from app.assistant.schema import PromptRequest, Message, History

RESPONSES = {
    "q4": "Focus on innovation acceleration, risk reduction, and board readiness initiatives.",
    "tcs": "TCS partnership expansion recommended based on ROI growth and delivery performance.",
    "risk": "Strengthen cybersecurity posture and compliance tracking across regions.",
    "innovation": "Increase investment in AI/ML and automation pipelines to drive long-term value.",
}
FALLBACK = "Only the supported demo topics Q4, TCS, risk, and innovation are available."


def token_character(character: str) -> bool:
    """Match the local resolver's Unicode letter, number and underscore boundaries."""
    return character == "_" or unicodedata.category(character)[0] in {"L", "N"}


def resolve_prompt(prompt: str) -> str:
    """Select Q4, TCS, risk then innovation by whole-token priority, not position."""
    # ECMAScript Unicode simple folding for ASCII keywords (not Python's dotted-I folding).
    normalized = prompt.translate(str.maketrans("ABCDEFGHIJKLMNOPQRSTUVWXYZſK", "abcdefghijklmnopqrstuvwxyzsk"))
    for keyword, text in RESPONSES.items():
        for match in re.finditer(keyword, normalized):
            start, end = match.span()
            if ((start == 0 or not token_character(prompt[start - 1]))
                    and (end == len(prompt) or not token_character(prompt[end]))):
                return text
    return FALLBACK


class AssistantService:
    """Keep owner identity supplied by authentication, never by submitted JSON."""

    def __init__(self, db: Session) -> None:
        """Bind a real response repository to the request transaction."""
        self.repo = AssistantRepository(db)

    def respond(self, user_id: UUID, request: PromptRequest) -> Message:
        """Persist the resolved narrative and return database-generated public fields."""
        return Message.model_validate(self.repo.save(user_id, resolve_prompt(request.prompt)))

    def history(self, user_id: UUID, limit: int = 100, offset: int = 0) -> History:
        """Reject invalid page bounds even for callers outside the HTTP boundary."""
        if type(limit) is not int or type(offset) is not int or not 1 <= limit <= 100 or offset < 0:
            raise ValueError("Invalid history pagination")
        items, total = self.repo.history(user_id, limit, offset)
        return History(items=[Message.model_validate(item) for item in items], total=total)
