<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;

/**
 * Evacuation-map photo -> graph JSON in the shared contract (업무분담.md).
 * Read-only: nothing is saved. The LLM output is untrusted, so it is cleaned here.
 */
class EvacMapParser
{
    public const NODE_TYPES = ['room', 'junction', 'stairs', 'elevator_hall', 'entrance', 'exit', 'landmark'];

    // ponytail: assumes the map spans ~50 m when the LLM gives no length; real lengths come from the editor.
    private const MAP_WIDTH_M = 50;

    public function __construct(private VisionClient $vision) {}

    public function parse(UploadedFile $image, string $building, string $floor): array
    {
        $raw = $this->vision->json('evac-map', $image, "건물: {$building}, 층: {$floor}");

        return $this->clean($raw, $building, $floor);
    }

    public function clean(array $raw, string $building, string $floor): array
    {
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
            'status' => 'draft',
            'current_node_id' => $ids[$raw['current_node_id'] ?? ''] ?? null,
            'nodes' => array_values($nodes),
            'edges' => $edges,
            'elevators' => $elevators,
        ];
    }
}
