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

    public function test_entrance_to_405_takes_the_elevator_to_4f(): void
    {
        // Real 우정정보관 seed: 주 출입구 (1F) -> elevator -> 405호 (4F).
        $res = $this->postJson('/api/route', ['start_node' => '1F-entrance', 'dest_node' => '4F-405'])->assertOk();
        $steps = collect($res->json('data.steps'));

        $this->assertContains('1F-elev-A', $res->json('data.path'));
        $elevator = $steps->firstWhere('kind', 'elevator');
        $this->assertSame('엘리베이터', $elevator['elevator']);
        $this->assertSame('엘리베이터에 타서 4층에서 내리세요', $elevator['text']);
        // A floor sign confirms the floor after the ride; walk steps never use one.
        $this->assertSame(['kind' => 'floor_sign', 'text' => '4F'], $elevator['checkpoint']);
        $this->assertTrue($steps->where('kind', 'walk')->every(fn ($s) => ($s['checkpoint']['kind'] ?? null) !== 'floor_sign'));
        $this->assertSame('4F-405', $res->json('data.arrived.node'));
        $this->assertSame(['kind' => 'room_no', 'text' => '405'], $steps->last()['checkpoint']);
    }

    public function test_unnamed_junctions_never_produce_blank_instructions(): void
    {
        // The real maps leave corridor junctions unnamed; steps ending there point to the next named place.
        $steps = collect($this->postJson('/api/route', ['start_node' => '1F-entrance', 'dest_node' => '4F-405'])->json('data.steps'));

        foreach ($steps as $s) {
            $this->assertNotSame('', trim($s['to_label']));
            // What an empty label used to produce: " 쪽으로 가세요", "돌아 까지", double spaces.
            $this->assertDoesNotMatchRegularExpression('/^\s|\s\s|(돌아|해서|지나서) (까지|쪽으로)/u', $s['text'], $s['text']);
        }
        $this->assertSame('엘리베이터 홀 방향 갈림길', $steps->first()['to_label']);
        $this->assertMatchesRegularExpression('/^엘리베이터 홀 쪽으로 약 \d+m 가세요$/u', $steps->first()['text']);
        // Legs ending at unnamed junctions must read differently, and no leg is a sub-2m hop.
        $walks = $steps->where('kind', 'walk');
        $this->assertSame($walks->count(), $walks->pluck('text')->unique()->count());
        $this->assertTrue($walks->every(fn ($s) => $s['length_m'] >= 2 || $s === $walks->first()));
    }

    public function test_draft_floor_is_not_routable(): void
    {
        DB::table('floors')->where('label', '4F')->update(['status' => 'draft']);

        $this->postJson('/api/route', ['start_node' => '1F-entrance', 'dest_node' => '4F-405'])->assertStatus(422);
    }

    public function test_search_matches_every_word(): void
    {
        $this->getJson('/api/search?q='.urlencode('우정정보관 405'))
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', '4F-405');
    }
}
