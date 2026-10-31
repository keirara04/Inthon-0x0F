<?php

namespace Tests\Feature;

use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/** Starting from somewhere other than the evacuation map's "현위치": scan a sign, or pick an entrance. */
class StartAnywhereTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
        config(['services.openrouter.key' => 'test-key']);
    }

    private function locate(?string $read): TestResponse
    {
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode(['text' => $read, 'kind' => $read ? 'room_no' : 'none'])]]],
        ])]);

        return $this->post('/api/locate', ['image' => UploadedFile::fake()->image('sign.jpg'), 'building' => '우정정보관'], ['Accept' => 'application/json']);
    }

    public function test_room_number_pins_the_start_anywhere_in_the_building(): void
    {
        $this->locate("405\n강의실")->assertOk()
            ->assertJsonPath('data.status', 'found')
            ->assertJsonPath('data.node.id', '4F-405')
            ->assertJsonPath('data.floor', '4F');
    }

    public function test_floor_sign_alone_asks_for_a_room_number(): void
    {
        $this->locate('4층')->assertOk()
            ->assertJsonPath('data.status', 'floor_only')
            ->assertJsonPath('data.floor', '4F')
            ->assertJsonPath('data.node', null);
    }

    public function test_nothing_readable_is_unknown_and_draft_floors_are_ignored(): void
    {
        $this->locate(null)->assertOk()->assertJsonPath('data.status', 'unknown');

        DB::table('floors')->where('label', '4F')->update(['status' => 'draft']);
        $this->locate('405호')->assertOk()->assertJsonPath('data.status', 'unknown');
    }

    public function test_unknown_building_is_rejected(): void
    {
        $this->post('/api/locate', ['image' => UploadedFile::fake()->image('a.jpg'), 'building' => '없는건물'], ['Accept' => 'application/json'])
            ->assertStatus(422);
    }

    public function test_start_points_list_entrances_lifts_and_stairs_by_floor(): void
    {
        $res = $this->getJson('/api/start-points?building='.urlencode('우정정보관'))->assertOk();

        $this->assertSame(['1F', '4F'], array_column($res->json('data'), 'floor'));
        $first = $res->json('data.0.points');
        $this->assertSame('1F-entrance', $first[0]['id']); // entrances first
        $this->assertSame(['entrance', 'exit', 'elevator_hall', 'stairs', 'stairs'], array_column($first, 'type'));
        $this->assertNotContains('1F-101', array_column($first, 'id')); // rooms are not start points
    }
}
