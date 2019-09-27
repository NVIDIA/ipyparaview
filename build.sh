#!/bin/bash

python setup.py build \
    && pip install -e . \
    && jupyter nbextension install --py --symlink --sys-prefix ipyparaview \
    && jupyter nbextension enable --py --sys-prefix ipyparaview \
    && jupyter labextension install js
