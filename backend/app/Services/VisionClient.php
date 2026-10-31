<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * One-shot vision call through OpenRouter (OpenAI chat format). Returns the model's JSON answer.
 * System prompt: resources/prompts/{name}.md, output schema: resources/schemas/{name}.json
 * (copied from ai/, owned by 상후). Settings match ai/eval/common.py so eval numbers carry over.
 */
class VisionClient
{
    public function json(string $name, UploadedFile $image, string $userText = ''): array
    {
        abort_if(! config('services.openrouter.key'), 503, 'OPENROUTER_API_KEY not set');

        $schema = json_decode(file_get_contents(resource_path("schemas/{$name}.json")), true, flags: JSON_THROW_ON_ERROR);
        unset($schema['$schema'], $schema['$id']); // some providers reject meta keys

        $body = [
            'model' => config("services.openrouter.{$name}_model") ?: config('services.openrouter.model'),
            'temperature' => 0,
            'reasoning' => ['effort' => 'low'], // ~3x faster than default, same JSON validity in eval
            'messages' => [
                ['role' => 'system', 'content' => file_get_contents(resource_path("prompts/{$name}.md"))],
                ['role' => 'user', 'content' => [
                    ['type' => 'text', 'text' => $userText ?: '이 사진을 읽어줘.'],
                    ['type' => 'image_url', 'image_url' => ['url' => 'data:'.$image->getMimeType().';base64,'.base64_encode($image->get())]],
                ]],
            ],
        ];

        // Strict schema first; if the routed provider can't do structured output, retry with plain JSON mode.
        $res = $this->post($body + [
            'response_format' => ['type' => 'json_schema', 'json_schema' => ['name' => $name, 'strict' => true, 'schema' => $schema]],
            'provider' => ['require_parameters' => true],
        ]);
        if (in_array($res->status(), [400, 404, 422], true)) {
            $res = $this->post($body + ['response_format' => ['type' => 'json_object']]);
        }
        if (! $res->ok()) {
            throw new RuntimeException('Vision provider error: '.$res->status());
        }

        // Some models ignore response_format and wrap JSON in a ```json fence.
        $text = trim(preg_replace('/^```(?:json)?\s*|\s*```$/', '', trim((string) $res->json('choices.0.message.content'))));

        return json_decode($text, true, flags: JSON_THROW_ON_ERROR);
    }

    private function post(array $body)
    {
        return Http::withToken(config('services.openrouter.key'))->timeout(60)
            ->post('https://openrouter.ai/api/v1/chat/completions', $body);
    }
}
