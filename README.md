ipyparaview
===============================

A widget for interactive server-side ParaView rendering. Note that this requires a pre-existing ParaView installation and ParaView's python libraries to be locatable via $PYTHONPATH--see the `scripts` folders for examples.


Examples
--------
Example notebooks are avaible in the `notebooks` folder. They are designed to give a broad overview of how to use ipyparaview. New users will probably have the best luck jumping in to the Hello_Jupyter-ParaView.ipynb notebook, which demonstrates basic usage and setting up the ParaView display. The Iso-Surfaces_with_RTX.ipynb notebook demonstrates more advanced usage, with more extensive manipulation of the render state and interactive control. The Dask-MPI_Volume_Render.ipynb notebook demonstrates how to use multi-node rendering by running PVRenderActors on a Dask-MPI cluster.


Installation
------------
Note that both the regular and developer installs currently require nodejs (for npm) in addition to the regular tools.

For a regular user installation:

    $ pip install git+https://github.com/NVIDIA/ipyparaview.git
    $ jupyter nbextension enable --py --sys-prefix ipyparaview
    
From within a conda environment:

    $ conda env create -f environment.yml
    $ conda activate ipy_dev
    $ ./rebuild.sh

To install for jupyterlab

    $ jupyter labextension install @jupyter-widgets/jupyterlab-manager
    $ jupyter labextension install ipyparaview

For a development installation (requires npm),

    $ git clone https://github.com/NVIDIA/ipyparaview.git
    $ cd ipyparaview
    $ pip install -e .
    $ jupyter nbextension install --py --symlink --sys-prefix ipyparaview
    $ jupyter nbextension enable --py --sys-prefix ipyparaview
    $ jupyter labextension install js (*optional*)


Running
-------
Within a conda environment

    $ conda activate ipy_dev
    $ export LD_LIBRARY_PATH=$PVPATH/lib/
    $ export PYTHONPATH=$PVPATH/lib/python3.7/site-packages/
    $ jupyter notebook
    

