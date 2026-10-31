<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Indoor map graph: buildings > floors > nodes/edges, plus elevators and OCR landmarks.
     * Node ids are strings from the shared graph JSON ("1F-lobby").
     */
    public function up(): void
    {
        Schema::create('buildings', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->string('campus')->nullable();
            $table->timestamps();
        });

        Schema::create('floors', function (Blueprint $table) {
            $table->id();
            $table->foreignId('building_id')->constrained()->cascadeOnDelete();
            $table->string('label'); // B1, 1F, ...
            $table->integer('level'); // B1 = -1, 1F = 1, used for stair adjacency
            $table->string('evac_map_image')->nullable();
            $table->string('status')->default('draft'); // draft | verified
            $table->timestamps();
            $table->unique(['building_id', 'label']);
        });

        Schema::create('nodes', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('floor_id')->constrained()->cascadeOnDelete();
            $table->string('type'); // room | junction | stairs | elevator_hall | entrance | exit | landmark
            $table->string('label');
            $table->float('x');
            $table->float('y');
            $table->string('ref')->nullable(); // elevator/stairs id linking floors
            $table->index('label');
        });

        Schema::create('edges', function (Blueprint $table) {
            $table->id();
            $table->string('from_node');
            $table->string('to_node');
            $table->string('type'); // walk | stairs | elevator
            $table->float('length_m')->nullable();
            $table->float('heading_deg')->nullable(); // compass, north 0, clockwise
            $table->foreign('from_node')->references('id')->on('nodes')->cascadeOnDelete();
            $table->foreign('to_node')->references('id')->on('nodes')->cascadeOnDelete();
        });

        Schema::create('elevators', function (Blueprint $table) {
            $table->string('id')->primary(); // "elev-A", matches nodes.ref
            $table->foreignId('building_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->json('served_floors'); // floor labels
            $table->string('source')->nullable();
            $table->timestamp('checked_at')->nullable();
        });

        Schema::create('landmarks', function (Blueprint $table) {
            $table->id();
            $table->string('node_id');
            $table->string('kind'); // room_no | floor_sign | elevator_sign
            $table->string('ocr_text');
            $table->foreign('node_id')->references('id')->on('nodes')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('landmarks');
        Schema::dropIfExists('elevators');
        Schema::dropIfExists('edges');
        Schema::dropIfExists('nodes');
        Schema::dropIfExists('floors');
        Schema::dropIfExists('buildings');
    }
};
