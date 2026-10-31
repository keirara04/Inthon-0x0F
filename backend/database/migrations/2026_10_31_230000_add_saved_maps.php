<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Evac maps users photographed, kept so the next visitor can skip the photo and AI read.
     * Separate from floors/nodes: a saved map is for viewing and picking a start, never routed or verified.
     * Buildings get an optional location so nearby ones list first.
     */
    public function up(): void
    {
        Schema::table('buildings', function (Blueprint $table) {
            $table->decimal('lat', 9, 6)->nullable();
            $table->decimal('lng', 9, 6)->nullable();
        });

        Schema::create('saved_maps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('building_id')->constrained()->cascadeOnDelete();
            $table->string('floor'); // 1F, B1, ...
            $table->json('graph'); // the parse result, same shape as POST /api/evac-map/parse
            $table->timestamps();
            $table->index(['building_id', 'floor', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('saved_maps');
        Schema::table('buildings', function (Blueprint $table) {
            $table->dropColumn(['lat', 'lng']);
        });
    }
};
