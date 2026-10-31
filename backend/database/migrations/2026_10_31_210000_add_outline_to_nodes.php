<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** Room/stair/elevator wall outline (0–1 points, closing edge implicit), for drawing the floor map. */
    public function up(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->json('outline')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('nodes', function (Blueprint $table) {
            $table->dropColumn('outline');
        });
    }
};
