from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    mongo_url: str = "mongodb://localhost:27017"
    db_name: str = "noidue"
    jwt_secret: str = "cambiami-in-produzione-con-una-stringa-lunga-casuale"
    jwt_days: int = 60
    cors_origins: str = "*"  # in produzione: l'URL del frontend
    vault_key: str = ""  # chiave per la cassaforte; se vuota si usa JWT_SECRET (non cambiarla dopo!)
    max_users: int = 2  # app privata: al massimo due account in tutto


settings = Settings()
