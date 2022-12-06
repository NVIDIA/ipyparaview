import math

import numpy as np

__all__ = ["rotateCameraTurntable", "panCameraTurntable", "zoomCameraTurntable"]


def _normalize(v):
    return v / np.linalg.norm(v)


def _cartToSphr(p):
    # cartesian position into spherical
    r = np.linalg.norm(p)
    return np.array([r, math.atan2(p[0], p[2]), math.asin(p[1] / r)])


def _sphrToCart(p):
    # spherical coordinate position into cartesian
    return np.array(
        [
            p[0] * math.sin(p[1]) * math.cos(p[2]),
            p[0] * math.sin(p[2]),
            p[0] * math.cos(p[1]) * math.cos(p[2]),
        ]
    )


def rotateCameraTurntable(d, p, f, u, scale, phiLimit):
    f = np.array(f)
    p = np.array(p) - f

    # compute orthonormal basis corresponding to current view and up vectors
    b1 = _normalize(np.array(u))
    b0 = _normalize(np.cross(b1, p))
    b2 = np.cross(b0, b1)

    # compute matrices to convert to and from the up-vector basis
    fromU = np.column_stack([b0, b1, b2])
    toU = np.linalg.inv(fromU)

    # rotate around the focus in spherical:
    # - convert focus-relative camera pos to up vector basis, then spherical
    # - apply mouse deltas as movements in spherical
    # - convert back to cartesian, then to standard basis, then to absolute position
    cp = _cartToSphr(np.matmul(toU, p))
    cp[1] -= scale * d["x"]
    cp[2] = max(-phiLimit, min(phiLimit, cp[2] - scale * d["y"]))
    p = np.matmul(fromU, _sphrToCart(cp))

    # self.render()
    return (p + f, f, u)


def panCameraTurntable(d, p, f, u, angle):
    # translates pan delta into a translation vector at the focal point
    f = np.array(f)
    p = np.array(p) - f
    u = np.array(u)

    h = _normalize(np.cross(p, u))
    v = _normalize(np.cross(p, h))

    f += (
        (d["x"] * h + d["y"] * v)
        * np.linalg.norm(p)
        * 2
        * math.tan(math.pi * angle / 360)
    )

    # self.render()
    return (p + f, f, u)


def zoomCameraTurntable(d, p, f, u, rlimit):
    # zooms by scaling the distance between camera and focus
    f = np.array(f)
    p = np.array(p) - f
    r = np.linalg.norm(p)
    p *= max(rlimit, r * d) / r

    return (p + f, f, u)
