import copy
import hashlib
import io
import json
import threading
import unittest
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from pipeline.map_pipeline import MAX_FILE_BYTES, PipelineError
from pipeline.server import Handler, ServiceError, convert_upload, validate_request_headers
from pipeline.vectorize import convert_photo as actual_convert_photo

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


def headers(**overrides):
    result = Message()
    values = {'Host': '127.0.0.1:8765', 'Origin': 'http://127.0.0.1:8765', 'Content-Type': 'image/png', 'Content-Length': '3'}
    values.update(overrides)
    for key, value in values.items():
        if value is not None: result[key] = value
    return result


class ServerTests(unittest.TestCase):
    def test_upload_validation_and_missing_key(self):
        for data, key, expected in [(b'', '', 400), (b'bad image', 'key', 400), (b'x' * (MAX_FILE_BYTES + 1), 'key', 413), ((EXAMPLES / 'map.png').read_bytes(), '', 503)]:
            with self.assertRaises(ServiceError) as error:
                convert_upload(data, api_key=key)
            self.assertEqual(error.exception.status, expected)

    def test_complete_automatic_path_uses_uploaded_image_and_cleans_workspace(self):
        payload = (EXAMPLES / 'map.png').read_bytes()
        fixture = json.loads((EXAMPLES / 'evacuation-photo.trace.json').read_text())
        frame = {'corners': [{'x': 5, 'y': 5}, {'x': 95, 'y': 5}, {'x': 95, 'y': 95}, {'x': 5, 'y': 95}], 'warnings': []}
        plan = copy.deepcopy(fixture['plan']); plan['warnings'] = []
        paths = []
        def record(path, key, model):
            paths.append(path)
            self.assertEqual(key, 'secret-test-key')
            self.assertEqual(model, 'test-model')
            return actual_convert_photo(path, key, model)
        with patch('pipeline.server.convert_photo', side_effect=record), patch('pipeline.vectorize.request_structured_image', side_effect=[frame, plan]) as analyze:
            result = convert_upload(payload, api_key='secret-test-key', model='test-model')
        self.assertEqual(analyze.call_count, 2)
        self.assertEqual(result['plan']['extraction'], {'method': 'vision', 'model': 'test-model'})
        self.assertEqual(result['plan']['source']['sha256'], hashlib.sha256(payload).hexdigest())
        self.assertNotIn('<image', result['svg'])
        self.assertIn('<image', result['overlay_svg'])
        self.assertTrue(result['review_required'])
        self.assertNotIn('secret-test-key', json.dumps(result))
        self.assertTrue(paths)
        self.assertTrue(all(not p.exists() and not p.parent.exists() for p in paths))

    def test_extraction_failure_returns_an_error_without_a_sample_result(self):
        with patch('pipeline.server.convert_photo', side_effect=PipelineError('No readable map was found.')):
            with self.assertRaises(ServiceError) as error:
                convert_upload((EXAMPLES / 'map.png').read_bytes(), api_key='test')
            self.assertEqual(error.exception.status, 422)
            self.assertEqual(error.exception.code, 'EXTRACTION_FAILED')

    def test_http_headers_limit_bytes_and_reject_cross_origin_requests(self):
        self.assertEqual(validate_request_headers(headers(), ('127.0.0.1', 8765)), 3)
        cases = [({'Origin': 'https://other.example'}, 403), ({'Host': 'other.example:8765'}, 403), ({'Content-Length': None}, 411), ({'Content-Length': '0'}, 400), ({'Content-Length': '-1'}, 400), ({'Content-Length': str(MAX_FILE_BYTES + 1)}, 413), ({'Content-Type': 'text/plain'}, 415), ({'Transfer-Encoding': 'chunked'}, 400)]
        for changed, status in cases:
            with self.subTest(changed=changed):
                with self.assertRaises(ServiceError) as error:
                    validate_request_headers(headers(**changed), ('127.0.0.1', 8765))
                self.assertEqual(error.exception.status, status)
        duplicate = headers(); duplicate['Content-Length'] = '5'
        with self.assertRaises(ServiceError): validate_request_headers(duplicate, ('127.0.0.1', 8765))

    def handler(self, converter=None, slot=None, path='/api/vectorize', request_headers=None, body=b'png'):
        handler = object.__new__(Handler)
        handler.path = path
        handler.headers = request_headers or headers()
        handler.connection = SimpleNamespace(settimeout=lambda value: None)
        handler.rfile = io.BytesIO(body)
        handler.server = SimpleNamespace(server_address=('127.0.0.1', 8765), converter=converter or Mock(return_value={'svg': 'converted', 'plan': {}}), conversion_slot=slot or threading.BoundedSemaphore(1))
        handler._reply = Mock()
        return handler

    def test_handler_success_error_and_busy_response_release_slots(self):
        success = self.handler()
        success.do_POST()
        self.assertEqual(success._reply.call_args.args[0], 200)
        success.server.converter.assert_called_once_with(b'png')
        self.assertTrue(success.server.conversion_slot.acquire(blocking=False))
        success.server.conversion_slot.release()
        busy_slot = threading.BoundedSemaphore(1); busy_slot.acquire()
        busy = self.handler(slot=busy_slot); busy.do_POST()
        self.assertEqual(busy._reply.call_args.args[0], 429)
        busy.server.converter.assert_not_called()
        self.assertFalse(busy_slot.acquire(blocking=False)); busy_slot.release()
        failed = self.handler(converter=Mock(side_effect=ServiceError(503, 'NOT_CONFIGURED', 'Key missing.')))
        failed.do_POST()
        self.assertEqual(failed._reply.call_args.args, (503, {'error': 'Key missing.', 'code': 'NOT_CONFIGURED'}))
        self.assertTrue(failed.server.conversion_slot.acquire(blocking=False)); failed.server.conversion_slot.release()

    def test_handler_incomplete_upload_wrong_path_and_private_errors(self):
        incomplete = self.handler(body=b'p'); incomplete.do_POST()
        self.assertEqual(incomplete._reply.call_args.args[0], 400)
        incomplete.server.converter.assert_not_called()
        other = self.handler(path='/not-an-endpoint'); other.do_POST()
        self.assertEqual(other._reply.call_args.args[0], 404)
        private = self.handler(converter=Mock(side_effect=RuntimeError('internal secret'))); private.do_POST()
        self.assertEqual(private._reply.call_args.args[0], 500)
        self.assertNotIn('internal secret', str(private._reply.call_args))


if __name__ == '__main__': unittest.main()
