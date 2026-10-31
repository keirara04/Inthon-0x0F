<?php

namespace App\Http\Controllers;

use App\Services\CheckpointMatcher;
use App\Services\EvacMapParser;
use App\Services\VisionClient;
use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use JsonException;
use RuntimeException;

/** Camera endpoints. Uploaded frames are processed in memory and never stored. */
class VisionController extends Controller
{
    private const IMAGE_RULE = 'required|image|max:2048'; // KB; client should downscale to <=1280px JPEG

    /** POST /api/evac-map/parse (multipart: image, building, floor) -> draft graph JSON, nothing saved */
    public function parse(Request $request, EvacMapParser $parser)
    {
        $data = $request->validate([
            'image' => self::IMAGE_RULE,
            'building' => 'required|string|max:100',
            'floor' => ['required', 'string', 'regex:/^(B\d+|\d+F)$/'],
        ]);

        return ['data' => $this->vision(fn () => $parser->parse($request->file('image'), $data['building'], $data['floor']))];
    }

    /** POST /api/checkpoint (multipart: image, expected_node) -> matched | mismatch | unknown */
    public function checkpoint(Request $request, VisionClient $vision, CheckpointMatcher $matcher)
    {
        $data = $request->validate([
            'image' => self::IMAGE_RULE,
            'expected_node' => 'required|string|exists:nodes,id',
        ]);

        $read = $this->vision(fn () => $vision->json('checkpoint', $request->file('image')));
        $texts = is_string($read['text'] ?? null) ? [$read['text']] : [];

        return ['data' => $matcher->match(array_filter((array) $texts, 'is_string'), $data['expected_node'])];
    }

    /** POST /api/locate (multipart: image, building) -> found | floor_only | unknown. For starting anywhere. */
    public function locate(Request $request, VisionClient $vision, CheckpointMatcher $matcher)
    {
        $data = $request->validate([
            'image' => self::IMAGE_RULE,
            'building' => 'required|string|exists:buildings,name',
        ]);

        $read = $this->vision(fn () => $vision->json('checkpoint', $request->file('image')));
        $texts = is_string($read['text'] ?? null) ? [$read['text']] : [];
        $buildingId = DB::table('buildings')->where('name', $data['building'])->value('id');

        return ['data' => $matcher->locate($texts, $buildingId)];
    }

    private function vision(Closure $call): mixed
    {
        // An evac-map read takes ~20-27 s and the HTTP timeout is 60 s, but PHP's default 30 s limit
        // (wall-clock under FrankenPHP) killed requests at ~31 s with a 500. Give AI calls room to finish.
        set_time_limit(90);
        try {
            return $call();
        } catch (RuntimeException|JsonException|ConnectionException) {
            abort(502, 'AI 인식에 실패했어요. 다시 찍어주세요');
        }
    }
}
