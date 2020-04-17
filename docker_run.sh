#!/bin/bash
conda activate ipy_pv_dev
jupyter notebook --port=8888 --no-browser --ip=0.0.0.0 --allow-root
