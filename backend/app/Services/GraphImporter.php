<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Loads one floor of the shared graph JSON (see 업무분담.md) into the DB,
 * then links floors through elevator/stairs nodes that share a `ref`.
 */
class GraphImporter
{
    public const ELEVATOR_COST = 30; // edge weight, metres-equivalent

    public const STAIRS_COST_PER_FLOOR = 20;

    /** Import or replace one floor. Call linkFloors() after all floors of a building are in. */
    public function importFloor(array $graph): int
    {
        return DB::transaction(function () use ($graph) {
            $buildingId = DB::table('buildings')->where('name', $graph['building'])->value('id')
                ?? DB::table('buildings')->insertGetId(['name' => $graph['building'], 'created_at' => now(), 'updated_at' => now()]);

            DB::table('floors')->updateOrInsert(
                ['building_id' => $buildingId, 'label' => $graph['floor']],
                ['level' => self::level($graph['floor']), 'status' => $graph['status'] ?? 'verified', 'updated_at' => now()],
            );
            $floorId = DB::table('floors')->where(['building_id' => $buildingId, 'label' => $graph['floor']])->value('id');

            // Replace the floor wholesale; cascades remove its edges and landmarks.
            DB::table('nodes')->where('floor_id', $floorId)->delete();

            foreach ($graph['nodes'] as $n) {
                DB::table('nodes')->insert([
                    'id' => $n['id'], 'floor_id' => $floorId, 'type' => $n['type'], 'label' => $n['label'],
                    'x' => $n['x'], 'y' => $n['y'], 'ref' => $n['ref'] ?? null,
                ]);

                $landmark = match ($n['type']) {
                    'room' => ['kind' => 'room_no', 'ocr_text' => preg_replace('/\D/', '', $n['label']) ?: $n['label']],
                    'elevator_hall' => ['kind' => 'floor_sign', 'ocr_text' => $graph['floor']],
                    default => null,
                };
                if ($landmark) {
                    DB::table('landmarks')->insert(['node_id' => $n['id'], ...$landmark]);
                }
            }

            // Walk edges are stored in both directions; reverse heading is +180.
            foreach ($graph['edges'] as $e) {
                $heading = $e['heading_deg'] ?? null;
                $base = ['type' => $e['type'] ?? 'walk', 'length_m' => $e['length_m'] ?? null];
                DB::table('edges')->insert([
                    ['from_node' => $e['from'], 'to_node' => $e['to'], 'heading_deg' => $heading, ...$base],
                    ['from_node' => $e['to'], 'to_node' => $e['from'], 'heading_deg' => $heading === null ? null : fmod($heading + 180, 360), ...$base],
                ]);
            }

            foreach ($graph['elevators'] ?? [] as $el) {
                DB::table('elevators')->updateOrInsert(
                    ['id' => $el['id']],
                    ['building_id' => $buildingId, 'name' => $el['name'], 'served_floors' => json_encode($el['served_floors'])],
                );
            }

            return $buildingId;
        });
    }

    /**
     * Rebuild cross-floor edges for a building:
     * elevators only between floors in served_floors, stairs only between adjacent levels.
     */
    public function linkFloors(int $buildingId): void
    {
        DB::transaction(function () use ($buildingId) {
            $nodes = DB::table('nodes')
                ->join('floors', 'floors.id', '=', 'nodes.floor_id')
                ->where('floors.building_id', $buildingId)
                ->whereNotNull('nodes.ref')
                ->get(['nodes.id', 'nodes.type', 'nodes.ref', 'floors.label', 'floors.level']);

            DB::table('edges')->whereIn('type', ['elevator', 'stairs'])
                ->whereIn('from_node', $nodes->pluck('id'))->delete();

            $served = DB::table('elevators')->where('building_id', $buildingId)
                ->pluck('served_floors', 'id')->map(fn ($f) => json_decode($f, true));

            $rows = [];
            foreach ($nodes->groupBy('ref') as $ref => $group) {
                foreach ($group as $a) {
                    foreach ($group as $b) {
                        if ($a->id === $b->id) {
                            continue;
                        }
                        if ($a->type === 'elevator_hall') {
                            $floors = $served[$ref] ?? [];
                            if (in_array($a->label, $floors) && in_array($b->label, $floors)) {
                                $rows[] = ['from_node' => $a->id, 'to_node' => $b->id, 'type' => 'elevator', 'length_m' => self::ELEVATOR_COST, 'heading_deg' => null];
                            }
                        } elseif ($a->type === 'stairs' && abs($a->level - $b->level) === 1) {
                            $rows[] = ['from_node' => $a->id, 'to_node' => $b->id, 'type' => 'stairs', 'length_m' => self::STAIRS_COST_PER_FLOOR, 'heading_deg' => null];
                        }
                    }
                }
            }
            DB::table('edges')->insert($rows);
        });
    }

    /** "B1" => -1, "1F" => 1, "12F" => 12 */
    public static function level(string $label): int
    {
        return preg_match('/^B(\d+)$/i', $label, $m) ? -(int) $m[1] : (int) $label;
    }
}
