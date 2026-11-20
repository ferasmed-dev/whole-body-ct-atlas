"""Minimal NIfTI-1 reader (no nibabel needed). Returns (data, affine, header dict)."""
import gzip, struct
import numpy as np

DT = {2: np.uint8, 4: np.int16, 8: np.int32, 16: np.float32, 64: np.float64,
      256: np.int8, 512: np.uint16, 768: np.uint32}


def read_header(raw):
    endian = '<' if struct.unpack('<i', raw[:4])[0] == 348 else '>'
    dim = struct.unpack(endian + '8h', raw[40:56])
    datatype = struct.unpack(endian + 'h', raw[70:72])[0]
    pixdim = struct.unpack(endian + '8f', raw[76:108])
    vox_offset = int(struct.unpack(endian + 'f', raw[108:112])[0])
    slope, inter = struct.unpack(endian + '2f', raw[112:120])
    qform_code, sform_code = struct.unpack(endian + '2h', raw[252:256])
    srow = np.array(struct.unpack(endian + '12f', raw[280:328])).reshape(3, 4)
    q = struct.unpack(endian + '6f', raw[256:280])
    return dict(endian=endian, dim=dim, datatype=datatype, pixdim=pixdim,
                vox_offset=vox_offset, slope=slope, inter=inter,
                qform_code=qform_code, sform_code=sform_code, srow=srow, quatern=q)


def qform_affine(h):
    b, c, d, qx, qy, qz = h['quatern']
    a = np.sqrt(max(0.0, 1.0 - (b * b + c * c + d * d)))
    R = np.array([[a*a+b*b-c*c-d*d, 2*(b*c-a*d), 2*(b*d+a*c)],
                  [2*(b*c+a*d), a*a+c*c-b*b-d*d, 2*(c*d-a*b)],
                  [2*(b*d-a*c), 2*(c*d+a*b), a*a+d*d-b*b-c*c]])
    qfac = h['pixdim'][0] if h['pixdim'][0] in (-1.0, 1.0) else 1.0
    zooms = np.array([h['pixdim'][1], h['pixdim'][2], h['pixdim'][3] * qfac])
    A = np.eye(4)
    A[:3, :3] = R * zooms
    A[:3, 3] = [qx, qy, qz]
    return A


def load(path, header_only=False):
    op = gzip.open if str(path).endswith('.gz') else open
    with op(path, 'rb') as f:
        raw = f.read(352) if header_only else f.read()
    h = read_header(raw)
    if h['sform_code'] > 0:
        aff = np.eye(4); aff[:3] = h['srow']
    else:
        aff = qform_affine(h)
    if header_only:
        return None, aff, h
    nd = h['dim'][0]
    shape = h['dim'][1:1 + nd]
    dt = np.dtype(DT[h['datatype']]).newbyteorder(h['endian'])
    n = int(np.prod(shape))
    data = np.frombuffer(raw, dtype=dt, count=n, offset=h['vox_offset']).reshape(shape, order='F')
    if h['slope'] not in (0.0, 1.0) or h['inter'] != 0.0:
        data = data * h['slope'] + h['inter']
    return data, aff, h
