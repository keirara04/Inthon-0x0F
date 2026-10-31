<?php

namespace Tests\Feature;

use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RouteTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
    }

    public function test_lobby_to_405_uses_an_elevator_that_stops_at_4f(): void
    {
        $res = $this->postJson('/api/route', ['start_node' => '1F-lobby', 'dest_node' => '4F-405'])->assertOk();

        // East elevator is closer on 1F but skips 4F, so the route must take the central one.
        $this->assertContains('1F-elev-A', $res->json('data.path'));
        $this->assertNotContains('1F-elev-B', $res->json('data.path'));
        $elevator = collect($res->json('data.steps'))->firstWhere('kind', 'elevator');
        $this->assertSame('중앙 엘리베이터', $elevator['elevator']);
        $this->assertSame('중앙 엘리베이터에 타서 4층에서 내리세요', $elevator['text']);
        $this->assertSame('4F-405', $res->json('data.arrived.node'));
        $this->assertSame(['kind' => 'room_no', 'text' => '405'], $res->json('data.steps.3.checkpoint'));

        // Walk steps name where they end; a floor sign is only a checkpoint after changing floors.
        $this->assertSame('중앙 엘리베이터 홀', $res->json('data.steps.0.to_label'));
        $this->assertNull($res->json('data.steps.0.checkpoint'));
        $this->assertSame(['kind' => 'floor_sign', 'text' => '4F'], $res->json('data.steps.1.checkpoint'));
    }

    public function test_draft_floor_is_not_routable(): void
    {
        DB::table('floors')->where('label', '4F')->update(['status' => 'draft']);

        $this->postJson('/api/route', ['start_node' => '1F-lobby', 'dest_node' => '4F-405'])->assertStatus(422);
    }

    public function test_search_matches_every_word(): void
    {
        $this->getJson('/api/search?q='.urlencode('우정정보관 405'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', '4F-405');
    }
}
