# Automated DevOps-Based Deployment Dashboard with AI/ML Model Support

Welcome to the **NexusCode** platform. This complete full-stack DevOps automation dashboard enables rapid environment provisioning for files, GitHub repositories, and AI/ML model deployments using Python, Flask, and Docker.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Python 3.9+** | Used for the Flask backend |
| **Docker Engine** | Can run locally **or** on a remote Linux VPS |
| **Git** | Required for GitHub repository cloning |
| **paramiko** (Python) | Auto-installed; needed for SSH Docker connections |

> **⚠️ No Docker Desktop / Hyper-V required.**  
> The backend connects to any Docker host via SSH or TCP.  
> You can use a cheap Linux VPS ($4–6/month) or even Oracle Cloud's free tier.

---

## Quick Start

### 1. Install Python Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Configure Docker Host

Edit `backend/.env`:

```env
# For a remote VPS (recommended — no Hyper-V needed):
DOCKER_HOST=ssh://root@YOUR_VPS_IP
DOCKER_REMOTE_IP=YOUR_VPS_IP

# For local Docker (if available):
# DOCKER_HOST=
# DOCKER_REMOTE_IP=localhost
```

### 3. (Remote VPS Only) Prepare the VPS

On your Ubuntu/Debian VPS, run:

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Ensure your SSH key is authorized
# (from your Windows machine)
ssh-keygen -t ed25519          # if you don't have a key yet
ssh-copy-id root@YOUR_VPS_IP   # copies your key to the VPS
```

### 4. Start the Backend

```bash
cd backend
python app.py
```

The API will run on `http://localhost:8000`.

### 5. Open the Frontend

Open `index.html` in your browser.  The frontend connects to the API at `localhost:8000` automatically.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/environments` | List all environments |
| `POST` | `/api/environments` | Create environment (files, GitHub, AI, ML) |
| `POST` | `/api/environments/<id>/deploy` | Build Docker image and run container |
| `POST` | `/api/environments/<id>/stop` | Stop and remove container |
| `GET` | `/api/environments/<id>/logs` | Fetch container logs |
| `GET` | `/api/environments/<id>` | Get environment details |

---

## Feature Overview

| Feature | How it Works |
|---|---|
| **File Upload** | Upload project files → auto-detect type → generate Dockerfile → build & run |
| **GitHub Import** | Clone repo → analyze structure → generate Dockerfile → build & run |
| **AI/ML Model** | Upload `.pkl` / `.h5` / `.joblib` → generate Flask API wrapper → Dockerize → serve `/predict` endpoint |
| **Live Logs** | Frontend polls container logs every 2 seconds and displays in terminal viewer |
| **Environment Lifecycle** | Create → Build → Deploy → Running → Stop |

---

## Project Structure

```
Sufyan/
├── index.html                 # Frontend dashboard
├── script.js                  # Frontend logic (API calls)
├── styles.css                 # Frontend styles
├── architecture.md            # Academic documentation & diagrams
├── README.md                  # This file
└── backend/
    ├── .env                   # Docker host configuration
    ├── app.py                 # Flask API server
    ├── models.py              # SQLite database models
    ├── docker_manager.py      # Docker build/run/stop (local or remote)
    ├── github_manager.py      # Git repository cloning
    ├── ml_handler.py          # ML model API wrapper generator
    └── requirements.txt       # Python dependencies
```
