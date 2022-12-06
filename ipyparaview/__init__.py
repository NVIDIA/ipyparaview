###############################################################################
# Copyright (c) 2019, NVIDIA CORPORATION.  All rights reserved.
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
###############################################################################

from ._version import __version__
from .camera_models import (
    rotateCameraTurntable,
    panCameraTurntable,
    zoomCameraTurntable,
)
from .widgets import PVDisplay, VStream


__all__ = ["PVDisplay", "VStream"]


def _jupyter_nbextension_paths():
    """Called by Jupyter Notebook Server to detect if it is a valid nbextension and
    to install the widget

    Returns
    =======
    section: The section of the Jupyter Notebook Server to change.
        Must be 'notebook' for widget extensions
    src: Source directory name to copy files from. Webpack outputs generated files
        into this directory and Jupyter Notebook copies from this directory during
        widget installation
    dest: Destination directory name to install widget files to. Jupyter Notebook copies
        from `src` directory into <jupyter path>/nbextensions/<dest> directory
        during widget installation
    require: Path to importable AMD Javascript module inside the
        <jupyter path>/nbextensions/<dest> directory
    """
    return [
        {
            "section": "notebook",
            "src": "static",
            "dest": "ipyparaview",
            "require": "ipyparaview/extension",
        }
    ]


class PVRenderActor:
    """A class for rendering data using ParaView as a Dask Actor"""

    framenum = 0
    frametime = 0  # time to render the latest frame
    rank, size = 0, 1

    def __init__(self, x):
        # NOTE: 'x' is required in order to instantiate an actor across all nodes by passing
        # a sequence of variables
        import paraview

        paraview.options.batch = True
        paraview.options.symmetric = True
        import paraview.simple as pvs

        self.pvs = pvs

        from mpi4py import MPI

        self.rank, self.size = MPI.COMM_WORLD.Get_rank(), MPI.COMM_WORLD.Get_size()

        import vtk
        from vtk import vtkWindowToImageFilter

        # Create render view and image transfer filter objects
        self.renv = pvs.CreateRenderView()
        self.w2i = vtkWindowToImageFilter()
        self.w2i.ReadFrontBufferOff()
        self.w2i.ShouldRerenderOff()
        self.w2i.SetInput(self.renv.SMProxy.GetRenderWindow())

        # Make sure all ranks have initialized
        MPI.COMM_WORLD.Barrier()
        if self.rank == 0:
            print("All ranks ready for rendering")

    def rotateCam(self, mouseDelta, rotateScale, phiLim):
        """Rotates the camera using the given mouse delta"""
        (
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
        ) = rotateCameraTurntable(
            mouseDelta,
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
            rotateScale,
            phiLim,
        )

    def panCam(self, mouseDelta):
        """Pans the camera using the given mouse delta"""
        (
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
        ) = panCameraTurntable(
            mouseDelta,
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
            self.renv.CameraViewAngle,
        )

    def zoomCam(self, mouseDelta, rlim):
        """Zooms the camera using the given mouse delta"""
        (
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
        ) = zoomCameraTurntable(
            mouseDelta,
            self.renv.CameraPosition,
            self.renv.CameraFocalPoint,
            self.renv.CameraViewUp,
            rlim,
        )

    def render(self):
        """Render a frame and return it as a numpy array"""
        import time

        ts = time.time()
        self.pvs.Render(view=self.renv)
        if self.rank == 0:
            self.frametime = time.time() - ts
            self.framenum += 1

    def fetchFrame(self):
        # Mathias's magic frame fetching snippet
        self.w2i.Modified()
        self.w2i.Update()
        imagedata = self.w2i.GetOutput()
        w, h, _ = imagedata.GetDimensions()
        import numpy as np
        from vtk.util.numpy_support import vtk_to_numpy

        imagedata_np = vtk_to_numpy(imagedata.GetPointData().GetScalars()).reshape(
            (h, w, 3)
        )
        return np.flipud(
            np.pad(
                imagedata_np,
                ((0, 0), (0, 0), (0, 1)),
                mode="constant",
                constant_values=255,
            )
        )

    def run(self, fun, args):
        """Run the given function on the Actor's worker node"""
        return fun(self, *args)
