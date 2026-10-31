import copy
import io
import json
import os
import tempfile
import unittest
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from pipeline.geometry import frame_transforms, project
from pipeline.map_pipeline import PipelineError, load_image
from pipeline.vectorize import main, rectify, build_plan, validate_plan, render_plan, detect_frame, extract_plan
from pipeline.vectorize import GEOMETRY_FORMAT_RULES, PLAN_SCHEMA

TRACE = Path(__file__).resolve().parents[1] / 'examples' / 'evacuation-photo.trace.json'


class VectorTests(unittest.TestCase):
    def setUp(self):
        self.trace = json.loads(TRACE.read_text())

    def test_photo_annotation_contains_all_numbered_rooms(self):
        validate_plan(self.trace['plan'])
        labels = {s['label'] for s in self.trace['plan']['spaces']}
        self.assertTrue({str(n) for n in range(201, 211)} <= labels)
        self.assertEqual(sum(s['kind'] == 'stairs' for s in self.trace['plan']['spaces']), 2)
        self.assertFalse(any(s['kind'] == 'you_are_here' for s in self.trace['plan']['markings']))

    def test_homography_roundtrip_and_invalid_frames(self):
        corners = self.trace['frame']['corners']
        forward, inverse = frame_transforms(corners, 640, 480)
        for source, expected in zip(corners, [(0, 0), (1200, 0), (1200, 760), (0, 760)]):
            x, y = project(forward, source)
            self.assertAlmostEqual(x, expected[0]); self.assertAlmostEqual(y, expected[1])
        for point in [(100, 200), (300, 300), (410, 360)]:
            recovered = project(inverse, project(forward, point))
            self.assertAlmostEqual(recovered[0], point[0]); self.assertAlmostEqual(recovered[1], point[1])
        for invalid in [corners[:3], [corners[0], corners[2], corners[1], corners[3]], [[0, 0]] * 4, [[-1, 0], [640, 0], [640, 480], [0, 480]]]:
            with self.assertRaises(PipelineError): frame_transforms(invalid, 640, 480)

    def test_rectification_exports_and_source_coordinate_alignment(self):
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp) / 'source.png'; Image.new('RGB', (640, 480), 'white').save(photo)
            frame = self.trace['frame']
            source, preview, forward, inverse, pixels = rectify(photo, frame['corners'], frame['width'], frame['height'])
            self.assertEqual(Image.open(io.BytesIO(pixels)).size, (1200, 760))
            plan = build_plan(self.trace['plan'], source, preview, frame['corners'], forward, inverse, {'method': 'provided_trace'})
            self.assertTrue(plan['review_required'])
            self.assertFalse(plan['rectification']['metric_calibrated'])
            for space in plan['spaces']:
                for point, original in zip(space['polygon'], space['source_photo_points']):
                    reconstructed = project(forward, (original['x'], original['y']))
                    self.assertAlmostEqual(reconstructed[0], point['x'], delta=.01)
                    self.assertAlmostEqual(reconstructed[1], point['y'], delta=.01)
            clean = render_plan(plan)
            overlay = render_plan(plan, preview.data_url)
            self.assertNotIn('<image', clean)
            self.assertNotIn('data:image', clean)
            self.assertIn('<image', overlay)
            root = ET.fromstring(clean)
            self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}polygon')), 15)
            ids = [n.get('id') for n in root.iter() if n.get('id')]
            self.assertEqual(len(ids), len(set(ids)))
            layers = {n.get('id') for n in root.findall('{http://www.w3.org/2000/svg}g')}
            self.assertEqual(layers, {'spaces', 'walls', 'markings', 'labels'})
            # Evacuation markings remain visual annotations, not routing edges.
            self.assertNotIn('edges', plan)

    def test_invalid_shapes_and_xml_text(self):
        changes = [
            lambda p: p['spaces'][0]['polygon'][0].update(x=101),
            lambda p: p['spaces'][0].update(confidence=[]),
            lambda p: p['spaces'][0].update(kind=[]),
            lambda p: p['spaces'][0].update(id='walls'),
            lambda p: p['spaces'][1].update(id=p['spaces'][0]['id']),
            lambda p: p['markings'][0].update(points=[]),
            lambda p: p.update(spaces=[]),
            lambda p: p['spaces'][0].update(polygon=[{'x':0,'y':0},{'x':90,'y':80},{'x':0,'y':100},{'x':70,'y':0}]),
        ]
        for mutate in changes:
            plan = copy.deepcopy(self.trace['plan']); mutate(plan)
            with self.assertRaises(PipelineError): validate_plan(plan)

    def test_vertex_failures_identify_shape_kind_actual_count_and_requirement(self):
        cases = [
            ('spaces', {'id':'bad-room', 'kind':'room', 'label':'201', 'confidence':'high', 'polygon':[{'x':1,'y':1},{'x':2,'y':2}]}, "spaces 'bad-room' \\(room\\) has 2; expected 3–80"),
            ('walls', {'id':'bad-wall', 'confidence':'high', 'points':[]}, "walls 'bad-wall' \\(wall\\) has 0; expected 2–80"),
            ('markings', {'id':'bad-exit', 'kind':'exit', 'label':'Exit', 'confidence':'high', 'points':[{'x':1,'y':1},{'x':2,'y':2}]}, "markings 'bad-exit' \\(exit\\) has 2; expected 1.*center point"),
            ('markings', {'id':'bad-route', 'kind':'evacuation_route', 'label':'Arrow', 'confidence':'high', 'points':[{'x':1,'y':1}]}, "markings 'bad-route' \\(evacuation_route\\) has 1; expected 2–80"),
        ]
        for layer, shape, message in cases:
            plan = copy.deepcopy(self.trace['plan'])
            plan[layer] = [shape]
            with self.subTest(layer=layer, shape_id=shape['id']), self.assertRaisesRegex(PipelineError, message):
                validate_plan(plan)

    def test_prompt_and_schema_explain_point_counts_without_changing_editable_prompt(self):
        custom = 'Keep my custom extraction instructions.'
        with patch('pipeline.vectorize.request_structured_image', return_value=self.trace['plan']) as analyze:
            extract_plan(None, 'key', 'model', prompt=custom)
        self.assertEqual(analyze.call_args.args[3], custom + GEOMETRY_FORMAT_RULES)
        self.assertIn('EXACTLY ONE point', analyze.call_args.args[3])
        spaces = PLAN_SCHEMA['properties']['spaces']['items']['properties']['polygon']
        walls = PLAN_SCHEMA['properties']['walls']['items']['properties']['points']
        symbol, route = PLAN_SCHEMA['properties']['markings']['items']['anyOf']
        self.assertEqual((spaces['minItems'], spaces['maxItems']), (3, 80))
        self.assertEqual((walls['minItems'], walls['maxItems']), (2, 80))
        self.assertEqual((symbol['properties']['points']['minItems'], symbol['properties']['points']['maxItems']), (1, 1))
        self.assertEqual(route['properties']['points']['minItems'], 2)

    def test_cli_uses_bound_trace_and_never_requires_original_private_fixture(self):
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            photo = Path(tmp) / 'source.png'; Image.new('RGB', (640, 480), 'white').save(photo)
            trace = Path(tmp) / 'trace.json'
            self.trace['source'] = load_image(photo).source(); trace.write_text(json.dumps(self.trace))
            out = Path(tmp) / 'out'
            self.assertEqual(main([str(photo), '--trace', str(trace), '--output', str(out)]), 0)
            self.assertEqual({p.name for p in out.iterdir()}, {'trace.json', 'rectified.png', 'vector.svg', 'overlay.svg', 'plan.json'})
            exported = json.loads((out / 'plan.json').read_text())
            self.assertEqual(exported['extraction']['method'], 'provided_trace')
            self.assertEqual(exported['extraction']['basis']['method'], 'assistant_photo_trace')
            self.assertEqual(main([str(photo), '--trace', str(trace), '--output', str(out)]), 1)
            self.trace['source']['sha256'] = 'wrong'; trace.write_text(json.dumps(self.trace))
            self.assertEqual(main([str(photo), '--trace', str(trace), '--output', str(Path(tmp) / 'wrong')]), 1)
            with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
                self.assertEqual(main([str(photo), '--output', str(Path(tmp) / 'live')]), 1)

    def test_two_stage_vision_contracts(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'map.png'; Image.new('RGB', (640, 480), 'white').save(path)
            source = load_image(path)
            frame = {'corners': [{'x': 10, 'y': 10}, {'x': 90, 'y': 10}, {'x': 90, 'y': 90}, {'x': 10, 'y': 90}], 'warnings': []}
            with patch('pipeline.vectorize.request_structured_image', return_value=frame) as call:
                corners, warnings = detect_frame(source, 'test', 'model')
                self.assertEqual(corners, [[64, 48], [576, 48], [576, 432], [64, 432]])
                self.assertEqual(call.call_args.args[-1], 'map_frame')
            with patch('pipeline.vectorize.request_structured_image', return_value=self.trace['plan']) as call:
                result = extract_plan(source, 'test', 'model')
                self.assertEqual(result, self.trace['plan'])
                self.assertEqual(call.call_args.args[-1], 'vector_plan')
                self.assertEqual(call.call_args.kwargs['max_output_tokens'], 32768)
                self.assertIn('minimum vertices', call.call_args.args[3])


if __name__ == '__main__': unittest.main()
