#!/bin/bash

cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

pip install -e . \
&& jupyter nbextension install --py --symlink --sys-prefix ipyparaview \
&& jupyter nbextension enable --py --sys-prefix ipyparaview \
&& jupyter labextension install @jupyter-widgets/jupyterlab-manager \
&& jupyter labextension install js
