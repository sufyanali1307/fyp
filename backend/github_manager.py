import os
import shutil
import uuid


# Suppress GitPython console flashes on Windows
os.environ['GIT_PYTHON_REFRESH'] = 'quiet'


# Attempt to explicitly define the path to git.exe on Windows if it's dropping from PATH
if os.name == 'nt' and not os.environ.get('GIT_PYTHON_GIT_EXECUTABLE'):
    possible_paths = [
        r"C:\Program Files\Git\cmd\git.exe",
        r"C:\Program Files (x86)\Git\cmd\git.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\cmd\git.exe") # Portable path for any Windows user
    ]
    for path in possible_paths:
        if os.path.exists(path):
            os.environ['GIT_PYTHON_GIT_EXECUTABLE'] = path
            break


os.environ['GIT_TERMINAL_PROMPT'] = '0'
os.environ['GIT_ASKPASS'] = 'echo'


try:
    import git
    GIT_AVAILABLE = True
except ImportError as e:
    GIT_AVAILABLE = False
    print(f"Warning: Git is not installed or not in PATH. Error: {e}")


class GitHubManager:
    def __init__(self, base_dir):
        self.base_dir = base_dir
        if not os.path.exists(self.base_dir):
            os.makedirs(self.base_dir)


    def clone_repo(self, repo_url, branch='main', env_id=None):
        """Clones a GitHub repository to a local directory."""
        import re
        repo_url = str(repo_url).strip()
        # SSRF Mitigation: Strictly validate the target URL to only permit github.com
        safe_url_pattern = re.compile(r'^https://(?:www\.)?github\.com/[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+(?:\.git)?$')
        if not repo_url or not safe_url_pattern.match(str(repo_url)):
            return False, "Invalid repository URL. Must be a secure structural github.com URL."

        if not GIT_AVAILABLE:
            return False, "Git is not installed on the server. Please install Git to use this feature."
           
        if not env_id:
            env_id = f"env-{uuid.uuid4().hex[:8]}"
       
        target_dir = os.path.join(self.base_dir, env_id)
       
        # Remove if exists
        if os.path.exists(target_dir):
            shutil.rmtree(target_dir)
           
        try:
            # We explicitly pass GIT_TERMINAL_PROMPT=0 and GCM_INTERACTIVE=false
            # to prevent the Git Credential Manager popup on Windows
            env_vars = dict(os.environ,
                            GIT_TERMINAL_PROMPT='0',
                            GIT_ASKPASS='echo',
                            GCM_INTERACTIVE='false')
           
            # Using -c credential.helper= temporally disables the credential helper
            clone_opts = ['-c', 'credential.helper=']
           
            # If branch is provided and is not the literal string 'undefined' or empty, clone that specific branch
            if branch and str(branch).strip().lower() != 'undefined' and str(branch).strip() != '':
                git.Repo.clone_from(repo_url, target_dir, branch=branch, env=env_vars, multi_options=clone_opts, allow_unsafe_protocols=True, allow_unsafe_options=True)
            else:
                # If no branch specified, clone the default (HEAD)
                git.Repo.clone_from(repo_url, target_dir, env=env_vars, multi_options=clone_opts, allow_unsafe_protocols=True, allow_unsafe_options=True)
            return True, target_dir
        except Exception as e:
            error_str = str(e)
           
            # If the user explicitly requested 'main' or left it blank and 'main' failed,
            # let's automatically try 'master' as a smart fallback before giving up.
            if "Remote branch main not found" in error_str or "Remote branch 'main' not found" in error_str:
                if os.path.exists(target_dir):
                    shutil.rmtree(target_dir)
                try:
                    git.Repo.clone_from(repo_url, target_dir, branch='master', env=env_vars, multi_options=clone_opts, allow_unsafe_protocols=True, allow_unsafe_options=True)
                    return True, target_dir
                except Exception as master_e:
                    return False, f"Failed to clone. Both 'main' and 'master' branches missing. Error: {master_e}"
           
            return False, error_str
