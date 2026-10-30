<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
Route::get('/ping', fn () => ['message' => 'pong from laravel']);

// Starter AI call (Lablup, Anthropic Messages format). Throttled: every call costs tokens.
Route::get('/ai/test', function (Request $request) {
    $res = Http::withToken(config('services.lablup.key'))
        ->withHeaders(['anthropic-version' => '2023-06-01'])
        ->timeout(60)
        ->post(config('services.lablup.base_url').'/v1/messages', [
            'model' => config('services.lablup.model'),
            'max_tokens' => 1000, // model "thinks" first; low limits cut off the answer
            'messages' => [['role' => 'user', 'content' => $request->query('prompt', 'say hi in 3 words')]],
        ]);

    abort_unless($res->ok(), 502, 'AI provider error');

    // Skip "thinking" blocks, keep only the answer text
    $text = collect($res->json('content'))->where('type', 'text')->pluck('text')->implode('');

    return ['reply' => $text, 'usage' => $res->json('usage')];
})->middleware('throttle:10,1');
