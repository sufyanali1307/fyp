"""
DockerManager — supports both local and remote Docker hosts.


Configuration via environment variables or .env file:
    DOCKER_HOST  — e.g. ssh://root@your-vps-ip   (remote via SSH)
                        tcp://your-vps-ip:2375    (remote via TCP)
                        unix:///var/run/docker.sock (local Linux)
                        (leave empty to auto-detect local Docker Desktop)
    DOCKER_REMOTE_IP — The public IP of the remote host, used to build
                       the access URL shown to the user.  Falls back to
                       "localhost" when running locally.
"""


import os
import docker




class DockerManager:
    def __init__(self, docker_host=None, remote_ip=None):
        """
        Parameters
        ----------
        docker_host : str | None
            Docker daemon address.  Examples:
              • ssh://root@203.0.113.50
              • tcp://203.0.113.50:2375
              • None  →  auto-detect local daemon
        remote_ip : str | None
            The public IP/hostname of the Docker host.
            Used to construct the URL shown to the user.
            Defaults to "localhost".
        """
        self.remote_ip = remote_ip or "localhost"


        try:
            if docker_host:
                self.client = docker.DockerClient(base_url=docker_host, timeout=900)
                print(f"[OK] Connected to remote Docker host: {docker_host}")
            else:
                self.client = docker.from_env(timeout=900)
                print("[OK] Connected to local Docker daemon")
            # Quick connectivity check
            self.client.ping()
        except Exception as e:
            print(f"[WARN] Docker connection failed: {e}")
            print("   The API will still start, but deploy actions will fail")
            print("   until Docker becomes reachable.")
            self.client = None


    # ------------------------------------------------------------------
    # Dockerfile generation (runs locally, no Docker needed)
    # ------------------------------------------------------------------
    def generate_dockerfile(self, project_dir, project_type):
        """Generates a Dockerfile if one doesn't already exist."""
        dockerfile_path = os.path.join(project_dir, 'Dockerfile')


        if os.path.exists(dockerfile_path):
            return True  # Already exists


        templates = {
            'node': """FROM node:18-alpine
WORKDIR /app
COPY . .
RUN if [ -f package.json ]; then npm install; fi
EXPOSE 3000
ENV HOST=0.0.0.0
ENV PORT=3000
# Startup script prioritizing package.json start script or standard entrypoints
CMD ["sh", "-c", "npm start || node index.js || node server.js || exit 1"]
""",
            'react': """FROM node:18-alpine
WORKDIR /app
COPY . .
RUN if [ -f package.json ]; then npm install; fi
# RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
""",
            'python': """FROM python:3.11-slim
WORKDIR /app
COPY . .
# Install C-headers for compiling heavy data science and Django database packages (e.g. psycopg2, numpy)
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev python3-dev && rm -rf /var/lib/apt/lists/*
RUN pip install --upgrade pip --disable-pip-version-check
# Auto-patch psycopg2 issues common in legacy apps without breaking the pipeline
RUN if [ -f requirements.txt ]; then \
        sed -i 's/^psycopg2==/psycopg2-binary==/g' requirements.txt || true; \
        sed -i 's/^psycopg2$/psycopg2-binary/g' requirements.txt || true; \
        pip install --no-cache-dir --disable-pip-version-check -r requirements.txt gunicorn honcho fastapi uvicorn; \
    elif [ -f pyproject.toml ] || [ -f setup.py ]; then \
        pip install --no-cache-dir --disable-pip-version-check . gunicorn honcho fastapi uvicorn; \
    else \
        pip install --no-cache-dir --disable-pip-version-check flask gunicorn honcho fastapi uvicorn; \
    fi
EXPOSE 5000
ENV HOST=0.0.0.0
ENV PORT=5000
# First try Procfile (Heroku style), then Python discovery
CMD ["sh", "-c", "if [ -f Procfile ]; then honcho start web; elif [ -f main.py ]; then uvicorn main:app --host 0.0.0.0 --port 5000 || python main.py; elif [ -f app.py ]; then python app.py; elif [ -f manage.py ]; then python manage.py runserver 0.0.0.0:5000; elif [ -f server.py ]; then python server.py; else gunicorn app:app --bind 0.0.0.0:5000 || python -m http.server 5000; fi"]
""",
            'ml': """FROM python:3.11
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 5000
CMD ["python", "model_api.py"]
""",
            'static': """FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"""
        }


        content = templates.get(project_type, """FROM alpine:latest
CMD ["echo", "Custom environments require a manual Dockerfile"]
""")


        with open(dockerfile_path, 'w') as f:
            f.write(content)


        # Generate .dockerignore
        dockerignore_path = os.path.join(project_dir, '.dockerignore')
        if not os.path.exists(dockerignore_path):
            with open(dockerignore_path, 'w') as f:
                f.write(".git\n.env\n__pycache__\n*.pyc\nnode_modules\nnexus.db\n")


        return True


    # ------------------------------------------------------------------
    # Build & Run
    # ------------------------------------------------------------------
    def build_and_run(self, project_dir, container_name, port_mapping, env_type=None):
        """Builds Docker image and runs the container."""
        if not self.client:
            return False, "Docker is not reachable. Check DOCKER_HOST in .env", None


        try:
            image_name = f"{container_name}_img".lower()


            # Build image
            print(f"Building Docker image {image_name} ...")
            try:
                image, build_logs = self.client.images.build(
                    path=project_dir, tag=image_name, rm=True, nocache=True
                )
            except docker.errors.BuildError as e:
                print(f"[ERROR] Docker Build Failed: {e}")
                log_output = []
                for chunk in e.build_log:
                    if 'stream' in chunk:
                        log_output.append(chunk['stream'])
                full_log = "".join(log_output)
                print("--- BUILD LOGS ---")
                print(full_log)
                print("------------------")
               
                # SELF HEALING FALLBACK
                if env_type and env_type in ['node', 'react', 'python', 'ml']:
                    dockerfile_path = os.path.join(project_dir, 'Dockerfile')
                    backup_path = os.path.join(project_dir, 'Dockerfile.failed')
                    import shutil
                    if os.path.exists(dockerfile_path) and not os.path.exists(backup_path):
                        print("Attempting self-healing fallback build...")
                        error_msg = f"Build failed, attempting self-healing recovery... Original error: {full_log[-200:]}"
                        print(error_msg)
                        shutil.move(dockerfile_path, backup_path)
                        self.generate_dockerfile(project_dir, env_type)
                        try:
                            # Retry build with our template
                            image, build_logs = self.client.images.build(
                                path=project_dir, tag=image_name, rm=True, nocache=True
                            )
                            print("[OK] Self-healing build successful!")
                            # Do NOT return here. Let the script flow down to "Detect EXPOSE port" and "Run Container"
                        except docker.errors.BuildError as fallback_e:
                            shutil.move(backup_path, dockerfile_path) # Revert
                            return False, f"Fallback Build also failed. Error: {fallback_e}", None, 0
                    else:
                        return False, f"Build Failed. See console logs. Last output: {full_log[-500:]}", None, 0
                else:
                    return False, f"Build Failed. See console logs. Last output: {full_log[-500:]}", None, 0


            # Detect EXPOSE port from Dockerfile
            exposed_port = 3000
            dockerfile_path = os.path.join(project_dir, 'Dockerfile')
            if os.path.exists(dockerfile_path):
                with open(dockerfile_path, 'r') as f:
                    for line in f:
                        if line.strip().upper().startswith('EXPOSE '):
                            try:
                                exposed_port = int(line.strip().split()[1])
                            except ValueError:
                                pass


            # Ensure container name is valid (no special chars, only alphanum and dashes/underscores)
            import re
            safe_container_name = re.sub(r'[^a-zA-Z0-9_\-]', '', container_name)


            # Run container with automatic port mapping if port_mapping is 0
            print(f"Running container {safe_container_name} mapping :{port_mapping if port_mapping != 0 else 'auto'} -> :{exposed_port} ...")
           
            run_kwargs = {
                'image': image_name,
                'name': safe_container_name,
                'detach': True,
                'remove': False,
                'mem_limit': '512m',
                'cpu_quota': 50000,
                'environment': {
                    'PORT': str(exposed_port),
                    'HOST': '0.0.0.0'
                }
            }
           
            if port_mapping != 0:
                run_kwargs['ports'] = {f'{exposed_port}/tcp': port_mapping}
            else:
                run_kwargs['publish_all_ports'] = True
               
            container = self.client.containers.run(**run_kwargs)


            # If we asked Docker to assign a random port (port_mapping=0), retrieve it
            assigned_port = port_mapping
            if port_mapping == 0:
                # Need to reload container attrs to get assigned ports
                container.reload()
                ports_dict = container.attrs['NetworkSettings']['Ports']
                # Search across all bindings for the exposed port finding the newly assigned HostPort
                bindings = ports_dict.get(f'{exposed_port}/tcp')
                if bindings and len(bindings) > 0:
                    assigned_port = int(bindings[0]['HostPort'])


            return True, "Container started successfully", container.id, assigned_port
        except Exception as e:
            return False, str(e), None, 0


    # ------------------------------------------------------------------
    # Logs
    # ------------------------------------------------------------------
    def get_container_logs(self, container_id):
        if not self.client:
            return "Docker not reachable"
        try:
            container = self.client.containers.get(container_id)
            return container.logs(tail=200).decode('utf-8', errors='replace')
        except Exception as e:
            return f"Error retrieving logs: {e}"


    # ------------------------------------------------------------------
    # Stop & Remove
    # ------------------------------------------------------------------
    def stop_and_remove_container(self, container_id):
        if not self.client:
            return False
        try:
            container = self.client.containers.get(container_id)
            container.stop(timeout=10)
            container.remove()
            return True
        except Exception as e:
            print(f"Stop/remove container error: {e}")
            return False


    # ------------------------------------------------------------------
    # Remove Image
    # ------------------------------------------------------------------
    def remove_image(self, container_name):
        """Removes the Docker image associated with an environment."""
        if not self.client:
            return False
        try:
            import re
            safe_container_name = re.sub(r'[^a-zA-Z0-9_\-]', '', container_name)
            image_name = f"{safe_container_name}_img".lower()
            print(f"Removing Docker image: {image_name}")
            self.client.images.remove(image_name, force=True)
            return True
        except docker.errors.ImageNotFound:
            print(f"Image {image_name} not found, already removed.")
            return True # Not an error if it doesn't exist
        except Exception as e:
            print(f"Remove image error: {e}")
            return False


    # ------------------------------------------------------------------
    # Helper — build the user-facing URL
    # ------------------------------------------------------------------
    def get_env_url(self, port):
        """Returns the URL users should open to access their environment."""
        return f"http://{self.remote_ip}:{port}"

    def prune_images(self):
        """Prunes dangling images to prevent disk space leaks."""
        if not self.client:
            return False
        try:
            print("Pruning old dangling Docker images...")
            self.client.images.prune(filters={'dangling': True, 'until': '24h'})
            return True
        except Exception as e:
            print(f"Prune images error: {e}")
            return False
