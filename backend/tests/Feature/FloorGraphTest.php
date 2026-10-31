<?php

namespace Tests\Feature;

use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class FloorGraphTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
    }

    public function test_returns_a_verified_floor_with_outlines_and_each_corridor_once(): void
    {
        $res = $this->getJson('/api/floors/4F/graph?building='.urlencode('우정정보관'))->assertOk();

        $nodes = collect($res->json('data.nodes'));
        $this->assertTrue($nodes->contains('id', '4F-405'));
        $outline = $nodes->firstWhere('id', '4F-405')['outline'] ?? null;
        $this->assertIsArray($outline);
        $this->assertGreaterThanOrEqual(3, count($outline));

        $pairs = collect($res->json('data.edges'))->map(fn ($e) => collect([$e['from'], $e['to']])->sort()->implode('|'));
        $this->assertSame($pairs->count(), $pairs->unique()->count()); // no A→B and B→A twice
        $this->assertGreaterThan(0, $pairs->count());
    }

    public function test_draft_and_unknown_floors_are_not_served(): void
    {
        DB::table('floors')->where('label', '4F')->update(['status' => 'draft']);
        $this->getJson('/api/floors/4F/graph?building='.urlencode('우정정보관'))->assertNotFound();
        $this->getJson('/api/floors/9F/graph?building='.urlencode('우정정보관'))->assertNotFound();
    }
}
