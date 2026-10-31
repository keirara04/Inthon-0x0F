import copy
import unittest

from pipeline.layout import normalize_layout
from pipeline.vectorize import validate_plan


def polygon(*points):
    return [{'x':x,'y':y} for x,y in points]


def room(identifier, points, kind='room'):
    return {'id':identifier, 'label':identifier, 'kind':kind, 'confidence':'high', 'polygon':polygon(*points)}


def fixture():
    return {'floor':'2F', 'spaces':[
        room('room-a', [(2,2),(31,2),(31,29),(2,28)]),
        room('room-b', [(29,1),(63,1),(63,31),(29,31)]),
        room('room-overflow', [(48,45),(85,45),(85,85),(48,85)]),
        room('bathroom', [(2,32),(20,32),(20,52),(2,52)], 'bathroom'),
    ], 'outlines':[{'id':'building', 'confidence':'high', 'polygon':polygon((0,0),(60,0),(60,40),(100,40),(100,60),(60,60),(60,80),(0,80))}],
        'walls':[{'id':'bath-stall', 'confidence':'medium', 'points':polygon((10,32),(10,52))}],
        'markings':[], 'warnings':[]}


def bounds(shape):
    p = shape['polygon']
    return min(v['x'] for v in p), min(v['y'] for v in p), max(v['x'] for v in p), max(v['y'] for v in p)


def area(points):
    return abs(sum(a['x']*b['y']-b['x']*a['y'] for a,b in zip(points,points[1:]+points[:1])))/2


class LayoutTests(unittest.TestCase):
    def test_right_angles_no_overlap_complete_interior_and_no_exterior_spill(self):
        raw = fixture()
        before = copy.deepcopy(raw)
        result, info = normalize_layout(raw)
        self.assertEqual(raw, before)
        validate_plan(result, generated=True)
        self.assertTrue(any(s['kind']=='corridor' and s['label']=='Hall' for s in result['spaces']))
        self.assertEqual(len([s for s in result['spaces'] if s['kind']!='corridor']), 4)
        for shape in result['spaces']:
            self.assertEqual(len(shape['polygon']), 4)
            for a,b in zip(shape['polygon'],shape['polygon'][1:]+shape['polygon'][:1]):
                self.assertTrue(a['x']==b['x'] or a['y']==b['y'])
            x0,y0,x1,y1 = bounds(shape)
            # The right-hand wing exists only between y=40 and y=60.
            if x1 > 60:
                self.assertGreaterEqual(y0,40)
                self.assertLessEqual(y1,60)
            self.assertGreaterEqual(x0,0); self.assertGreaterEqual(y0,0)
            self.assertLessEqual(x1,100); self.assertLessEqual(y1,80)
        for i,one in enumerate(result['spaces']):
            a,b,c,d = bounds(one)
            for two in result['spaces'][i+1:]:
                e,f,g,h = bounds(two)
                overlap = max(0,min(c,g)-max(a,e))*max(0,min(d,h)-max(b,f))
                self.assertAlmostEqual(overlap,0)
        expected_area = area(result['outlines'][0]['polygon'])
        self.assertAlmostEqual(sum(area(s['polygon']) for s in result['spaces']),expected_area)
        self.assertAlmostEqual(info['covered_area_percent_squared'],expected_area)
        self.assertGreater(info['inferred_hall_parts'],0)

    def test_major_wall_stops_a_room_and_bathroom_internal_divider_is_removed(self):
        raw = fixture()
        raw['walls'].append({'id':'hard-wall','confidence':'high','points':polygon((25,0),(25,30))})
        result,_ = normalize_layout(raw)
        a = next(s for s in result['spaces'] if s['id']=='room-a')
        self.assertLessEqual(bounds(a)[2],25)
        bathroom = next(s for s in result['spaces'] if s['id']=='bathroom')
        x0,y0,x1,y1 = bounds(bathroom)
        for wall in result['walls']:
            a,b = wall['points']
            cx,cy = (a['x']+b['x'])/2,(a['y']+b['y'])/2
            self.assertFalse(x0<cx<x1 and y0<cy<y1)

    def test_sloping_room_and_building_bottom_edges_become_horizontal(self):
        raw = {'floor':'F','spaces':[room('room',[(2,2),(98,2),(98,98),(2,97)])],
               'outlines':[{'id':'outline','confidence':'high','polygon':polygon((0,0),(100,0),(100,100),(0,99))}],
               'walls':[],'markings':[],'warnings':[]}
        result,_ = normalize_layout(raw)
        for shape in result['spaces']+result['outlines']:
            p = shape['polygon']
            self.assertTrue(all(a['x']==b['x'] or a['y']==b['y'] for a,b in zip(p,p[1:]+p[:1])))

    def test_missing_exterior_does_not_invent_a_bounding_rectangle(self):
        raw = {'floor':'F','spaces':[room('one',[(0,0),(20,0),(20,20),(0,20)]), room('two',[(80,80),(100,80),(100,100),(80,100)])],
               'walls':[],'markings':[],'warnings':[]}
        result,_ = normalize_layout(raw)
        self.assertEqual(result['outlines'],[])
        self.assertAlmostEqual(sum(area(s['polygon']) for s in result['spaces']),800)
        self.assertTrue(any('No readable exterior' in note for note in result['warnings']))


if __name__ == '__main__':
    unittest.main()
