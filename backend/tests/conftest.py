import os

# Hermetic tests: never fetch the real project's JWKS or write to the real database, even when a
# developer's backend/.env points at Supabase. Env vars win over the .env file in pydantic-settings.
os.environ["SUPABASE_URL"] = ""
os.environ["SUPABASE_SERVICE_KEY"] = ""
os.environ["REQUIRE_AUTH"] = "false"  # tests that need auth build their own Settings(require_auth=True)
