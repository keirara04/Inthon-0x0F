import io
import json
import math
import os
import tempfile
import unittest
import urllib.error
import xml.etree.ElementTree as ET
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from pipeline.__main__ import main
from pipeline.map_pipeline import (
    MapImage, PipelineError, diagram_to_graph, extract_diagram,
    load_image, read_diagram, render_svg, validate_diagram, write_artifacts,
)

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


def example():
    return json.loads((EXAMPLES / 'diagram.json').read_text())


def place(id, x, y):
    return {'id': id, 'name': id.upper(), 'x': x, 'y': y, 'description': ''}


def diagram(places, corridors):
    return {'floor': 'Floor 1', 'places': places, 'corridors': corridors, 'warnings': []}


def corridor(a, b, *via):
    return {'from': a, 'to': b, 'via': [{'x': x, 'y': y} for x, y in via]}


class PipelineTests(unittest.TestCase):
    def setUp(self):
        # Keep explicit coverage for the original OpenAI Responses adapter.
        config = patch.dict(os.environ, {'OPENAI_BASE_URL': 'https://api.openai.com/v1', 'OPENAI_API_FORMAT': 'responses'})
        config.start()
        self.addCleanup(config.stop)
        self.image = load_image(EXAMPLES / 'map.png')

    def test_example_load_and_graph(self):
        self.assertEqual((self.image.width, self.image.height), (1000, 700))
        graph = diagram_to_graph(example(), self.image)
        self.assertEqual(len([n for n in graph['nodes'] if n['kind'] == 'place']), 5)
        self.assertEqual(len(graph['nodes']), 8)
        self.assertEqual(len(graph['edges']), 7)
        self.assertTrue(graph['validation']['connected'])
        self.assertTrue(graph['review_required'])
        self.assertEqual(graph['coordinate_system']['unit'], 'pixel')
        self.assertEqual(graph['extraction']['method'], 'provided_diagram')
        self.assertEqual(graph, diagram_to_graph(example(), self.image))
        nodes = {n['id']: n for n in graph['nodes']}
        self.assertEqual((nodes['cafe']['x'], nodes['cafe']['y']), (440, 280))
        pairs = set()
        for edge in graph['edges']:
            self.assertIn(edge['from'], nodes)
            self.assertIn(edge['to'], nodes)
            a, b = nodes[edge['from']], nodes[edge['to']]
            self.assertAlmostEqual(edge['length_pixels'], math.hypot(a['x'] - b['x'], a['y'] - b['y']), places=3)
            self.assertTrue(edge['bidirectional'])
            pairs.add(tuple(sorted((edge['from'], edge['to']))))
        self.assertEqual(len(pairs), len(graph['edges']))

    def test_crossings_become_shared_junctions(self):
        data = diagram([place('a', 10, 50), place('b', 90, 50), place('c', 50, 10), place('d', 50, 90)], [corridor('a', 'b'), corridor('c', 'd')])
        graph = diagram_to_graph(data, self.image)
        junctions = [n for n in graph['nodes'] if n['kind'] == 'junction']
        self.assertEqual([(n['x'], n['y']) for n in junctions], [(500, 350)])
        self.assertEqual(len(graph['edges']), 4)
        self.assertTrue(graph['validation']['connected'])
        self.assertEqual(sum(junctions[0]['id'] in (e['from'], e['to']) for e in graph['edges']), 4)

    def test_t_junction_and_overlapping_corridors_split_and_deduplicate(self):
        data = diagram([place('a', 10, 50), place('b', 90, 50), place('c', 50, 90)], [corridor('a', 'b'), corridor('a', 'c', (50, 50))])
        graph = diagram_to_graph(data, self.image)
        self.assertEqual(len(graph['nodes']), 4)
        self.assertEqual(len(graph['edges']), 3)
        shared = [e for e in graph['edges'] if len(e['corridors']) == 2]
        self.assertEqual(len(shared), 1)
        self.assertTrue(graph['validation']['connected'])

    def test_parallel_corridors_are_not_connected_or_snapped(self):
        data = diagram([place('a', 10, 20), place('b', 90, 20), place('c', 10, 21), place('d', 90, 21)], [corridor('a', 'b'), corridor('c', 'd')])
        graph = diagram_to_graph(data, self.image)
        self.assertEqual(len(graph['nodes']), 4)
        self.assertEqual(len(graph['edges']), 2)
        self.assertFalse(graph['validation']['connected'])
        self.assertEqual(len(graph['validation']['components']), 2)
        self.assertTrue(any('disconnected' in warning for warning in graph['warnings']))

    def test_named_place_on_a_corridor_splits_the_edge(self):
        data = diagram([place('a', 10, 50), place('b', 90, 50), place('c', 50, 50)], [corridor('a', 'b')])
        graph = diagram_to_graph(data, self.image)
        self.assertEqual(len(graph['nodes']), 3)
        self.assertEqual(len(graph['edges']), 2)
        self.assertTrue(graph['validation']['connected'])

    def test_graph_ids_cannot_collide_with_place_ids(self):
        data = diagram([place('junction-001', 10, 10), place('b', 90, 90)], [corridor('junction-001', 'b', (10, 90))])
        graph = diagram_to_graph(data, self.image)
        ids = [n['id'] for n in graph['nodes']]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertIn('junction-002', ids)

    def test_invalid_diagrams_fail_before_export(self):
        mutations = [
            lambda d: d['places'][0].update(x=True),
            lambda d: d['places'][0].update(y=float('nan')),
            lambda d: d['places'][0].update(x=101),
            lambda d: d['places'][0].update(id=d['places'][1]['id']),
            lambda d: d['places'][0].update(name=d['places'][1]['name']),
            lambda d: d['places'][0].update(name=''),
            lambda d: d['corridors'][0].update(to='missing'),
            lambda d: d['corridors'][0].update(to=d['corridors'][0]['from']),
            lambda d: d['corridors'][0].update(via=[{'x': 20}]),
            lambda d: d.update(places=[]),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                data = example(); mutate(data)
                with self.assertRaises(PipelineError):
                    validate_diagram(data)
        data = example(); data['corridors'][0]['via'] = [{'x': 15, 'y': 80}]
        with self.assertRaisesRegex(PipelineError, 'repeated'):
            diagram_to_graph(data, self.image)

    def test_svg_is_valid_and_escapes_labels(self):
        data = example(); data['places'][0]['name'] = '<script>&"'
        graph = diagram_to_graph(data, self.image)
        for overlay in (False, True):
            svg = render_svg(graph, self.image, overlay=overlay)
            root = ET.fromstring(svg)
            self.assertEqual(len(root.findall('{http://www.w3.org/2000/svg}line')), 7)
            self.assertNotIn('<script>', svg)
            self.assertEqual('data:image/png;base64,' in svg, overlay)

    def test_artifact_roundtrip_and_source_binding(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            data = example(); graph = diagram_to_graph(data, self.image)
            files = write_artifacts(path, data, graph, self.image)
            self.assertEqual(len(files), 4)
            self.assertEqual(json.loads((path / 'graph.json').read_text()), graph)
            self.assertEqual(read_diagram(path / 'diagram.json', self.image), data)
            with self.assertRaisesRegex(PipelineError, 'already exist'):
                write_artifacts(path, data, graph, self.image)
            write_artifacts(path, data, graph, self.image, overwrite=True)
            other = MapImage(self.image.width, self.image.height, 'different-sha', self.image.data_url, 'other.png')
            with self.assertRaisesRegex(PipelineError, 'different map'):
                read_diagram(path / 'diagram.json', other)

    def test_corrupt_images_and_exif_orientation(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp)
            bad = path / 'bad.png'; bad.write_bytes(b'not an image')
            with self.assertRaises(PipelineError):
                load_image(bad)
            huge = path / 'huge.png'; huge.write_bytes(b'0' * (6 * 1024 * 1024 + 1))
            with self.assertRaisesRegex(PipelineError, '6 MB'):
                load_image(huge)
            oriented = path / 'rotated.jpg'
            image = Image.new('RGB', (40, 20), 'white')
            exif = image.getexif(); exif[274] = 6
            image.save(oriented, exif=exif)
            loaded = load_image(oriented)
            self.assertEqual((loaded.width, loaded.height), (20, 40))

    def test_vision_request_and_response_are_wired_to_actual_image(self):
        calls = []
        def transport(request, timeout):
            calls.append(request)
            payload = json.loads(request.data)
            self.assertEqual(payload['input'][0]['content'][1]['image_url'], self.image.data_url)
            self.assertFalse(payload['store'])
            self.assertTrue(payload['text']['format']['strict'])
            self.assertEqual(payload['model'], 'configured-model')
            self.assertIsNone(timeout)
            return io.BytesIO(json.dumps({'status': 'completed', 'output': [{'type': 'message', 'content': [{'type': 'output_text', 'text': json.dumps(example())}]}]}).encode())
        extracted = extract_diagram(self.image, 'test-key', 'configured-model', transport=transport)
        self.assertEqual(len(calls), 1)
        self.assertEqual(extracted, example())
        graph = diagram_to_graph(extracted, self.image, {'method': 'vision', 'model': 'configured-model'})
        self.assertTrue(graph['validation']['connected'])

    def test_vision_failures_are_explicit_and_do_not_fabricate_diagrams(self):
        with self.assertRaisesRegex(PipelineError, 'OPENAI_API_KEY'):
            extract_diagram(self.image, '', 'model')
        responses = [
            {'status': 'incomplete', 'output': []},
            {'status': 'completed', 'output': [{'content': [{'type': 'refusal', 'refusal': 'no'}]}]},
            {'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': 'bad json'}]}]},
            {'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': json.dumps({'floor': 'Unknown', 'places': [], 'corridors': [], 'warnings': ['Not readable']})}]}]},
        ]
        for response in responses:
            with self.subTest(response=response):
                with self.assertRaises(PipelineError):
                    extract_diagram(self.image, 'test', 'model', transport=lambda *a, **k: io.BytesIO(json.dumps(response).encode()))
        for code in (401, 403, 429, 500):
            with self.subTest(code=code):
                with self.assertRaises(PipelineError) as caught:
                    extract_diagram(self.image, 'test', 'model', transport=lambda *a, **k: (_ for _ in ()).throw(urllib.error.HTTPError('https://api.openai.com/v1/responses', code, 'private error details', {}, None)))
                self.assertNotIn('private error details', str(caught.exception))
        with self.assertRaisesRegex(PipelineError, 'timed out'):
            extract_diagram(self.image, 'test', 'model', transport=lambda *a, **k: (_ for _ in ()).throw(TimeoutError()))

    def test_cli_full_local_conversion_and_disconnected_exit(self):
        with tempfile.TemporaryDirectory() as tmp, redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            out = Path(tmp) / 'out'
            self.assertEqual(main([str(EXAMPLES / 'map.png'), '--diagram', str(EXAMPLES / 'diagram.json'), '--output', str(out), '--require-connected']), 0)
            self.assertTrue((out / 'diagram.svg').exists())
            self.assertTrue(json.loads((out / 'graph.json').read_text())['validation']['connected'])
            self.assertEqual(main([str(EXAMPLES / 'map.png'), '--diagram', str(EXAMPLES / 'diagram.json'), '--output', str(out)]), 1)
            data = example(); data['corridors'] = data['corridors'][:1]
            disconnected = Path(tmp) / 'disconnected.json'; disconnected.write_text(json.dumps(data))
            other_out = Path(tmp) / 'other'
            self.assertEqual(main([str(EXAMPLES / 'map.png'), '--diagram', str(disconnected), '--output', str(other_out), '--require-connected']), 2)
            self.assertFalse(json.loads((other_out / 'graph.json').read_text())['validation']['connected'])
            with patch.dict(os.environ, {'OPENAI_API_KEY': ''}):
                failed_out = Path(tmp) / 'failed'
                self.assertEqual(main([str(EXAMPLES / 'map.png'), '--output', str(failed_out)]), 1)
                self.assertFalse(failed_out.exists())


if __name__ == '__main__':
    unittest.main()
