<?php

namespace App\Services;

use App\Exceptions\NotFloorPlanException;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * Evacuation-map photo -> graph JSON in the shared contract (업무분담.md).
 * Read-only: nothing is saved. The LLM output is untrusted, so it is cleaned here.
 */
class EvacMapParser
{
    public const NODE_TYPES = ['room', 'junction', 'stairs', 'elevator_hall', 'entrance', 'exit', 'landmark'];

    // ponytail: assumes the map spans ~50 m when the LLM gives no length; real lengths come from the editor.
    private const MAP_WIDTH_M = 50;

    /** Room/stair/elevator wall outline: 3–12 points, 0–1, no repeated neighbours, closing edge implicit. */
    private function outline(mixed $points): ?array
    {
        if (! is_array($points)) {
            return null;
        }
        $out = [];
        foreach ($points as $p) {
            if (! is_array($p) || ! is_numeric($p['x'] ?? null) || ! is_numeric($p['y'] ?? null)) {
                continue;
            }
            $pt = ['x' => min(1, max(0, (float) $p['x'])), 'y' => min(1, max(0, (float) $p['y']))];
            if ($pt !== end($out)) {
                $out[] = $pt;
            }
        }
        if (count($out) > 1 && $out[0] === end($out)) {
            array_pop($out); // the model repeated the first point
        }

        return count($out) >= 3 ? array_slice($out, 0, 12) : null;
    }

    public function __construct(private VisionClient $vision) {}

    public function parse(UploadedFile $image, string $building, string $floor): array
    {
        $raw = $this->vision->json('evac-map', $image, "건물: {$building}, 층: {$floor}");

        if (! is_bool($raw['is_floor_plan'] ?? null)) {
            throw new RuntimeException('Vision response is missing a floor-plan classification.');
        }
        if (! $raw['is_floor_plan']) {
            throw new NotFloorPlanException;
        }

        $graph = $this->clean($raw, $building, $floor);
        if ($graph['nodes'] === []) {
            throw ValidationException::withMessages([
                'image' => '안내도에서 방이나 복도를 읽지 못했어요. 안내도 전체가 선명하게 보이도록 다시 찍어주세요.',
            ]);
        }

        return $graph;
    }

    /** The floor printed on the map ("4F", "B1"; also accepts "4층", "지하1층"), or null when unreadable. */
    private function readFloor(mixed $value): ?string
    {
        $v = strtoupper(str_replace(' ', '', is_string($value) ? $value : ''));
        if (preg_match('/^(B\d+|\d+F)$/', $v)) {
            return $v;
        }
        if (preg_match('/^지하(\d+)층$/u', $v, $m)) {
            return "B{$m[1]}";
        }

        return preg_match('/^(\d+)층$/u', $v, $m) ? "{$m[1]}F" : null;
    }

    public function clean(array $raw, string $building, string $floor): array
    {
        // The prompt says to trust the map over the hint, so keep the floor the model read.
        $read = $this->readFloor($raw['floor'] ?? null);
        $floor = $read ?? $floor;
        $ids = []; // LLM id => contract id
        $nodes = [];
        foreach ($raw['nodes'] ?? [] as $n) {
            if (! is_array($n) || ! in_array($n['type'] ?? null, self::NODE_TYPES, true) || ! isset($n['id'], $n['x'], $n['y'])) {
                continue;
            }
            $rawId = preg_replace('/^XF-/i', "{$floor}-", (string) $n['id']); // prompt uses XF- when the floor is unknown
            $id = str_starts_with($rawId, "{$floor}-") ? $rawId : "{$floor}-{$rawId}";
            if (isset($nodes[$id])) {
                continue;
            }
            $ids[(string) $n['id']] = $id;
            $nodes[$id] = array_filter([
                'id' => $id,
                'type' => $n['type'],
                'label' => (string) ($n['label'] ?? $id),
                'x' => min(1, max(0, (float) $n['x'])),
                'y' => min(1, max(0, (float) $n['y'])),
                'ref' => in_array($n['type'], ['stairs', 'elevator_hall'], true) && is_string($n['ref'] ?? null) ? $n['ref'] : null,
                'outline' => in_array($n['type'], ['room', 'stairs', 'elevator_hall'], true) ? $this->outline($n['outline'] ?? null) : null,
            ], fn ($v) => $v !== null);
        }

        $edges = [];
        foreach ($raw['edges'] ?? [] as $e) {
            $from = $ids[$e['from'] ?? ''] ?? null;
            $to = $ids[$e['to'] ?? ''] ?? null;
            if (! $from || ! $to || $from === $to) {
                continue;
            }
            [$a, $b] = [$nodes[$from], $nodes[$to]];
            $dx = $b['x'] - $a['x'];
            $dy = $b['y'] - $a['y'];
            $length = (float) ($e['length_m'] ?? 0);
            $edges[] = [
                'from' => $from,
                'to' => $to,
                'type' => 'walk',
                'length_m' => round($length > 0 ? $length : hypot($dx, $dy) * self::MAP_WIDTH_M, 1),
                // Map-relative (image up = 0°), NOT compass. Measure on site before using for vibration guidance.
                'heading_deg' => round(fmod(rad2deg(atan2($dx, -$dy)) + 360, 360), 1),
            ];
        }

        $elevators = array_values(array_filter(
            $raw['elevators'] ?? [],
            fn ($el) => is_array($el) && is_string($el['id'] ?? null) && is_string($el['name'] ?? null) && is_array($el['served_floors'] ?? null),
        ));

        return [
            'building' => $building,
            'floor' => $floor,
            'floor_source' => $read ? 'map' : 'hint', // 'hint' = the floor the app sent, not confirmed by the map
            'status' => 'draft',
            'current_node_id' => $ids[$raw['current_node_id'] ?? ''] ?? null,
            'nodes' => array_values($nodes),
            'edges' => $edges,
            'elevators' => $elevators,
        ];
    }
}
