import os
import uuid
import shutil
import time
import threading
from datetime import datetime, timedelta, timezone
from flask import Flask, request, jsonify, stream_with_context, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename


# Local imports
from models import db, Environment
from docker_manager import DockerManager
from github_manager import GitHubManager
from ml_handler import MLHandler


# ── Load .env file (simple parser, no extra dependency) ──
def load_dotenv(path):
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                key, value = line.split('=', 1)
                os.environ.setdefault(key.strip(), value.strip())


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(BASE_DIR, '.env'))


import logging

app = Flask(__name__)
CORS(app)

# Silence polling logs to prevent console flooding during deployment
class PollingFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        if 'GET /api/environments' in msg and '200' in msg:
            return False
        return True

logging.getLogger('werkzeug').addFilter(PollingFilter())


# Configuration
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'nexus.db') + '?check_same_thread=False'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
UPLOAD_FOLDER = os.path.join(BASE_DIR, 'uploads')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


# Ensure upload folder exists
os.makedirs(UPLOAD_FOLDER, exist_ok=True)


# Initialize DB
db.init_app(app)


with app.app_context():
    db.create_all()


# ── Initialize Managers ──
DOCKER_HOST = os.environ.get('DOCKER_HOST', None)
DOCKER_REMOTE_IP = os.environ.get('DOCKER_REMOTE_IP', 'localhost')


docker_manager = DockerManager(docker_host=DOCKER_HOST, remote_ip=DOCKER_REMOTE_IP)
github_manager = GitHubManager(UPLOAD_FOLDER)
ml_handler = MLHandler(UPLOAD_FOLDER)


# Helper function to generate unique ID
def get_uuid():
    return f"nexus-{uuid.uuid4().hex}"


# ── Expiry Cleanup Worker ──
def cleanup_expired_environments():
    while True:
        try:
            with app.app_context():
                now = datetime.now(timezone.utc)
                expired_envs = Environment.query.filter(Environment.expires_at <= now, Environment.status != 'expired').all()
                for env in expired_envs:
                    print(f"Auto-expiring environment: {env.id}")
                    if env.container_id:
                        docker_manager.stop_and_remove_container(env.container_id)
                    docker_manager.remove_image(env.id)
                   
                    if env.target_dir and os.path.exists(env.target_dir):
                        try:
                            shutil.rmtree(env.target_dir)
                        except Exception as e:
                            print(f"Failed to delete directory {env.target_dir}: {e}")
                           
                    env.status = 'expired'
                    env.container_id = None
                    env.port = None
                    env.url = None
               
                try:
                    db.session.commit()
                except Exception as db_e:
                    print(f"DB Commit failed during cleanup: {db_e}")
                    db.session.rollback()
        except Exception as e:
             print(f"Cleanup thread error: {e}")
             
        # Run every 60 seconds
        time.sleep(60)


# Start cleanup thread if not main auto-reloader sub-process
if not os.environ.get('WERKZEUG_RUN_MAIN'):
    cleanup_thread = threading.Thread(target=cleanup_expired_environments, daemon=True)
    cleanup_thread.start()




@app.route('/api/environments', methods=['GET'])
def list_environments():
    envs = Environment.query.all()
    return jsonify({
        'success': True,
        'count': len(envs),
        'environments': [env.to_dict() for env in envs]
    })




@app.route('/api/environments', methods=['POST'])
def create_environment():
    data = request.form
    env_type = data.get('type')
    source = data.get('source')
    env_name = data.get('name', f"NexusEnv-{uuid.uuid4().hex[:6]}")
    env_id = get_uuid()


    target_dir = os.path.join(app.config['UPLOAD_FOLDER'], env_id)
    os.makedirs(target_dir, exist_ok=True)


    # Handle based on source
    env_type = data.get('type', 'custom') # Default fallback
    if source == 'github':
        repo_url = data.get('url', '').strip()
        branch = data.get('branch')
       
        success, res = github_manager.clone_repo(repo_url, branch, env_id)
        if not success:
            return jsonify({'success': False, 'error': res}), 400
           
        # Auto-detect Python or Node environments (useful for Fallback Self-Healing)
        if (os.path.exists(os.path.join(target_dir, 'requirements.txt')) or
            os.path.exists(os.path.join(target_dir, 'app.py')) or
            os.path.exists(os.path.join(target_dir, 'main.py')) or
            os.path.exists(os.path.join(target_dir, 'pyproject.toml')) or
            os.path.exists(os.path.join(target_dir, 'setup.py'))):
            env_type = 'python'
        elif os.path.exists(os.path.join(target_dir, 'package.json')):
            if os.path.exists(os.path.join(target_dir, 'public')) and os.path.exists(os.path.join(target_dir, 'src/App.js')):
                env_type = 'react'
            else:
                env_type = 'node'
        elif os.path.exists(os.path.join(target_dir, 'index.html')):
            env_type = 'static'
    elif source == 'files' or source == 'ml':
        if 'file' not in request.files and not request.files.getlist('files[]'):
            return jsonify({'success': False, 'error': 'No files provided'}), 400
           
        files = request.files.getlist('files[]')
        if not files: # fall back to single file for ML
            files = [request.files.get('file')]
           
        for file in files:
            if file and file.filename:
                # Secure path while preserving internal folder structure from webkitRelativePath
                parts = file.filename.replace('\\', '/').split('/')
                safe_parts = [secure_filename(p) for p in parts if p]
                if not safe_parts: continue
                
                # If uploaded via folder, the first element is the root folder name. 
                # We strip it so the actual project files land in the target_dir root.
                if len(safe_parts) > 1:
                    safe_parts.pop(0)
                    
                final_rel_path = os.path.join(*safe_parts) if safe_parts else secure_filename(file.filename)
                file_path = os.path.join(target_dir, final_rel_path)
                
                os.makedirs(os.path.dirname(file_path), exist_ok=True)
                file.save(file_path)
               
                # If ml source, setup the python wrapper
                if source == 'ml':
                    ml_handler.generate_api_wrapper(env_id, final_rel_path, target_dir)
                    env_type = 'ml'


    elif source == 'ai':
        import json
        description = data.get('description', 'AI Generated App')
        framework = data.get('framework', 'python')
        
        # Enforce basic alphanumeric framework string to prevent logic bypass
        import re
        framework = re.sub(r'[^a-zA-Z0-9_\-]', '', framework)
        description_safestring = json.dumps(description) # Safely escapes quotes and newlines for injection
        
        file_content = f"""from flask import Flask
app = Flask(__name__)


@app.route('/')
def hello():
    return '''
    <html>
        <body style="font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; background: #0f172a; color: white;">
            <div style="text-align: center; max-width: 600px; padding: 2rem; background: #1e293b; border-radius: 12px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);">
                <h1 style="color: #8b5cf6;">🚀 Nexus AI Generated Component</h1>
                <p><strong>Framework:</strong> {framework}</p>
                <p style="font-size: 1.2rem; color: #cbd5e1; margin-top: 1rem;">''' + {description_safestring} + '''</p>
            </div>
        </body>
    </html>
    '''


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
"""
        with open(os.path.join(target_dir, 'app.py'), 'w', encoding='utf-8') as f:
            f.write(file_content)
       
        with open(os.path.join(target_dir, 'requirements.txt'), 'w', encoding='utf-8') as f:
            f.write("flask\n")
        env_type = 'python'


    # Generate Dockerfile
    docker_manager.generate_dockerfile(target_dir, env_type)


    # Save to Database
    new_env = Environment(
        id=env_id,
        name=env_name,
        type=env_type,
        source=source,
        status='created',
        target_dir=target_dir,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24) # Set expiry
    )
    db.session.add(new_env)
    db.session.commit()


    return jsonify({
        'success': True,
        'environmentId': env_id,
        'message': 'Environment created successfully',
        'data': new_env.to_dict()
    })




@app.route('/api/environments/<env_id>/deploy', methods=['POST'])
def deploy_environment(env_id):
    env = db.session.get(Environment, env_id)
    if not env:
        return jsonify({'success': False, 'error': 'Environment not found'}), 404


    if env.status in ['deploying', 'running']:
        return jsonify({'success': False, 'error': 'Environment is already deploying or running.'}), 400


    target_dir = env.target_dir
   
    # 0 tells docker_manager to let Docker assign a port natively, preventing race conditions.
    port = 0
   
    env.status = 'deploying'
    db.session.commit()


    def bg_deploy(target_dir, env_id, port, env_type):
        with app.app_context():
            bg_env = db.session.get(Environment, env_id)
            if not bg_env:
                return
            
            success, msg, container_id, assigned_port = docker_manager.build_and_run(target_dir, env_id, port, env_type)
            
            if success:
                bg_env.container_id = container_id
                bg_env.port = assigned_port
                bg_env.status = 'running'
                bg_env.deployed_at = datetime.now(timezone.utc)
                bg_env.url = docker_manager.get_env_url(assigned_port)
            else:
                bg_env.status = 'failed'
                print(f"Deploy failed: {msg}")
                
            try:
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                print(f"DB Commit failed in bg_deploy: {e}")

    threading.Thread(target=bg_deploy, args=(target_dir, env_id, port, env.type), daemon=True).start()

    return jsonify({
        'success': True,
        'message': 'Environment deployment started',
        'data': env.to_dict()
    })




@app.route('/api/environments/<env_id>/stop', methods=['POST'])
def stop_environment(env_id):
    env = db.session.get(Environment, env_id)
    if not env:
         return jsonify({'success': False, 'error': 'Environment not found'}), 404


    if env.container_id:
        docker_manager.stop_and_remove_container(env.container_id)
   
    env.status = 'stopped'
    db.session.commit()
    return jsonify({'success': True, 'message': 'Environment stopped'})


@app.route('/api/environments/<env_id>', methods=['DELETE'])
def delete_environment(env_id):
    env = db.session.get(Environment, env_id)
    if not env:
         return jsonify({'success': False, 'error': 'Environment not found'}), 404


    # Stop container and clean image
    if env.container_id:
        docker_manager.stop_and_remove_container(env.container_id)
    docker_manager.remove_image(env.id)
       
    # Remove files
    if env.target_dir and os.path.exists(env.target_dir):
        try:
            shutil.rmtree(env.target_dir)
        except Exception as e:
            print(f"Failed to delete directory {env.target_dir}: {e}")
           
    # Delete from DB
    db.session.delete(env)
    db.session.commit()
    return jsonify({'success': True, 'message': 'Environment deleted permanently'})


@app.route('/api/environments/<env_id>/logs', methods=['GET'])
def get_logs(env_id):
    env = db.session.get(Environment, env_id)
    if not env or not env.container_id:
        return jsonify({'success': False, 'logs': 'No logs available.'})


    logs = docker_manager.get_container_logs(env.container_id)
    return jsonify({'success': True, 'logs': logs})


@app.route('/api/environments/<env_id>', methods=['GET'])
def get_environment(env_id):
    env = db.session.get(Environment, env_id)
    if not env:
        return jsonify({'success': False, 'error': 'Environment not found'}), 404
       
    return jsonify({
        'success': True,
        'data': env.to_dict()
    })


if __name__ == '__main__':
    app.run(debug=True, port=8000)



