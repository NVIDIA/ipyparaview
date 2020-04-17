FROM continuumio/anaconda3:latest
LABEL Description="ipyParaView: a container for demos."

WORKDIR /root
COPY . ./ipyparaview/
WORKDIR /root/ipyparaview

# Headless display stuff
# RUN apt-get update
RUN apt-get install -y libgl1-mesa-dev
# RUN which Xvfb
# ARG DISPLAY=:99.0
# RUN Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
# Give XVfb a chance to set up
# RUN sleep 3

RUN conda install -c conda-forge nb_conda_kernels
RUN conda env create -f environment.yml

SHELL ["conda", "run", "-n", "ipy_pv_dev", "/bin/bash", "-c"]

# Might not be needed:
# ARG LD_LIBRARY_PATH=/opt/conda/envs/ipy_pv_dev/lib

# Install ipyparaview
RUN pip install -e .
RUN jupyter nbextension install --py --symlink --sys-prefix ipyparaview
RUN jupyter nbextension enable --py --sys-prefix ipyparaview
RUN jupyter labextension install js

# Set up for use
# WORKDIR /root/ipyparaview/notebooks
# CMD ["jupyter", "notebook", "--port=8888", "--no-browser", "--ip=0.0.0.0", "--allow-root"]
# ENTRYPOINT [ "bash", "../docker_run.sh" ]
