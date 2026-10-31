<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * One-shot vision call through OpenRouter (OpenAI chat format). Returns the model's JSON answer.
 * Prompts live in resources/prompts/*.md so they can be tuned without touching PHP.
 */
class VisionClient
{
    public function json(string $promptName, UploadedFile $image, array $vars = []): array
    {
        abort_if(! config('services.openrouter.key'), 503, 'OPENROUTER_API_KEY not set');

        $prompt = strtr(file_get_contents(resource_path("prompts/{$promptName}.md")), $vars);
        $dataUrl = 'data:'.$image->getMimeType().';base64,'.base64_encode($image->get());

        $res = Http::withToken(config('services.openrouter.key'))
            ->timeout(60)
            ->post('https://openrouter.ai/api/v1/chat/completions', [
                'model' => config('services.openrouter.model'),
                'response_format' => ['type' => 'json_object'],
                'messages' => [[
                    'role' => 'user',
                    'content' => [
                        ['type' => 'text', 'text' => $prompt],
                        ['type' => 'image_url', 'image_url' => ['url' => $dataUrl]],
                    ],
                ]],
            ]);

        if (! $res->ok()) {
            throw new RuntimeException('Vision provider error: '.$res->status());
        }

        // Some models ignore response_format and wrap JSON in a ```json fence.
        $text = trim(preg_replace('/^```(?:json)?\s*|\s*```$/', '', trim((string) $res->json('choices.0.message.content'))));

        return json_decode($text, true, flags: JSON_THROW_ON_ERROR);
    }
}
