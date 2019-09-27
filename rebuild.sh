#!/bin/bash

#uninstall previous version
jupyter nbextension uninstall --py --sys-prefix ipyparaview
rm -rf ipyparaview/static

./build.sh
