import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or os.urandom(32)
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///team_management.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
