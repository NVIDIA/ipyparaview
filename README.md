ipyparaview
===============================

A widget for interactive server-side ParaView rendering. Note that this requires a pre-existing ParaView installation and ParaView's python libraries to be locatable via $PYTHONPATH--see the `scripts` folders for examples.

Installation
------------

To install use pip:

    $ pip install https://github.com/NickLeaf/ipyparaview.git
    $ jupyter nbextension enable --py --sys-prefix ipyparaview


For a development installation (requires npm),

    $ git clone https://github.com/NickLeaf/ipyparaview.git
    $ cd ipyparaview
    $ pip install -e .
    $ jupyter nbextension install --py --symlink --sys-prefix ipyparaview
    $ jupyter nbextension enable --py --sys-prefix ipyparaview
    $ jupyter labextension install js (*optional*)
