<?php

namespace Tests\Feature;

use Database\Seeders\GraphSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class CheckpointModelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(GraphSeeder::class);
        config(['services.openrouter.key' => 'test-key', 'services.openrouter.model' => 'main-model']);
        Http::fake(['openrouter.ai/*' => Http::response([
            'choices' => [['message' => ['content' => json_encode([
                'text' => '405호', 'kind' => 'room_no', 'is_floor_plan' => true,
                'nodes' => [['id' => '405', 'type' => 'room', 'label' => '405호', 'x' => 0.2, 'y' => 0.5]],
                'edges' => [],
            ])]]],
        ])]);
    }

    private function sentModels(): array
    {
        return Http::recorded()->map(fn ($pair) => $pair[0]->data()['model'])->all();
    }

    public function test_checkpoint_uses_its_own_model_when_set_and_parse_keeps_the_main_one(): void
    {
        config(['services.openrouter.checkpoint_model' => 'fast-model']);

        $this->post('/api/checkpoint', ['image' => UploadedFile::fake()->image('a.jpg'), 'expected_node' => '4F-405'])->assertOk();
        $this->post('/api/evac-map/parse', ['image' => UploadedFile::fake()->image('b.jpg'), 'building' => '우정정보관', 'floor' => '2F'])->assertOk();

        $this->assertSame(['fast-model', 'main-model'], $this->sentModels());
    }

    public function test_checkpoint_falls_back_to_the_main_model_when_unset(): void
    {
        config(['services.openrouter.checkpoint_model' => null]);

        $this->post('/api/checkpoint', ['image' => UploadedFile::fake()->image('a.jpg'), 'expected_node' => '4F-405'])->assertOk();

        $this->assertSame(['main-model'], $this->sentModels());
    }
}
