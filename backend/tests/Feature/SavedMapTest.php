<?php

namespace Tests\Feature;

use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SavedMapTest extends TestCase
{
    use RefreshDatabase;

    private const MAP = [
        'is_floor_plan' => true, 'floor' => '3F', 'current_node_id' => 'lobby',
        'nodes' => [
            ['id' => 'lobby', 'type' => 'entrance', 'label' => '로비', 'x' => 0.5, 'y' => 0.9],
            ['id' => '301', 'type' => 'room', 'label' => '301호', 'x' => 0.5, 'y' => 0.5],
        ],
        'edges' => [['from' => 'lobby', 'to' => '301', 'length_m' => 10]],
    ];

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
        config(['services.openrouter.key' => 'test-key']);
    }

    private function parse(array $fields, array $answer = self::MAP)
    {
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => json_encode($answer)]]]])]);

        return $this->post('/api/evac-map/parse', ['image' => UploadedFile::fake()->image('map.jpg', 640, 480), 'floor' => '1F', ...$fields], ['Accept' => 'application/json']);
    }

    public function test_a_good_read_is_saved_under_the_building_and_floor_read_from_the_map(): void
    {
        $floorsBefore = DB::table('floors')->get()->toArray();

        $id = $this->parse(['building' => '하나스퀘어', 'lat' => 37.5853, 'lng' => 127.0292])->assertOk()
            ->assertJsonPath('data.building', '하나스퀘어')->json('data.building_id');

        $this->get("/api/evac-map/saved?building_id={$id}&floor=3F")->assertOk()
            ->assertJsonPath('data.floor', '3F')->assertJsonCount(2, 'data.nodes')->assertJsonStructure(['data' => ['saved_at']]);
        $this->get("/api/evac-map/saved?building_id={$id}&floor=1F")->assertNotFound();
        // Saved maps never become routable or touch verified floors.
        $this->assertEquals($floorsBefore, DB::table('floors')->get()->toArray());
    }

    public function test_spacing_and_case_variants_are_the_same_building(): void
    {
        $a = $this->parse(['building' => '우정 정보관'])->json('data.building_id');
        $b = $this->parse(['building' => '우정정보관'])->json('data.building_id');

        $this->assertSame($a, $b);
        $this->assertSame($a, DB::table('buildings')->where('name', '우정정보관')->value('id')); // the seeded one
        $this->assertSame(2, DB::table('saved_maps')->where('building_id', $a)->count());
    }

    public function test_not_a_floor_plan_saves_nothing(): void
    {
        $this->parse(['building' => '새건물'], ['is_floor_plan' => false, 'nodes' => [], 'edges' => []])->assertStatus(422);

        $this->assertSame(0, DB::table('saved_maps')->count());
        $this->assertFalse(DB::table('buildings')->where('name', '새건물')->exists());
    }

    public function test_buildings_list_nearest_first_with_saved_floors(): void
    {
        $this->parse(['building' => '먼건물', 'lat' => 37.60, 'lng' => 127.03]);
        $this->parse(['building' => '가까운건물', 'lat' => 37.5853, 'lng' => 127.0292]);

        $rows = $this->get('/api/buildings?lat=37.5850&lng=127.0290')->assertOk()->json('data');

        $this->assertSame(['가까운건물', '먼건물'], array_slice(array_column($rows, 'name'), 0, 2));
        $this->assertLessThan(100, $rows[0]['distance_m']);
        $this->assertSame(['3F'], $rows[0]['saved_floors']);
        $this->assertNull(end($rows)['distance_m']); // seeded building has no location yet: listed last
        $this->assertSame(['먼건물'], array_column($this->get('/api/buildings?q=먼 건물')->json('data'), 'name'));
    }
}
