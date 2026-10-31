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

from PIL import Image, ImageDraw

from pipeline.geometry import frame_transforms, padded_frame, project
from pipeline.map_pipeline import PipelineError, load_image
from pipeline.vectorize import main, rectify, build_plan, validate_plan, render_plan, detect_frame, extract_plan
from pipeline.vectorize import GEOMETRY_FORMAT_RULES, EXTRACTION_COVERAGE_RULES, PLAN_SCHEMA

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

    def test_old_simple_setting_cannot_select_a_reduced_prompt_or_schema(self):
        with patch.dict(os.environ, {'MAP_EXTRACTION_MODE':'simple'}), patch('pipeline.vectorize.request_structured_image', return_value=copy.deepcopy(self.trace['plan'])) as analyze:
            result = extract_plan(None, 'key', 'model')
        self.assertEqual(len(result['spaces']), len(self.trace['plan']['spaces']))
        self.assertGreater(len(result['spaces']), 8)
        self.assertEqual(analyze.call_args.args[4], PLAN_SCHEMA)
        self.assertNotIn('max_output_tokens', analyze.call_args.kwargs)
        prompt = analyze.call_args.args[3]
        self.assertIn('Include only visibly supported EXIT DOORS', prompt)
        self.assertIn('Do not create markings for ordinary room-entry doors', prompt)
        self.assertIn('every recognizable stair and elevator', prompt)
        self.assertNotIn('up to FIVE', prompt)
        self.assertNotIn('Simplified output contract', prompt)

    def test_elevator_and_exit_doors_exported_with_interior_doors_hidden(self):
        raw = copy.deepcopy(self.trace['plan'])
        raw['spaces'][0].update(kind='elevator', label='Elevator')
        raw['markings'] += [
            {'id':'interior-door-test','kind':'door','label':'Room doorway','confidence':'high','points':[{'x':50,'y':50}]},
            {'id':'exit-door-test','kind':'exit','label':'ExitDoor','confidence':'high','points':[{'x':90,'y':50}]},
            {'id':'edge-exit-test','kind':'exit','label':'','confidence':'medium','points':[{'x':100,'y':0}]},
        ]
        validate_plan(raw)
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp) / 'source.png'
            Image.new('RGB', (640, 480), 'white').save(photo)
            frame = self.trace['frame']
            source, preview, forward, inverse, _ = rectify(photo, frame['corners'], frame['width'], frame['height'])
            plan = build_plan(raw, source, preview, frame['corners'], forward, inverse, {'method':'provided_trace'})
            self.assertEqual(plan['spaces'][0]['kind'], 'elevator')
            self.assertFalse(any(s['kind'] == 'door' for s in plan['markings']))
            self.assertTrue(any(s['id'] == 'exit-door-test' for s in plan['markings']))
            self.assertTrue(all(s['label']=='Exit door' for s in plan['markings'] if s['kind']=='exit'))
            ns = '{http://www.w3.org/2000/svg}'
            for background in (None, preview.data_url):
                root = ET.fromstring(render_plan(plan, background))
                self.assertIn('Elevator', ''.join(root.itertext()))
                for identifier in ['exit-door-test','edge-exit-test']:
                    marker = root.find(f'{ns}g[@id="markings"]/{ns}rect[@id="{identifier}"]')
                    self.assertIsNotNone(marker)
                    self.assertNotEqual(marker.get('stroke'), 'none')
                    label = root.find(f'{ns}g[@id="labels"]/{ns}text[@data-for="{identifier}"]')
                    self.assertIsNotNone(label)
                    self.assertEqual(label.text, 'Exit door')
                    self.assertGreater(float(label.get('x')),0)
                    self.assertLess(float(label.get('x')),preview.width)
                    self.assertGreater(float(label.get('y')),0)
                    self.assertLess(float(label.get('y')),preview.height)
                self.assertIsNone(root.find(f'{ns}g[@id="markings"]/{ns}rect[@id="interior-door-test"]'))

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
            self.assertEqual(len(root.findall('.//{http://www.w3.org/2000/svg}polygon')), len(plan['spaces']) + len(plan['outlines']))
            ids = [n.get('id') for n in root.iter() if n.get('id')]
            self.assertEqual(len(ids), len(set(ids)))
            layers = {n.get('id') for n in root.findall('{http://www.w3.org/2000/svg}g')}
            self.assertEqual(layers, {'spaces', 'walls', 'markings', 'labels', 'outlines'})
            # Evacuation markings remain visual annotations, not routing edges.
            self.assertNotIn('edges', plan)

    def test_crop_padding_preserves_detected_frame_and_stays_inside_photo(self):
        rectangle = [[200,150],[800,150],[800,450],[200,450]]
        expected = [[140,120],[860,120],[860,480],[140,480]]
        for actual, target in zip(padded_frame(rectangle,1000,600), expected):
            for value, wanted in zip(actual,target):
                self.assertAlmostEqual(value,wanted)
        self.assertEqual(padded_frame(rectangle,1000,600,0),rectangle)
        skew = [[230,170],[750,120],[820,440],[180,480]]
        padded = padded_frame(skew,1000,600)
        self.assertNotAlmostEqual(padded[0][1],padded[1][1])
        # Also cover photo-edge clamping and perspective expansion reaching
        # infinity, which needs the conservative rectangular fallback.
        for corners in [rectangle,skew,[[0,10],[990,0],[1000,580],[10,600]],
                        [[455,100],[545,100],[995,550],[5,550]]]:
            expanded = padded_frame(corners,1000,600)
            frame_transforms(expanded,1000,600)
            for x,y in expanded:
                self.assertTrue(0 <= x <= 1000 and 0 <= y <= 600)
            for a,b in zip(expanded,expanded[1:]+expanded[:1]):
                for x,y in corners:
                    self.assertGreaterEqual((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]),-1e-6)
        for invalid in [-.1,.31,True,float('nan'),float('inf')]:
            with self.subTest(fraction=invalid), self.assertRaises(PipelineError):
                padded_frame(rectangle,1000,600,invalid)

    def test_crop_margin_retains_feature_outside_model_detected_frame(self):
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp) / 'edge-detail.png'
            image = Image.new('RGB',(1000,600),'white')
            ImageDraw.Draw(image).rectangle((150,125,175,145),fill='red')
            image.save(photo)
            corners = [[200,150],[800,150],[800,450],[200,450]]
            def red_pixels(frame):
                *_,pixels = rectify(photo,frame,1200,760)
                with Image.open(io.BytesIO(pixels)) as crop:
                    pixels = crop.convert('RGB').load()
                    return sum(r > 200 and g < 50 and b < 50
                               for y in range(crop.height) for x in range(crop.width)
                               for r,g,b in [pixels[x,y]])
            self.assertEqual(red_pixels(corners),0)
            self.assertGreater(red_pixels(padded_frame(corners,1000,600)),100)

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
        self.assertEqual(analyze.call_args.args[3], custom + GEOMETRY_FORMAT_RULES + EXTRACTION_COVERAGE_RULES)
        self.assertIn('EXACTLY ONE point', analyze.call_args.args[3])
        spaces = PLAN_SCHEMA['properties']['spaces']['items']['properties']['polygon']
        walls = PLAN_SCHEMA['properties']['walls']['items']['properties']['points']
        symbol = PLAN_SCHEMA['properties']['markings']['items']
        self.assertEqual((spaces['minItems'], spaces['maxItems']), (3, 80))
        self.assertEqual((walls['minItems'], walls['maxItems']), (2, 80))
        self.assertEqual((symbol['properties']['points']['minItems'], symbol['properties']['points']['maxItems']), (1, 1))
        self.assertEqual(symbol['properties']['kind']['enum'], ['exit'])

    def test_every_space_has_an_outline_with_partial_walls_and_equipment_dots_hidden(self):
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp) / 'source.png'
            Image.new('RGB', (640, 480), 'white').save(photo)
            frame = self.trace['frame']
            source, preview, forward, inverse, _ = rectify(photo, frame['corners'], frame['width'], frame['height'])
            plan = build_plan(self.trace['plan'], source, preview, frame['corners'], forward, inverse, {'method':'provided_trace'})
            self.assertTrue(plan['walls'])
            self.assertTrue(any(s['kind'] == 'fire_equipment' for s in plan['markings']))
            for background in (None, preview.data_url):
                root = ET.fromstring(render_plan(plan, background))
                ns = '{http://www.w3.org/2000/svg}'
                spaces = root.find(f'{ns}g[@id="spaces"]').findall(f'{ns}polygon')
                self.assertEqual(len(spaces), len(plan['spaces']))
                kinds = {s['id']:s['kind'] for s in plan['spaces']}
                self.assertTrue(all(s.get('stroke') not in (None, 'none') for s in spaces if kinds[s.get('id')] != 'corridor'))
                marks = root.find(f'{ns}g[@id="markings"]')
                ids = {s.get('id') for s in marks}
                for mark in plan['markings']:
                    self.assertEqual(mark['id'] in ids, mark['kind'] == 'exit')

    def test_concave_exterior_outline_and_bathroom_export(self):
        raw = copy.deepcopy(self.trace['plan'])
        raw['spaces'][0].update(kind='bathroom', label='209 Bathroom')
        raw['outlines'] = [{'id':'building-exterior', 'confidence':'medium', 'polygon':[
            {'x':1,'y':1}, {'x':99,'y':1}, {'x':99,'y':60}, {'x':60,'y':60}, {'x':60,'y':99}, {'x':1,'y':99},
        ]}]
        validate_plan(raw)
        with tempfile.TemporaryDirectory() as tmp:
            photo = Path(tmp) / 'source.png'
            Image.new('RGB', (640, 480), 'white').save(photo)
            frame = self.trace['frame']
            source, preview, forward, inverse, _ = rectify(photo, frame['corners'], frame['width'], frame['height'])
            plan = build_plan(raw, source, preview, frame['corners'], forward, inverse, {'method':'provided_trace'})
            outline = plan['outlines'][0]
            self.assertEqual(len(outline['polygon']), 6)  # Keep the recess, not a bounding box.
            self.assertEqual(outline['polygon'][3], {'x':720, 'y':456})
            self.assertEqual(len(outline['source_photo_points']), 6)
            root = ET.fromstring(render_plan(plan))
            ns = '{http://www.w3.org/2000/svg}'
            self.assertIsNotNone(root.find(f'{ns}g[@id="outlines"]/{ns}polygon[@id="building-exterior"]'))
            self.assertIn('209 Bathroom', ''.join(root.itertext()))
            self.assertFalse(any('No exterior' in w for w in plan['warnings']))
        for vertices in [[{'x':0,'y':0},{'x':1,'y':1}], [{'x':0,'y':0},{'x':90,'y':80},{'x':0,'y':100},{'x':70,'y':0}]]:
            invalid = copy.deepcopy(raw)
            invalid['outlines'][0]['polygon'] = vertices
            with self.assertRaises(PipelineError):
                validate_plan(invalid)

    def test_extraction_requests_complete_perimeter_and_bathrooms(self):
        with patch('pipeline.vectorize.request_structured_image', return_value=self.trace['plan']) as analyze:
            extract_plan(None, 'key', 'model', prompt='Preserve my edits.')
        prompt = analyze.call_args.args[3]
        self.assertTrue(prompt.startswith('Preserve my edits.'))
        self.assertIn('toilet-stall', prompt)
        self.assertIn('exterior building perimeter', prompt)
        self.assertIn('omit fire_equipment', prompt)
        self.assertIn('bathroom', PLAN_SCHEMA['properties']['spaces']['items']['properties']['kind']['enum'])
        self.assertIn('outlines', PLAN_SCHEMA['required'])

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
                self.assertNotIn('max_output_tokens', call.call_args.kwargs)
                self.assertIn('minimum vertices', call.call_args.args[3])


if __name__ == '__main__': unittest.main()
