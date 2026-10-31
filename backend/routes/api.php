<?php

use App\Http\Controllers\GraphController;
use App\Http\Controllers\NavigationController;
use App\Http\Controllers\SavedMapController;
use App\Http\Controllers\VisionController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Route;

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
Route::get('/ping', fn () => ['message' => 'pong from laravel']);

Route::get('/search', [NavigationController::class, 'search']);
Route::post('/route', [NavigationController::class, 'route']);
Route::get('/start-points', [NavigationController::class, 'startPoints']);

// Every vision call costs money. Generous checkpoint limit: venue phones share one public IP.
Route::post('/evac-map/parse', [VisionController::class, 'parse'])->middleware('throttle:10,1');
Route::get('/evac-map/saved', [SavedMapController::class, 'latest'])->middleware('throttle:60,1');
// Search-as-you-type and venue phones share one public IP; cheap DB read, so a high limit.
Route::get('/buildings', [SavedMapController::class, 'buildings'])->middleware('throttle:300,1');
Route::post('/checkpoint', [VisionController::class, 'checkpoint'])->middleware('throttle:60,1');
Route::post('/locate', [VisionController::class, 'locate'])->middleware('throttle:60,1');
Route::put('/graph', [GraphController::class, 'save'])->middleware('throttle:30,1');
Route::get('/floors/{floor}/graph', [GraphController::class, 'show']);

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
