from pydantic import BaseModel
from typing import Optional, List

class User(BaseModel):
    id: int
    name: str
    email: str
    users: Optional[List[str]] = None
    address: Optional[str] = None