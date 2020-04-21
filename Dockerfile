FROM continuumio/miniconda3 AS conda
LABEL Description="ipyParaView: a container for demos."

SHELL ["/bin/bash", "-c"]

USER root

WORKDIR /root
COPY . ./ipyparaview/
WORKDIR /root/ipyparaview

RUN apt-get update && \
    apt-get install -y --no-install-recommends libgl1-mesa-dev xvfb tini && \
    rm -rf /var/lib/apt/lists/*

RUN conda install --quiet --yes -c conda-forge --file conda_requirements.txt

COPY start_xvfb.sh /sbin/start_xvfb.sh
RUN chmod a+x /sbin/start_xvfb.sh

# Might not be needed:
# ARG LD_LIBRARY_PATH=/opt/conda/envs/ipy_pv_dev/lib

# Install ipyparaview
RUN pip install -e .
RUN jupyter nbextension install --py --symlink --sys-prefix ipyparaview
RUN jupyter nbextension enable --py --sys-prefix ipyparaview
RUN jupyter labextension install js

RUN jupyter lab clean \
  && jupyter lab build

# Set up for use
WORKDIR /root/ipyparaview/notebooks

ENTRYPOINT ["tini", "-g", "--", "start_xvfb.sh"]
# CMD ["/bin/bash"]
CMD ["jupyter", "lab", "--port=8888", "--no-browser", "--ip=0.0.0.0", "--allow-root"]
