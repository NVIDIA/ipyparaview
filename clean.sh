#!/bin/bash

cd "$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

rm -rf ipyparaview.egg-info
rm -rf ipyparaview/__pycache__ ipyparaview/static
rm -rf js/dist js/node_modules js/package-lock.json
