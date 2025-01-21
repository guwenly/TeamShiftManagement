import logging
import json
import os
from datetime import datetime, timedelta
from apscheduler.schedulers.background import BackgroundScheduler
from models import db, Team, Member
from flask import current_app
from croniter import croniter
from pytz import timezone

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

moscow_tz = timezone('Europe/Moscow')
scheduler = BackgroundScheduler(timezone='Europe/Moscow')  # UTC+3 timezone

# Use /app directory for rotation file to avoid container issues
ROTATIONS_FILE = 'team_rotations.json'

def start_scheduler():
    logger.info("Starting the scheduler")
    try:
        if not scheduler.running:
            scheduler.start()
            # Check rotations every minute
            scheduler.add_job(
                check_rotations,
                'cron',
                minute='*',
                id='check_rotations',
                replace_existing=True,
                args=[current_app._get_current_object()]  # Pass app object to the job
            )
            logger.info("Scheduler started successfully")
            logger.info(f"Scheduler state: running={scheduler.running}, state={scheduler.state}")
        else:
            logger.info("Scheduler is already running")
            logger.info(f"Scheduler state: running={scheduler.running}, state={scheduler.state}")
    except Exception as e:
        logger.error(f"Error starting scheduler: {str(e)}")

def load_rotation_data():
    if os.path.exists(ROTATIONS_FILE):
        try:
            with open(ROTATIONS_FILE, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Error loading rotation data: {str(e)}")
            return {}
    return {}

def save_rotation_data(data):
    try:
        # Write to temp file first then move atomically
        temp_file = f"{ROTATIONS_FILE}.tmp"
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        os.replace(temp_file, ROTATIONS_FILE)
    except Exception as e:
        logger.error(f"Error saving rotation data: {str(e)}")

def get_next_rotation_time(schedule, base_time=None):
    if base_time is None:
        base_time = datetime.now()
    
    # Ensure base_time is naive before localizing
    if base_time.tzinfo:
        base_time = base_time.replace(tzinfo=None)
    base_time = moscow_tz.localize(base_time)
        
    try:
        # Convert */2 day format to proper cron format
        schedule_parts = schedule.split()
        if schedule_parts[2] == '*/2':
            # For */2 days, calculate next time manually to ensure 2 day interval
            next_time = base_time.replace(
                hour=int(schedule_parts[1]),
                minute=int(schedule_parts[0]),
                second=0,
                microsecond=0
            ).replace(tzinfo=None)  # Make naive before localizing
            
            # If current time is past today's scheduled time, add 2 days
            if moscow_tz.localize(next_time) <= base_time:
                next_time += timedelta(days=2)
            return moscow_tz.localize(next_time)
        else:
            schedule_parts[4] = f"{schedule_parts[4]} * *" # Add month and year fields
            cron_schedule = ' '.join(schedule_parts)
            
            # Use naive datetime for croniter
            naive_base = base_time.replace(tzinfo=None)
            iter = croniter(cron_schedule, naive_base)
            next_time = iter.get_next(datetime)
            
            # If next time is in the past or too close to current time, get the next occurrence
            if moscow_tz.localize(next_time) <= base_time or (moscow_tz.localize(next_time) - base_time).total_seconds() < 60:
                next_time = iter.get_next(datetime)
                
            return moscow_tz.localize(next_time)
    except Exception as e:
        logger.error(f"Error calculating next rotation time: {str(e)}")
        return moscow_tz.localize(base_time.replace(tzinfo=None) + timedelta(days=1))

def update_rotation_schedule(team_id):
    logger.info(f"Updating rotation schedule for team {team_id}")
    try:
        with current_app.app_context():
            team = Team.query.get(team_id)
            if team and team.rotation_schedule:
                rotations = load_rotation_data()
                current_time = datetime.now()
                # Ensure current_time is naive
                if current_time.tzinfo:
                    current_time = current_time.replace(tzinfo=None)
                current_time = moscow_tz.localize(current_time)
                next_rotation = get_next_rotation_time(team.rotation_schedule, current_time)
                
                # If team already exists in rotations, preserve the last rotation time
                last_rotation = current_time.strftime('%Y-%m-%d %H:%M')
                if str(team_id) in rotations:
                    last_rotation = rotations[str(team_id)].get('last_rotation', last_rotation)
                
                rotations[str(team_id)] = {
                    'schedule': team.rotation_schedule,
                    'next_rotation': next_rotation.strftime('%Y-%m-%d %H:%M'),
                    'last_rotation': last_rotation
                }
                
                save_rotation_data(rotations)
                logger.info(f"Updated rotation schedule for team {team_id}")
                logger.info(f"Next rotation scheduled for: {next_rotation}")
            else:
                rotations = load_rotation_data()
                if str(team_id) in rotations:
                    del rotations[str(team_id)]
                    save_rotation_data(rotations)
                logger.info(f"Removed rotation schedule for team {team_id}")
    except Exception as e:
        logger.error(f"Error updating rotation schedule for team {team_id}: {str(e)}")

def manual_rotate_shifts(team_id):
    logger.info(f"Manual rotation triggered for team {team_id}")
    with current_app.app_context():
        rotate_shifts_for_team(team_id)

def check_scheduler_state():
    logger.info("Checking scheduler state")
    if scheduler.running:
        logger.info("Scheduler is running")
        logger.info(f"Scheduler state: running={scheduler.running}, state={scheduler.state}")
        jobs = scheduler.get_jobs()
        logger.info(f"Number of scheduled jobs: {len(jobs)}")
        for job in jobs:
            logger.info(f"Job ID: {job.id}, Next run time: {job.next_run_time}")
    else:
        logger.warning("Scheduler is not running")
        logger.warning(f"Scheduler state: running={scheduler.running}, state={scheduler.state}")

def check_rotations(app):
    logger.info("Checking rotations")
    with app.app_context():
        rotations = load_rotation_data()
        current_time = datetime.now()
        if current_time.tzinfo:
            current_time = current_time.replace(tzinfo=None)
        current_time = moscow_tz.localize(current_time)
        
        for team_id, data in rotations.items():
            try:
                schedule_parts = data['schedule'].split()
                if len(schedule_parts) == 5:  # Ensure valid cron format
                    minute, hour, day_of_month, _, day = schedule_parts
                    
                    # Convert last rotation date to datetime with time
                    last_rotation = datetime.strptime(data.get('last_rotation', '2000-01-01 00:00'), '%Y-%m-%d %H:%M')
                    last_rotation = moscow_tz.localize(last_rotation)
                    days_since_rotation = (current_time - last_rotation).total_seconds() / 86400  # Convert to days
                    
                    # Check if current time matches schedule
                    current_minute = str(int(current_time.strftime('%M')))  # Remove leading zeros
                    current_hour = str(int(current_time.strftime('%H')))  # Remove leading zeros
                    
                    minute_match = minute == '*' or current_minute == minute
                    hour_match = hour == '*' or current_hour == hour
                    
                    # For 2-day rotation periods
                    if day_of_month == '*/2':
                        # Calculate if enough time has passed since last rotation
                        should_rotate = (days_since_rotation >= 2 and 
                                       minute_match and 
                                       hour_match)
                    else:
                        current_day = str(int(current_time.strftime('%w')))  # 0-6, 0 is Sunday
                        day_match = day == '*' or current_day == day
                        should_rotate = minute_match and hour_match and day_match
                    
                    logger.info(f"Team {team_id} rotation check - should rotate: {should_rotate}")
                    logger.info(f"Days since last rotation: {days_since_rotation}")
                    
                    if should_rotate:
                        logger.info(f"Rotating team {team_id} based on schedule: {data['schedule']}")
                        success = rotate_shifts_for_team(int(team_id))
                        
                        if success:
                            # Only update the rotation data when an actual rotation occurs
                            data['last_rotation'] = current_time.strftime('%Y-%m-%d %H:%M')
                            next_rotation = get_next_rotation_time(data['schedule'], current_time)
                            data['next_rotation'] = next_rotation.strftime('%Y-%m-%d %H:%M')
                            save_rotation_data(rotations)
                            logger.info(f"Updated rotation data for team {team_id}")
                        else:
                            logger.error(f"Rotation failed for team {team_id}")
            except Exception as e:
                logger.error(f"Error processing rotation for team {team_id}: {str(e)}")
                logger.exception("Traceback:")

def check_scheduled_jobs():
    logger.info("Checking all scheduled jobs")
    jobs = scheduler.get_jobs()
    logger.info(f"Total number of scheduled jobs: {len(jobs)}")
    for job in jobs:
        logger.info(f"Job ID: {job.id}, Next run time: {job.next_run_time}, Func: {job.func.__name__}")

def schedule_rotations(app):
    logger.info("Scheduling rotations for all teams")
    try:
        with app.app_context():
            teams = Team.query.all()
            for team in teams:
                if team.rotation_schedule:
                    update_rotation_schedule(team.id)
                else:
                    logger.warning(f"Team {team.id} has no rotation schedule set")
    except Exception as e:
        logger.error(f"Error scheduling rotations: {str(e)}")
    
    check_scheduled_jobs()

def rotate_shifts_for_team(team_id):
    logger.info(f"Starting rotation for team {team_id}")
    try:
        team = Team.query.get(team_id)
        if team:
            logger.info(f"Team {team_id} found: {team.name}")
            
            members = team.members.order_by(Member.position).all()
            logger.info(f"Team {team_id} has {len(members)} members")
            
            if members:
                first_position = min(member.position for member in members)
                last_position = max(member.position for member in members)
                
                for member in members:
                    old_position = member.position
                    if member.position == first_position:
                        member.position = last_position
                    else:
                        member.position -= 1
                    logger.info(f"Member {member.id} moved from position {old_position} to {member.position}")
                
                db.session.commit()
                logger.info(f"Successfully rotated shifts for team {team_id}")
                
                return True
            else:
                logger.warning(f"No members found for team {team_id}")
        else:
            logger.warning(f"Team {team_id} not found")
    except Exception as e:
        logger.error(f"Error rotating shifts for team {team_id}: {str(e)}")
        logger.exception("Traceback:")
        db.session.rollback()
    
    return False
