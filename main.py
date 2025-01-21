import logging
import subprocess
import os
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from config import Config
from models import db, User
from auth import login_manager
from routes import bp
from utils import start_scheduler, schedule_rotations, check_scheduler_state, check_scheduled_jobs
from apscheduler.schedulers.background import BackgroundScheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder=os.path.abspath('static'))
app.config.from_object(Config)

db.init_app(app)
migrate = Migrate(app, db)
login_manager.init_app(app)
login_manager.login_view = 'main.login'

app.register_blueprint(bp)

def create_default_user():
    with app.app_context():
        try:
            db.create_all()
            if not User.query.first():
                default_admin = User(username='admin')
                default_admin.set_password('Sistem01*1')
                db.session.add(default_admin)
                db.session.commit()
                logger.info("Default admin user created.")
        except Exception as e:
            logger.error(f"Error creating default user: {str(e)}")
            logger.exception("Traceback:")

def build_css():
    try:
        subprocess.run(["node", "build_css.js"], check=True)
        logger.info("CSS built successfully")
    except subprocess.CalledProcessError as e:
        logger.error(f"Error building CSS: {e}")
    except FileNotFoundError:
        logger.error("Node.js not found. Please install Node.js to build CSS.")

def initialize_app():
    with app.app_context():
        try:
            db.create_all()
            start_scheduler()
            schedule_rotations(app)
            check_scheduler_state()
            check_scheduled_jobs()
            logger.info("App initialized successfully")
        except Exception as e:
            logger.error(f"Error initializing app: {str(e)}")
            logger.exception("Traceback:")

def periodic_scheduler_check():
    with app.app_context():
        try:
            check_scheduler_state()
            check_scheduled_jobs()
            if not scheduler.running:
                logger.warning("Scheduler is not running. Attempting to restart...")
                start_scheduler()
        except Exception as e:
            logger.error(f"Error during periodic scheduler check: {str(e)}")
            logger.exception("Traceback:")

build_css()
create_default_user()

with app.app_context():
    initialize_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
