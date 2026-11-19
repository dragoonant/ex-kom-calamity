"""Body landmarks measured on a normalized mesh (feet on z = 0, Blender z up), shared by finalize.py and rig.py.
Face areas, not vertex counts, so the full mesh and its decimated LOD give the same answer."""


def chin_z(fig, H, W):
    """The 2% band of the top 45% of the height holding the most downward-facing surface area in the central
    column (|x| < 18% of the width): the underside of the helmet or jaw. The eye sockets are small; the chest
    plates' undersides lie below the band. None if nothing faces down there."""
    bins = {}
    for p in fig.data.polygons:
        c = p.center
        if abs(c.x) < 0.18 * W and c.z > 0.55 * H and p.normal.z < -0.5:
            b = int(c.z / (0.02 * H))
            bins[b] = bins.get(b, 0.0) + p.area
    return (max(bins, key=bins.get) * 0.02 * H) if bins else None


def crotch_z(fig, H, W):
    """The lowest 2.5% slice above the feet (from 8% up) with surface on the centre line: where the legs join."""
    slices = 40
    for i in range(int(slices * 0.08), int(slices * 0.7)):
        z0, z1 = H * i / slices, H * (i + 1) / slices
        if any(abs(p.center.x) < 0.04 * W and z0 <= p.center.z < z1 for p in fig.data.polygons):
            return z0
    return None
