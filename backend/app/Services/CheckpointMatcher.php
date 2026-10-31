<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/** Matches sign texts read by the camera against stored landmarks (see GraphImporter for stored forms). */
class CheckpointMatcher
{
    public function match(array $texts, string $expectedNode): array
    {
        $read = array_values(array_unique(array_filter(array_map([self::class, 'canonical'], $texts))));

        $expected = DB::table('nodes')->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->where('nodes.id', $expectedNode)->first(['nodes.id', 'nodes.floor_id', 'floors.building_id']);

        // Same floor first, then room numbers over floor signs (more specific).
        $hits = DB::table('landmarks')
            ->join('nodes', 'nodes.id', '=', 'landmarks.node_id')
            ->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->where('floors.building_id', $expected->building_id)
            ->whereIn('landmarks.ocr_text', $read ?: [''])
            ->get(['nodes.id', 'nodes.label', 'nodes.floor_id', 'floors.label as floor', 'landmarks.kind'])
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

    /** "405호" => "405", "4층"/"4F" => "4F", "지하1층"/"B1" => "B1"; anything else => null */
    public static function canonical(string $text): ?string
    {
        $t = strtoupper(preg_replace('/\s+/', '', $text));

        return match (true) {
            (bool) preg_match('/^(?:지하|B)(\d+)(?:층|F)?$/u', $t, $m) => "B{$m[1]}",
            (bool) preg_match('/^(\d{1,2})(?:층|F)$/u', $t, $m) => "{$m[1]}F",
            (bool) preg_match('/^(\d{2,4})(?:호실?)?$/u', $t, $m) => $m[1],
            default => null,
        };
    }
}
