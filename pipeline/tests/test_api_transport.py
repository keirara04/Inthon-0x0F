import io
import json
import socket
import ssl
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from pipeline.map_pipeline import (
    PipelineError, _verified_urlopen, api_connection, load_image,
    request_structured_image, verified_ssl_context, vision_model, thinking_parameters,
)

EXAMPLES = Path(__file__).resolve().parents[1] / 'examples'


class TransportTests(unittest.TestCase):
    def setUp(self):
        self.image = load_image(EXAMPLES / 'map.png')

    def call(self, transport):
        return request_structured_image(self.image, 'private-test-key', 'exact-hackathon-model', 'Read this map.', {'type': 'object'}, 'test_map', transport=transport)

    def test_gateway_chat_endpoint_payload_and_response(self):
        def transport(request, timeout):
            self.assertEqual(request.full_url, 'https://gateway.example/hackathon/v1/chat/completions')
            body = json.loads(request.data)
            self.assertEqual(body['model'], 'exact-hackathon-model')
            self.assertEqual(body['messages'][1]['content'][1]['image_url']['url'], self.image.data_url)
            self.assertEqual(body['response_format']['type'], 'json_object')
            self.assertNotIn('store', body)
            self.assertNotIn('input', body)
            self.assertNotIn('max_tokens', body)
            self.assertNotIn('max_output_tokens', body)
            self.assertIsNone(timeout)
            return io.BytesIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"floor":"2F"}'}}]}).encode())
        with patch.dict('os.environ', {'OPENAI_BASE_URL': 'https://gateway.example/hackathon/v1/', 'OPENAI_API_FORMAT': 'chat_completions'}):
            self.assertEqual(self.call(transport), {'floor': '2F'})

    def test_gateway_responses_format_and_no_model_based_rerouting(self):
        def transport(request, timeout):
            self.assertEqual(request.full_url, 'https://gateway.example/v1/responses')
            self.assertEqual(json.loads(request.data)['model'], 'exact-hackathon-model')
            self.assertNotIn('max_output_tokens', json.loads(request.data))
            self.assertIsNone(timeout)
            return io.BytesIO(json.dumps({'status': 'completed', 'output': [{'content': [{'type': 'output_text', 'text': '{"ok":true}'}]}]}).encode())
        with patch.dict('os.environ', {'OPENAI_BASE_URL': 'https://gateway.example/v1', 'OPENAI_API_FORMAT': 'responses'}):
            self.assertEqual(self.call(transport), {'ok': True})

    def test_invalid_base_urls_and_formats_fail_before_sending_credentials(self):
        for base in ['http://gateway.example/v1', 'https://key@gateway.example/v1', 'https://gateway.example/v1?api_key=secret', 'https://gateway.example/v1#fragment', 'not-a-url']:
            with self.subTest(base=base), patch.dict('os.environ', {'OPENAI_BASE_URL': base}):
                with self.assertRaises(PipelineError): api_connection()
        with patch.dict('os.environ', {'OPENAI_BASE_URL': 'https://gateway.example/v1', 'OPENAI_API_FORMAT': 'unknown'}):
            with self.assertRaises(PipelineError): api_connection()

    def test_chat_blank_truncated_and_refused_results_fail(self):
        responses = [
            {'choices': []},
            {'choices': [{'finish_reason': 'length', 'message': {'content': '{}'}}]},
            {'choices': [{'finish_reason': 'stop', 'message': {'content': '   '}}]},
            {'choices': [{'finish_reason': 'stop', 'message': {'content': '{}', 'refusal': 'Cannot process'}}]},
            {'choices': [{'finish_reason': 'stop', 'message': {'content': 'not json'}}]},
        ]
        with patch.dict('os.environ', {'OPENAI_BASE_URL': 'https://gateway.example/v1', 'OPENAI_API_FORMAT': 'chat_completions'}):
            for response in responses:
                with self.subTest(response=response), self.assertRaises(PipelineError):
                    self.call(lambda *a, **k: io.BytesIO(json.dumps(response).encode()))

    def test_verified_ca_bundle_and_transport_keep_certificate_checks_enabled(self):
        context = verified_ssl_context()
        self.assertTrue(context.check_hostname)
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertGreater(context.cert_store_stats()['x509_ca'], 0)
        with patch('urllib.request.urlopen', return_value='response') as opener:
            self.assertEqual(_verified_urlopen('request', timeout=90), 'response')
            passed = opener.call_args.kwargs['context']
            self.assertTrue(passed.check_hostname)
            self.assertEqual(passed.verify_mode, ssl.CERT_REQUIRED)

    def test_refusal_and_output_limit_are_distinct_and_identify_the_stage(self):
        cases = [
            ({'choices': [{'finish_reason': 'length', 'message': {'content': ''}}], 'usage': {'completion_tokens_details': {'reasoning_tokens': 5999}}}, 'Locating the map:.*provider reported a generation length limit.*no output-token cap.*not an explicit refusal.*5999'),
            ({'choices': [{'finish_reason': 'stop', 'message': {'refusal': 'private provider text', 'content': None}}]}, 'Locating the map:.*explicitly refused'),
            ({'choices': [{'finish_reason': 'content_filter', 'message': {'content': ''}}]}, 'Locating the map:.*explicitly refused'),
            ({'choices': [{'finish_reason': 'tool_calls', 'message': {'content': ''}}]}, 'finish_reason=tool_calls.*No explicit refusal'),
            ({'choices': [{'finish_reason': 'stop', 'message': {'content': ''}}]}, 'returned no JSON text.*No explicit refusal'),
        ]
        with patch.dict('os.environ', {'OPENAI_API_FORMAT': 'chat_completions'}):
            for result, expected in cases:
                with self.subTest(result=result), self.assertRaisesRegex(PipelineError, expected) as caught:
                    request_structured_image(self.image, 'private-test-key', 'model', 'Read map', {}, 'map_frame', transport=lambda *a, **k: io.BytesIO(json.dumps(result).encode()))
                self.assertNotIn('private provider text', str(caught.exception))
                self.assertNotIn('private-test-key', str(caught.exception))

    def test_lablup_defaults_match_hackathon_snippet(self):
        with patch.dict('os.environ', {}, clear=True):
            self.assertEqual(api_connection(), ('https://api.console.lablup.ai/v1', 'chat_completions'))
            self.assertEqual(vision_model(), 'DeepSeek-V4.1-Flash-B300')

    def test_thinking_controls_match_the_model_host(self):
        with patch.dict('os.environ', {'MAP_THINKING_CONTROL': 'auto'}):
            self.assertEqual(thinking_parameters('DeepSeek-V4.1-Flash-B300', 'https://api.console.lablup.ai/v1'), {})
            self.assertEqual(thinking_parameters('deepseek-flash', 'https://api.deepseek.com'), {'thinking': {'type': 'disabled'}})
            self.assertEqual(thinking_parameters('other-model', 'https://api.console.lablup.ai/v1'), {})
            self.assertEqual(thinking_parameters('deepseek-flash', 'https://other-gateway.example/v1'), {})
        with patch.dict('os.environ', {'MAP_THINKING_CONTROL': 'off'}):
            self.assertEqual(thinking_parameters('DeepSeek-V4.1-Flash-B300', 'https://api.console.lablup.ai/v1'), {})
        with patch.dict('os.environ', {'MAP_THINKING_CONTROL': 'template'}):
            self.assertEqual(thinking_parameters('DeepSeek-V4.1-Flash-B300', 'https://api.console.lablup.ai/v1'), {'chat_template_kwargs': {'thinking_mode': 'chat', 'enable_thinking': False}})
        with patch.dict('os.environ', {'MAP_THINKING_CONTROL': 'wrong'}):
            with self.assertRaises(PipelineError): thinking_parameters('model', 'https://gateway.example/v1')

    def test_lablup_image_request_uses_compatible_fields_and_larger_output_budget(self):
        def transport(request, timeout):
            body = json.loads(request.data)
            self.assertNotIn('chat_template_kwargs', body)
            self.assertNotIn('thinking', body)
            self.assertEqual(body['max_tokens'], 32768)
            self.assertEqual(body['response_format'], {'type': 'json_object'})
            self.assertEqual(body['messages'][1]['content'][1]['image_url']['url'], self.image.data_url)
            return io.BytesIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': '{"ok":true}'}}]}).encode())
        with patch.dict('os.environ', {}, clear=True):
            result = request_structured_image(self.image, 'test-key', vision_model(), 'Extract compact geometry JSON.', {}, 'vector_plan', transport=transport, max_output_tokens=32768)
            self.assertEqual(result, {'ok': True})

    def test_upstream_error_reports_stage_and_redacts_provider_message(self):
        detail = 'Unsupported option. private-test-key Bearer another-secret data:image/png;base64,abc123'
        stream = io.BytesIO(json.dumps({'error': {'message': detail}}).encode())
        error = urllib.error.HTTPError('https://gateway.example/v1/chat/completions', 502, 'Bad Gateway', {}, stream)
        def transport(*args, **kwargs):
            raise error
        with self.assertRaisesRegex(PipelineError, 'Image analysis:.*HTTP 502.*Provider detail: Unsupported option') as caught:
            self.call(transport)
        for secret in ['private-test-key', 'another-secret', 'abc123']:
            self.assertNotIn(secret, str(caught.exception))
        self.assertIs(caught.exception.__cause__, error)
        self.assertTrue(stream.closed)

    def test_html_and_oversized_provider_error_bodies_are_not_displayed(self):
        for body in [b'<html>private gateway diagnostic</html>', json.dumps({'error': 'x' * 9000}).encode()]:
            error = urllib.error.HTTPError('https://gateway.example/v1/chat/completions', 502, 'Bad Gateway', {}, io.BytesIO(body))
            def transport(*args, **kwargs):
                raise error
            with self.subTest(body_size=len(body)), self.assertRaises(PipelineError) as caught:
                self.call(transport)
            self.assertNotIn('Provider detail:', str(caught.exception))

    def test_network_failure_messages_identify_certificate_dns_and_timeout(self):
        cases = [(ssl.SSLCertVerificationError('test'), 'certificate'), (socket.gaierror('test'), 'hostname'), (TimeoutError(), 'timed out')]
        for reason, expected in cases:
            with self.subTest(reason=reason):
                def transport(*args, **kwargs): raise urllib.error.URLError(reason)
                with self.assertRaisesRegex(PipelineError, expected): self.call(transport)


if __name__ == '__main__': unittest.main()
