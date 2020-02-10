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

import ipywidgets as widgets
from traitlets import Unicode, Int, Float, Bytes, Tuple, validate
import time
import math
import numpy as np
import threading

@widgets.register
class PVDisplay(widgets.DOMWidget):
    """A ParaView interactive render widget"""
    _view_name = Unicode('PVDisplayView').tag(sync=True)
    _model_name = Unicode('PVDisplayModel').tag(sync=True)
    _view_module = Unicode('ipyparaview').tag(sync=True)
    _model_module = Unicode('ipyparaview').tag(sync=True)
    _view_module_version = Unicode('^0.1.2').tag(sync=True)
    _model_module_version = Unicode('^0.1.2').tag(sync=True)

    # traitlets -- variables synchronized with front end
    frame = Bytes().tag(sync=True)
    resolution = Tuple((800,500)).tag(sync=True) #canvas resolution; w,h
    fpsLimit = Float(60.0).tag(sync=True) #maximum render rate

    # class variables
    instances = dict()
    rotateScale = 5.0

    @classmethod
    def GetOrCreate(cls, ren, runAsync=True, **kwargs):
        """
        Check if a PVDisplay instance already exists for the renderer. If yes, return that instance; otherwise, create a new one.
        """
        instance = cls.instances.get(ren, None)
        if instance is None:
            instance = PVDisplay(ren, runAsync, **kwargs)
            cls.instances.update({ ren : instance })
        return instance

    def __init__(self, ren, runAsync=True, **kwargs):
        if ren in PVDisplay.instances:
            raise RuntimeError(f"A PVDisplay instance already exists for this renderer. Use PVDisplay.GetOrCreate() to avoid this error.")

        super(PVDisplay, self).__init__(**kwargs) #must call super class init

        # regular vars
        self.pvs, self.renv, self.w2i = None,None,None #used for Jupyter kernel rendering
        self.master, self.renderers = None,[] #used for Dask rendering
        self.mode = 'Jupyter'
        self.tp = time.time() #time of latest render
        self.fps = 10.0
        self.fpsOut = [] #FPS output ipywidgets; passed in from Jupyter
        self.intyld = [0.05, 0.01] #interaction yield--period and duration
        self.tiy = time.time() #time of last interaction yield

        # see if we can import Dask.distributed, then try guessing the render
        # mode based on the type of ren. Fallback to regular Jupyter rendering
        # otherwise
        try:
            import dask.distributed as distributed
            if(type(ren) == list and type(ren[0]) == distributed.actor.Actor):
                self.mode = 'Dask'
            else:
                self.mode = 'Jupyter'
        except ImportError:
            self.mode = 'Jupyter'

        if self.mode == 'Dask':
            self.renderers = ren
            self.master = [r for r in self.renderers if r.rank == 0][0]
            self.resolution = tuple(self.master.run(
                    lambda self : list(self.renv.ViewSize),
                    []).result())
            cf = self.master.run(
                    lambda self : list(self.renv.CameraFocalPoint),
                    []).result()
            cp = self.master.run(
                    lambda self : list(self.renv.CameraPosition),
                    []).result()
            self.camf = (cf[0], cf[1], cf[2])
            self.camp = (cp[0], cp[1], cp[2])
        else:
            import paraview.simple as pvs
            self.pvs = pvs
            self.renv = ren
            self.resolution = tuple(self.renv.ViewSize)

            cf = self.renv.CameraFocalPoint
            cp = self.renv.CameraPosition
            self.camf = (cf[0], cf[1], cf[2])
            self.camp = (cp[0], cp[1], cp[2])

            import vtk
            from vtk import vtkWindowToImageFilter
            self.w2i = vtkWindowToImageFilter()
            self.w2i.ReadFrontBufferOff()
            self.w2i.ShouldRerenderOff()
            self.w2i.SetInput(self.renv.SMProxy.GetRenderWindow())

        self.frameNum = 0
        self.FRBufSz = 10
        self.FRBuf = np.zeros(self.FRBufSz, dtype=np.float32);

        self.runAsync = runAsync
        if runAsync:
            self.renderThread = threading.Thread(target=self.__renderLoop)
            self.renderThread.start()

    #FIXME: starting the render loop thread outside of __init__ seems to create
    # a copy of the paraview.simple object, rather than using the one that's
    # part of the PVDisplay state; this causes PV to crash
    #def setAsync(self, on):
    #    if on and not self.runAsync:
    #        self.runAsync = on
    #        self.renderThread = threading.Thread(target=self.__renderLoop)
    #        self.renderThread.start()
    #    elif not on and self.runAsync:
    #        self.runAsync = False

    def addFPSDisplay(self, *w):
        """Add a widget to write FPS to"""
        for o in w:
            self.fpsOut.append(o)

    def updateCam(self):
        self.render()

    def render(self):
        if self.runAsync:
            return
        else:
            tc = time.time()
            if(1.0/(tc-self.tp) < self.fpsLimit):
                self.__renderFrame()


    def fetchFrame(self):
        if self.mode == 'Dask':
            return self.master.fetchFrame().result()
        else:
            # Mathias's magic frame fetching snippet
            self.w2i.Modified()
            self.w2i.Update()
            imagedata = self.w2i.GetOutput()
            w,h,_ = imagedata.GetDimensions()
            from vtk.util.numpy_support import vtk_to_numpy
            imagedata_np = vtk_to_numpy(
                    imagedata.GetPointData().GetScalars()).reshape((h,w,3))
            return np.flipud(np.pad(imagedata_np, ((0,0),(0,0),(0,1)),
                mode='constant', constant_values=255))

    def _handle_custom_msg(self, content, buffers):
        self.content = content
        if content['event'] == 'updateCam':
            self.updateCam()

        if content['event'] == 'rotate':
            self.__rotateCam(content['data'])
        if content['event'] == 'pan':
            self.__panCam(content['data'])
        if content['event'] == 'zoom':
            self.__zoomCam(content['data'])

    @staticmethod
    def __normalize(v):
        return v/np.linalg.norm(v)

    @staticmethod
    def __cartToSphr(p):
        #cartesian position into spherical
        r = np.linalg.norm(p)
        return np.array([r,
            math.atan2(p[0], p[2]),
            math.asin(p[1]/r)])

    @staticmethod
    def __sphrToCart(p):
        #spherical coordinate position into cartesian
        return np.array([p[0]*math.sin(p[1])*math.cos(p[2]),
                p[0]*math.sin(p[2]),
                p[0]*math.cos(p[1])*math.cos(p[2])])


    def __rotateCam(self, d):
        #rotates the camera around the focus in spherical
        phiLim = 1.5175

        f = np.array(self.renv.CameraFocalPoint)
        p = np.array(self.renv.CameraPosition) - np.array(self.renv.CameraFocalPoint)

        #compute orthonormal basis corresponding to current up vector
        b1 = PVDisplay.__normalize(np.array(self.renv.CameraViewUp))
        b0 = PVDisplay.__normalize(np.cross(b1, p-f))
        b2 = np.cross(b0, b1)

        #compute matrices to convert to and from the up-vector basis
        fromU = np.column_stack([b0,b1,b2])
        toU = np.linalg.inv(fromU)

        #rotate around the focus in spherical:
        # - convert focus-relative camera pos to up vector basis, then spherical
        # - apply mouse deltas as movements in spherical
        # - convert back to cartesian, then to standard basis, then to absolute position
        cp = PVDisplay.__cartToSphr( np.matmul(toU,p) )
        cp[1] -= self.rotateScale*d['x']
        cp[2] = max(-phiLim, min(phiLim, cp[2]-self.rotateScale*d['y']))
        self.renv.CameraPosition = self.renv.CameraFocalPoint + np.matmul( fromU,PVDisplay.__sphrToCart(cp) )

        self.render()
        
    def __panCam(self, d):
        #translates pan delta into a translation vector at the focal point
        f = np.array(self.renv.CameraFocalPoint)
        p = np.array(self.renv.CameraPosition)-f
        u = np.array(self.renv.CameraViewUp)

        h = PVDisplay.normalize(np.cross(p, u))
        v = PVDisplay.normalize(np.cross(p, h))

        pd = (d['x']*h + d['y']*v)*np.linalg.norm(p)*2*math.tan(math.pi*self.renv.CameraViewAngle/360)

        self.renv.CenterOfRotation = self.renv.CameraFocalPoint = f+pd
        self.renv.CameraPosition = self.renv.CameraFocalPoint + p

        self.render()

    def __zoomCam(self, d):
        #zooms by scaling the distance between camera and focus
        rlim = 0.00001 #minimum allowable radius
        f = np.array(self.renv.CameraFocalPoint)
        p = np.array(self.renv.CameraPosition)-f
        r = np.linalg.norm(p)
        self.renv.CameraPosition = f + (max(rlim, r*d)/r)*p


    def __renderFrame(self):
        tc = time.time()
        self.FRBuf[self.frameNum % self.FRBufSz] = 1.0/(tc - self.tp)
        self.tp = tc

        #set the camera position, render, and get the output frame
        if self.mode == 'Dask':
            from dask.distributed import wait
            wait([r.render(self.camp, self.camf) for r in self.renderers])
        else:
            self.pvs.Render(view=self.renv)
        self.frame = self.fetchFrame().tostring()
        self.frameNum += 1
        self.fps = np.average(self.FRBuf)
        if self.fpsOut is not None:
            for fo in self.fpsOut:
                fo.value = self.fps


    def __renderLoop(self):
        while self.runAsync:
            #check if it's time for an interaction yield; if so, do it
            if time.time() - self.tiy > self.intyld[0]:
                time.sleep(self.intyld[1])
                self.tiy = time.time()

            #sleep to keep FPS to fpsLimit
            time.sleep(max(0, 1.0/self.fpsLimit - (time.time() - self.tp)))

            self.__renderFrame()

@widgets.register
class VStream(widgets.DOMWidget):
    """A WebSocket-based video stream widget with interaction."""

    _view_name = Unicode('VStreamView').tag(sync=True)
    _model_name = Unicode('VStreamModel').tag(sync=True)
    _view_module = Unicode('ipyparaview').tag(sync=True)
    _model_module = Unicode('ipyparaview').tag(sync=True)
    _view_module_version = Unicode('^0.1.2').tag(sync=True)
    _model_module_version = Unicode('^0.1.2').tag(sync=True)
    url = Unicode('ws://localhost:9002').tag(sync=True)
    state = Unicode('').tag(sync=True)

    def connect(self):
        self.state = 'connect'
