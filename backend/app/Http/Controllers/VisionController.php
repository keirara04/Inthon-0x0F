<?php

namespace App\Http\Controllers;

use App\Exceptions\NotFloorPlanException;
use App\Services\CheckpointMatcher;
use App\Services\EvacMapParser;
use App\Services\VisionClient;
use Closure;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use JsonException;
use RuntimeException;
use Throwable;

/** Camera endpoints. Uploaded frames are processed in memory and never stored. */
class VisionController extends Controller
{
    private const IMAGE_RULE = 'required|image|max:2048'; // KB; client should downscale to <=1280px JPEG

    /**
     * POST /api/evac-map/parse (multipart: image, building, floor, lat?, lng?) -> draft graph JSON.
     * A good read is kept in saved_maps (never in the routable floors) so the next visitor can skip the photo.
     */
    public function parse(Request $request, EvacMapParser $parser)
    {
        $data = $request->validate([
            'image' => self::IMAGE_RULE,
            'building' => 'required|string|max:100',
            'floor' => ['required', 'string', 'regex:/^(B\d+|\d+F)$/'],
            'lat' => 'nullable|numeric|between:-90,90|required_with:lng',
            'lng' => 'nullable|numeric|between:-180,180|required_with:lat',
        ]);

        try {
            $graph = $this->vision(fn () => $parser->parse($request->file('image'), $data['building'], $data['floor']));
        } catch (NotFloorPlanException $exception) {
            return response()->json([
                'message' => $exception->getMessage(),
                'code' => 'NOT_FLOOR_PLAN',
            ], 422);
        }

        // Saving is a bonus: a failure here must not cost the user the read they waited ~25 s for.
        try {
            $b = SavedMapController::resolveBuilding($data['building'], isset($data['lat']) ? (float) $data['lat'] : null, isset($data['lng']) ? (float) $data['lng'] : null);
            $graph = [...$graph, 'building' => $b->name, 'building_id' => $b->id];
            DB::table('saved_maps')->insert(['building_id' => $b->id, 'floor' => $graph['floor'], 'graph' => json_encode($graph, JSON_UNESCAPED_UNICODE), 'created_at' => now(), 'updated_at' => now()]);
        } catch (Throwable $e) {
            report($e);
        }

        return ['data' => $graph];
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
