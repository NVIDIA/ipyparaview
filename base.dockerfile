FROM continuumio/miniconda3 AS conda
LABEL Description="iPyParaView base container."

SHELL ["/bin/bash", "-c"]

USER root

WORKDIR /root

RUN apt-get update && \
    apt-get install -y --no-install-recommends libgl1-mesa-dev xvfb tini && \
    rm -rf /var/lib/apt/lists/*

RUN conda install --quiet --yes -c conda-forge \
    ipywidgets \
    jupyter \
    jupyterlab \
    ipython \
    pillow \
    paraview=5.8.0=py37ha369aaf_8 \
    nodejs \
    numpy \
    matplotlib \
    scipy

COPY start_xvfb.sh /sbin/start_xvfb.sh
RUN chmod a+x /sbin/start_xvfb.sh

ENTRYPOINT ["tini", "-g", "--", "start_xvfb.sh"]
