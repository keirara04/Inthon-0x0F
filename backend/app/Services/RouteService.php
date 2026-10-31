<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use SplPriorityQueue;

/**
 * Dijkstra over verified floors, then turns the edge path into spoken-style steps.
 * Elevator rule needs no special case: GraphImporter only creates elevator edges
 * between floors the elevator actually serves.
 */
class RouteService
{
    private const STRAIGHT_DEG = 30;

    /** @return array{total_m: float, path: list<string>, steps: list<array>, arrived: array}|null null when unreachable */
    public function route(string $start, string $dest): ?array
    {
        $edges = DB::table('edges')
            ->join('nodes as a', 'a.id', '=', 'edges.from_node')
            ->join('floors as fa', 'fa.id', '=', 'a.floor_id')
            ->join('nodes as b', 'b.id', '=', 'edges.to_node')
            ->join('floors as fb', 'fb.id', '=', 'b.floor_id')
            ->where('fa.status', 'verified')->where('fb.status', 'verified')
            ->get(['edges.from_node', 'edges.to_node', 'edges.type', 'edges.length_m', 'edges.heading_deg']);

        $adj = $edges->groupBy('from_node');
        $path = $this->dijkstra($adj, $start, $dest);
        if ($path === null) {
            return null;
        }

        $nodeIds = array_unique([$start, ...array_column($path, 'to_node')]);
        $nodes = DB::table('nodes')->join('floors', 'floors.id', '=', 'nodes.floor_id')
            ->whereIn('nodes.id', $nodeIds)
            ->get(['nodes.id', 'nodes.label', 'nodes.ref', 'floors.label as floor'])->keyBy('id');
        $landmarks = DB::table('landmarks')->whereIn('node_id', $nodeIds)->get()->keyBy('node_id');
        $elevators = DB::table('elevators')->pluck('name', 'id');

        return [
            'total_m' => round(collect($path)->where('type', 'walk')->sum('length_m'), 1),
            'path' => array_values($nodeIds),
            'steps' => $this->steps($path, $nodes, $landmarks, $elevators),
            'arrived' => ['node' => $dest, 'label' => $nodes[$dest]->label, 'floor' => $nodes[$dest]->floor],
        ];
    }

    /** @return list<object>|null edges from start to dest */
    private function dijkstra($adj, string $start, string $dest): ?array
    {
        $dist = [$start => 0.0];
        $prev = [];
        $queue = new SplPriorityQueue;
        $queue->insert($start, 0);

        while (! $queue->isEmpty()) {
            $u = $queue->extract();
            if ($u === $dest) {
                break;
            }
            foreach ($adj[$u] ?? [] as $e) {
                $d = $dist[$u] + (float) $e->length_m;
                if ($d < ($dist[$e->to_node] ?? INF)) {
                    $dist[$e->to_node] = $d;
                    $prev[$e->to_node] = $e;
                    $queue->insert($e->to_node, -$d); // max-heap, so negate
                }
            }
        }

        if (! isset($dist[$dest])) {
            return null;
        }
        $path = [];
        for ($n = $dest; $n !== $start; $n = $prev[$n]->from_node) {
            array_unshift($path, $prev[$n]);
        }

        return $path;
    }

    private function steps(array $path, $nodes, $landmarks, $elevators): array
    {
        // Group consecutive edges: same vertical type, or walk edges with roughly the same heading.
        $groups = [];
        foreach ($path as $e) {
            $i = count($groups) - 1;
            $head = $groups[$i][0] ?? null;
            if ($head && $e->type === $head->type
                && ($e->type !== 'walk' || abs(self::delta($head->heading_deg, $e->heading_deg)) <= self::STRAIGHT_DEG)) {
                $groups[$i][] = $e;
            } else {
                $groups[] = [$e];
            }
        }

        $steps = [];
        $prevHeading = null;
        foreach ($groups as $g) {
            $from = $g[0]->from_node;
            $to = end($g)->to_node;
            $toNode = $nodes[$to];
            $lm = $landmarks[$to] ?? null;
            // A floor sign only confirms something after changing floors; on a walk step you're already on that floor.
            if ($lm && $lm->kind === 'floor_sign' && $g[0]->type === 'walk') {
                $lm = null;
            }
            // Traced floors have unnamed corridor junctions; speak those as "복도" and by distance instead.
            $toLabel = trim((string) $toNode->label);
            $step = [
                'kind' => $g[0]->type, 'from' => $from, 'to' => $to, 'to_label' => $toLabel !== '' ? $toLabel : '복도', 'floor' => $toNode->floor,
                'checkpoint' => $lm ? ['kind' => $lm->kind, 'text' => $lm->ocr_text] : null,
            ];

            if ($g[0]->type === 'walk') {
                $heading = $g[0]->heading_deg === null ? null : (float) $g[0]->heading_deg;
                $turn = ($prevHeading === null || $heading === null) ? null : self::turn(self::delta($prevHeading, $heading));
                $passed = count($g) > 1 ? trim((string) $nodes[$g[0]->to_node]->label) : '';
                $via = $passed !== '' ? $passed.' 지나서 ' : '';
                $metres = round(array_sum(array_map(fn ($e) => (float) $e->length_m, $g)));
                $action = match ($turn) {
                    'left' => '왼쪽으로 돌아 ',
                    'right' => '오른쪽으로 돌아 ',
                    'back' => '뒤로 돌아 ',
                    'straight' => '직진해서 ',
                    null => '',
                };
                $step += [
                    'heading_deg' => $heading,
                    'turn' => $turn,
                    'length_m' => round(array_sum(array_map(fn ($e) => (float) $e->length_m, $g)), 1),
                    'text' => $toLabel === ''
                        ? $action.'복도를 따라 약 '.max(1, $metres).'m 가세요'
                        : $via.$action.$toLabel.($via || $action ? '까지 가세요' : ' 쪽으로 가세요'),
                ];
                $prevHeading = $heading;
            } else {
                $name = $g[0]->type === 'elevator' ? ($elevators[$toNode->ref] ?? '엘리베이터') : '계단';
                $step += [
                    'elevator' => $g[0]->type === 'elevator' ? $name : null,
                    'to_floor' => $toNode->floor,
                    'text' => $g[0]->type === 'elevator'
                        ? "{$name}에 타서 ".self::spoken($toNode->floor).'에서 내리세요'
                        : '계단으로 '.self::spoken($toNode->floor).'까지 이동하세요',
                ];
                $prevHeading = null; // facing is unknown after changing floors
            }
            $steps[] = $step;
        }

        return $steps;
    }

    /** Signed turn from heading a to b in (-180, 180]; positive = clockwise (right). */
    private static function delta(?float $a, ?float $b): float
    {
        if ($a === null || $b === null) {
            return 0;
        }

        return fmod($b - $a + 540, 360) - 180;
    }

    /** "4F" => "4층", "B1" => "지하 1층", so TTS doesn't read "사 에프". */
    private static function spoken(string $floor): string
    {
        return preg_match('/^B(\d+)$/i', $floor, $m) ? "지하 {$m[1]}층" : ((int) $floor).'층';
    }

    private static function turn(float $delta): string
    {
        return match (true) {
            abs($delta) <= self::STRAIGHT_DEG => 'straight',
            abs($delta) >= 150 => 'back',
            $delta > 0 => 'right',
            default => 'left',
        };
    }
}
