"""Small dependency-free homography helpers for photographing a flat map."""
import math

from .map_pipeline import PipelineError


def project(matrix, point):
    x, y = point
    denominator = matrix[6] * x + matrix[7] * y + matrix[8]
    if abs(denominator) < 1e-10:
        raise PipelineError("Perspective transform maps a point to infinity.")
    return ((matrix[0] * x + matrix[1] * y + matrix[2]) / denominator,
            (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator)


def homography(source, target):
    """Solve the 8-parameter projective transform from four point pairs."""
    rows = []
    for (x, y), (u, v) in zip(source, target):
        rows.extend([[x, y, 1, 0, 0, 0, -u * x, -u * y, u],
                     [0, 0, 0, x, y, 1, -v * x, -v * y, v]])
    for column in range(8):
        pivot = max(range(column, 8), key=lambda row: abs(rows[row][column]))
        if abs(rows[pivot][column]) < 1e-10:
            raise PipelineError("Map corners do not define a valid perspective transform.")
        rows[column], rows[pivot] = rows[pivot], rows[column]
        factor = rows[column][column]
        rows[column] = [value / factor for value in rows[column]]
        for row in range(8):
            if row != column:
                factor = rows[row][column]
                rows[row] = [a - factor * b for a, b in zip(rows[row], rows[column])]
    return [rows[row][8] for row in range(8)] + [1.0]


def frame_transforms(corners, source_width, source_height, width=1200, height=760):
    if not isinstance(corners, list) or len(corners) != 4:
        raise PipelineError("Provide four source-image corners in TL, TR, BR, BL order.")
    for point in corners:
        if not isinstance(point, (list, tuple)) or len(point) != 2 or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in point):
            raise PipelineError("Frame corners must be finite source-image pixel coordinates.")
        if not (0 <= point[0] <= source_width and 0 <= point[1] <= source_height):
            raise PipelineError("Frame corners must lie inside the oriented source image.")
    turns = []
    for index in range(4):
        a, b, c = corners[index], corners[(index + 1) % 4], corners[(index + 2) % 4]
        turns.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    if any(turn <= 1e-6 for turn in turns):
        raise PipelineError("Frame must be convex and ordered TL, TR, BR, BL, without crossing edges.")
    area = abs(sum(corners[i][0] * corners[(i + 1) % 4][1] - corners[(i + 1) % 4][0] * corners[i][1] for i in range(4))) / 2
    if area < 100:
        raise PipelineError("Map frame is too small to rectify.")
    if isinstance(width, bool) or isinstance(height, bool) or not isinstance(width, int) or not isinstance(height, int) or not 200 <= width <= 3000 or not 200 <= height <= 3000:
        raise PipelineError("Rectified canvas dimensions must be integers between 200 and 3000.")
    target = [(0, 0), (width, 0), (width, height), (0, height)]
    return homography(corners, target), homography(target, corners)
