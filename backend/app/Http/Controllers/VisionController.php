<?php

namespace App\Http\Controllers;

use App\Services\CheckpointMatcher;
use App\Services\EvacMapParser;
use App\Services\VisionClient;
use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
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

        $texts = $this->vision(fn () => $vision->json('checkpoint', $request->file('image'))['texts'] ?? []);

        return ['data' => $matcher->match(array_filter((array) $texts, 'is_string'), $data['expected_node'])];
    }

    private function vision(Closure $call): mixed
    {
        try {
            return $call();
        } catch (RuntimeException|JsonException|ConnectionException) {
            abort(502, 'AI 인식에 실패했어요. 다시 찍어주세요');
        }
    }
}
