"""Deterministic orthogonal floor-plan cleanup in normalized coordinates.

An adaptive grid uses the extracted boundaries, rather than a pixel raster.
Every interior cell has exactly one owner. Named spaces become rectangles;
remaining cells become explicitly inferred hall rectangles. No extra API call.
"""
from bisect import bisect_left
from collections import deque
from copy import deepcopy
from statistics import median

SNAP_TOLERANCE = .6  # percent of the corrected drawing, not meters


def _straighten(points, closed=True):
    """Constrain each edge to its dominant axis, sharing endpoint coordinates."""
    n = len(points)
    parents = [list(range(n)), list(range(n))]

    def find(axis, i):
        while parents[axis][i] != i:
            parents[axis][i] = parents[axis][parents[axis][i]]
            i = parents[axis][i]
        return i

    for i in range(n if closed else n - 1):
        j = (i + 1) % n
        dx, dy = points[j]['x'] - points[i]['x'], points[j]['y'] - points[i]['y']
        axis = 1 if abs(dx) >= abs(dy) else 0
        parents[axis][find(axis, j)] = find(axis, i)
    coords = []
    for axis, key in enumerate(('x', 'y')):
        groups = {}
        for i, p in enumerate(points):
            groups.setdefault(find(axis, i), []).append(p[key])
        coords.append({i: median(groups[find(axis, i)]) for i in range(n)})
    return [{'x': coords[0][i], 'y': coords[1][i]} for i in range(n)]


def _clean(points):
    result = []
    for p in points:
        if not result or p != result[-1]:
            result.append(p)
    if len(result) > 1 and result[0] == result[-1]:
        result.pop()
    changed = True
    while changed and len(result) > 3:
        changed = False
        for i, p in enumerate(result):
            a, b = result[i - 1], result[(i + 1) % len(result)]
            if a['x'] == p['x'] == b['x'] or a['y'] == p['y'] == b['y']:
                result.pop(i)
                changed = True
                break
    return result


def _axis(values):
    clusters = []
    for value, priority in sorted(values):
        if not clusters or value - clusters[-1][0][0] > SNAP_TOLERANCE:
            clusters.append([])
        clusters[-1].append((value, priority))
    mapping = {}
    for cluster in clusters:
        priority = max(p for _, p in cluster)
        representative = round(median(v for v, p in cluster if p == priority), 6)
        for value, _ in cluster:
            mapping[value] = representative
    return sorted(set(mapping.values())), mapping


def _contains(points, x, y):
    inside = False
    for a, b in zip(points, points[1:] + points[:1]):
        if (a['y'] > y) != (b['y'] > y):
            crossing = a['x'] + (y - a['y']) * (b['x'] - a['x']) / (b['y'] - a['y'])
            if x < crossing:
                inside = not inside
    return inside


def _rect(x0, y0, x1, y1):
    return [{'x':x0,'y':y0}, {'x':x1,'y':y0}, {'x':x1,'y':y1}, {'x':x0,'y':y1}]


def _largest_rectangle(free, xs, ys):
    """Largest free rectangle on a nonuniform grid, by actual geometric area."""
    heights = [0] * (len(xs) - 1)
    best, bounds = 0, None
    for row, cells in enumerate(free):
        heights = [h + 1 if cell else 0 for h, cell in zip(heights, cells)]
        stack = []
        for col, height in enumerate(heights + [0]):
            start = col
            while stack and stack[-1][1] > height:
                left, h = stack.pop()
                area = (xs[col] - xs[left]) * (ys[row + 1] - ys[row + 1 - h])
                if area > best:
                    best, bounds = area, (left, row + 1 - h, col, row + 1)
                start = left
            if height and (not stack or stack[-1][1] < height):
                stack.append((start, height))
    return bounds


def normalize_layout(plan):
    result = deepcopy(plan)
    outlines = result.get('outlines', [])
    groups = []
    for shape in outlines:
        shape['polygon'] = _straighten(shape['polygon'])
        groups.append((shape['polygon'], 3))
    for shape in result['walls']:
        shape['points'] = _straighten(shape['points'], closed=False)
        groups.append((shape['points'], 2))
    for shape in result['spaces']:
        if shape['kind'] == 'corridor':
            shape['polygon'] = _straighten(shape['polygon'])
        else:
            p = shape['polygon']
            shape['polygon'] = _rect(min(v['x'] for v in p), min(v['y'] for v in p), max(v['x'] for v in p), max(v['y'] for v in p))
        groups.append((shape['polygon'], 1))
    xs, mx = _axis([(p['x'], priority) for points, priority in groups for p in points])
    ys, my = _axis([(p['y'], priority) for points, priority in groups for p in points])
    for points, _ in groups:
        for p in points:
            p.update(x=mx[p['x']], y=my[p['y']])
    for shape in outlines:
        shape['polygon'] = _clean(shape['polygon'])
    outlines = [s for s in outlines if len(s['polygon']) >= 4]
    result['outlines'] = outlines
    nr, nc = len(ys) - 1, len(xs) - 1
    if nr < 1 or nc < 1:
        from .map_pipeline import PipelineError
        raise PipelineError('The extracted layout collapsed after aligning its boundaries.')
    footprints = [s['polygon'] for s in (outlines or result['spaces'])]
    inside = [[any(_contains(p, (xs[c] + xs[c+1])/2, (ys[r] + ys[r+1])/2) for p in footprints) for c in range(nc)] for r in range(nr)]
    if not outlines:
        # Fill enclosed holes only. Never invent a bounding-box building outline.
        outside, queue = set(), deque()
        for r in range(nr):
            for c in range(nc):
                if (r in (0, nr-1) or c in (0, nc-1)) and not inside[r][c]:
                    outside.add((r,c)); queue.append((r,c))
        while queue:
            r, c = queue.popleft()
            for rr, cc in ((r-1,c),(r+1,c),(r,c-1),(r,c+1)):
                if 0 <= rr < nr and 0 <= cc < nc and not inside[rr][cc] and (rr,cc) not in outside:
                    outside.add((rr,cc)); queue.append((rr,cc))
        inside = [[inside[r][c] or (r,c) not in outside for c in range(nc)] for r in range(nr)]

    owners = [[None] * nc for _ in range(nr)]
    named = [s for s in result['spaces'] if s['kind'] != 'corridor']
    rank = {'high':0, 'medium':1, 'low':2}
    named.sort(key=lambda s: (s['kind'] not in {'bathroom','elevator','stairs'}, rank[s['confidence']], (max(p['x'] for p in s['polygon'])-min(p['x'] for p in s['polygon']))*(max(p['y'] for p in s['polygon'])-min(p['y'] for p in s['polygon'])), s['id']))
    walls = [(a,b) for wall in result['walls'] for a,b in zip(wall['points'], wall['points'][1:]) if a != b]
    emitted, metadata, dropped = [], {}, []
    for shape in named:
        p = shape['polygon']
        x0, x1 = min(v['x'] for v in p), max(v['x'] for v in p)
        y0, y1 = min(v['y'] for v in p), max(v['y'] for v in p)
        cx, cy = (x0+x1)/2, (y0+y1)/2
        # A long wall inside a proposed rectangle is a hard boundary. Small
        # bathroom dividers are ignored; bathroom interiors stay undetailed.
        if shape['kind'] != 'bathroom':
            for a,b in walls:
                if a['x'] == b['x'] and x0 < a['x'] < x1 and min(max(a['y'],b['y']),y1)-max(min(a['y'],b['y']),y0) >= .75*(y1-y0):
                    if a['x'] <= cx: x0 = a['x']
                    else: x1 = a['x']
                elif a['y'] == b['y'] and y0 < a['y'] < y1 and min(max(a['x'],b['x']),x1)-max(min(a['x'],b['x']),x0) >= .75*(x1-x0):
                    if a['y'] <= cy: y0 = a['y']
                    else: y1 = a['y']
        left, right = bisect_left(xs,x0), bisect_left(xs,x1)
        top, bottom = bisect_left(ys,y0), bisect_left(ys,y1)
        free = [[inside[r][c] and owners[r][c] is None for c in range(left,right)] for r in range(top,bottom)]
        bounds = _largest_rectangle(free, xs[left:right+1], ys[top:bottom+1]) if right > left and bottom > top else None
        if bounds is None:
            dropped.append(shape['id']); continue
        l,t,r,b = bounds
        l += left; r += left; t += top; b += top
        shape['polygon'] = _rect(xs[l],ys[t],xs[r],ys[b])
        emitted.append(shape)
        for row in range(t,b):
            for col in range(l,r): owners[row][col] = shape['id']

    halls = [s for s in result['spaces'] if s['kind'] == 'corridor']
    inferred = object()
    for row in range(nr):
        for col in range(nc):
            if inside[row][col] and owners[row][col] is None:
                x,y = (xs[col]+xs[col+1])/2, (ys[row]+ys[row+1])/2
                owners[row][col] = next((s['id'] for s in halls if _contains(s['polygon'],x,y)), inferred)
    hall_lookup = {s['id']:s for s in halls}
    used = {s['id'] for layer in ('spaces','walls','markings','outlines') for s in result.get(layer,[])} | {'spaces','walls','markings','outlines','labels'}
    counts, active, rectangles = {}, {}, []
    # Merge equal horizontal runs across rows: no holes and no white seams in JSON.
    for row in range(nr+1):
        runs, col = {}, 0
        while row < nr and col < nc:
            owner, start = owners[row][col], col
            col += 1
            while col < nc and owners[row][col] == owner: col += 1
            if owner == inferred or owner in hall_lookup:
                runs[(owner,start,col)] = active.get((owner,start,col),row)
        for key, start in active.items():
            if key not in runs: rectangles.append((*key,start,row))
        active = runs
    generated = 0
    for owner,left,right,top,bottom in rectangles:
        base = hall_lookup.get(owner)
        if base is not None and owner not in counts:
            identifier = owner
        else:
            n = counts.get(owner,0) + 1
            prefix = base['id'][:40] if base else 'inferred_hall'
            identifier = f'{prefix}_part_{n}'
            while identifier in used:
                n += 1; identifier = f'{prefix}_part_{n}'
        counts[owner] = counts.get(owner,0)+1
        used.add(identifier)
        emitted.append({'id':identifier, 'kind':'corridor', 'label':(base['label'] or 'Hall') if base else 'Hall', 'confidence':base['confidence'] if base else 'low', 'polygon':_rect(xs[left],ys[top],xs[right],ys[bottom])})
        metadata[identifier] = owner if base else None
        generated += base is None
    original_order = {s['id']:i for i,s in enumerate(result['spaces'])}
    emitted.sort(key=lambda s: original_order.get(s['id'], original_order.get(metadata.get(s['id']), len(original_order))))
    result['spaces'] = emitted

    # Retain wall segments only on boundaries between different owners. In
    # particular, no extracted divider is drawn through an enclosing bathroom.
    segments = set()
    for a,b in walls:
        if a['x'] == b['x']:
            c = bisect_left(xs,a['x'])
            lo,hi = sorted((a['y'],b['y']))
            for r in range(bisect_left(ys,lo),bisect_left(ys,hi)):
                one = owners[r][c-1] if c > 0 else None
                two = owners[r][c] if c < nc else None
                if one != two and (one is not None or two is not None): segments.add(('v',c,r))
        elif a['y'] == b['y']:
            r = bisect_left(ys,a['y'])
            lo,hi = sorted((a['x'],b['x']))
            for c in range(bisect_left(xs,lo),bisect_left(xs,hi)):
                one = owners[r-1][c] if r > 0 else None
                two = owners[r][c] if r < nr else None
                if one != two and (one is not None or two is not None): segments.add(('h',r,c))
    cleaned_walls = []
    while segments:
        axis,line,start = min(segments)
        end = start
        while (axis,line,end) in segments:
            segments.remove((axis,line,end)); end += 1
        points = [{'x':xs[line],'y':ys[start]}, {'x':xs[line],'y':ys[end]}] if axis == 'v' else [{'x':xs[start],'y':ys[line]}, {'x':xs[end],'y':ys[line]}]
        n = len(cleaned_walls)+1
        identifier = f'aligned_wall_{n}'
        while identifier in used: n += 1; identifier = f'aligned_wall_{n}'
        used.add(identifier)
        cleaned_walls.append({'id':identifier,'points':points,'confidence':'low'})
    result['walls'] = cleaned_walls
    notes = ['Layout regularized to right-angled rectangles and shared edges; geometry changes require review.']
    if generated: notes.append('Unassigned interior areas were inferred as low-confidence halls; these are not verified walkable routes.')
    if dropped: notes.append('Spaces with no available area inside the footprint were omitted: ' + ', '.join(dropped)[:800])
    if not outlines: notes.append('No readable exterior outline: cleanup used extracted space coverage and enclosed holes only.')
    result['warnings'] = [*result['warnings'], *notes]
    area = sum((xs[c+1]-xs[c])*(ys[r+1]-ys[r]) for r in range(nr) for c in range(nc) if inside[r][c])
    return result, {'method':'orthogonal_grid', 'snap_tolerance_percent':SNAP_TOLERANCE, 'inferred_hall_parts':generated, 'hall_source_ids':metadata, 'dropped_space_ids':dropped, 'covered_area_percent_squared':round(area,6)}
