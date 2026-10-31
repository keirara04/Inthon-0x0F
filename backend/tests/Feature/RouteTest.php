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

    public function test_entrance_to_405_takes_the_central_elevator(): void
    {
        $res = $this->postJson('/api/route', ['start_node' => '1F-entrance', 'dest_node' => '4F-405'])->assertOk();
        $steps = collect($res->json('data.steps'));

        $this->assertContains('1F-elev-A', $res->json('data.path'));
        $elevator = $steps->firstWhere('kind', 'elevator');
        $this->assertSame('중앙 엘리베이터', $elevator['elevator']);
        $this->assertSame('중앙 엘리베이터에 타서 4층에서 내리세요', $elevator['text']);
        // A floor sign is only a checkpoint after changing floors.
        $this->assertSame(['kind' => 'floor_sign', 'text' => '4F'], $elevator['checkpoint']);
        $this->assertNull($steps->first()['checkpoint']);
        $this->assertSame('4F-405', $res->json('data.arrived.node'));
        $this->assertSame(['kind' => 'room_no', 'text' => '405'], $steps->last()['checkpoint']);

        // Unnamed corridor junctions never leave holes in the spoken text or the step title.
        foreach ($steps as $s) {
            $this->assertNotSame('', $s['to_label']);
            $this->assertDoesNotMatchRegularExpression('/^\s|\s{2}|\s까지|^쪽으로|지나서 지나서/u', $s['text']);
        }
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
