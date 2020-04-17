"""
A simple test script to run with `pvpython` to see if GL is properly set up
"""
from paraview.simple import *
sphere = Sphere(ThetaResolution=16, PhiResolution=32)
shrink = Shrink(sphere)
Show(shrink)

ren = GetActiveView()

# Potential Error:
Render(view=ren)
