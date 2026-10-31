<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/** Matches sign texts read by the camera against stored landmarks (see GraphImporter for stored forms). */
class CheckpointMatcher
{
    public function match(array $texts, string $expectedNode): array
    {
        $expected = DB::table('nodes')->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->where('nodes.id', $expectedNode)->first(['nodes.id', 'nodes.floor_id', 'floors.building_id']);

        // Same floor first, then room numbers over floor signs (more specific).
        $hits = $this->hits($texts, $expected->building_id)
            ->sortBy(fn ($h) => [$h->floor_id !== $expected->floor_id, $h->kind !== 'room_no']);

        $node = $hits->firstWhere('id', $expectedNode) ?? $hits->first();

        return [
            'status' => match (true) {
                $node === null => 'unknown',
                $node->id === $expectedNode => 'matched',
                default => 'mismatch',
            },
            'texts' => array_values($texts),
            'node' => $node ? ['id' => $node->id, 'label' => $node->label, 'floor' => $node->floor] : null,
        ];
    }

    /**
     * "Where am I?" with no expected node: one photo of a nearby sign, matched across the building's verified floors.
     * found = a room number pins the node; floor_only = only a floor sign was read (several nodes share it),
     * so the app asks for a room number; unknown = nothing usable.
     */
    public function locate(array $texts, int $buildingId): array
    {
        $hits = $this->hits($texts, $buildingId, verifiedOnly: true);
        $room = $hits->firstWhere('kind', 'room_no');
        $floor = $hits->firstWhere('kind', 'floor_sign');

        return [
            'status' => $room ? 'found' : ($floor ? 'floor_only' : 'unknown'),
            'texts' => array_values($texts),
            'node' => $room ? ['id' => $room->id, 'label' => $room->label, 'floor' => $room->floor] : null,
            'floor' => ($room ?? $floor)?->floor,
        ];
    }

    /** Landmarks in the building whose stored text equals a canonicalized reading. */
    private function hits(array $texts, int $buildingId, bool $verifiedOnly = false)
    {
        // Signs are often multi-line ("405\n강의실"): canonicalize each line.
        $lines = array_merge(...array_map(fn ($t) => preg_split('/\R/u', $t), $texts ?: ['']));
        $read = array_values(array_unique(array_filter(array_map([self::class, 'canonical'], $lines))));

        return DB::table('landmarks')
            ->join('nodes', 'nodes.id', '=', 'landmarks.node_id')
            ->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->where('floors.building_id', $buildingId)
            ->when($verifiedOnly, fn ($q) => $q->where('floors.status', 'verified'))
            ->whereIn('landmarks.ocr_text', $read ?: [''])
            ->get(['nodes.id', 'nodes.label', 'nodes.floor_id', 'floors.label as floor', 'landmarks.kind']);
    }

    /**
     * Shared by GraphImporter (stored room/floor landmarks) and the camera side, so both always agree.
     * "405호" => "405", "401A호"/"401 A" => "401A", "B101호" => "B101" (basement room),
     * "4층"/"4F" => "4F", "지하1층"/"B1" => "B1" (floor: B + 1–2 digits only), "401A 강의실" => "401A";
     * anything else => null. Exact forms first, then a room number or floor sign inside longer text.
     */
    public static function canonical(string $text): ?string
    {
        $t = strtoupper(preg_replace('/\s+/', '', $text));

        return match (true) {
            (bool) preg_match('/^(?:지하(\d{1,2})층?|B(\d{1,2})(?:층|F)?)$/u', $t, $m) => 'B'.($m[1] ?: $m[2]),
            (bool) preg_match('/^(\d{1,2})(?:층|F)$/u', $t, $m) => "{$m[1]}F",
            (bool) preg_match('/^(B?\d{2,4}[A-Z]?)(?:호실?)?$/u', $t, $m) => $m[1],
            (bool) preg_match('/(?<![\dA-Z])(B?\d{3,4}[A-Z]?)(?![\dA-Z])/u', $t, $m) => $m[1],
            (bool) preg_match('/(?<!\d)(\d{1,2})(?:층|F)(?![A-Z])/u', $t, $m) => "{$m[1]}F",
            default => null,
        };
    }
}
