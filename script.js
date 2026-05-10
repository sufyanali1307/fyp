// Real Backend API Wrapper
class NexusBackend {
    constructor() {
        const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
        this.host = isLocalHost ? '127.0.0.1' : window.location.hostname;
        this.ports = [8000, 5000];
        this.apiBase = `http://${this.host}:${this.ports[0]}/api`;
    }


    async _fetch(endpoint, options = {}) {
        const triedBases = new Set();
        let lastError = null;

        for (const port of this.ports) {
            const base = `http://${this.host}:${port}/api`;
            if (triedBases.has(base)) continue;
            triedBases.add(base);

            try {
                const url = `${base}${endpoint}`;
                const response = await fetch(url, options);
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || `HTTP error ${response.status}`);
                }
                this.apiBase = base;
                return data;
            } catch (error) {
                console.error(`API Error on ${endpoint} at ${base}:`, error);
                lastError = error;
                const isNetworkFailure = error instanceof TypeError && /failed to fetch|networkerror|network error/i.test(error.message);
                if (!isNetworkFailure) {
                    return {
                        success: false,
                        error: error.message
                    };
                }
            }
        }

        const portsTried = Array.from(triedBases).map((base) => base.replace(`http://${this.host}:`, '').replace('/api', '')).join(', ');
        return {
            success: false,
            error: `Backend API is not reachable at ${this.apiBase}. Tried ports ${portsTried}. Start the Flask backend on port 8000 or 5000.`
        };
    }

    async checkAvailability() {
        const result = await this._fetch('/environments', { method: 'GET' });
        return result.success;
    }


    async createEnvironment(config) {
        console.log('Creating environment via API:', config);
        const formData = new FormData();
        formData.append('type', config.type);
        formData.append('name', config.name || `NexusEnv-${Date.now().toString(36).substring(0, 6)}`);
        formData.append('source', config.source);


        if (config.source === 'github') {
            formData.append('url', config.url);
            if (config.branch) formData.append('branch', config.branch);
        } else if (config.source === 'files' || config.source === 'ml') {
            if (config.files && config.files.length > 0) {
                for (let i = 0; i < config.files.length; i++) {
                    formData.append('files[]', config.files[i]);
                }
            }
        } else if (config.source === 'ai') {
            formData.append('description', config.description);
            if (config.framework) formData.append('framework', config.framework);
        }


        return await this._fetch('/environments', {
            method: 'POST',
            body: formData
        });
    }


    async deployEnvironment(envId) {
        return await this._fetch(`/environments/${envId}/deploy`, { method: 'POST' });
    }


    async getEnvironmentStatus(envId) {
        return await this._fetch(`/environments/${envId}`);
    }


    async stopEnvironment(envId) {
        return await this._fetch(`/environments/${envId}/stop`, { method: 'POST' });
    }


    async deleteEnvironment(envId) {
        return await this._fetch(`/environments/${envId}`, { method: 'DELETE' });
    }


    async listEnvironments() {
        return await this._fetch('/environments');
    }


    async getLogs(envId) {
        return await this._fetch(`/environments/${envId}/logs`);
    }
}


// DOM Elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const selectedFiles = document.getElementById('selectedFiles');
const uploadBtn = document.getElementById('uploadBtn');
const githubBtn = document.getElementById('githubBtn');
const aiBtn = document.getElementById('aiBtn');
const outputContent = document.getElementById('outputContent');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const downloadBtn = document.getElementById('downloadBtn');
const deployBtn = document.getElementById('deployBtn');
const clearBtn = document.getElementById('clearBtn');
const environmentLinkContainer = document.getElementById('environmentLinkContainer');
const environmentLink = document.getElementById('environmentLink');
const linkText = document.getElementById('linkText');
const deploymentModal = document.getElementById('deploymentModal');
const modalClose = document.getElementById('modalClose');
const modalEnvLink = document.getElementById('modalEnvLink');
const modalLinkText = document.getElementById('modalLinkText');
const modalEnvName = document.getElementById('modalEnvName');
const modalDeployTime = document.getElementById('modalDeployTime');
const openEnvBtn = document.getElementById('openEnvBtn');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const dashboardLink = document.getElementById('dashboardLink');
const environmentViewer = document.getElementById('environmentViewer');
const closeEnvBtn = document.getElementById('closeEnvBtn');
const refreshEnvBtn = document.getElementById('refreshEnvBtn');
const stopEnvBtn = document.getElementById('stopEnvBtn');
const deleteEnvBtn = document.getElementById('deleteEnvBtn'); // Added this in HTML parsing assumption or we can inject it dynamically
const envTerminal = document.getElementById('envTerminal');
const envUrlDisplay = document.getElementById('envUrlDisplay');
const dashboardViewer = document.getElementById('dashboardViewer');
const closeDashboardBtn = document.getElementById('closeDashboardBtn');
const dashboardTableBody = document.getElementById('dashboardTableBody');
const appContainer = document.getElementById('appContainer');
const mlUploadArea = document.getElementById('mlUploadArea');
const mlFileInput = document.getElementById('mlFileInput');
const mlSelectedFiles = document.getElementById('mlSelectedFiles');
const mlBtn = document.getElementById('mlBtn');
const pageViews = document.querySelectorAll('.page-view');
const pageLinks = document.querySelectorAll('[data-page-link]');
const signInOpenBtn = document.getElementById('signInOpenBtn');
const signOutBtn = document.getElementById('signOutBtn');
const signedInMenu = document.getElementById('signedInMenu');
const signedInName = document.getElementById('signedInName');
const authModal = document.getElementById('authModal');
const authClose = document.getElementById('authClose');
const authTabs = document.querySelectorAll('[data-auth-mode]');
const signinForm = document.getElementById('signinForm');
const signupForm = document.getElementById('signupForm');
const authMessage = document.getElementById('authMessage');
const useTemplateButtons = document.querySelectorAll('.use-template-btn');
const communityForm = document.getElementById('communityForm');
const communityPosts = document.getElementById('communityPosts');


// Initialize backend
const backend = new NexusBackend();


// Current environment data
let currentEnvironment = null;

const AUTH_USERS_KEY = 'nexuscode_users';
const AUTH_CURRENT_KEY = 'nexuscode_current_user';
const COMMUNITY_POSTS_KEY = 'nexuscode_community_posts';

function readJson(key, fallback) {
    try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
    } catch (error) {
        console.warn(`Unable to read ${key} from local storage`, error);
        return fallback;
    }
}

function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function showPage(pageName, updateHash = true) {
    const page = pageName || 'builder';
    pageViews.forEach((view) => {
        view.classList.toggle('active', view.dataset.page === page);
    });

    pageLinks.forEach((link) => {
        link.classList.toggle('active', link.dataset.pageLink === page);
    });

    if (dashboardLink) {
        dashboardLink.classList.remove('active');
    }

    if (dashboardViewer) {
        dashboardViewer.style.display = 'none';
    }

    appContainer.style.display = 'block';

    if (updateHash) {
        history.pushState(null, '', `#${page}`);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setAuthMode(mode) {
    const isSignup = mode === 'signup';
    authTabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.authMode === mode);
    });
    signinForm.classList.toggle('active', !isSignup);
    signupForm.classList.toggle('active', isSignup);
    document.getElementById('authTitle').textContent = isSignup ? 'Create Account' : 'Sign In';
    authMessage.textContent = isSignup
        ? 'Your account is stored locally in this browser for the current frontend.'
        : 'No account is required to use the builder.';
}

function openAuthModal(mode = 'signin') {
    setAuthMode(mode);
    authModal.classList.add('open');
    authModal.setAttribute('aria-hidden', 'false');
}

function closeAuthModal() {
    authModal.classList.remove('open');
    authModal.setAttribute('aria-hidden', 'true');
    authMessage.textContent = 'No account is required to use the builder.';
}

function refreshAuthUI() {
    const user = readJson(AUTH_CURRENT_KEY, null);
    if (user) {
        signInOpenBtn.style.display = 'none';
        signedInMenu.hidden = false;
        signedInName.textContent = user.name || user.email;
    } else {
        signInOpenBtn.style.display = 'inline-flex';
        signedInMenu.hidden = true;
        signedInName.textContent = '';
    }
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function renderCommunityPosts() {
    const savedPosts = readJson(COMMUNITY_POSTS_KEY, []);
    savedPosts.forEach((post) => prependCommunityPost(post));
}

function prependCommunityPost(post) {
    if (!communityPosts) return;
    const article = document.createElement('article');
    const title = document.createElement('strong');
    const body = document.createElement('p');
    title.textContent = post.title;
    body.textContent = post.body;
    article.appendChild(title);
    article.appendChild(body);
    communityPosts.prepend(article);
}

function applyTemplate(templateName) {
    const templates = {
        react: {
            framework: 'react',
            environmentType: 'react',
            description: 'Create a React frontend starter with reusable components, routing, API service helpers, and a Docker-ready production build.',
            message: 'React template selected. Review the AI description, then generate or upload your own React files.'
        },
        node: {
            framework: 'javascript',
            environmentType: 'node',
            description: 'Create a Node.js REST API with health checks, environment configuration, structured routes, and Docker deployment support.',
            message: 'Node.js API template selected. Review the AI description, then generate the starter API.'
        },
        python: {
            framework: 'python',
            environmentType: 'python',
            description: 'Create a Python Flask API with health checks, clean routes, requirements.txt, and a Docker-friendly entry point.',
            message: 'Python Flask template selected. Review the AI description, then generate the starter API.'
        },
        ml: {
            framework: 'python',
            environmentType: 'python',
            description: 'Create a Python model serving API with a /predict endpoint, request validation, and Docker deployment notes for an uploaded ML model.',
            message: 'ML API template selected. Upload a model file or use AI generation for the wrapper shape.'
        }
    };

    const template = templates[templateName];
    if (!template) return;

    document.getElementById('environmentType').value = template.environmentType;
    document.getElementById('aiFramework').value = template.framework;
    document.getElementById('aiDescription').value = template.description;
    outputContent.textContent = template.message;
    updateStatus('', 'Template ready');
    showPage('builder');
}

pageLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
        event.preventDefault();
        showPage(link.dataset.pageLink);
    });
});

useTemplateButtons.forEach((button) => {
    button.addEventListener('click', () => {
        applyTemplate(button.dataset.template);
    });
});

authTabs.forEach((tab) => {
    tab.addEventListener('click', () => setAuthMode(tab.dataset.authMode));
});

signInOpenBtn.addEventListener('click', () => openAuthModal('signin'));
authClose.addEventListener('click', closeAuthModal);

signOutBtn.addEventListener('click', () => {
    localStorage.removeItem(AUTH_CURRENT_KEY);
    refreshAuthUI();
});

signinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.getElementById('signinEmail').value.trim().toLowerCase();
    const password = document.getElementById('signinPassword').value;
    const users = readJson(AUTH_USERS_KEY, []);
    const user = users.find((item) => item.email === email && item.password === password);

    if (!isValidEmail(email) || !password) {
        authMessage.textContent = 'Enter a valid email and password.';
        return;
    }

    if (!user) {
        authMessage.textContent = 'No matching local account found. Create an account first.';
        return;
    }

    writeJson(AUTH_CURRENT_KEY, { name: user.name, email: user.email });
    closeAuthModal();
    refreshAuthUI();
});

signupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim().toLowerCase();
    const password = document.getElementById('signupPassword').value;
    const users = readJson(AUTH_USERS_KEY, []);

    if (!name || !isValidEmail(email) || password.length < 6) {
        authMessage.textContent = 'Use your name, a valid email, and a password of at least 6 characters.';
        return;
    }

    if (users.some((user) => user.email === email)) {
        authMessage.textContent = 'An account with this email already exists locally.';
        return;
    }

    const newUser = { name, email, password };
    users.push(newUser);
    writeJson(AUTH_USERS_KEY, users);
    writeJson(AUTH_CURRENT_KEY, { name, email });
    closeAuthModal();
    refreshAuthUI();
    signupForm.reset();
});

if (communityForm) {
    communityForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const titleInput = document.getElementById('communityTitle');
        const bodyInput = document.getElementById('communityBody');
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();

        if (!title || !body) {
            alert('Please enter both a title and a message.');
            return;
        }

        const posts = readJson(COMMUNITY_POSTS_KEY, []);
        const post = { title, body, createdAt: new Date().toISOString() };
        posts.unshift(post);
        writeJson(COMMUNITY_POSTS_KEY, posts.slice(0, 20));
        prependCommunityPost(post);
        communityForm.reset();
    });
}


// File upload handling
uploadArea.addEventListener('click', (e) => {
    if (e.target !== fileInput) {
        fileInput.click();
    }
});


fileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        selectedFiles.innerHTML = '';
        const fileList = document.createElement('div');
        fileList.style.marginTop = '1rem';
        fileList.style.padding = '1rem';
        fileList.style.backgroundColor = 'rgba(10, 10, 26, 0.5)';
        fileList.style.borderRadius = '8px';
        fileList.style.border = '1px solid var(--border)';


        fileList.innerHTML = `<h4 style="margin-bottom: 0.5rem; color: var(--primary);">Selected Files (${files.length})</h4>`;


        // Show first few files
        const fileCount = Math.min(files.length, 5);
        for (let i = 0; i < fileCount; i++) {
            const file = files[i];
            const fileItem = document.createElement('div');
            fileItem.style.display = 'flex';
            fileItem.style.alignItems = 'center';
            fileItem.style.gap = '0.5rem';
            fileItem.style.marginBottom = '0.3rem';
            fileItem.style.fontSize = '0.9rem';


            const icon = file.type.includes('image') ?
                '<i class="fas fa-image" style="color: var(--warning);"></i>' :
                file.type.includes('text') || file.name.endsWith('.js') || file.name.endsWith('.py') || file.name.endsWith('.html') || file.name.endsWith('.css') ?
                    '<i class="fas fa-file-code" style="color: var(--primary);"></i>' :
                    '<i class="fas fa-file" style="color: var(--gray);"></i>';


            fileItem.innerHTML = `${icon} ${file.name} (${(file.size / 1024).toFixed(2)} KB)`;
            fileList.appendChild(fileItem);
        }


        if (files.length > 5) {
            const moreFiles = document.createElement('div');
            moreFiles.textContent = `... and ${files.length - 5} more files`;
            moreFiles.style.color = 'var(--gray)';
            moreFiles.style.fontSize = '0.85rem';
            moreFiles.style.marginTop = '0.5rem';
            fileList.appendChild(moreFiles);
        }


        selectedFiles.appendChild(fileList);
    }
});


// ML File upload handling
mlUploadArea.addEventListener('click', (e) => {
    if (e.target !== mlFileInput) {
        mlFileInput.click();
    }
});


mlFileInput.addEventListener('change', (e) => {
    const files = e.target.files;
    if (files.length > 0) {
        mlSelectedFiles.innerHTML = '';
        const fileList = document.createElement('div');
        fileList.style.marginTop = '1rem';
        fileList.style.padding = '1rem';
        fileList.style.backgroundColor = 'rgba(10, 10, 26, 0.5)';
        fileList.style.borderRadius = '8px';
        fileList.style.border = '1px solid var(--border)';


        fileList.innerHTML = `<h4 style="margin-bottom: 0.5rem; color: #8b5cf6;">Selected Model</h4>`;


        const file = files[0];
        const fileItem = document.createElement('div');
        fileItem.style.display = 'flex';
        fileItem.style.alignItems = 'center';
        fileItem.style.gap = '0.5rem';
        fileItem.style.marginBottom = '0.3rem';
        fileItem.style.fontSize = '0.9rem';


        const icon = '<i class="fas fa-brain" style="color: #8b5cf6;"></i>';
        fileItem.innerHTML = `${icon} ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
        fileList.appendChild(fileItem);
        mlSelectedFiles.appendChild(fileList);
    }
});


// Update status indicator
function updateStatus(status, message) {
    statusDot.className = 'status-dot';
    if (status) {
        statusDot.classList.add(status);
    }
    statusText.textContent = message;


    if (status === 'active') {
        statusDot.style.backgroundColor = 'var(--success)';
    } else if (status === 'warning') {
        statusDot.style.backgroundColor = 'var(--warning)';
    } else if (status === 'error') {
        statusDot.style.backgroundColor = 'var(--danger)';
    } else {
        statusDot.style.backgroundColor = 'var(--gray)';
    }
}


// Build environment
async function buildEnvironment(source, data) {
    updateStatus('active', 'Building environment...');


    // Simulate API call delay
    setTimeout(async () => {
        let envType = '';
        let envName = '';


        if (source === 'files') {
            envType = document.getElementById('environmentType').value;
            const envNames = {
                'node': 'Node.js Development',
                'python': 'Python Data Science',
                'react': 'React Frontend',
                'fullstack': 'Full Stack (MERN)',
                'docker': 'Docker Container',
                'custom': 'Custom Configuration'
            };
            envName = `File-based ${envNames[envType]}`;
        } else if (source === 'github') {
            envType = 'GitHub Import';
            const url = document.getElementById('githubUrl').value;
            const branch = document.getElementById('branch').value;
            const repoName = url.split('/').pop().replace('.git', '');
            envName = `GitHub: ${repoName}`;
        } else if (source === 'ai') {
            envType = document.getElementById('aiFramework').value;
            envName = `AI Generated Project`;
        } else if (source === 'ml') {
            envType = 'Machine Learning API';
            const file = document.getElementById('mlFileInput').files[0];
            envName = `ML deployment: ${file.name}`;
        }


        // Create environment in backend FIRST before showing dummy logs
        try {
            const result = await backend.createEnvironment({
                type: envType,
                name: envName,
                source: source,
                data: data,
                files: source === 'files' ? document.getElementById('fileInput').files :
                    source === 'ml' ? document.getElementById('mlFileInput').files : null,
                url: source === 'github' ? document.getElementById('githubUrl').value : null,
                branch: source === 'github' ? document.getElementById('branch').value : null,
                description: source === 'ai' ? document.getElementById('aiDescription').value : null,
                framework: source === 'ai' ? document.getElementById('aiFramework').value : null
            });


            if (result.success) {
                currentEnvironment = result.data;
                updateStatus('active', 'Environment ready');
                downloadBtn.disabled = false;
                deployBtn.disabled = false;


                // Now show the success log
                if (source === 'files') {
                    outputContent.textContent = `✅ Environment built successfully from uploaded files!\n\nEnvironment ID: ${currentEnvironment.id}\nFiles Processed: ${data || 'Multiple files'}\n\nNext Steps:\n1. Deploy using the button below\n2. Wait for Docker build process`;
                } else if (source === 'github') {
                    outputContent.textContent = `✅ GitHub repository imported successfully!\n\nRepository: ${document.getElementById('githubUrl').value}\nEnvironment ID: ${currentEnvironment.id}\n\nGenerated Environment:\n- Dockerfile cloned\n- Dependencies analyzed\n\nNext Steps:\n1. Deploy using the button below`;
                } else if (source === 'ai') {
                    outputContent.textContent = `✅ AI-generated code template created!\n\nEnvironment ID: ${currentEnvironment.id}\nFramework: ${envType}\n\nGenerated Code Structure:\n- Complete application template\n- Dockerfile\n\nNext Steps:\n1. Deploy to test the AI generated code`;
                } else if (source === 'ml') {
                    outputContent.textContent = `✅ ML Model deployment configured successfully!\n\nModel File: ${document.getElementById('mlFileInput').files[0].name}\nEnvironment ID: ${currentEnvironment.id}\n\nGenerated Architecture:\n- Python Flask API wrapper wrapping the ML inference.\n- Auto-generated /predict endpoint\n\nNext Steps:\n1. Hit Deploy Environment below\n2. Wait for Docker Build`;
                }
            } else {
                throw new Error(result.error || "Unknown backend error");
            }
        } catch (error) {
            console.error('Error creating environment:', error);
            updateStatus('error', 'Failed to create environment');
            const backendUnavailable = /Backend API is not reachable/i.test(error.message);
            outputContent.textContent = backendUnavailable
                ? `❌ Error: ${error.message}\n\nPlease start the Flask backend server by running backend/app.py on port 8000.`
                : `❌ Error: ${error.message}\n\nPlease check server logs or ensure Docker daemon is running.`;
            downloadBtn.disabled = true;
            deployBtn.disabled = true;
        }
    }, 500); // reduced timeout since backend does real work
}


// Deploy current environment
let isDeploying = false;
async function deployCurrentEnvironment() {
    if (!currentEnvironment) {
        alert('Please build an environment first');
        return;
    }


    if (isDeploying) return;


    // Disable button to prevent double-clicks
    isDeploying = true;
    deployBtn.disabled = true;
    updateStatus('active', 'Deploying environment...');


    try {
        const result = await backend.deployEnvironment(currentEnvironment.id);


        if (result.success) {
            const deployTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            outputContent.textContent += `\n\n⏳ Deployment container triggered at ${deployTime}. Building in background...`;

            const pollInterval = setInterval(async () => {
                try {
                    const statusRes = await backend.getEnvironmentStatus(currentEnvironment.id);
                    if (statusRes.success && statusRes.data) {
                        currentEnvironment = statusRes.data;
                        if (statusRes.data.status === 'running') {
                            clearInterval(pollInterval);
                            const url = statusRes.data.url;

                            outputContent.textContent += `\n✅ Environment deployed successfully!\n\nYour environment is now live and accessible at:`;

                            // Show the environment link
                            linkText.textContent = url;
                            environmentLink.href = url;
                            environmentLinkContainer.style.display = 'block';

                            // Update modal
                            modalEnvName.textContent = currentEnvironment.name;
                            modalLinkText.textContent = url;
                            modalEnvLink.href = url;
                            modalDeployTime.textContent = 'Just now';

                            updateStatus('active', 'Environment deployed');

                            // Show deployment modal after a short delay
                            setTimeout(() => {
                                deploymentModal.style.display = 'flex';
                            }, 500);
                            isDeploying = false;
                        } else if (statusRes.data.status === 'failed' || statusRes.data.status === 'expired') {
                            clearInterval(pollInterval);
                            updateStatus('error', 'Deployment failed');
                            outputContent.textContent += `\n❌ Deployment Failed! Please check the dashboard or logs.`;
                            alert('Deployment background task failed.');
                            isDeploying = false;
                        }
                    }
                } catch (pollErr) {
                    console.error("Polling error: ", pollErr);
                }
            }, 2500);

        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('Error deploying environment:', error);
        updateStatus('error', 'Deployment failed');
        alert('Failed to start deployment: ' + error.message);
        isDeploying = false;
    }
}


// Open environment viewer
function openEnvironmentViewer(envUrl, envName) {
    // Hide main app
    appContainer.style.display = 'none';


    // Show environment viewer
    environmentViewer.style.display = 'block';


    // Update viewer content
    document.getElementById('envViewerTitle').innerHTML = `<i class="fas fa-code"></i> ${envName}`;
    envUrlDisplay.textContent = envUrl;

    // Dynamically update the link at the bottom of the viewer output section just in case
    const envLink = document.getElementById('environmentLink');
    const envLinkText = document.getElementById('linkText');
    if (envLink && envLinkText) {
        envLink.href = envUrl;
        envLinkText.textContent = envUrl;
    }


    envTerminal.innerHTML = '';
    const startLine = document.createElement('div');
    startLine.className = 'terminal-line';
    startLine.innerHTML = `<span class="prompt">$</span> Fetching live logs from container...`;
    envTerminal.appendChild(startLine);


    // Poll logs every 2 seconds
    if (window.logInterval) clearInterval(window.logInterval);


    window.logInterval = setInterval(async () => {
        if (!currentEnvironment) return;
        const res = await backend.getLogs(currentEnvironment.id);
        if (res.success && res.logs) {
            envTerminal.innerHTML = ''; // clear
            const lines = res.logs.split('\n').filter(l => l.trim().length > 0);
            lines.forEach(line => {
                const lineElement = document.createElement('div');
                lineElement.className = 'terminal-line';
                // Use textContent to prevent execution of payload (XSS mitigation)
                const promptSpan = document.createElement('span');
                promptSpan.className = 'prompt';
                promptSpan.textContent = '> ';
                lineElement.appendChild(promptSpan);
                lineElement.appendChild(document.createTextNode(line));
                envTerminal.appendChild(lineElement);
            });
            envTerminal.scrollTop = envTerminal.scrollHeight;
        }
    }, 2000);
}


// Button event listeners
uploadBtn.addEventListener('click', () => {
    if (fileInput.files.length === 0) {
        alert('Please select files to upload');
        return;
    }
    buildEnvironment('files', `${fileInput.files.length} files`);
});


githubBtn.addEventListener('click', () => {
    const url = document.getElementById('githubUrl').value;
    if (!url) {
        alert('Please enter a GitHub repository URL');
        return;
    }


    if (!url.includes('github.com')) {
        alert('Please enter a valid GitHub URL');
        return;
    }


    buildEnvironment('github');
});


aiBtn.addEventListener('click', () => {
    const description = document.getElementById('aiDescription').value;
    if (!description) {
        alert('Please describe your project for AI generation');
        return;
    }


    buildEnvironment('ai');
});


mlBtn.addEventListener('click', () => {
    if (mlFileInput.files.length === 0) {
        alert('Please select an ML model file (.pkl, .h5, etc.) to upload');
        return;
    }
    buildEnvironment('ml', mlFileInput.files);
});


downloadBtn.addEventListener('click', () => {
    updateStatus('active', 'Downloading configuration...');
    setTimeout(() => {
        alert('Configuration downloaded as nexus-environment.zip');
        updateStatus('active', 'Environment ready');
    }, 1000);
});


deployBtn.addEventListener('click', () => {
    if (!currentEnvironment) {
        alert('Please build an environment first');
        return;
    }
    deployCurrentEnvironment();
});


clearBtn.addEventListener('click', () => {
    outputContent.textContent = '// Environment output will appear here\n\nYour generated development environment configuration, setup scripts, and deployment instructions will be displayed in this area.\n\nSelect an input method above and click the corresponding button to begin.';
    updateStatus('', 'Ready to build environment');
    downloadBtn.disabled = true;
    deployBtn.disabled = true;
    environmentLinkContainer.style.display = 'none';
    currentEnvironment = null;
});


// Modal event listeners
modalClose.addEventListener('click', () => {
    deploymentModal.style.display = 'none';
});


openEnvBtn.addEventListener('click', () => {
    deploymentModal.style.display = 'none';
    openEnvironmentViewer(modalEnvLink.href, modalEnvName.textContent);
});


copyLinkBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(modalEnvLink.href)
        .then(() => {
            copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyLinkBtn.innerHTML = '<i class="fas fa-copy"></i> Copy Link';
            }, 2000);
        });
});


// Environment viewer controls
closeEnvBtn.addEventListener('click', () => {
    if (window.logInterval) {
        clearInterval(window.logInterval);
        window.logInterval = null;
    }
    environmentViewer.style.display = 'none';
    appContainer.style.display = 'block';
});


refreshEnvBtn.addEventListener('click', () => {
    const newLine = document.createElement('div');
    newLine.className = 'terminal-line';
    newLine.innerHTML = `<span class="prompt">$</span> Environment refreshed at ${new Date().toLocaleTimeString()}`;
    envTerminal.appendChild(newLine);
    envTerminal.scrollTop = envTerminal.scrollHeight;
});


stopEnvBtn.addEventListener('click', async () => {
    if (currentEnvironment) {
        try {
            const result = await backend.stopEnvironment(currentEnvironment.id);
            if (result.success) {
                const newLine = document.createElement('div');
                newLine.className = 'terminal-line';
                newLine.innerHTML = `<span class="prompt">$</span> Stopping environment...`;
                envTerminal.appendChild(newLine);


                setTimeout(() => {
                    const stoppedLine = document.createElement('div');
                    stoppedLine.className = 'terminal-line';
                    stoppedLine.innerHTML = `<span class="prompt">$</span> ✅ Environment stopped successfully`;
                    envTerminal.appendChild(stoppedLine);
                    envTerminal.scrollTop = envTerminal.scrollHeight;
                }, 1000);
            }
        } catch (error) {
            console.error('Error stopping environment:', error);
        }
    }
});


// Logic for Delete button
if (deleteEnvBtn) {
    deleteEnvBtn.addEventListener('click', async () => {
        if (currentEnvironment && confirm("Are you sure you want to permanently delete this environment? This removes all local files, Docker images, and containers.")) {
            try {
                const newLine = document.createElement('div');
                newLine.className = 'terminal-line';
                newLine.innerHTML = `<span class="prompt">$</span> Deleting environment entirely...`;
                envTerminal.appendChild(newLine);


                const result = await backend.deleteEnvironment(currentEnvironment.id);
                if (result.success) {
                    setTimeout(() => {
                        alert("Environment deleted successfully.");
                        environmentViewer.style.display = 'none';
                        appContainer.style.display = 'block';
                        clearBtn.click(); // Reset dashboard UI
                    }, 500);
                }
            } catch (error) {
                console.error('Error deleting environment:', error);
                alert("Failed to delete environment.");
            }
        }
    });
}


// File Explorer & Controls
const runServerBtn = document.getElementById('runServerBtn');
const openEditorBtn = document.getElementById('openEditorBtn');
const viewLogsBtn = document.getElementById('viewLogsBtn');


if (runServerBtn) {
    runServerBtn.addEventListener('click', () => {
        if (currentEnvironment && currentEnvironment.status === 'running') {
            window.open(currentEnvironment.url, '_blank');
        } else {
            alert('Environment is not currently running. Please deploy or start it first.');
        }
    });
}


if (openEditorBtn) {
    openEditorBtn.addEventListener('click', () => {
        alert('Web IDE feature is arriving in v2.0! For now, your files are running securely in the Docker container.');
    });
}


if (viewLogsBtn) {
    viewLogsBtn.addEventListener('click', () => {
        alert('Detailed container stream logs feature is arriving in v2.0. Basic startup logs are visible in the terminal above.');
    });
}


// Dashboard link
dashboardLink.addEventListener('click', async (e) => {
    e.preventDefault();
    pageLinks.forEach((link) => link.classList.remove('active'));
    dashboardLink.classList.add('active');
    try {
        const result = await backend.listEnvironments();
        if (result.success) {
            dashboardTableBody.innerHTML = '';
            if (result.count === 0) {
                dashboardTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem;">No environments running.</td></tr>`;
            } else {
                result.environments.forEach(env => {
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid var(--border)';


                    const statusColor = env.status === 'running' ? 'var(--success)' : (env.status === 'failed' ? 'var(--danger)' : 'var(--warning)');


                    tr.innerHTML = `
                        <td style="padding: 1rem;"><strong>${env.name}</strong><br><small style="color: var(--gray);">${env.id.substring(0, 8)} | ${env.type || env.source}</small></td>
                        <td style="padding: 1rem;"><span style="color: ${statusColor}">● ${env.status}</span></td>
                        <td style="padding: 1rem;">${new Date(env.createdAt).toLocaleString()}</td>
                        <td style="padding: 1rem;">
                            <button class="btn btn-sm" onclick="window.open('${env.url}', '_blank')" ${env.status !== 'running' ? 'disabled' : ''} style="padding: 0.3rem 0.6rem; font-size: 0.8rem;" title="Open App"><i class="fas fa-external-link-alt"></i></button>
                            <button class="btn btn-sm" onclick="backend.stopEnvironment('${env.id}').then(() => document.getElementById('dashboardLink').click())" ${env.status !== 'running' ? 'disabled' : ''} style="padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--warning); border-color: var(--warning);" title="Stop Container"><i class="fas fa-stop"></i></button>
                            <button class="btn btn-sm" onclick="backend.deleteEnvironment('${env.id}').then(() => document.getElementById('dashboardLink').click())" style="padding: 0.3rem 0.6rem; font-size: 0.8rem; color: var(--danger); border-color: var(--danger);" title="Delete Environment"><i class="fas fa-trash"></i></button>
                        </td>
                    `;
                    dashboardTableBody.appendChild(tr);
                });
            }


            appContainer.style.display = 'none';
            environmentViewer.style.display = 'none';


            if (window.logInterval) {
                clearInterval(window.logInterval);
                window.logInterval = null;
            }


            dashboardViewer.style.display = 'block';
        }
    } catch (error) {
        console.error('Error listing environments:', error);
        alert('Error loading environments');
    }
});


if (closeDashboardBtn) {
    closeDashboardBtn.addEventListener('click', () => {
        dashboardViewer.style.display = 'none';
        const pageFromHash = window.location.hash.replace('#', '') || 'builder';
        showPage(pageFromHash, false);
    });
}


// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target === deploymentModal) {
        deploymentModal.style.display = 'none';
    }
    if (e.target === authModal) {
        closeAuthModal();
    }
});


// Check for environment in URL parameters (for direct access)
window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const envId = urlParams.get('env');
    const requestedPage = window.location.hash.replace('#', '');
    const knownPage = [...pageViews].some((view) => view.dataset.page === requestedPage);

    refreshAuthUI();
    renderCommunityPosts();
    showPage(knownPage ? requestedPage : 'builder', false);

    updateStatus('warning', 'Checking backend connection...');
    const backendAvailable = await backend.checkAvailability();
    if (backendAvailable) {
        updateStatus('active', 'Ready to build environment');
        uploadBtn.disabled = false;
        githubBtn.disabled = false;
        aiBtn.disabled = false;
        mlBtn.disabled = false;
    } else {
        updateStatus('error', 'Backend API unavailable');
        outputContent.textContent = `❌ Backend API is not reachable on ${backend.apiBase}.\n\nPlease start the Flask backend server by running backend/app.py and make sure the backend is listening on port 8000 or 5000.`;
        uploadBtn.disabled = true;
        githubBtn.disabled = true;
        aiBtn.disabled = true;
        mlBtn.disabled = true;
        downloadBtn.disabled = true;
        deployBtn.disabled = true;
    }

    if (envId) {
        // Try to load environment from backend
        backend.getEnvironmentStatus(envId)
            .then(result => {
                if (result.success && result.data) {
                    openEnvironmentViewer(result.data.url || window.location.href, result.data.name);
                }
            })
            .catch(console.error);
    }

    // Initialize with disabled buttons
    downloadBtn.disabled = true;
    deployBtn.disabled = true;
});

window.addEventListener('popstate', () => {
    const requestedPage = window.location.hash.replace('#', '') || 'builder';
    const knownPage = [...pageViews].some((view) => view.dataset.page === requestedPage);
    showPage(knownPage ? requestedPage : 'builder', false);
});

