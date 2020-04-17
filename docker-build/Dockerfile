###############################################################################
### build stage - conda environment for ipyparaview
#############################################

# Setup conda from a handy conda container
FROM continuumio/miniconda3 AS conda
SHELL ["/bin/bash", "-c"]

# Install the dependencies for our environment
RUN conda install -c conda-forge -y --freeze-installed \
     numpy=1.18.1 \
     ipywidgets=7.5.1 \
     jupyter=1.0.0 \
     jupyterlab=1.2.6 \
     nodejs=13.9.0 \
     dask=2.10.1 \
     distributed=2.10.0 \
     dask-mpi=2.0.0 \
     && conda clean -afy
###############################################################################



###############################################################################
### build stage - paraview
#############################################
FROM nvidia/cudagl:10.1-devel-ubuntu18.04 AS pv-build

# Set up conda in this environment
COPY --from=conda /opt/conda /opt/conda
SHELL ["/bin/bash", "-c"]

# Install ParaView's build pre-requisites
RUN export DEBIAN_FRONTEND=noninteractive \
 && apt-get update \
 && apt-get install --no-install-recommends -y \
    binutils-dev \
    cmake \
    curl \
    g++ gcc \
    libglew2.0 \
    libglu1-mesa-dev \
    libopenmpi-dev \
    ninja-build \
    wget \
 && apt-get autoremove -y \
 && apt-get clean \
 && apt-get autoclean \
 && rm -rf /var/lib/apt/lists/*


ENV PATH=${PATH:+${PATH}:}/usr/local/openmpi/bin:/opt/conda/bin \
    LD_LIBRARY_PATH=${LD_LIBRARY_PATH:+${LD_LIBRARY_PATH}:}/usr/local/paraview/lib_so:/usr/local/cuda/lib64/stubs:/usr/local/openmpi/lib:/usr/local/ucx/lib:/usr/local/knem/lib:/usr/local/xpmem/lib \
    PKG_CONFIG_PATH=/usr/local/ucx/lib/pkgconfig:/usr/local/openmpi/lib/pkgconfig:/usr/local/xpmem/lib/pkgconfig

### 
# CUDA and driver library config
###
RUN ldconfig /usr/local/cuda/lib64/stubs
RUN mkdir -p /driver-libs \
 && echo /driver-libs >> /etc/ld.so.conf.d/nvidia.conf \
 && ldconfig

###
# Copy in some non-apt pre-requisites
##
COPY optix-6.5 /optix
RUN echo /optix/lib64 >> /etc/ld.so.conf.d/nvidia.conf \
 && ldconfig

COPY mdl-2019.1.1 /mdl
RUN echo /mdl/lib >> /etc/ld.so.conf.d/nvidia.conf \
 && ldconfig


###
# Download & set up some ParaView dependencies
###
# VisRTX
RUN wget "https://www.paraview.org/files/dependencies/visrtx-v0.1.6.tar.gz" \
 && tar -xzf visrtx-v0.1.6.tar.gz \
 && mkdir /VisRTX-build && cd /VisRTX-build \
 && cmake -G Ninja \
    -D CMAKE_INSTALL_PREFIX=/visrtx \
    -D CMAKE_BUILD_TYPE=Release \
    -D OptiX_INSTALL_DIR=/optix \
    -D MDL_INSTALL_DIR=/mdl \
    -D VISRTX_BUILD_SAMPLE=OFF \
    /VisRTX-0.1.6 \
 && cd /VisRTX-build && ninja && ninja install \
 && echo /visrtx/lib >> /etc/ld.so.conf.d/nvidia.conf \
 && ldconfig

#IndeX
RUN wget "https://www.paraview.org/files/dependencies/nvidia-index-libs-2.4.20200124-linux.tar.bz2" \
 && tar -xjf nvidia-index-libs-2.4.20200124-linux.tar.bz2 \
 && mv nvidia-index-libs-2.4.20200124-linux index


###
# ParaView build
###
COPY ParaView-src /ParaView-src
RUN source activate \
 && mkdir -p /ParaView-build \
 && cd /ParaView-build \
 && cmake -G Ninja \
    -D CMAKE_INSTALL_PREFIX=/usr/local/paraview \
    -D CMAKE_BUILD_TYPE=Release \
    -D PARAVIEW_BUILD_SHARED_LIBS=ON \
    -D BUILD_TESTING=OFF \
    -D VTK_PYTHON_VERSION=3 \
    -D VTK_LEGACY_SILENT=ON \
    -D PARAVIEW_USE_MPI=ON \
    -D PARAVIEW_ENABLE_PYTHON=ON \
    -D PARAVIEW_ENABLE_CATALYST=OFF \
    -D PARAVIEW_ENABLE_EMBEDDED_DOCUMENTATION=OFF \
    -D PARAVIEW_ENABLE_WEB=ON \
    -D PARAVIEW_PLUGIN_ENABLE_pvNVIDIAIndeX=ON \
    -D PARAVIEW_USE_RAYTRACING=ON \
    -D VTK_ENABLE_VISRTX=ON \
    -D VTK_ENABLE_OSPRAY=OFF \
    -D VisRTX_DIR=/visrtx \
    -D PARAVIEW_BUILD_QT_GUI=OFF \
    -D VTK_OPENGL_HAS_EGL=ON \
    -D VTK_USE_X=OFF \
    /ParaView-src
RUN cd /ParaView-build \
 && ninja && ninja install
###############################################################################



###############################################################################
### build stage - paraview jupyter ipywidget
#############################################
FROM conda AS ipp-build

# Copy the ipyparaview repo into our build container
COPY ipyparaview-src /ipyparaview-src

# Install pip dependencies, including ipyparaview
RUN source activate \
 && pip install PVGeo \
 && pip install /ipyparaview-src \
 && jupyter nbextension enable --py --sys-prefix ipyparaview \
 && jupyter labextension install @jupyter-widgets/jupyterlab-manager \
 && jupyter labextension install /ipyparaview-src/js
###############################################################################



###############################################################################
### runtime stage
#############################################
FROM nvidia/cudagl:10.1-runtime-ubuntu18.04 AS runtime

#fix some library issues between the dev and runtime containers
COPY --from=pv-build /usr/lib/x86_64-linux-gnu/libOpenGL.so.* /usr/lib/x86_64-linux-gnu/

# Set up conda in this environment
COPY --from=ipp-build /opt/conda /opt/conda
SHELL ["/bin/bash", "-c"]

# Install some requirements for running ParaView headless
RUN export DEBIAN_FRONTEND=noninteractive \
 && apt-get update \
 && apt-get install --no-install-recommends -y \
    rsh-client \
    ssh \
 && apt-get autoremove -y \
 && apt-get clean \
 && apt-get autoclean \
 && rm -rf /var/lib/apt/lists/*

COPY --from=pv-build /usr/local/paraview /usr/local/paraview

# Copy requirements from the build environment
COPY --from=pv-build /optix /optix
COPY --from=pv-build /mdl /mdl
COPY --from=pv-build /visrtx /visrtx
COPY --from=pv-build /index /index
COPY --from=pv-build /etc/ld.so.conf.d/nvidia.conf /etc/ld.so.conf.d/nvidia.conf
RUN ldconfig
COPY paraview.plugins.xml /usr/local/paraview/lib/paraview-5.8/plugins/paraview.plugins.xml

# Copy the example notebooks from the conda setup repo
COPY ipyparaview-src/notebooks /notebooks
COPY ipyparaview-src/scripts /scripts

# Set environment so Jupyter can find ParaView
ENV PYTHONPATH=/usr/local/paraview/lib/python3.7/site-packages:/usr/local/paraview/lib/python3.7/site-packages/vtkmodules:/usr/local/paraview/lib/python3.7/site-packages/paraview/modules

# Add copied libraries and ParaView's python modules to the environment library path
ENV LD_LIBRARY_PATH=/opt/conda/lib:/usr/local/paraview/lib/python3.7/site-packages/vtkmodules:/mdl/lib:/optix/lib64:/index/lib:$LD_LIBRARY_PATH

# Add a line activating our environment to the .bashrc
RUN echo "source /opt/conda/bin/activate" >> ~/.bashrc

# By default, the container will start up Jupyter straight away
CMD ["/bin/bash","-c","cd notebooks && source /opt/conda/bin/activate && jupyter lab --allow-root"]
###############################################################################
