from flask import Blueprint, jsonify, request, render_template, redirect, url_for, current_app
from flask_login import login_user, login_required, logout_user, current_user
from werkzeug.security import check_password_hash
from models import db, User, Team, Member
from utils import update_rotation_schedule, manual_rotate_shifts, check_scheduler_state, check_scheduled_jobs

bp = Blueprint('main', __name__)

@bp.route('/')
def index():
    return render_template('index.html')

@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        user = User.query.filter_by(username=username).first()
        if user and check_password_hash(user.password_hash, password):
            login_user(user)
            next_page = request.args.get('next')
            return jsonify({'success': True, 'redirect': next_page or url_for('main.admin')})
        else:
            return jsonify({'success': False, 'message': 'Invalid username or password'}), 401
    return render_template('login.html')

@bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('main.index'))

@bp.route('/admin')
@login_required
def admin():
    return render_template('admin.html')

@bp.route('/api/teams', methods=['GET', 'POST'])
def teams():
    if request.method == 'POST':
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required for this action'}), 401
        data = request.json
        if not data or 'name' not in data:
            return jsonify({'error': 'Team name is required'}), 400
        new_team = Team(name=data['name'], rotation_schedule=data.get('rotation_schedule'))
        db.session.add(new_team)
        db.session.commit()
        update_rotation_schedule(new_team.id)
        return jsonify({'message': 'Team created successfully', 'id': new_team.id}), 201
    else:
        teams = Team.query.order_by(Team.name).all()
        return jsonify([{
            'id': team.id, 
            'name': team.name, 
            'rotation_schedule': team.rotation_schedule,
            'members': [{
                'id': member.id,
                'name': member.name,
                'position': member.position
            } for member in team.members.order_by(Member.position)]
        } for team in teams])

@bp.route('/api/teams/<int:team_id>', methods=['GET', 'PUT', 'DELETE'])
def team(team_id):
    team = Team.query.get_or_404(team_id)
    
    if request.method == 'GET':
        return jsonify({
            'id': team.id, 
            'name': team.name, 
            'rotation_schedule': team.rotation_schedule,
            'members': [{
                'id': member.id,
                'name': member.name,
                'position': member.position
            } for member in team.members.order_by(Member.position)]
        })
    
    if not current_user.is_authenticated:
        return jsonify({'error': 'Authentication required for this action'}), 401
    
    if request.method == 'PUT':
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        team.name = data.get('name', team.name)
        team.rotation_schedule = data.get('rotation_schedule', team.rotation_schedule)
        db.session.commit()
        update_rotation_schedule(team.id)
        return jsonify({'message': 'Team updated successfully'})
    
    if request.method == 'DELETE':
        db.session.delete(team)
        db.session.commit()
        return jsonify({'message': 'Team deleted successfully'})

@bp.route('/api/teams/<int:team_id>/members', methods=['GET', 'POST'])
def team_members(team_id):
    team = Team.query.get_or_404(team_id)
    
    if request.method == 'POST':
        if not current_user.is_authenticated:
            return jsonify({'error': 'Authentication required for this action'}), 401
        data = request.json
        if not data or 'name' not in data:
            return jsonify({'error': 'Member name is required'}), 400
        new_member = Member(
            name=data['name'],
            team_id=team_id,
            position=len(team.members.all()) + 1
        )
        db.session.add(new_member)
        db.session.commit()
        return jsonify({'message': 'Member added successfully', 'id': new_member.id}), 201
    else:
        if request.referrer and 'admin' in request.referrer:
            members = Member.query.filter_by(team_id=team_id).order_by(Member.position).all()
        else:
            members = Member.query.filter_by(team_id=team_id).order_by(Member.position).limit(3).all()
        return jsonify([{'id': member.id, 'name': member.name, 'position': member.position} for member in members])

@bp.route('/api/teams/<int:team_id>/members/<int:member_id>/remove', methods=['POST'])
@login_required
def remove_member_from_team(team_id, member_id):
    team = Team.query.get_or_404(team_id)
    member = Member.query.get_or_404(member_id)
    
    if member.team_id != team_id:
        return jsonify({'error': 'Member does not belong to the specified team'}), 400
    
    db.session.delete(member)
    db.session.commit()
    
    # Reorder remaining members after deletion
    remaining_members = Member.query.filter_by(team_id=team_id).order_by(Member.position).all()
    for i, m in enumerate(remaining_members, start=1):
        m.position = i
    
    db.session.commit()
    return jsonify({'message': 'Member removed successfully'}), 200

@bp.route('/api/teams/<int:team_id>/members/reorder', methods=['PUT'])
@login_required
def reorder_members(team_id):
    team = Team.query.get_or_404(team_id)
    data = request.json
    if not data or 'order' not in data:
        return jsonify({'error': 'Invalid request data'}), 400
    
    new_order = data['order']
    members = {str(m.id): m for m in team.members}
    
    # Convert new_order to set of strings for comparison
    new_order_set = {str(member_id) for member_id in new_order}
    members_set = set(members.keys())
    
    if new_order_set != members_set:
        return jsonify({'error': 'Invalid member IDs in the new order'}), 400
    
    for index, member_id in enumerate(new_order, start=1):
        members[str(member_id)].position = index
    
    db.session.commit()
    return jsonify({'message': 'Member positions updated successfully'}), 200

@bp.route('/check_scheduler')
@login_required
def check_scheduler():
    check_scheduler_state()
    check_scheduled_jobs()
    return jsonify({'message': 'Scheduler check completed. Check the logs for details.'}), 200

@bp.route('/api/teams/<int:team_id>/rotate', methods=['POST'])
@login_required
def rotate_team(team_id):
    success = manual_rotate_shifts(team_id)
    if success:
        return jsonify({'message': 'Team rotation completed successfully'}), 200
    else:
        return jsonify({'error': 'Failed to rotate team'}), 500