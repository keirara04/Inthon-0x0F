<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** POST /api/route/photo: guidance on a photographed floor that has no checked map, without storing it. */
class PhotoRouteTest extends TestCase
{
    use RefreshDatabase;

    /** Elevator hall -> unnamed junction -> 305호, and a dead-end room with no corridor. */
    private function graph(): array
    {
        return [
            'floor' => '3F',
            'nodes' => [
                ['id' => '3F-elev', 'type' => 'elevator_hall', 'label' => '엘리베이터 홀', 'ref' => 'elev-1'],
                ['id' => '3F-j1', 'type' => 'junction', 'label' => ''],
                ['id' => '3F-305', 'type' => 'room', 'label' => '305호'],
                ['id' => '3F-399', 'type' => 'room', 'label' => '399호'],
            ],
            'edges' => [
                ['from' => '3F-elev', 'to' => '3F-j1', 'length_m' => 6, 'heading_deg' => 90],
                ['from' => '3F-j1', 'to' => '3F-305', 'length_m' => 8, 'heading_deg' => 0],
            ],
        ];
    }

    public function test_routes_from_the_elevator_to_the_room_and_stores_nothing(): void
    {
        $res = $this->postJson('/api/route/photo', ['graph' => $this->graph(), 'start_node' => '3F-elev', 'dest_node' => '3F-305'])->assertOk();

        $this->assertTrue($res->json('data.draft'));
        $this->assertSame(['3F-elev', '3F-j1', '3F-305'], $res->json('data.path'));
        $this->assertSame(14.0, (float) $res->json('data.total_m'));
        $steps = collect($res->json('data.steps'));
        $this->assertSame('left', $steps->last()['turn']); // east, then north
        $this->assertSame(['kind' => 'room_no', 'text' => '305'], $steps->last()['checkpoint']);
        $this->assertSame(['node' => '3F-305', 'label' => '305호', 'floor' => '3F'], $res->json('data.arrived'));
        $this->assertSame(0, DB::table('nodes')->count());
    }

    public function test_unreachable_room_says_so(): void
    {
        $this->postJson('/api/route/photo', ['graph' => $this->graph(), 'start_node' => '3F-elev', 'dest_node' => '3F-399'])
            ->assertStatus(422)->assertJsonFragment(['message' => '안내도에서 목적지까지 이어진 복도를 찾지 못했어요']);
    }

    public function test_rejects_nodes_that_are_not_on_the_map(): void
    {
        $this->postJson('/api/route/photo', ['graph' => $this->graph(), 'start_node' => '3F-elev', 'dest_node' => '4F-405'])
            ->assertStatus(422)->assertJsonValidationErrors('dest_node');
        $bad = $this->graph();
        $bad['edges'][] = ['from' => '3F-elev', 'to' => 'nowhere'];
        $this->postJson('/api/route/photo', ['graph' => $bad, 'start_node' => '3F-elev', 'dest_node' => '3F-305'])
            ->assertStatus(422)->assertJsonValidationErrors('graph.edges.2.to');
    }
}
