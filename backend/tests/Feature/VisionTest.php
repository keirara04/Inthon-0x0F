<?php

namespace Tests\Feature;

use App\Services\CheckpointMatcher;
use App\Services\GraphImporter;
use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class VisionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
        config(['services.admin_token' => 'secret', 'services.openrouter.key' => 'test-key']);
    }

    /** Fake OpenRouter answering each call with the next $answers entry (fenced, like some models do). */
    private function fakeVision(array ...$answers): void
    {
        $sequence = Http::sequence();
        foreach ($answers as $json) {
            $sequence->push(['choices' => [['message' => ['content' => "```json\n".json_encode($json)."\n```"]]]]);
        }
        Http::fake(['openrouter.ai/*' => $sequence]);
    }

    private function photo(): UploadedFile
    {
        return UploadedFile::fake()->image('frame.jpg', 640, 480);
    }

    public function test_checkpoint_matched_mismatch_unknown(): void
    {
        $this->fakeVision(
            ['text' => '405호', 'kind' => 'room_no'],
            ['text' => '401 호', 'kind' => 'room_no'],
            ['text' => null, 'kind' => 'none'],
        );
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'matched');

        // Expected 405 but camera reads 401: user is elsewhere, node tells the frontend where.
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'mismatch')->assertJsonPath('data.node.id', '4F-401');

        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'unknown')->assertJsonPath('data.node', null);
    }

    public function test_floor_sign_matches_expected_elevator_hall(): void
    {
        $this->fakeVision(['text' => '4층', 'kind' => 'floor_sign']);
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-elev-A'])
            ->assertOk()->assertJsonPath('data.status', 'matched');
    }

    public function test_canonical_forms_match_stored_landmarks(): void
    {
        $this->assertSame('405', CheckpointMatcher::canonical('405호'));
        $this->assertSame('4F', CheckpointMatcher::canonical('4 층'));
        $this->assertSame('B1', CheckpointMatcher::canonical('지하1층'));
        $this->assertNull(CheckpointMatcher::canonical('엘리베이터'));
        $this->assertSame('405', CheckpointMatcher::canonical('405 강의실'));
        $this->assertSame('4F', CheckpointMatcher::canonical('4층 엘리베이터'));
        $this->assertSame('401A', CheckpointMatcher::canonical('401A호'));
        $this->assertSame('401A', CheckpointMatcher::canonical('401 A'));
        $this->assertSame('401A', CheckpointMatcher::canonical('401A 강의실'));
        $this->assertSame('B101', CheckpointMatcher::canonical('B101호'));
        $this->assertSame('B1', CheckpointMatcher::canonical('B1'));
        $this->assertSame('B1', CheckpointMatcher::canonical('B1F'));
        $this->assertSame('B1', CheckpointMatcher::canonical('지하 1층'));
        $this->assertNull(CheckpointMatcher::canonical('6')); // elevator position indicator
    }

    public function test_room_letters_are_kept_apart(): void
    {
        app(GraphImporter::class)->importFloor([
            'building' => '우정정보관', 'floor' => '3F',
            'nodes' => [
                ['id' => '3F-j', 'type' => 'junction', 'label' => '복도', 'x' => 0.5, 'y' => 0.5],
                ['id' => '3F-301A', 'type' => 'room', 'label' => '301A호', 'x' => 0.2, 'y' => 0.5],
                ['id' => '3F-301B', 'type' => 'room', 'label' => '301B호', 'x' => 0.8, 'y' => 0.5],
            ],
            'edges' => [
                ['from' => '3F-j', 'to' => '3F-301A', 'length_m' => 5, 'heading_deg' => 270],
                ['from' => '3F-j', 'to' => '3F-301B', 'length_m' => 5, 'heading_deg' => 90],
            ],
        ]);

        $this->fakeVision(
            ['text' => '301A', 'kind' => 'room_no'],
            ['text' => '301B호', 'kind' => 'room_no'],
            ['text' => '301', 'kind' => 'room_no'],
        );
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '3F-301A'])
            ->assertJsonPath('data.status', 'matched');
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '3F-301A'])
            ->assertJsonPath('data.status', 'mismatch')->assertJsonPath('data.node.id', '3F-301B');
        // Bare "301" can't tell A from B: ask for another photo rather than guess.
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '3F-301A'])
            ->assertJsonPath('data.status', 'unknown');
    }

    public function test_multiline_door_sign_matches(): void
    {
        // Real prod answer before this fix: "405\n강의실" came back as unknown.
        $this->fakeVision(['text' => "405\n강의실", 'kind' => 'room_no']);
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'matched');
    }

    public function test_parse_cleans_llm_output_and_saves_nothing(): void
    {
        $this->fakeVision([
            'current_node_id' => 'lobby',
            'nodes' => [
                ['id' => 'lobby', 'type' => 'entrance', 'label' => '로비', 'x' => 0.5, 'y' => 0.9],
                ['id' => 'hall', 'type' => 'junction', 'label' => '복도', 'x' => 0.5, 'y' => 0.5],
                ['id' => 'bad', 'type' => 'spaceship', 'label' => '?', 'x' => 0, 'y' => 0],
            ],
            'edges' => [
                ['from' => 'lobby', 'to' => 'hall', 'length_m' => 10],
                ['from' => 'hall', 'to' => 'ghost'],
            ],
        ]);
        $nodesBefore = DB::table('nodes')->count();

        $res = $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '2F'])->assertOk();

        $res->assertJsonPath('data.current_node_id', '2F-lobby')
            ->assertJsonCount(2, 'data.nodes')
            ->assertJsonCount(1, 'data.edges')
            ->assertJsonPath('data.edges.0.heading_deg', 0); // straight up the map
        $this->assertSame($nodesBefore, DB::table('nodes')->count());
    }

    public function test_parse_cleans_outlines(): void
    {
        $sq = [['x' => 0.1, 'y' => 0.1], ['x' => 0.3, 'y' => 0.1], ['x' => 0.3, 'y' => 0.3], ['x' => 0.1, 'y' => 0.3]];
        $this->fakeVision([
            'current_node_id' => null,
            'nodes' => [
                // repeated closing point, a duplicate neighbour and one point off the photo
                ['id' => '405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.2, 'ref' => null,
                    'outline' => [...$sq, ['x' => 0.1, 'y' => 0.3], ['x' => 1.4, 'y' => -0.2], ['x' => 0.1, 'y' => 0.1]]],
                ['id' => 'j1', 'type' => 'junction', 'label' => '', 'x' => 0.5, 'y' => 0.5, 'ref' => null, 'outline' => $sq],
                ['id' => '406', 'type' => 'room', 'label' => '406호', 'x' => 0.6, 'y' => 0.2, 'ref' => null, 'outline' => [['x' => 0.5, 'y' => 0.1], ['x' => 0.7, 'y' => 0.1]]],
            ],
            'edges' => [],
        ]);

        $res = $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '4F'])->assertOk();

        $this->assertEquals([...$sq, ['x' => 1, 'y' => 0]], $res->json('data.nodes.0.outline')); // JSON drops .0
        $this->assertArrayNotHasKey('outline', $res->json('data.nodes.1')); // junctions never carry one
        $this->assertArrayNotHasKey('outline', $res->json('data.nodes.2')); // fewer than 3 points
    }

    public function test_sends_prompt_schema_and_falls_back_to_json_mode(): void
    {
        Http::fake(['openrouter.ai/*' => Http::sequence()
            ->push(['error' => 'structured output not supported'], 400)
            ->push(['choices' => [['message' => ['content' => json_encode(['text' => '405호', 'kind' => 'room_no'])]]]])]);

        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'matched');

        $sent = Http::recorded()->map(fn ($pair) => $pair[0]->data());
        $this->assertSame('json_schema', $sent[0]['response_format']['type']);
        $this->assertSame(['text', 'kind'], $sent[0]['response_format']['json_schema']['schema']['required']);
        $this->assertSame('system', $sent[0]['messages'][0]['role']);
        $this->assertSame(['effort' => 'low'], $sent[0]['reasoning']);
        $this->assertSame('json_object', $sent[1]['response_format']['type']);
    }

    public function test_parse_replaces_unknown_floor_prefix(): void
    {
        $this->fakeVision([
            'current_node_id' => null,
            'nodes' => [['id' => 'XF-405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5, 'ref' => null]],
            'edges' => [],
        ]);

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '2F'])
            ->assertOk()->assertJsonPath('data.nodes.0.id', '2F-405');
    }

    public function test_vision_garbage_returns_502(): void
    {
        Http::fake(['openrouter.ai/*' => Http::response(['choices' => [['message' => ['content' => 'sorry, I cannot']]]])]);

        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'], ['Accept' => 'application/json'])
            ->assertStatus(502);
    }

    public function test_save_graph_requires_token_protects_verified_and_links_floors(): void
    {
        $floor = [
            'building' => '우정정보관', 'floor' => '5F', 'status' => 'verified',
            'nodes' => [
                ['id' => '5F-elev-A', 'type' => 'elevator_hall', 'label' => '중앙 엘리베이터 홀', 'x' => 0.5, 'y' => 0.45, 'ref' => 'elev-1'],
                ['id' => '5F-501', 'type' => 'room', 'label' => '501호', 'x' => 0.2, 'y' => 0.6],
            ],
            'edges' => [['from' => '5F-elev-A', 'to' => '5F-501', 'type' => 'walk', 'length_m' => 10, 'heading_deg' => 270]],
        ];

        $this->putJson('/api/graph', $floor)->assertStatus(401);
        $this->putJson('/api/graph', $floor, ['X-Admin-Token' => 'secret'])->assertOk();

        // New floor is linked by elevator A (serves 5F) and routable.
        $this->postJson('/api/route', ['start_node' => '1F-lobby', 'dest_node' => '5F-501'])->assertOk();

        // Saving over a verified floor needs replace: true.
        $this->putJson('/api/graph', $floor, ['X-Admin-Token' => 'secret'])->assertStatus(409);
        $this->putJson('/api/graph', [...$floor, 'replace' => true], ['X-Admin-Token' => 'secret'])->assertOk();

        // Node ids must carry the floor prefix.
        $bad = $floor;
        $bad['floor'] = '6F';
        $this->putJson('/api/graph', $bad, ['X-Admin-Token' => 'secret'])->assertStatus(422);
    }
}
