from fastapi import FastAPI, HTTPException
from typing import List
from . import database, cache
from .models import User

app = FastAPI()

@app.get("/")
def read_root():
    return {"message": "Welcome to the EKS-powered FastAPI app!"}

@app.get("/users", response_model=List[User])
def get_users():
    users = database.get_all_users()
    return users

@app.get("/user/{user_id}", response_model=User)
def get_user(user_id: int):
    cached_user = cache.get_user(user_id)
    if cached_user:
        return cached_user
    
    user = database.get_user_by_id(user_id)
    if user:
        cache.set_user(user_id, user)
        return user
    
    raise HTTPException(status_code=404, detail="User not found")