<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** Buildings and the evac maps users already photographed there. */
class SavedMapController extends Controller
{
    /** "우정 정보관" and "우정정보관" are the same building. */
    public static function nameKey(string $name): string
    {
        return mb_strtolower(preg_replace('/\s+/u', '', $name));
    }

    /** Existing building matched by name key, else a new one. Fills in a missing location. */
    public static function resolveBuilding(string $name, ?float $lat, ?float $lng): object
    {
        $key = self::nameKey($name);
        // ponytail: compares every building in PHP; move the key into an indexed column past a few thousand buildings.
        $b = DB::table('buildings')->get(['id', 'name', 'lat'])->first(fn ($b) => self::nameKey($b->name) === $key);
        if (! $b) {
            $id = DB::table('buildings')->insertGetId(['name' => trim($name), 'lat' => $lat, 'lng' => $lng, 'created_at' => now(), 'updated_at' => now()]);

            return (object) ['id' => $id, 'name' => trim($name)];
        }
        if ($b->lat === null && $lat !== null) {
            DB::table('buildings')->where('id', $b->id)->update(['lat' => $lat, 'lng' => $lng, 'updated_at' => now()]);
        }

        return $b;
    }

    /** GET /api/buildings?q=&lat=&lng= — buildings, nearest first when a location is given, with their saved floors. */
    public function buildings(Request $request)
    {
        $data = $request->validate([
            'q' => 'nullable|string|max:100',
            'lat' => 'nullable|numeric|between:-90,90|required_with:lng',
            'lng' => 'nullable|numeric|between:-180,180|required_with:lat',
        ]);
        $key = self::nameKey($data['q'] ?? '');
        $saved = DB::table('saved_maps')->select('building_id', 'floor')->distinct()->get()->groupBy('building_id');

        $rows = DB::table('buildings')->get(['id', 'name', 'lat', 'lng'])
            ->filter(fn ($b) => $key === '' || str_contains(self::nameKey($b->name), $key))
            ->map(fn ($b) => [
                'id' => $b->id,
                'name' => $b->name,
                'distance_m' => isset($data['lat'], $b->lat) ? self::distance((float) $data['lat'], (float) $data['lng'], (float) $b->lat, (float) $b->lng) : null,
                'saved_floors' => ($saved[$b->id] ?? collect())->pluck('floor')->sort(SORT_NATURAL)->values(),
            ])
            ->sortBy(fn ($b) => [$b['distance_m'] ?? INF, $b['name']])
            ->take(20)->values();

        return ['data' => $rows];
    }

    /** GET /api/evac-map/saved?building_id=&floor= — the latest map saved for that floor. */
    public function latest(Request $request)
    {
        $data = $request->validate([
            'building_id' => 'required|integer',
            'floor' => ['required', 'string', 'regex:/^(B\d+|\d+F)$/'],
        ]);
        $row = DB::table('saved_maps')->where($data)->latest('id')->first(['graph', 'created_at']);
        abort_unless($row, 404, '저장된 안내도가 없어요');

        return ['data' => [...json_decode($row->graph, true), 'saved_at' => $row->created_at]];
    }

    /** Haversine, metres, rounded. */
    private static function distance(float $lat1, float $lng1, float $lat2, float $lng2): int
    {
        $r = M_PI / 180;
        $a = sin(($lat2 - $lat1) * $r / 2) ** 2 + cos($lat1 * $r) * cos($lat2 * $r) * sin(($lng2 - $lng1) * $r / 2) ** 2;

        return (int) round(12_742_000 * asin(min(1, sqrt($a))));
    }
}
