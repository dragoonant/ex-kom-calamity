"""Where the owner's Local AI Studio lives (HANDOFF-hunyuan-install.md). Everything resolves from the
user profile or an env var; nothing here names a machine or a person."""
import os

HOME = os.path.expanduser('~')
HY2 = os.environ.get('HY2_DIR', os.path.join(HOME, 'Hunyuan3D-2'))      # Python 3.11: rembg, 2.0 paint
HY21 = os.environ.get('HY21_DIR', os.path.join(HOME, 'Hunyuan3D-2.1'))  # Python 3.10: 2.1 shape, bpy
PY2 = os.path.join(HY2, '.venv', 'Scripts', 'python.exe')
PY21 = os.path.join(HY21, '.venv', 'Scripts', 'python.exe')
CACHE = os.path.join(HOME, '.cache', 'hy3dgen')

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
MODELS = os.path.join(REPO, 'public', 'models', 'figures')
GATES = os.path.join(REPO, 'docs', 'concept', 'gates')
WORK = os.environ.get('FIGURES_WORK', os.path.join(HY2, 'outputs', 'ekc-figures'))  # the studio's working folder, one subfolder per attempt

ENV = dict(os.environ, HF_HUB_OFFLINE='1', PYTHONUNBUFFERED='1', PYTHONIOENCODING='utf-8')


def scrub(path):
    """Replace the user profile in a path with %USERPROFILE% before anything is committed (KB rule 11)."""
    p = str(path)
    for h in (HOME, HOME.replace('\\', '/'), HOME.replace('/', '\\')):
        if h and h in p:
            p = p.replace(h, '%USERPROFILE%')
    return p
