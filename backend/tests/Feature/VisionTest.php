<?php

namespace Tests\Feature;

use App\Services\CheckpointMatcher;
use App\Services\GraphImporter;
use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
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
            ['text' => '401A 호', 'kind' => 'room_no'],
            ['text' => null, 'kind' => 'none'],
        );
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'matched');

        // Expected 405 but camera reads 401A: user is elsewhere, node tells the frontend where.
        $this->post('/api/checkpoint', ['image' => $this->photo(), 'expected_node' => '4F-405'])
            ->assertOk()->assertJsonPath('data.status', 'mismatch')->assertJsonPath('data.node.id', '4F-401A');

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

    public function test_parse_cleans_llm_output_and_never_touches_routable_nodes(): void
    {
        $this->fakeVision([
            'is_floor_plan' => true,
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
            'is_floor_plan' => true,
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

    public function test_parse_requests_and_preserves_different_room_sizes(): void
    {
        Http::preventStrayRequests();
        $classroom = [['x' => 0.1, 'y' => 0.2], ['x' => 0.5, 'y' => 0.2], ['x' => 0.5, 'y' => 0.6], ['x' => 0.1, 'y' => 0.6]];
        $bathroom = [['x' => 0.55, 'y' => 0.2], ['x' => 0.65, 'y' => 0.2], ['x' => 0.65, 'y' => 0.35], ['x' => 0.55, 'y' => 0.35]];
        $this->fakeVision([
            'is_floor_plan' => true,
            'floor' => '2F',
            'current_node_id' => null,
            'nodes' => [
                ['id' => '205', 'type' => 'room', 'label' => '205호', 'x' => 0.3, 'y' => 0.4, 'ref' => null, 'outline' => $classroom],
                ['id' => '209', 'type' => 'room', 'label' => '209호(화장실)', 'x' => 0.6, 'y' => 0.275, 'ref' => null, 'outline' => $bathroom],
            ],
            'edges' => [],
        ]);

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '2F'])
            ->assertOk()
            ->assertJsonPath('data.nodes.0.outline', $classroom)
            ->assertJsonPath('data.nodes.1.outline', $bathroom);

        // Structured output must permit and request footprints, not restrict every room to a centre point.
        Http::assertSent(function (ClientRequest $request): bool {
            $node = $request['response_format']['json_schema']['schema']['properties']['nodes']['items'];

            return array_key_exists('outline', $node['properties']) && in_array('outline', $node['required'], true);
        });
    }

    public function test_parse_keeps_exit_thresholds_separate_from_stair_flights(): void
    {
        Http::preventStrayRequests();
        $door = [['x' => 0.4, 'y' => 0.3], ['x' => 0.4, 'y' => 0.4]];
        $flight = [['x' => 0.2, 'y' => 0.35], ['x' => 0.35, 'y' => 0.35]];
        $this->fakeVision([
            'is_floor_plan' => true, 'floor' => '1F', 'current_node_id' => null,
            'nodes' => [
                ['id' => 'stairs', 'type' => 'stairs', 'label' => '서측 계단', 'x' => 0.25, 'y' => 0.35, 'door' => $door, 'stair_flight' => $flight],
                ['id' => 'exit', 'type' => 'exit', 'label' => '서측 출구', 'x' => 0.25, 'y' => 0.35, 'door' => $door, 'stair_flight' => $flight],
                ['id' => 'entry', 'type' => 'entrance', 'label' => '주 출입구', 'x' => 0.5, 'y' => 0.8, 'door' => [['x' => 0.45, 'y' => 0.9], ['x' => 0.55, 'y' => 0.9]]],
                ['id' => 'room', 'type' => 'room', 'label' => '101호', 'x' => 0.7, 'y' => 0.5, 'door' => $door],
                ['id' => 'bad', 'type' => 'exit', 'label' => '출구', 'x' => 0.1, 'y' => 0.1, 'door' => [['x' => 0.1, 'y' => 0.1], ['x' => 0.1, 'y' => 0.1]]],
                ['id' => 'hall', 'type' => 'junction', 'label' => '복도', 'x' => 0.4, 'y' => 0.5],
                ['id' => 'bath', 'type' => 'room', 'label' => '106호(화장실)', 'x' => 0.4, 'y' => 0.4],
            ],
            'edges' => [
                ['from' => 'hall', 'to' => 'exit'],
                ['from' => 'stairs', 'to' => 'exit'], // forced path between entrances should be filtered out
            ],
        ]);

        $res = $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'])->assertOk();
        $res->assertJsonPath('data.nodes.0.type', 'stairs')->assertJsonPath('data.nodes.0.stair_flight', $flight)
            ->assertJsonPath('data.nodes.1.type', 'exit')->assertJsonPath('data.nodes.1.door', $door)
            ->assertJsonPath('data.nodes.1.x', 0.4)->assertJsonPath('data.nodes.1.y', 0.35)
            ->assertJsonPath('data.nodes.2.x', 0.5)->assertJsonPath('data.nodes.2.y', 0.9)
            ->assertJsonPath('data.nodes.6.label', '화장실')
            ->assertJsonPath('data.edges.0.to', '1F-exit');
        $this->assertCount(1, $res->json('data.edges'));
        $this->assertArrayNotHasKey('stair_flight', $res->json('data.nodes.1'));
        $this->assertArrayNotHasKey('door', $res->json('data.nodes.3'));
        $this->assertArrayNotHasKey('door', $res->json('data.nodes.4'));
        Http::assertSent(function (ClientRequest $request): bool {
            $schema = $request['response_format']['json_schema']['schema']['properties']['nodes']['items'];

            return isset($schema['properties']['door'], $schema['properties']['stair_flight'])
                && in_array('door', $schema['required'], true) && in_array('stair_flight', $schema['required'], true);
        });
    }

    public function test_parse_keeps_the_floor_read_from_the_map(): void
    {
        $graph = fn (string $floor) => [
            'is_floor_plan' => true,
            'floor' => $floor,
            'current_node_id' => null,
            'nodes' => [['id' => 'XF-405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5, 'ref' => null]],
            'edges' => [],
        ];
        $parse = fn () => $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'])->assertOk();

        $cases = ['4F' => '4F', '4층' => '4F', '지하 1층' => 'B1'];
        $this->fakeVision(...[...array_map($graph, array_keys($cases)), $graph('비상시 대피 안내')]);

        foreach ($cases as $floor) {
            $parse()->assertJsonPath('data.floor', $floor)
                ->assertJsonPath('data.floor_source', 'map')
                ->assertJsonPath('data.nodes.0.id', "{$floor}-405");
        }
        // unreadable: fall back to the hint
        $parse()->assertJsonPath('data.floor', '1F')
            ->assertJsonPath('data.floor_source', 'hint')
            ->assertJsonPath('data.nodes.0.id', '1F-405');
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
            'is_floor_plan' => true,
            'current_node_id' => null,
            'nodes' => [['id' => 'XF-405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5, 'ref' => null]],
            'edges' => [],
        ]);

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '2F'])
            ->assertOk()->assertJsonPath('data.nodes.0.id', '2F-405');
    }

    public function test_non_floor_plan_returns_422_without_a_graph_or_saved_nodes(): void
    {
        Http::preventStrayRequests();
        $this->fakeVision([
            'is_floor_plan' => false,
            'floor' => '4F',
            'current_node_id' => '405',
            'nodes' => [['id' => '405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5]],
            'edges' => [],
        ]);
        $nodesBefore = DB::table('nodes')->count();

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonPath('code', 'NOT_FLOOR_PLAN')
            ->assertJsonPath('message', '평면도가 아닌 사진이에요')
            ->assertJsonMissingPath('data');

        $this->assertSame($nodesBefore, DB::table('nodes')->count());
        Http::assertSentCount(1);
    }

    public function test_empty_floor_plan_returns_422_instead_of_a_successful_read(): void
    {
        Http::preventStrayRequests();
        $this->fakeVision([
            'is_floor_plan' => true,
            'nodes' => [['id' => 'bad', 'type' => 'spaceship', 'x' => 0.2, 'y' => 0.5]],
            'edges' => [],
            'current_node_id' => null,
        ]);

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'], ['Accept' => 'application/json'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('image')
            ->assertJsonPath('errors.image.0', '안내도에서 방이나 복도를 읽지 못했어요. 안내도 전체가 선명하게 보이도록 다시 찍어주세요.')
            ->assertJsonMissingPath('data');

        Http::assertSentCount(1);
    }

    public function test_missing_or_invalid_classification_returns_502_instead_of_accepting_a_graph(): void
    {
        Http::preventStrayRequests();
        $graph = [
            'nodes' => [['id' => '405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5]],
            'edges' => [],
        ];
        $this->fakeVision($graph, ['is_floor_plan' => 'false', ...$graph]);

        foreach ([0, 1] as $attempt) {
            $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'], ['Accept' => 'application/json'])
                ->assertStatus(502)
                ->assertJsonPath('message', 'AI 인식에 실패했어요. 다시 찍어주세요')
                ->assertJsonMissingPath('data');
        }

        Http::assertSentCount(2);
    }

    public function test_valid_map_can_be_uploaded_after_a_non_floor_plan(): void
    {
        Http::preventStrayRequests();
        $this->fakeVision(
            ['is_floor_plan' => false, 'nodes' => [], 'edges' => []],
            [
                'is_floor_plan' => true, 'floor' => '2F', 'current_node_id' => null,
                'nodes' => [['id' => '201', 'type' => 'room', 'label' => '201호', 'x' => 0.2, 'y' => 0.5]],
                'edges' => [],
            ],
        );

        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'], ['Accept' => 'application/json'])
            ->assertStatus(422)->assertJsonPath('code', 'NOT_FLOOR_PLAN');
        $this->post('/api/evac-map/parse', ['image' => $this->photo(), 'building' => '우정정보관', 'floor' => '1F'], ['Accept' => 'application/json'])
            ->assertOk()->assertJsonPath('data.floor', '2F')->assertJsonPath('data.nodes.0.label', '201호');

        Http::assertSentCount(2);
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
            // The seed's elevator only lists 1F/4F; this save says it also stops at 5F.
            'elevators' => [['id' => 'elev-1', 'name' => '엘리베이터', 'served_floors' => ['1F', '4F', '5F']]],
        ];

        $this->putJson('/api/graph', $floor)->assertStatus(401);
        $this->putJson('/api/graph', $floor, ['X-Admin-Token' => 'secret'])->assertOk();

        // New floor is linked by elevator A (serves 5F) and routable.
        $this->postJson('/api/route', ['start_node' => '1F-entrance', 'dest_node' => '5F-501'])->assertOk();

        // Saving over a verified floor needs replace: true.
        $this->putJson('/api/graph', $floor, ['X-Admin-Token' => 'secret'])->assertStatus(409);
        $this->putJson('/api/graph', [...$floor, 'replace' => true], ['X-Admin-Token' => 'secret'])->assertOk();

        // Node ids must carry the floor prefix.
        $bad = $floor;
        $bad['floor'] = '6F';
        $this->putJson('/api/graph', $bad, ['X-Admin-Token' => 'secret'])->assertStatus(422);
    }
}
