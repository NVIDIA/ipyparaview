$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

pip install -e .
jupyter nbextension install --py --symlink --sys-prefix ipyparaview
jupyter nbextension enable --py --sys-prefix ipyparaview
jupyter labextension install @jupyter-widgets/jupyterlab-manager
jupyter labextension install js
