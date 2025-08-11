from .models import User

# Mock cache
_cache = {}

def get_user(user_id):
    """Retrieves a user from the cache."""
    return _cache.get(user_id)

def set_user(user_id, user):
    """Stores a user in the cache."""
    _cache[user_id] = user